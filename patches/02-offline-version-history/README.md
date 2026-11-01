# 02 · 线下剧情 · 版本留底 (version-history)

> 依赖：无（可单独安装）｜基线：Uranus 1.22.3｜改动：4 个文件

**一句话**：重 roll、手改、删除 —— 三种「一按就没了」的操作，现在都留一份底，随时翻、随时恢复。

---

## 它治什么

线下剧情最常用的操作就是重 roll：不满意，再来一次。但原版是**直接把上一条回复删掉**：

- 重 roll 三次，前三版**永久消失**，只剩最后一版
- 手改一段独白，改完发现还是原来的好 —— 原句已经没了
- 删错一条轮次，只能翻记忆库里残缺的总结去「考古」

而模型的输出是有随机性的，同一次重 roll 常常一版比一版好，也可能第一版才是最好的。
没有留底，等于每次按下去都在赌。

---

## 装上之后

- 气泡标题行多一个按钮：`历史 3`（有 3 个旧版本）。点开是这个样子：

```
┌─ 这条的历史版本（旧的在前）· 点 ⟲ 恢复，现在的正文会先留底 ──────┐
│ 重roll  10/31 22:14  他说：……（旧版正文，可滚动）          ⟲  │
│ 手改    10/31 22:20  他说：……（你改之前的原句）            ⟲  │
└──────────────────────────────────────────────────────────┘
```

- 三个点菜单里也有「历史版本 (N)」，和标题行的按钮同一个东西
- 点 `⟲` 把那一版写回正文；**当前这一版会先变成历史**，所以来回切换不丢任何一版
- 删除的轮次不再人间蒸发，进的是剧情级的「已删除存档」

---

## 机制（想改的人看这里）

三层存储，都在剧情 JSON 里，**不进模型上下文**：

| 字段 | 位置 | 存什么 |
|---|---|---|
| `turn.alts[]` | 单条轮次 | 这一轮的历次版本（`kind: "reroll" \| "edit"`，带 `ts`，装了 04 还带 `model` / `tokens`） |
| `story.pendingAlts[]` | 剧情级暂存 | 重 roll 时被砍掉的回复先放这儿，等新的那条助手轮落盘时**接走** |
| `story.removed[]` | 剧情级存档 | 删掉的整条轮次（连 alts 一起搬进来 + `removedAt`） |

三个关键设计：

1. **重 roll 的旧稿挂在「新回复」上，不挂在 user 轮上。**
   挂 user 轮最直观，但会导致 user 气泡上出现「恢复」按钮 —— 一点就把角色旧稿写进 user 正文。
   这个坑真实踩过（一条 333 字的用户 prompt 被换成 1.3 万字正文），所以旧稿先进
   `pendingAlts` 暂存，等真正的新回复落盘时接走；如果用户没等新回复就发了下一句，
   这次重 roll 算放弃，旧稿转进 `removed`。

2. **迁移逻辑**：老版本（这个补丁的早期实现）把重 roll 旧稿挂在 user 轮上。
   读取时会把它们**搬到后面那条助手轮**上，一次读、一次修，不需要手动迁移。

3. **上限**：每条轮次最多 20 版（`MAX_ALTS`），每段剧情最多 100 条删除存档（`MAX_REMOVED`）。
   防止剧情文件无限膨胀 —— 剧情文件是每次读盘全量解析的。

上下文安全：`offline.js:historyOf()` 只读 `turn.content`，`alts` / `removed` 只进界面。
自检里专门有一条校验这个（`historyOf 读的是 turn.content`）。

---

## 涉及文件

| 文件 | 改动 |
|---|---|
| `server/src/offlinestore.js` | `alts` / `pendingAlts` / `removed` 三个字段的规范化、`updateTurn` 手改留底、`removeTurn` 删除存档、`dropLastAssistant` → **`archiveLastAssistant`** |
| `server/src/offline.js` | 重 roll 调用点改名、日志文案 |
| `server/src/index.js` | `archiveLastAssistant` 导入；PATCH 路由透传 |
| `client/src/panels/offline.jsx` | 历史版本按钮 / 抽屉 / 恢复、`versions` / `altsOpen` 等状态 |

> `dropLastAssistant` 改名成 `archiveLastAssistant` 是有意的：函数行为变了（不再只是删），
> 沿用老名字会让后来看代码的人以为它还在丢数据。改名后任何漏改的调用点会直接报错，而不是静默丢稿。

---

## 安装 / 卸载

```bash
node install.mjs --only 02 --run    # 从仓库根目录
node uninstall.mjs --run            # 用备份还原
```

手动打（有 `patch` 命令的话）：

```bash
cd /path/to/Uranus_Imessage
patch -p1 < /path/to/patches/02-offline-version-history/02-version-history.patch
cd client && npm run build
```

---

## 限制

- 只对**安装之后**产生的轮次生效；之前的轮次本来就没存过旧稿，补不回来
- 历史版本不参与上下文 —— 想让模型「记得」某个旧版本，得手动恢复它
- 恢复旧稿不会重新生成语音/图片，只换正文
