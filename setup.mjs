#!/usr/bin/env node
/**
 * uranus_patches_awesome · 引导器（拿原项目 → 装补丁）
 *
 * 这个仓库**不附带** Uranus 源码。上游许可是「非商业 · 原样转发须附全文」，
 * 所以这里不存副本，改成需要时从上游官方仓库拉一份干净的：
 *
 *   github.com/nikonotnicotine/Uranus_Imessage   tag v1.22.3
 *
 * 用法：
 *   node setup.mjs                         预览：要拉哪个版本、拉到哪、然后装什么
 *   node setup.mjs --run                   拉源码到 ./Uranus_Imessage（不装补丁）
 *   node setup.mjs --run --install         拉源码 + 装全部补丁
 *   node setup.mjs --run --dir ~/Uranus_test --tag v1.22.3
 *   node setup.mjs --run --use-existing    不下载，直接对已有目录装补丁
 *   node setup.mjs --run --no-git          不用 git，走 tarball 下载（没装 git 时用）
 *
 * 已有 Uranus 的人**不需要**跑这个脚本，直接用 install.mjs 就行。
 * 它存在的意义：换机器、想先试装一份、或者把「原项目 + 补丁」一次装齐。
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UPSTREAM = "https://github.com/nikonotnicotine/Uranus_Imessage";

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const valOf = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};

const RUN = has("--run");
const DO_INSTALL = has("--install");
const USE_EXISTING = has("--use-existing");
const NO_GIT = has("--no-git"); // 强制走 tarball（没装 git / git 被墙时用）
const TAG = valOf("--tag") ?? "v1.22.3";
const DIR = path.resolve(
  valOf("--dir") || (USE_EXISTING ? process.env.URANUS_DIR : "") || "Uranus_Imessage"
);

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
};

const say = (s) => console.log(s);
const ok = (s) => console.log(`${c.g("✓")} ${s}`);
const warn = (s) => console.log(`${c.y("!")} ${s}`);
const bad = (s) => console.log(`${c.r("✗")} ${s}`);

/* ------------------------------------------------------------------ 探测 */

function isUranus(dir) {
  const pkg = path.join(dir, "package.json");
  const entry = path.join(dir, "server", "src", "index.js");
  if (!fs.existsSync(pkg) || !fs.existsSync(entry)) return null;
  try {
    const p = JSON.parse(fs.readFileSync(pkg, "utf8"));
    return p.name === "uranus-imessage" ? p.version : null;
  } catch {
    return null;
  }
}

function haveGit() {
  try {
    execFileSync("git", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ 下载（无 git 时的兜底） */

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("重定向太多次"));
    https
      .get(url, { headers: { "User-Agent": "uranus-patches-setup" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return download(res.headers.location, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}：${url}`));
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/** 极简 tar 读取：够用于 GitHub 的 codeload 包（ustar + pax 长路径） */
function extractTarGz(buf, destRoot) {
  const tar = zlib.gunzipSync(buf);
  const str = (b, off, len) => {
    const s = b.subarray(off, off + len);
    const end = s.indexOf(0);
    return s.subarray(0, end === -1 ? s.length : end).toString("utf8");
  };
  let off = 0;
  let pending = null; // pax 里的 path
  let count = 0;
  while (off + 512 <= tar.length) {
    const head = tar.subarray(off, off + 512);
    if (head.every((b) => b === 0)) break;
    const name = str(head, 0, 100);
    const size = parseInt(str(head, 124, 12).trim(), 8) || 0;
    const type = String.fromCharCode(head[156] || 48);
    const prefix = str(head, 345, 155);
    const dataStart = off + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    off = dataStart + Math.ceil(size / 512) * 512;

    if (type === "x") {
      const m = data.toString("utf8").match(/(?:^|\n)\d+ path=([^\n]*)\n/);
      if (m) pending = m[1];
      continue;
    }
    if (type === "g" || type === "L") continue;

    let full = prefix ? `${prefix}/${name}` : name;
    if (pending) {
      full = pending;
      pending = null;
    }
    // 去掉 tar 包的顶层目录（GitHub 一律是 <repo>-<sha>/）
    const rel = full.split("/").slice(1).join("/");
    if (!rel) continue;
    if (rel.split("/").includes("..")) throw new Error(`可疑路径：${rel}`);
    const abs = path.join(destRoot, rel);

    if (type === "5") {
      fs.mkdirSync(abs, { recursive: true });
      continue;
    }
    if (type !== "0" && type !== "\0") continue; // 符号链接之类，跳过
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
    count += 1;
  }
  return count;
}

/* ------------------------------------------------------------------ 主流程 */

async function main() {
  const existing = fs.existsSync(DIR) ? isUranus(DIR) : null;
  const targetExists = fs.existsSync(DIR);

  say(c.b("\nuranus_patches_awesome · 引导器\n"));
  say(`  上游项目   ${UPSTREAM}`);
  say(`  版本       ${TAG}`);
  say(`  目标目录   ${DIR}`);
  say(`  已有内容   ${targetExists ? (existing ? `Uranus ${existing}` : "有目录，但不是 Uranus") : "空"}`);
  say(`  随后安装   ${USE_EXISTING ? "不下载，只装补丁" : DO_INSTALL ? "拉到源码后装全部补丁" : "不装（只拿源码）"}`);

  if (USE_EXISTING) {
    if (!existing) return bad(`--use-existing：${DIR} 里没有 Uranus（缺 package.json / server/src/index.js）`);
  } else if (targetExists) {
    if (existing) {
      warn(`目录里已经有一份 Uranus ${existing}，跳过下载`);
      if (existing !== TAG.replace(/^v/, "")) {
        warn(`它的版本是 ${existing}，本仓库补丁是按 ${TAG.replace(/^v/, "")} 做的 —— 版本不符时安装器会拦下来`);
      }
    } else {
      return bad(`目录 ${DIR} 存在但不是 Uranus，为免覆盖你自己的东西，我不动它。换个 --dir，或手动清空`);
    }
  }

  if (!RUN) {
    say(c.dim("\n这是预览，什么都没动。加 --run 才会真的下载/安装。"));
    if (!USE_EXISTING && !existing) {
      say(c.dim(`  node setup.mjs --run${DO_INSTALL ? " --install" : ""}\n`));
    }
    return;
  }

  /* 1) 拿源码 */
  if (!USE_EXISTING && !existing) {
    if (haveGit() && !NO_GIT) {
      say(`\n${c.b("用 git 拉取")}  --depth 1 --branch ${TAG}`);
      execFileSync(
        "git",
        ["clone", "--depth", "1", "--branch", TAG, `${UPSTREAM}.git`, DIR],
        { stdio: "inherit" }
      );
      ok(`已拉到 ${DIR}`);
    } else {
      say(`\n${c.b("没用 git（或没装），改走 tarball")}`);
      const url = `https://codeload.github.com/nikonotnicotine/Uranus_Imessage/tar.gz/refs/tags/${TAG}`;
      say(c.dim(`  ${url}`));
      const buf = await download(url);
      fs.mkdirSync(DIR, { recursive: true });
      const n = extractTarGz(buf, DIR);
      ok(`解出 ${n} 个文件到 ${DIR}`);
    }
    const v = isUranus(DIR);
    if (!v) return bad("拉下来的目录里没有 Uranus（package.json 的 name 不是 uranus-imessage）");
    ok(`版本确认：${v}`);
  }

  /* 2) 装补丁 */
  if (DO_INSTALL) {
    say(`\n${c.b("调 install.mjs 装补丁")}`);
    execFileSync("node", [path.join(HERE, "install.mjs"), "--all", "--run"], {
      stdio: "inherit",
      env: { ...process.env, URANUS_DIR: DIR },
    });
  } else {
    say(`\n下一步：`);
    say(c.dim(`  node install.mjs --all --run          # 装到 ${DIR}`));
    say(c.dim(`  URANUS_DIR=${DIR} node install.mjs --all --run`));
  }

  say(`\n上游许可提醒：Uranus 是**非商业**许可，只许自己玩/自己学，`);
  say(`不许卖、不许当付费服务、不许二次修改后对外分发。详见 ${UPSTREAM}/blob/master/LICENSE\n`);
}

main().catch((e) => {
  bad(String(e?.message ?? e));
  process.exit(1);
});
