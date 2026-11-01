#!/usr/bin/env node
/**
 * uranus_patches_awesome · 卸载 / 回退
 *
 * 装的时候每个被改的文件都原样复制到了 <Uranus>/.patches-backup-<时间戳>/files/，
 * 这里就是拿那份备份逐字节还原 —— 不是「反向打补丁」，所以只要备份还在，
 * 还原一定是干净的。
 *
 * 用法：
 *   node uninstall.mjs              预览：会用哪份备份、还原哪些文件
 *   node uninstall.mjs --run        还原最近一次安装
 *   node uninstall.mjs --run --all  按时间倒序还原全部（装过好几次时用）
 *   node uninstall.mjs --run --keep 还原但保留备份文件夹（想留个后路）
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RECORD = ".patches-backup-";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const say = (s = "") => console.log(s);
const ok = (s) => say(`${c.green("✓")} ${s}`);
const warn = (s) => say(`${c.yellow("!")} ${s}`);
const die = (s) => {
  say(`${c.red("✗")} ${s}`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const RUN = argv.includes("--run");
const ALL = argv.includes("--all");
const KEEP = argv.includes("--keep");

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function findTarget() {
  const tries = [process.env.URANUS_DIR, path.join(HERE, ".."), process.cwd(), path.join(process.env.HOME ?? "", "Uranus_Imessage")];
  for (const dir of tries) {
    if (!dir) continue;
    const pkg = path.join(dir, "package.json");
    if (!exists(pkg) || !exists(path.join(dir, "server", "src", "index.js"))) continue;
    try {
      const p = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (p.name === "uranus-imessage") return path.resolve(dir);
    } catch {
      /* 跳过 */
    }
  }
  return null;
}

function listBackups(dir) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(RECORD) && fs.statSync(path.join(dir, n)).isDirectory())
    .sort() // 名字里带时间戳，字典序＝时间序
    .reverse(); // 新的在前
}

say(c.bold("\nuranus_patches_awesome · 卸载\n"));

const target = findTarget();
if (!target) die("没找到 Uranus 安装目录。指定一下：URANUS_DIR=/路径/Uranus_Imessage node uninstall.mjs --run");

say(`Uranus：${c.bold(target)}`);

const boxes = listBackups(target);
if (!boxes.length) {
  ok("这个目录里没有安装备份 —— 没装过，或者已经被卸载过了。");
  say(c.dim("  第 01 号补丁是系统定时任务，卸载：patches/01-nosleep-guard/uninstall.command"));
  process.exit(0);
}

const use = ALL ? boxes : [boxes[0]];
say(`模式：${RUN ? c.green("真的还原") : c.yellow("预览（不写任何文件）")}`);
say("");

for (const name of use) {
  const box = path.join(target, name);
  const manPath = path.join(box, "manifest.json");
  if (!exists(manPath)) {
    warn(`${name} 里没有 manifest.json，跳过`);
    continue;
  }
  const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
  const mods = (man.modules ?? []).join(" + ") || "?";
  say(`${c.bold(name)}  ${c.dim(`${man.at ?? ""}  补丁 ${mods}`)}`);
  for (const f of man.files ?? []) {
    const abs = path.join(target, f.path);
    const from = path.join(box, "files", f.path);
    if (f.existed && exists(from)) {
      say(`  ${c.yellow("还原")}  ${f.path}`);
      if (RUN) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.copyFileSync(from, abs);
      }
    } else if (!f.existed) {
      say(`  ${c.red("删除")}  ${f.path}  ${c.dim("（安装时新建的）")}`);
      if (RUN) fs.rmSync(abs, { force: true });
    } else {
      warn(`${f.path}：备份里没有这一份（${f.existed ? "原文件不存在" : "新建文件"}），跳过`);
    }
  }
  say("");
}

if (!RUN) {
  say(c.dim("预览到此为止。真要还原："));
  say(c.bold("  node uninstall.mjs --run"));
  process.exit(0);
}

/* 01 号是系统定时任务，还原文件管不到它，单独调它的卸载脚本 */
const modsAll = new Set();
for (const name of use) {
  try {
    const man = JSON.parse(fs.readFileSync(path.join(target, name, "manifest.json"), "utf8"));
    for (const m of man.modules ?? []) modsAll.add(m);
  } catch {
    /* 忽略 */
  }
}
if (modsAll.has("01")) {
  try {
    execFileSync("bash", [path.join(HERE, "patches", "01-nosleep-guard", "uninstall.command"), "--yes"], { stdio: "pipe" });
    ok("第 01 号（唤醒防断流）的定时任务已移除");
  } catch (e) {
    warn(`第 01 号卸载脚本没跑通：${String(e.stderr ?? e.message).slice(0, 200)}`);
  }
}

if (!KEEP) {
  for (const name of use) fs.rmSync(path.join(target, name), { recursive: true, force: true });
  say(c.dim(`已清理备份文件夹（${use.length} 个）`));
}

say("");
ok("还原完成。");
say("  1. 重启 Uranus");
say("  2. 浏览器 Cmd+R 强刷");
say("");
