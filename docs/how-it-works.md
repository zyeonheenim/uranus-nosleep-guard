# 实现要点（给想改 / 想抄的人）

四个补丁踩过的坑，按「你如果自己重写一遍，会踩到哪」来组织。想直接看代码：
`patches/*/` 下的 patch 文件就是完整改动。

---

## 01 · 唤醒防断流

**判据是三个条件同时成立，缺一不可**：

```bash
# 1. 8787 有进程在监听（没监听 → 交给 launchd KeepAlive，脚本不插手）
PID=$(lsof -nP -iTCP:8787 -sTCP:LISTEN | awk 'NR==2{print $2}')

# 2. 进程启动时间 < 最近一次「真正的唤醒」
#    pmset -g log 里 Wake / DarkWake 都会出现，必须排除 DarkWake 和 Maintenance：
#    后台维护唤醒很频繁，拿它当判据会疯狂误重启
LAST_WAKE=$(pmset -g log | grep -E 'Wake from' | grep -vE 'DarkWake|Maintenance' | tail -1 ...)

# 3. 已经唤醒超过 90 秒（WAKE_GRACE）—— 避开刚唤醒的网络抖动，也避免重复重启
```

拿进程启动时间用 `ps -o lstart=`，拿不到回退 `etime`，**两者都拿不到就保守跳过**。
宁可这次不救，也不要盲重启一个正在正常工作的实例。

**为什么不用「代理端口不通就 pkill 重开」那种看门狗**：试过，两份看门狗互相 kill，
代理每 15 秒重启一次，变成死循环。这里只调 `launchctl kickstart`（优雅重启），
且 5 分钟才看一次。

---

## 02 · 版本留底

### 坑 1：旧稿挂在哪一轮

最直观是挂在 **user 轮**上（那条回复就是它的回复）。但界面是按轮次渲染按钮的，
一挂上去，user 气泡上就会出现「恢复」—— 一点就把角色旧稿写进 user 正文。
实际翻车记录：一条 333 字的用户 prompt 被替换成 1.3 万字正文。

所以：

```
重 roll → 旧稿进 story.pendingAlts
        → 新回复 appendTurn 时接走（alts 挂在**新回复**上）
        → 若用户没等新回复就发下一句，这次重 roll 算放弃，旧稿转 removed
```

### 坑 2：函数改名

`dropLastAssistant` → `archiveLastAssistant`。改名不是为了好看：
函数语义变了（从「删」变成「删并留底」），沿用老名字会让下一个读代码的人
以为它还在丢数据。改名后任何漏改的调用点会**直接报错**，而不是静默丢稿。

### 坑 3：三个存储区各自的持久化

`alts` 在轮次上、`pendingAlts` 和 `removed` 在剧情上 —— 都要在 `normalizeStory`
（每次读盘都过一遍）里规范化。少写一个，重启服务后那个字段就没了。

---

## 03 · 气泡样式

### 为什么必须放服务端

`localStorage` 按「设备 + 浏览器 + **源站**」隔离。手机用 `http://192.168.x.x:8787`、
电脑用 `http://127.0.0.1:8787`，**源站都不同 → 两份存储，永不互通**。
用户报的「手机改完电脑不变」就是这个，不是 bug。

### 为什么不放 config.json

控制台页面保存时会**整包覆盖** `data/config.json`（老坑，踩过十几次）。
UI 偏好放进去，下一次点保存就被冲掉。所以单开 `data/offline-bubbles.json` + 自己的两条路由。

### 服务端不信前端

```js
// 只留白名单字段；颜色只认 6 位 hex；圆角 0-40、边框 0-12、α 0-100 越界夹回
// 空 body → 400；> 20KB → 400
```

### 「跟随主题」必须是真的什么都不做

```js
function bubbleBoxStyle(style, mine) {
  if (!style || style.mode !== "custom") return null;   // ← 关键：返回 null
  ...
}
```

返回 `null` 时 React 不写 `style` 属性，气泡完全保持主题类名。
如果返回 `{}`，某些浏览器上会生成空的 style 属性，换主题时行为会漂。

### 先画缓存，再以服务端为准

打开瞬间用 `localStorage` 那份额外一份先画（否则会闪一下默认样式），
但**拿到服务端值之前禁止回推** —— 不然会用本地旧值把另一台设备刚改好的盖掉。
`styleSynced` 标志就是干这个的。

---

## 04 · 模型与 token

### 三种 usage 形状

```js
let inTok  = n(usage.prompt_tokens) || n(usage.promptTokenCount) || n(usage.input_tokens);
let outTok = n(usage.completion_tokens)
          || n(usage.candidatesTokenCount) + n(usage.thoughtsTokenCount)
          || n(usage.output_tokens);
let cached = n(usage.prompt_tokens_details?.cached_tokens)
          || n(usage.cachedContentTokenCount)
          || n(usage.cache_read_input_tokens);
```

Gemini 原生那条线（Vertex）回的是 `usageMetadata.*TokenCount`。
第一版只认 `prompt_tokens`，读出来 `0 / 0`，存档层判定「没数据」清成 `null` ——
表现是「功能装了但界面不显示」。**同一个字段名在不同服务商那里不一样**，这是最容易漏的一处。

### 五处都要带

`model` / `tokens` 是「这一版」的属性，所以：

1. `normalizeTurn`（新增轮次）
2. `alts[]`（手改留底）
3. `pendingAlts[]`（重 roll 暂存）← 第一版漏了这里，重 roll 之后旧稿用量全空
4. `updateTurn`（恢复旧稿时连 model/tokens 一起写回）
5. `index.js` 的 PATCH 路由（透传 `req.body.model` / `req.body.tokens`）

自检里专门跑一遍「重 roll → 接走 → 旧稿还带用量」，就是为了堵这个。

### 只显示量，不折算钱

按次计费的源（一个价买 N 次那种）跟 token 数无关，强行折算会得出错误的数字。
要显示成本就得维护一张价格表并且区分计费方式 —— 那是另一个功能的量级，没做。

---

## 补丁文件的格式约定

补丁是**标准统一 diff**，只用了 `--- a/` 和 `+++ b/` 两种前缀（不用 `diff --git`），
这样安装器的纯 JS 解析器和系统的 `patch -p1` 都能吃。

生成方式：拿到官方 1.22.3 源码，把改动**一条条手工放进去**（不是整文件覆盖），
然后 `diff -ruN` 出补丁。整文件覆盖会把上游的其他改动一起冲掉。
