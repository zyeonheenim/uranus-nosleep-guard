#!/usr/bin/env node
/**
 * uranus_patches_awesome · 统一安装器
 *
 * 四个补丁一个入口。默认只**预览**（不写盘），加 --run 才真的动文件。
 *
 * 用法：
 *   node install.mjs --list                  列出补丁 / 装没装 / 依赖
 *   node install.mjs                         预览：选中全部（会改哪些文件）
 *   node install.mjs --run --all             全装
 *   node install.mjs --only 02 --run         只装「版本留底」
 *   node install.mjs --only 02,03 --run      版本留底 + 气泡样式
 *   node install.mjs --all --run --no-build  跳过前端构建
 *   node install.mjs --all --run --force     版本号对不上也强装
 *
 * 设计上的两条硬规矩：
 *   1) 补丁对不上就**整份不动** —— 宁可什么都不改，也不能改坏半个文件；
 *   2) 动之前先备份到 .patches-backup-<时间戳>/，语法检查不过就自动回滚。
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECT_VERSION = "1.22.3";
const RECORD = ".patches-backup-"; // 备份目录前缀

/* ------------------------------------------------------------------ 补丁清单 */

const CATALOG = [
  {
    id: "01",
    dir: "patches/01-nosleep-guard",
    title: "唤醒防断流 nosleep-guard",
    kind: "script", // 独立脚本，不改 Uranus 代码
    needs: [],
    summary: "Mac 睡醒后 Uranus 出网全废 → 自动重启一次（macOS · launchd）",
    script: "install.command",
    uninstall: "uninstall.command",
    check: () => fileExists(homePlist()),
  },
  {
    id: "02",
    dir: "patches/02-offline-version-history",
    title: "线下剧情 · 版本留底 version-history",
    kind: "patch",
    needs: [],
    summary: "重 roll / 手改 / 删除都留底，气泡上能翻、能 ⟲ 恢复",
    patch: "02-version-history.patch",
    // 判断「已经装过」的标记：文件里出现这些函数名就说明这一份补丁在了
    markers: [["server/src/offlinestore.js", "archiveLastAssistant"]],
  },
  {
    id: "03",
    dir: "patches/03-offline-bubble-style",
    title: "线下剧情 · 气泡样式 bubble-style",
    kind: "patch",
    needs: ["02"],
    summary: "两侧气泡底色/边框/文字色/圆角，存服务端，手机电脑同一份",
    patch: "03-bubble-style.patch",
    markers: [["server/src/bubblestyle.js", "sanitizeBubbleStyle"]],
  },
  {
    id: "04",
    dir: "patches/04-offline-model-token",
    title: "线下剧情 · 模型与 token",
    kind: "patch",
    needs: ["02", "03"],
    summary: "气泡标题写清「哪个服务商·模型 + ↑输入(缓存) ↓输出」",
    patch: "04-model-token.patch",
    markers: [
      ["server/src/llm.js", "normUsageTokens"],
      ["client/src/panels/offline.jsx", "fmtTok"],
    ],
  },
];

/* ------------------------------------------------------------------ 输出 */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const say = (s = "") => console.log(s);
const ok = (s) => say(`${c.green("✓")} ${s}`);
const warn = (s) => say(`${c.yellow("!")} ${s}`);
const die = (s) => {
  say(`${c.red("✗")} ${s}`);
  process.exit(1);
};

/* ------------------------------------------------------------------ 参数 */

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const valOf = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};

const RUN = has("--run");
const FORCE = has("--force");
const NO_BUILD = has("--no-build");
const LIST = has("--list");
const ALL = has("--all");
const ONLY = valOf("--only");

function normId(s) {
  const t = String(s).trim();
  if (!t) return "";
  return t.length === 1 ? `0${t}` : t;
}

/* ------------------------------------------------------------------ 目标目录 */

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
function homePlist() {
  return path.join(process.env.HOME ?? "", "Library", "LaunchAgents", "com.uranus.wake-restart.plist");
}

function findTarget() {
  const tries = [];
  if (process.env.URANUS_DIR) tries.push(process.env.URANUS_DIR);
  tries.push(path.join(HERE, ".."));
  tries.push(process.cwd());
  tries.push(path.join(process.env.HOME ?? "", "Uranus_Imessage"));

  for (const dir of tries) {
    if (!dir) continue;
    const pkg = path.join(dir, "package.json");
    const entry = path.join(dir, "server", "src", "index.js");
    if (!fileExists(pkg) || !fileExists(entry)) continue;
    try {
      const p = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (p.name === "uranus-imessage") return { dir: path.resolve(dir), version: p.version };
    } catch {
      /* 不是这个目录 */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ 统一 diff 解析 + 应用 */

/** 把补丁拆成 [{path, hunks:[{oldStart, oldCount, newStart, newCount, lines}]}] */
function parsePatch(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const files = [];
  let cur = null;
  let hunk = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("--- a/")) {
      const plus = lines[i + 1] ?? "";
      if (!plus.startsWith("+++ b/")) die(`补丁格式不对：${line} 后面不是 +++`);
      cur = { path: line.slice(6).trim(), hunks: [] };
      files.push(cur);
      hunk = null;
      i += 1;
      continue;
    }
    if (line.startsWith("@@") && cur) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!m) die(`看不懂的 hunk 头：${line}`);
      hunk = {
        oldStart: Number(m[1]),
        oldCount: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newCount: m[4] === undefined ? 1 : Number(m[4]),
        lines: [],
      };
      cur.hunks.push(hunk);
      continue;
    }
    if (hunk && (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-"))) {
      hunk.lines.push(line);
    }
  }
  return files;
}

/**
 * 把一段补丁打到目标目录。
 *
 * 每个 hunk 先按「旧的起始行」取位置，再在附近前后找**完全一致**的上下文块；
 * 找不到就退化成全文搜索（多处命中取离补丁行号最近的）。两样都不成 → 抛错，
 * 调用方负责回滚。
 */
function applyPatch(root, text, dryRun) {
  const files = parsePatch(text);
  const touched = [];

  for (const f of files) {
    const abs = path.join(root, f.path);
    const existed = fileExists(abs);
    const raw = existed ? fs.readFileSync(abs, "utf8") : "";
    const crlf = raw.includes("\r\n");
    const src = raw ? raw.replace(/\r\n/g, "\n").split("\n") : [];
    const isNew = !existed;

    let out = [];
    let cursor = 0;
    for (const h of f.hunks) {
      const want = h.lines.filter((l) => l.startsWith(" ") || l.startsWith("-")).map((l) => l.slice(1));
      const give = h.lines.filter((l) => l.startsWith(" ") || l.startsWith("+")).map((l) => l.slice(1));

      const guess = Math.max(0, h.oldStart - 1 - (h.oldCount ? 0 : 1));
      let at = -1;
      if (matchesAt(src, want, guess) && guess >= cursor) at = guess;
      if (at < 0) {
        const hits = [];
        for (let i = cursor; i + want.length <= src.length; i += 1) {
          if (matchesAt(src, want, i)) hits.push(i);
        }
        if (hits.length) {
          hits.sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess));
          at = hits[0];
        }
      }
      if (at < 0) {
        throw new Error(
          `${f.path}: 第 ${h.oldStart} 行附近对不上 —— 这个文件不是原版 ${EXPECT_VERSION}，` +
            `或者已经装过别的补丁。这一份没有动过，检查完再试。`
        );
      }
      out = out.concat(src.slice(cursor, at));
      out = out.concat(give);
      cursor = at + want.length;
    }
    out = out.concat(src.slice(cursor));

    let next = out.join("\n");
    // hunk 只覆盖到最后一个改动行，文件末尾那个换行不在里面，补回来
    if ((isNew || raw.endsWith("\n")) && !next.endsWith("\n")) next += "\n";
    if (crlf) next = next.replace(/\n/g, "\r\n");
    touched.push({ path: f.path, abs, existed, next, changed: next !== raw, isNew });
  }

  if (!dryRun) {
    for (const t of touched) {
      if (!t.changed) continue;
      fs.mkdirSync(path.dirname(t.abs), { recursive: true });
      fs.writeFileSync(t.abs, t.next, "utf8");
    }
  }
  return touched;
}

function matchesAt(src, want, at) {
  if (at < 0 || at + want.length > src.length) return false;
  for (let i = 0; i < want.length; i += 1) if (src[at + i] !== want[i]) return false;
  return true;
}

/* ------------------------------------------------------------------ 状态 */

function markerInstalled(dir, m) {
  const [rel, needle] = m;
  const abs = path.join(dir, rel);
  return fileExists(abs) && fs.readFileSync(abs, "utf8").includes(needle);
}

function isInstalled(dir, mod) {
  if (mod.kind === "script") return mod.check ? mod.check() : false;
  return (mod.markers ?? []).every((m) => markerInstalled(dir, m));
}

/* ------------------------------------------------------------------ 备份 / 回滚 */

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backup(dir, relPaths, modules) {
  const box = path.join(dir, `${RECORD}${stamp()}`);
  fs.mkdirSync(box, { recursive: true });
  const files = [];
  for (const rel of relPaths) {
    const abs = path.join(dir, rel);
    const existed = fileExists(abs);
    if (existed) {
      const to = path.join(box, "files", rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(abs, to);
    }
    files.push({ path: rel, existed });
  }
  fs.writeFileSync(
    path.join(box, "manifest.json"),
    JSON.stringify({ at: new Date().toISOString(), baseVersion: EXPECT_VERSION, modules, files }, null, 2),
    "utf8"
  );
  return box;
}

function rollback(dir, box) {
  const man = JSON.parse(fs.readFileSync(path.join(box, "manifest.json"), "utf8"));
  for (const f of man.files) {
    const abs = path.join(dir, f.path);
    const from = path.join(box, "files", f.path);
    if (f.existed && fileExists(from)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(from, abs);
    } else if (!f.existed) {
      fs.rmSync(abs, { force: true });
    }
  }
}

/* ------------------------------------------------------------------ 选补丁 */

function select() {
  let ids;
  if (ALL) ids = CATALOG.map((m) => m.id);
  else if (ONLY) ids = ONLY.split(",").map(normId).filter(Boolean);
  else ids = CATALOG.map((m) => m.id);

  for (const id of ids) {
    if (!CATALOG.some((m) => m.id === id)) die(`没有第 ${id} 号补丁（可用：${CATALOG.map((m) => m.id).join(" / ")}）`);
  }
  // 依赖闭包：03 要 02，04 要 02+03。缺的自动补上并说一声
  const set = new Set(ids);
  const added = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...set]) {
      const mod = CATALOG.find((m) => m.id === id);
      for (const need of mod.needs) {
        if (!set.has(need)) {
          set.add(need);
          added.push(need);
          changed = true;
        }
      }
    }
  }
  return { ids: CATALOG.filter((m) => set.has(m.id)), added };
}

/* ------------------------------------------------------------------ 主流程 */

say(c.bold("\nuranus_patches_awesome · 安装器\n"));

const target = findTarget();
if (LIST || !target) {
  if (!target && !LIST) {
    die(
      "没找到 Uranus 安装目录。\n" +
        "  先指定：URANUS_DIR=/路径/Uranus_Imessage node install.mjs --all --run\n" +
        "  （只有第 01 号补丁可以不指定 —— 它装的是系统的定时任务）"
    );
  }
  say(target ? `Uranus：${c.bold(target.dir)}  ${c.dim(`v${target.version}`)}` : c.dim("（没找到 Uranus 目录，只列清单）"));
  say("");
  for (const m of CATALOG) {
    const inst = target ? isInstalled(target.dir, m) : false;
    const badge = inst ? c.green("已装") : c.dim("未装");
    const need = m.needs.length ? c.dim(`  ← 需要 ${m.needs.join("+")}`) : "";
    say(`  ${c.cyan(m.id)}  ${badge}  ${m.title}${need}`);
    say(`       ${c.dim(m.summary)}`);
  }
  say("");
  say(c.dim("装：node install.mjs --all --run   只装一个：node install.mjs --only 02 --run"));
  say("");
  process.exit(0);
}

say(`Uranus：${c.bold(target.dir)}`);
say(`版本：${target.version}${target.version === EXPECT_VERSION ? "" : c.yellow(`（补丁按 ${EXPECT_VERSION} 做的）`)}`);
say(`模式：${RUN ? c.green("真的装") : c.yellow("预览（不写任何文件）")}`);
say("");

const { ids: picked, added } = select();
if (added.length) warn(`自动带上前置补丁：${added.join(" / ")}（后面的补丁改的是同一段代码）`);

if (target.version !== EXPECT_VERSION && !FORCE) {
  die(
    `版本不一样：你的 ${target.version}，补丁是按 ${EXPECT_VERSION} 的源码做的。\n` +
      `  小改版通常也能打上（改的是函数内部，不碰框架），但没实测过：\n` +
      `    node install.mjs --all --run --force\n` +
      `  装之前会自动把被改的文件备份到 ${RECORD}<时间戳>/，随时能退回。`
  );
}

// 先把不需要打补丁的（01 脚本）挑出来，剩下的按顺序预演
const already = picked.filter((m) => isInstalled(target.dir, m));
const todo = picked.filter((m) => !isInstalled(target.dir, m));

if (already.length) {
  ok(`已经装过，跳过：${already.map((m) => m.id).join(" / ")}`);
}
if (!todo.length) {
  ok("选中的补丁都已经在了，没有要改的。");
  say(c.dim("  想重装：node uninstall.mjs --run 之后再装一次。"));
  process.exit(0);
}

const patchMods = todo.filter((m) => m.kind === "patch");
const scriptMods = todo.filter((m) => m.kind === "script");

/* 预演：一路 dry-run 下来，看每个文件会变成什么 */
const plan = [];
{
  // 用一个临时目录模拟「按顺序打」的效果，避免真的写盘
  const mem = new Map(); // relPath -> content（模拟当前磁盘/已叠加的结果）
  const readSim = (rel) => {
    if (mem.has(rel)) return mem.get(rel);
    const abs = path.join(target.dir, rel);
    return fileExists(abs) ? fs.readFileSync(abs, "utf8") : "";
  };
  for (const m of patchMods) {
    const text = fs.readFileSync(path.join(HERE, m.dir, m.patch), "utf8");
    const files = parsePatch(text);
    // 用一个假的 root + 拦截读取来实现 dry-run
    const tmpRoot = path.join(osTmp(), `uranus-preview-${m.id}-${Date.now()}`);
    fs.mkdirSync(tmpRoot, { recursive: true });
    try {
      for (const f of files) {
        const abs = path.join(tmpRoot, f.path);
        const existed = fileExists(path.join(target.dir, f.path));
        if (!existed && !mem.has(f.path)) continue; // 目标里没有、也没被上一份补丁建出来 → 让 applyPatch 当新文件
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, readSim(f.path), "utf8");
      }
      let touched;
      try {
        touched = applyPatch(tmpRoot, text, false);
      } catch (e) {
        die(`${m.id} 打不上：${e.message}\n\n  什么都没改。`);
      }
      for (const t of touched) {
        mem.set(t.path, fileExists(t.abs) ? fs.readFileSync(t.abs, "utf8") : "");
        plan.push({ module: m.id, path: t.path, isNew: t.isNew, changed: t.changed });
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
}

function osTmp() {
  return process.env.TMPDIR ?? "/tmp";
}

for (const m of scriptMods) {
  say(`  ${c.green("脚本")}  第 ${m.id} 号 · ${m.title}`);
  say(`         ${c.dim(`会跑 ${m.dir}/${m.script}`)}`);
}
const shown = plan.filter((p) => p.changed);
for (const p of shown) {
  say(`  ${p.isNew ? c.green("新增") : c.yellow("修改")}  ${p.path}  ${c.dim(`(${p.module})`)}`);
}
say("");

if (!RUN) {
  say(c.dim("预览到此为止。真要装的话："));
  say(c.bold(`  node install.mjs ${ALL ? "--all" : `--only ${picked.map((m) => m.id).join(",")}`} --run`));
  say(c.dim("（或者在 Finder 里双击「安装.command」）"));
  process.exit(0);
}

/* 1) 备份 */
const relPaths = [...new Set(plan.map((p) => p.path))];
// 只记「这一轮真的装了」的补丁 —— 之前记的是「选中的」，
// 结果 --all 时把已经装过的 01 也写进 manifest，卸载时连带把人家在跑的定时任务卸了。
const installedIds = todo.map((m) => m.id);
const box = patchMods.length ? backup(target.dir, relPaths, installedIds) : "";
if (box) ok(`已备份到 ${path.basename(box)}（${relPaths.length} 个文件）`);

/* 2) 真打 */
try {
  for (const m of patchMods) {
    const text = fs.readFileSync(path.join(HERE, m.dir, m.patch), "utf8");
    applyPatch(target.dir, text, false);
    ok(`补丁 ${m.id} 已写入`);
  }
} catch (e) {
  if (box) rollback(target.dir, box);
  die(`打补丁时出错：${e.message}\n${box ? `  已用 ${path.basename(box)} 回滚。` : ""}`);
}

/* 3) 语法检查（挂了立刻回滚） */
if (patchMods.length) {
  const checkFiles = [
    "server/src/offlinestore.js",
    "server/src/offline.js",
    "server/src/index.js",
    "server/src/llm.js",
    "server/src/bubblestyle.js",
  ].filter((rel) => fileExists(path.join(target.dir, rel)));
  let bad = "";
  for (const rel of checkFiles) {
    try {
      execFileSync(process.execPath, ["--check", path.join(target.dir, rel)], { stdio: "pipe" });
    } catch (e) {
      bad += `\n${rel}\n${String(e.stderr ?? e.message).slice(0, 400)}`;
    }
  }
  if (bad) {
    rollback(target.dir, box);
    die(`语法检查没过，已经自动退回原样：${bad}`);
  }
  ok(`服务端语法检查通过（${checkFiles.length} 个文件）`);
}

/* 4) 前端构建 */
if (patchMods.length) {
  const clientDir = path.join(target.dir, "client");
  const hasModules = fileExists(path.join(target.dir, "node_modules"));
  if (NO_BUILD) {
    warn("按你的要求跳过前端构建 —— 记得自己跑 cd client && npm run build，否则界面还是旧的");
  } else if (!hasModules) {
    warn("没找到 node_modules，跳过前端构建。先 npm install，再 cd client && npm run build");
  } else {
    try {
      execFileSync("npm", ["run", "build"], { cwd: clientDir, stdio: "pipe" });
      ok("前端已构建（client/dist）");
    } catch (e) {
      warn("前端构建失败：服务端改动已生效，但界面还是旧的。手动跑一次 cd client && npm run build");
      say(c.dim(String(e.stdout ?? "").slice(-800)));
    }
  }
}

/* 5) 脚本补丁（01） */
const scriptFailed = [];
for (const m of scriptMods) {
  const cmd = path.join(HERE, m.dir, m.script);
  try {
    execFileSync("bash", [cmd, "--yes"], { stdio: "pipe" });
    ok(`第 ${m.id} 号已装（${m.title}）`);
  } catch (e) {
    scriptFailed.push(m.id);
    warn(`第 ${m.id} 号没装上：${String(e.stderr ?? e.message).slice(0, 300)}`);
  }
}
// 没装上的别记进 manifest —— 否则卸载时会去卸一个根本没装的定时任务
if (box && scriptFailed.length) {
  const manPath = path.join(box, "manifest.json");
  const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
  man.modules = man.modules.filter((id) => !scriptFailed.includes(id));
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2), "utf8");
}

/* 6) 自检 */
if (patchMods.length) {
  try {
    const out = execFileSync(process.execPath, [path.join(HERE, "tests", "smoke.mjs"), target.dir], {
      encoding: "utf8",
      stdio: "pipe",
    });
    say(out.trim());
  } catch (e) {
    warn("自检没跑通（不影响安装，但建议看一眼）：");
    say(c.dim(String(e.stdout ?? "") + String(e.stderr ?? "")).slice(0, 600));
  }
}

say("");
say(c.bold("装好了。接下来两件事："));
say("  1. 重启 Uranus（关掉窗口重新打开，或控制台里的重启按钮）");
say("  2. 浏览器 Cmd+R 强刷一次，前端才有新界面");
if (patchMods.length) say("");
if (box) say(c.dim(`想退回：node uninstall.mjs --run（会用 ${path.basename(box)} 还原）`));
say("");
