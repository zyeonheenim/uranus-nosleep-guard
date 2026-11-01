#!/usr/bin/env node
/**
 * 装完自检：不连网、不碰你的真数据 —— 在临时目录里把装上的功能各跑一遍。
 *
 *   node tests/smoke.mjs [Uranus 目录]
 *
 * 按「哪些补丁在」决定跑哪几段：
 *   02 版本留底 —— 手改留底 / 重 roll 暂存接走 / 删除进存档 / 恢复旧稿 / 存档不进上下文
 *   03 气泡样式 —— 白名单裁剪、越界夹回、GET/PUT 两条路由
 *   04 模型与 token —— 三种上游用量形状（OpenAI / Gemini 原生 / Claude）
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, ".."));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uranus-smoke-"));
process.env.URANUS_DATA_DIR = dir;

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass += 1;
    console.log(`${green("✓")} ${name}`);
  } else {
    fail += 1;
    console.log(`${red("✗")} ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const has = (rel, needle) => {
  try {
    return read(rel).includes(needle);
  } catch {
    return false;
  }
};

const has02 = has("server/src/offlinestore.js", "archiveLastAssistant");
const has03 = has("server/src/bubblestyle.js", "sanitizeBubbleStyle");
const has04 = has("server/src/llm.js", "normUsageTokens");

if (!has02 && !has03 && !has04) {
  console.log(dim("这次没装 02/03/04，没有要自检的代码补丁。"));
  process.exit(0);
}

/* ---------- 02 · 版本留底 ---------- */
if (has02) {
  const S = await imp("server/src/offlinestore.js");
  const key = "smoke-role";
  S.openOffline(key, { name: "自检剧情" });
  const sid = S.readIndex(key).currentId;
  const u = S.appendTurn(key, { role: "user", content: "第一句" });
  const extra = has04 ? { model: "某服务商 · 某模型", tokens: { in: 1200, out: 60, cached: 900 } } : {};
  const a1 = S.appendTurn(key, { role: "assistant", content: "第一版", ...extra });

  if (has04) {
    check("助手轮存下 model", a1.model === "某服务商 · 某模型", a1.model);
    check("助手轮存下 tokens", a1.tokens?.in === 1200 && a1.tokens?.out === 60, JSON.stringify(a1.tokens));
  }

  S.updateTurn(key, sid, a1.id, { content: "改过的" });
  let turn = S.readStory(sid).turns.find((t) => t.id === a1.id);
  check("手改会留底一版", turn.alts.length === 1 && turn.alts[0].content === "第一版");
  if (has04) {
    check("旧稿带自己的 model/tokens", turn.alts[0].model === "某服务商 · 某模型" && turn.alts[0].tokens?.in === 1200);
  }

  const dropped = S.archiveLastAssistant(key, sid);
  check("重 roll 会把末尾回复存起来", dropped === 1);
  check("旧稿进了暂存区", S.readStory(sid).pendingAlts.length >= 1);

  const a2 = S.appendTurn(key, { role: "assistant", content: "重 roll 版", ...(has04 ? { model: "另一个", tokens: { in: 1300, out: 70, cached: 0 } } : {}) });
  let st = S.readStory(sid);
  turn = st.turns.find((t) => t.id === a2.id);
  check("新回复接走旧稿", turn.alts.some((x) => x.kind === "reroll") && st.pendingAlts.length === 0);

  S.removeTurn(key, sid, u.id);
  check("删除的轮次进存档区", S.readStory(sid).removed.length === 1);

  const restored = S.readStory(sid).turns.find((t) => t.id === a2.id).alts[0];
  S.updateTurn(key, sid, a2.id, { content: restored.content, ...(has04 ? { model: restored.model, tokens: restored.tokens } : {}) });
  turn = S.readStory(sid).turns.find((t) => t.id === a2.id);
  check("恢复旧稿写回正文", turn.content === restored.content, turn.content);
  if (has04) {
    check(
      "恢复旧稿连 model/tokens 一起回来",
      turn.model === restored.model && JSON.stringify(turn.tokens) === JSON.stringify(restored.tokens),
      `${turn.model} / ${JSON.stringify(turn.tokens)}`
    );
    const plain = S.appendTurn(key, { role: "assistant", content: "没用量的一轮" });
    check("老轮次没有 tokens 也不报错", plain.tokens === null);
  }

  check("historyOf 读的是 turn.content（存档不进上下文）", /out\.push\(\{ role: t\.role, content: stamp \+ t\.content \}\)/.test(read("server/src/offline.js")));
  check("重 roll 走的是留底版本", /archiveLastAssistant\(roleKey, story\.id\)/.test(read("server/src/offline.js")));
}

/* ---------- 03 · 气泡样式 ---------- */
if (has03) {
  const B = await imp("server/src/bubblestyle.js");
  const cut = B.sanitizeBubbleStyle({ mode: "custom", user: { bg: "#FF0000", bgAlpha: 999 }, assistant: { text: "red" }, junk: 1 });
  check("样式只留白名单字段", !("junk" in cut) && cut.user.bg === "#ff0000");
  check("越界值夹回合法区间", cut.user.bgAlpha === 100 && cut.user.radius === 12, JSON.stringify(cut.user));
  const routes = [];
  B.mountBubbleStyle({ get: (p) => routes.push(`GET ${p}`), put: (p) => routes.push(`PUT ${p}`) });
  check("GET/PUT 两条路由都挂上", routes.length === 2, routes.join(" / "));
  check("index.js 挂载了气泡样式", has("server/src/index.js", "mountBubbleStyle(app)"));
}

/* ---------- 04 · 用量翻译 ---------- */
// llm.js 会连带引到 env.js（依赖 chinese-days 之类）；没装 node_modules 的目录跑不了，
// 那种情况跳过这一段，别把「缺依赖」算成「功能坏了」。
if (has04) {
  let chatWithFallback = null;
  try {
    ({ chatWithFallback } = await imp("server/src/llm.js"));
  } catch {
    console.log(dim("· 跳过「用量翻译」这一段：这份目录没装 node_modules（装进真实 Uranus 后会跑）"));
  }
  const shapes = {
    "OpenAI 形状": {
      body: {
        choices: [{ index: 0, message: { role: "assistant", content: "好" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } },
      },
      want: { in: 1000, out: 50, cached: 800 },
      type: "openai",
    },
    "Gemini 原生（Google Vertex 那种）": {
      body: {
        candidates: [{ content: { parts: [{ text: "好" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 49299, candidatesTokenCount: 189, thoughtsTokenCount: 37, cachedContentTokenCount: 45964 },
      },
      want: { in: 49299, out: 226, cached: 45964 },
      type: "gemini",
    },
    Claude: {
      body: { content: [{ type: "text", text: "好" }], stop_reason: "end_turn", usage: { input_tokens: 700, output_tokens: 30, cache_read_input_tokens: 500 } },
      want: { in: 700, out: 30, cached: 500 },
      type: "anthropic",
    },
  };
  for (const [name, c] of chatWithFallback ? Object.entries(shapes) : []) {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(c.body));
    });
    await new Promise((r) => server.listen(0, r));
    const ep = { type: c.type, url: `http://127.0.0.1:${server.address().port}/v1`, key: "k", model: "m", label: name };
    const out = await chatWithFallback(ep, null, [{ role: "user", content: "hi" }], {}, { label: "自检" });
    check(`认得 ${name} 的用量`, JSON.stringify(out.tokens) === JSON.stringify(c.want), JSON.stringify(out.tokens));
    server.close();
  }
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${fail ? red(`${fail} 项没过`) : green("全部通过")}（${pass} 项）\n`);
process.exit(fail ? 1 : 0);
