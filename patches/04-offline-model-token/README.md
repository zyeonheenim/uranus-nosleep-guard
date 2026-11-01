# 04 · 线下剧情 · 模型与 token (model / token)

> 依赖：02 → 03（同一段气泡代码）｜基线：Uranus 1.22.3｜改动：5 个文件

**一句话**：每一轮气泡的标题行，写清「这轮是谁生成的、用了多少 token」。

---

## 它治什么

一个角色通常配了主 API + 兜底 API。出问题时最想知道的就三件事：

1. **这一轮到底是谁写的？** 主端点挂了会静默走兜底，风格一变你只能靠感觉猜
2. **发了多少 token？** 上下文是不是又爆了、缓存有没有命中
3. **为什么这轮感觉不对？** —— 答案常常就写在第 1 条里

原版这些信息只在日志里，而且日志是多实例同写、行号不可靠。

---

## 装上之后

气泡标题行：

```
郑成灿   今天 19:24   ｜小鸡农场 · [Build][抗截断] gemini-3.8-flash   ｜↑49.3k(46k) ↓189
                      └── 这轮实际用的服务商 · 模型 ──┘              └─ 输入(缓存) 输出 ─┘
```

- 悬停看精确值：`输入 49299 tokens（缓存命中 45964）· 输出 189`
- 历史版本抽屉里每一版也带自己的用量（`· ↑1.3k ↓70`），恢复旧稿时用量跟着版本走
- 上游没回 usage 的那一轮就不显示 —— 不编数字
- 老轮次（装之前生成的）没有这两个字段，也不显示

---

## 机制

**取**：`llm.js:chatRaw()` 从上游响应的 `usage` 里剪出三件（`in` / `out` / `cached`），
随返回值一起交给调用方。流式的 usage 挂在最后一个 chunk 上（`include_usage`），有的源压根不给 → `null`。

**归一**：`normUsageTokens()` 认三种形状 —— 这是踩过坑的地方：

| 服务商类型 | 字段 |
|---|---|
| OpenAI 兼容（小鸡、聚梦、织云、舒芙蕾…） | `prompt_tokens` / `completion_tokens` / `prompt_tokens_details.cached_tokens` |
| **Gemini 原生**（Google Vertex 那条线） | `usageMetadata.promptTokenCount` / `candidatesTokenCount`（+ `thoughtsTokenCount`）/ `cachedContentTokenCount` |
| Claude | `input_tokens` / `output_tokens` / `cache_read_input_tokens` |

第一版只认 OpenAI 形状，于是 Gemini 原生那条线的轮次读出来全是 0，
被存档层当「没数据」清成 `null` —— 界面上就是「勾了功能但没显示」。现在三种通吃。

**存**：`offlinestore.js` 的 `normalizeTurn` 加 `model` / `tokens`，且**五处都要带**：
新增轮次、手改留底、重 roll 暂存（`pendingAlts`）、恢复旧稿、PATCH 透传。
少一处就会出现「重 roll 之后旧稿用量全空」——第一版就漏了 `pendingAlts`，自检抓到的。

**显示**：`fmtTok()`（≥1 万 → `49.3k`），标题行 + 历史版本行。

---

## 涉及文件

| 文件 | 改动 |
|---|---|
| `server/src/llm.js` | `chatRaw` 返回 `tokens` / `ms`；`normUsageTokens()` 三形状归一 |
| `server/src/offline.js` | 生成处接 `out.tokens`，`appendTurn` 存 `model` / `tokens` |
| `server/src/offlinestore.js` | `normTokens()`；`normalizeTurn` / `alts` / `pendingAlts` / `updateTurn` 全链路 |
| `server/src/index.js` | PATCH 路由透传 `model` / `tokens` |
| `client/src/ui.jsx` · `client/src/panels/offline.jsx` | `fmtTok()`、标题行、历史版本行、恢复时一起 PATCH |

---

## 安装 / 卸载

```bash
node install.mjs --only 02,03,04 --run
node uninstall.mjs --run
```

---

## 限制

- **只有新生成的轮次有数字**。历史轮次的用量当时没存，补不回来
- 走「按次计费」的源（比如小鸡农场那种 🐥0.001/次），token 数跟钱无关 —— 这里只显示量，不折算钱
- 不显示首字延迟 / tok/s：那要在前端接流式增量时计时，属于另一个改动
