# uranus_patches_awesome

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT%20%2F%20non--commercial-lightgrey)
![Base](https://img.shields.io/badge/Uranus-1.22.3-blue)
![Patches](https://img.shields.io/badge/patches-4-orange)

**给 [Uranus](https://github.com/nikonotnicotine/Uranus_Imessage) 用的一组补丁。一个补丁只干一件事，装之前自动备份，装坏了能一键退回。**

> ### 先看清楚这是什么
>
> 这里**没有 Uranus 本体**，只有补丁。上游项目是
> **[nikonotnicotine/Uranus_Imessage](https://github.com/nikonotnicotine/Uranus_Imessage)**
> （自建 iMessage 角色扮演客户端，**非商业许可**），补丁基线是它的 **v1.22.3**。
>
> - **已经装了 Uranus** → 直接 `node install.mjs --all --run`，完事。
> - **手上没有** → `node setup.mjs --run --install`：自动从上游官方仓库拉一份干净的 v1.22.3，再打补丁。
>   仓库里不存源码副本（上游许可只允许「原样、不收费、附全文」地转发），原因见 [docs/upstream.md](docs/upstream.md)。
>
> 上游许可的核心就一句：**自己玩、自己学，随便；赚钱，不行。**

这里的四个补丁都来自真实使用中的痛点，不是「看起来会很酷」的功能：

| # | 补丁 | 治什么 | 类型 |
|---|---|---|---|
| 01 | [唤醒防断流](#01--唤醒防断流-nosleep-guard) | Mac 睡一觉醒来，Uranus 还活着但出网全废（`ENOTFOUND`），角色不回消息 | 独立脚本，**不改 Uranus 代码** |
| 02 | [线下剧情 · 版本留底](#02--线下剧情--版本留底-version-history) | 重 roll 之后旧稿没了，手改之后原句没了，删错了找不回来 | 代码补丁（1.22.3） |
| 03 | [线下剧情 · 气泡样式](#03--线下剧情--气泡样式-bubble-style) | 手机上调好的气泡配色，电脑上不生效（localStorage 按源站隔离） | 代码补丁（1.22.3） |
| 04 | [线下剧情 · 模型与 token](#04--线下剧情--模型与-token-model--token) | 不知道这一轮是哪条线生成的、花了多少 token、是不是偷偷用了兜底 | 代码补丁（1.22.3） |

> 02 / 03 / 04 是同一个组件（线下剧情气泡）上的三个功能，所以它们**按 02 → 03 → 04 叠加**。
> 只装到 02 是完整可用的（纯版本留底）；想只要气泡样式就得连 02 一起装 —— 原因见 [docs/install.md](docs/install.md#为什么-020304-要叠着装)。

---

## 目录

- [快速开始](#快速开始)
- [上游项目与版本](#上游项目与版本)
- [补丁清单](#补丁清单)
- [01 · 唤醒防断流](#01--唤醒防断流-nosleep-guard)
- [02 · 线下剧情 · 版本留底](#02--线下剧情--版本留底-version-history)
- [03 · 线下剧情 · 气泡样式](#03--线下剧情--气泡样式-bubble-style)
- [04 · 线下剧情 · 模型与 token](#04--线下剧情--模型与-token-model--token)
- [安装器怎么用](#安装器怎么用)
- [卸载 / 回退](#卸载--回退)
- [Uranus 升级之后](#uranus-升级之后)
- [兼容性与已知限制](#兼容性与已知限制)
- [目录结构](#目录结构)
- [为什么不直接用 git patch](#为什么不直接用-git-patch)
- [English](#english)

---

## 快速开始

**手上已经有 Uranus：**

```bash
git clone https://github.com/zyeonheenim/uranus_patches_awesome.git
cd uranus_patches_awesome

node install.mjs                 # 先看：会改哪些文件（不写盘）
node install.mjs --all --run     # 真的装（01 + 02 + 03 + 04）
```

**手上还没有 Uranus（换机器、想先试装一份）：**

```bash
node setup.mjs                       # 预览：拉哪个 tag、拉到哪、装什么
node setup.mjs --run --install       # 从上游拉干净的 v1.22.3，然后装全部补丁
```

只想装其中一个：

```bash
node install.mjs --only 02 --run          # 只装「版本留底」
node install.mjs --only 02,03 --run       # 版本留底 + 气泡样式
node install.mjs --only 01 --run          # 只装唤醒防断流
```

装完两件事：**重启 Uranus**、浏览器 **Cmd+R**（前端有缓存）。

Uranus 装在哪？安装器会自己找（当前目录 / 上一层 / `~/Uranus_Imessage`）。找不到就指定：

```bash
URANUS_DIR=/path/to/Uranus_Imessage node install.mjs --all --run
```

---

## 上游项目与版本

| 项 | 值 |
|---|---|
| 上游 | [nikonotnicotine/Uranus_Imessage](https://github.com/nikonotnicotine/Uranus_Imessage)（[@nikonotnicotine](https://github.com/nikonotnicotine)） |
| 补丁基线 | **v1.22.3** |
| 上游许可 | 自定义非商业许可（[LICENSE](https://github.com/nikonotnicotine/Uranus_Imessage/blob/master/LICENSE)） |
| 本仓库自带源码 | **没有**（许可只允许原样转发；补丁属于修改） |

补丁是按 tag 源码逐行对上的，所以版本很要紧：1.22.3 精确匹配；1.22.4 多半能过；
更旧或更新会被**整体拒绝**（你的文件原封不动，不会写坏半个文件），`--force` 可强装。

拉源码的方式有两种，结果一样（实测同为 282 个文件、逐字节无差异）：

```bash
node setup.mjs --run --install                 # 默认：git clone --depth 1 --branch v1.22.3
node setup.mjs --run --install --no-git        # 没装 git：走官方 tarball
node setup.mjs --run --use-existing --install  # 不下载，直接对已有目录装
```

细节（版本对应表、升级后怎么办、许可怎么算）：[docs/upstream.md](docs/upstream.md)。

---

## 补丁清单

### 01 · 唤醒防断流 (nosleep-guard)

**症状**：Mac 合盖睡一晚，早上打开 —— Uranus 进程在、8787 端口在监听、控制台能开，
但所有出网请求超时（`ENOTFOUND` / `UND_ERR_CONNECT_TIMEOUT`），iMessage 不回、IG 不动、定时发信不发。
这是「进程活着，网络栈被休眠挂死了」。

**做法**：launchd 每 5 分钟看一次。三个条件**同时**满足才重启一次 Uranus：

1. 8787 有进程在监听（没监听就交给 Uranus 自己的 `KeepAlive`，脚本不插手）；
2. **进程启动时间早于最近一次真正的唤醒**（`pmset -g log`，排除 `DarkWake` / `Maintenance`）；
3. 已唤醒超过 90 秒（避开唤醒瞬间的网络抖动）。

- 不禁用系统睡眠、不 `pkill`、不轮询拨号、零依赖（只用 macOS 自带命令）
- 平时完全静默，日志只有真的重启过才会写一行
- 📖 详细说明：[patches/01-nosleep-guard/README.md](patches/01-nosleep-guard/README.md) ｜ 手把手指南：[USAGE.md](patches/01-nosleep-guard/USAGE.md)

```bash
# 也可以单独双击装（不装另外三个）
patches/01-nosleep-guard/install.command
```

---

### 02 · 线下剧情 · 版本留底 (version-history)

重 roll 是日常操作，但 Uranus 原版是**直接删**：一按重 roll，上一版正文就没了。
手改也是原地覆盖，改完想找回原句只能翻记忆库里残缺的总结。

装上之后：

- 重 roll 的旧稿、手改前的旧稿、被删掉的整轮 —— **都留底**
- 气泡标题多一个 `历史 3` 小按钮，点开是这一轮的全部旧版本，`⟲` 一键写回正文
- 恢复时**当前版本也会先留底**，来回切不丢任何一版
- 历史版本只给界面看，**不进模型上下文**（不会因为翻旧稿让剧情错乱）
- 每条轮次最多留 20 版，每段剧情最多留 100 条已删除轮次（有上限，文件不会无限膨胀）

📖 [patches/02-offline-version-history/README.md](patches/02-offline-version-history/README.md)

---

### 03 · 线下剧情 · 气泡样式 (bubble-style)

Uranus 原版的气泡样式只能改主题，改不了「我这侧浅灰、他那侧米白、圆角 18、边框淡一点」。

装上之后：线下页顶部多一个 **样式** 按钮 —— 上方实时预览，`跟随主题 / 自定义` 二选一，
自定义里 **用户侧 / 助手侧分别** 调底色、底色不透明度、边框色、边框不透明度、边框宽度、文字色、圆角。
改完即时生效，没有「保存」按钮，关掉就是存好了。

关键点：**样式存在服务端**（`data/offline-bubbles.json`，走 `/api/offline-bubbles`），
不是只塞在浏览器里 —— 因为 localStorage 按「设备 + 浏览器 + 源站」隔离，
手机用 `http://192.168.x.x:8787`、电脑用 `http://127.0.0.1:8787` 打开时**永远是两份**，
所以手机上调完电脑上不变。现在两台设备读同一份。

📖 [patches/03-offline-bubble-style/README.md](patches/03-offline-bubble-style/README.md)

---

### 04 · 线下剧情 · 模型与 token (model / token)

一个角色配了主 API + 兜底 API，出问题时最想知道的就是：**这一轮到底是谁写的、花了多少。**

装上之后气泡标题变成：

```
郑成灿  今天 19:24  ｜小鸡农场 · [Build][抗截断] gemini-3.8-flash  ｜↑49.3k(46k) ↓189
```

- `｜服务商 · 模型`：这一轮实际用的端点。**走兜底的那轮记兜底的标签** —— 「为什么这轮风格不对」一眼能看出来
- `↑输入`：发给模型的 token，括号里是**缓存命中**的部分；`↓输出`：模型回的 token
- 悬停看精确值（`输入 49299 tokens（缓存命中 45964）· 输出 189`）
- 历史版本抽屉里每一版也带自己的用量，恢复旧稿时用量跟着版本走
- 用量识别三种形状：OpenAI（`prompt_tokens`）、Gemini 原生（`usageMetadata`，Google Vertex 走这个）、Claude（`input_tokens`）

上游不回 usage 的那一轮就不显示，不影响别的。

📖 [patches/04-offline-model-token/README.md](patches/04-offline-model-token/README.md)

---

## 安装器怎么用

```
node install.mjs --list                  列出补丁和状态（装没装、能不能装）
node install.mjs                         预览：会改哪些文件（默认不写盘）
node install.mjs --run --all             全装
node install.mjs --only 01,02 --run      装指定几个
node install.mjs --all --run --no-build  跳过前端构建（你自己会 build）
node install.mjs --all --run --force     版本号对不上也强装
```

安装器做的事，按顺序：

1. **找目录 + 认版本**：读 `package.json` 的 `name: uranus-imessage` 和 `version`；不是 1.22.3 会停下来问你（`--force` 才继续）
2. **预演**：整份补丁先在内存里跑一遍，任何一个 hunk 对不上 → **整体不动**，一个字节都不写
3. **备份**：被改的文件原样复制到 `.patches-backup-<时间戳>/`（含 `manifest.json`）
4. **写入**：按 02 → 03 → 04 顺序打
5. **语法检查**：`node --check` 每个改过的服务端文件，不过就**自动用备份回滚**
6. **构建前端**：`cd client && npm run build`（没有 `node_modules` 会跳过并提醒）
7. **自检**：跑 `tests/smoke.mjs`（纯逻辑，不联网、不碰你的数据）

---

## 卸载 / 回退

```bash
node uninstall.mjs           # 预览：会用哪份备份还原什么
node uninstall.mjs --run     # 真的还原
```

卸载走**安装时的那份备份**，所以还原是逐字节的（新加的文件会被删掉，改过的文件会回到安装前）。
补丁 01 有自己的卸载：`patches/01-nosleep-guard/uninstall.command`（只删定时任务，不动 Uranus 主服务）。

---

## Uranus 升级之后

**升级会覆盖被改的文件** —— 补丁不是插件，是直接改源码。所以：

```bash
cd uranus_patches_awesome && git pull
node install.mjs --list          # 看哪些补丁「已失效」
node install.mjs --all --run     # 重新装上
```

- 版本号变了但代码没大动（1.22.x 内的小改）：`--force` 通常能打上
- 大版本升级后上下文对不上：安装器会**拒绝安装并说明哪个文件对不上**，不会改坏东西。
  这种情况提 issue，把 `package.json` 的版本号贴上，我按新版本重出补丁。

---

## 兼容性与已知限制

- **补丁 02/03/04 只针对 Uranus 1.22.3**（基线源码：官方发布的 1.22.3，未含任何第三方改动）
- 前端改的是 `client/src/panels/offline.jsx` 等文件，装完**必须重新 build**，否则界面还是旧的
- 补丁只动「线下剧情」这条链，**不碰** iMessage 桥接、查手机、记忆库的既有逻辑
- 03 的样式存在 `data/offline-bubbles.json`，备份 Uranus 时记得一起备份
- 04 的用量只能从「有 usage 的上游」取；流式源不回 usage 尾帧的那一轮就没有数字
- **不含任何角色卡、世界书、记忆库、API 密钥** —— 这个仓库只有机制，没有我的私人设定
- 01 只支持 macOS（launchd / `pmset`）；Windows 与 Linux 请跳过 01

---

## 目录结构

```
uranus_patches_awesome/
├── install.mjs               统一安装器（自带纯 JS 补丁引擎）
├── uninstall.mjs             按备份还原
├── setup.mjs                 从上游拉干净源码（不存副本），再交给 install.mjs
├── 安装.command               双击：全装
├── NOTICE.md                 归属与许可边界（上游非商业许可）
├── patches/
│   ├── 01-nosleep-guard/     独立脚本补丁（不改代码）
│   │   ├── README.md  USAGE.md
│   │   ├── install.command  uninstall.command
│   │   └── files/uranus-wake-restart.sh
│   ├── 02-offline-version-history/   README.md + 02-version-history.patch
│   ├── 03-offline-bubble-style/      README.md + 03-bubble-style.patch
│   └── 04-offline-model-token/       README.md + 04-model-token.patch
├── docs/
│   ├── install.md            安装细节、叠装顺序、排错
│   ├── upstream.md           上游项目、版本对应、许可、为什么不打包源码
│   └── how-it-works.md       每个补丁的实现要点（给想改的人）
├── tests/smoke.mjs           装完自检（纯逻辑，不联网）
└── CHANGELOG.md
```

---

## 为什么不直接用 git patch

因为分发对象是「用 Uranus 的人」，不是「维护 Uranus 的人」：

- 有人 Windows 上跑 Uranus，**没有 `patch` 命令**；有人机器上没装 git
- `git apply` 要求上下文严格一致，Uranus 升级一次就全废，且**报错时半个文件可能已经写进去了**
- 这里自带一个纯 JS 的统一 diff 引擎：先全文搜上下文（不靠行号），
  唯一命中才动手；多处命中取离补丁行号最近的；**一处对不上就整份不动**

代价是补丁文件必须保持「标准统一 diff」格式（`--- a/…` / `+++ b/…`），
所以它们照样能用 `patch -p1 < xxx.patch` 打 —— 两条路都留着。

---

## License

分两层，别混：

| 对象 | 许可 |
|---|---|
| 本仓库的脚本与文档（`install.mjs` / `uninstall.mjs` / `setup.mjs` / `tests/` / `patches/01-*/` 的脚本） | **MIT** —— 见 [LICENSE](LICENSE) |
| `patches/**/*.patch` 里的代码片段 | **上游代码的衍生物**，跟着上游的**非商业**许可走 |
| 打完补丁的 Uranus | 仍是上游作品，仍受上游许可约束 |

一句话：**自己玩、自己学随便；卖钱、收费代搭建、二次修改后对外分发 —— 不行。**
边界写清楚在 [NOTICE.md](NOTICE.md)。

---

## English

A small collection of patches for [Uranus](https://github.com/nikonotnicotine/Uranus_Imessage)
(a self-hosted iMessage character-simulation app). Each patch does one thing, backs up
before touching anything, and can be rolled back byte-for-byte.

| # | Patch | What it fixes |
|---|---|---|
| 01 | `nosleep-guard` | After your Mac wakes from sleep, Uranus keeps running but its network stack is dead (`ENOTFOUND` everywhere). A launchd job restarts it once — only when the process is older than the last real wake. macOS only, no code changes. |
| 02 | `offline-version-history` | Re-roll / manual edit / delete all keep a copy. A `历史 N` button on each bubble lists previous versions and restores any of them (current one is archived first). Never fed back into the model context. |
| 03 | `offline-bubble-style` | Per-side bubble colours (background, border, text, radius) with live preview, **stored server-side** so phone and desktop finally share one style. |
| 04 | `offline-model-token` | Bubble header shows which provider/model generated that turn (fallback included) plus `↑input (cached) ↓output` tokens. Handles OpenAI / Gemini-native / Claude usage shapes. |

```bash
node install.mjs --list              # what's available / installed
node install.mjs --all --run         # install everything
node install.mjs --only 02,03 --run  # or a subset
node uninstall.mjs --run             # restore from backup
```

Requirements: Uranus **1.22.3** (patches 02–04 are source patches against that release),
Node.js (already required by Uranus). Then restart Uranus and hard-refresh the console.

Patches 02 → 03 → 04 stack in that order (same React component). 01 is independent.
No character cards, world books, memories or API keys are included — mechanism only.

**No Uranus source is bundled here.** Upstream is under a custom *non-commercial* licence
that permits re-sharing only unmodified copies, so instead of vendoring a copy,
`setup.mjs` fetches a clean `v1.22.3` straight from the official repository:

```bash
node setup.mjs --run --install            # git clone --branch v1.22.3, then install
node setup.mjs --run --install --no-git   # same tree via tarball (no git needed)
node setup.mjs --run --use-existing --install   # already have it? skip the download
```

Licence: our scripts are MIT; the `.patch` files contain upstream code fragments and
therefore follow upstream's non-commercial terms. See [NOTICE.md](NOTICE.md).
