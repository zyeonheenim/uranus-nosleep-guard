# 安装细节与排错

面向想搞清楚「它到底改了什么、为什么失败」的人。只想快点装上：回 [README](../README.md#快速开始)。

---

## 零、还没有 Uranus？

这个仓库不带源码。先拉一份干净的，再打补丁：

```bash
node setup.mjs                    # 预览：拉哪个 tag、拉到哪
node setup.mjs --run --install    # 从上游拉 v1.22.3 → 直接装全部补丁
```

- 默认用 `git clone --depth 1 --branch v1.22.3`；没装 git 或走不通就 `--no-git` 走官方 tarball
- 已经有一份想直接装：`node setup.mjs --run --use-existing --install --dir /path/to/Uranus_Imessage`
- 拉下来的东西跟官方 tag 一模一样（实测 282 个文件、逐字节无差异），本仓库不留副本 —— 原因见 [upstream.md](upstream.md)

---

## 一、装之前确认三件事

1. **Uranus 是 1.22.3**（补丁 02/03/04 的基线；01 与版本无关）
   ```bash
   python3 -c "import json;print(json.load(open('package.json'))['version'])"
   ```
2. **Node 能跑**（Uranus 本身就要 node，通常没问题）：`node -v`
3. **装了依赖**：`node_modules` 存在。没有就先 `npm install`，否则前端构建会被跳过，界面还是旧的

---

## 二、安装器的执行顺序

```
找目录 → 认版本 → 预演 → 备份 → 写入 → 语法检查 → 构建前端 → 自检
                        ↑                          ↓
                        └──── 任何一步失败就回滚 ───┘
```

**预演**是最关键的一步：整份补丁在内存里（其实是临时目录里）跑一遍，
任何一个 hunk 的上下文对不上，就**整体不动**地退出 —— 一个字节都不写。
所以「装到一半坏掉」这种情况在这个安装器里不会发生。

报错长这样，说明这个文件不是原版 1.22.3：

```
✗ 02 打不上：server/src/offlinestore.js: 第 469 行附近对不上 ——
  这个文件不是原版 1.22.3，或者已经装过别的补丁。这一份没有动过，检查完再试。
```

排查顺序：

1. 你是不是装过别的补丁？`git -C ~/Uranus_Imessage status --short` 看看这些文件有没有本地改动
2. 版本是不是 1.22.3？不是的话看 [README 的「升级之后」](../README.md#uranus-升级之后)
3. 都不是 → 提 issue，把 `package.json` 版本号 + 报错贴上来

---

## 三、为什么 02/03/04 要叠着装

它们改的是**同一个 React 组件** `client/src/panels/offline.jsx`，而且是**同一片区域**：

```
Bubble 组件
├─ 标题行   ← 02 加「历史 N」按钮，04 加「｜模型 ｜↑token ↓token」
├─ 气泡框   ← 03 加 style={自定义样式}
└─ 抽屉区   ← 02 加「历史版本」抽屉，04 给每一版加用量
```

如果拆成三个互相独立的补丁，会变成「三个补丁都想改标题行 → 第二个必然对不上」。
所以按 **02 → 03 → 04** 分段出：

| 装到 | 得到 |
|---|---|
| `--only 02` | 版本留底（完整可用） |
| `--only 02,03` | + 气泡样式 |
| `--only 02,03,04`（＝`--all`） | + 模型与 token |

安装器会自动补前置：`--only 03` 会提示「自动带上前置补丁：02」。
`--only 01` 不受影响 —— 它是独立脚本。

---

## 四、备份在哪、怎么手动退回

```
~/Uranus_Imessage/.patches-backup-20261101-224512/
├── manifest.json       装了哪几个补丁、改了哪些文件、每个文件原来存不存在
└── files/              改动前的原样（目录结构和 Uranus 一致）
```

手动退回（不想用脚本时）：

```bash
cd ~/Uranus_Imessage
cp -R .patches-backup-20261101-224512/files/* .
# 新加的文件（manifest 里 existed:false 的那些）自己删掉
cd client && npm run build
```

`node uninstall.mjs --run` 做的就是这件事，并且会顺手清理备份目录（`--keep` 保留）。

---

## 五、装完界面没变化？

按顺序查：

1. **前端没构建** → `cd client && npm run build`，看有没有报错
2. **浏览器缓存** → `Cmd+R`（Windows `Ctrl+F5`）
3. **服务没重启** → 关掉 Uranus 窗口重开，或者控制台里重启
4. **打开的是另一份** → 你是不是有多个 Uranus 目录？安装器打印的路径对不对
5. 还是不行 → 看 `uranus.log` 里有没有加载错误

---

## 六、01 号补丁单独说明

它装的是 **launchd 定时任务**，不是代码：

```bash
launchctl print gui/$(id -u)/com.uranus.wake-restart   # 有输出＝在跑
tail -5 ~/Uranus_Imessage/uranus-wake-restart.log      # 平时空＝正常
```

- 需要 Uranus 由 launchd 托管（服务名 `com.uranus.imessage`）；手动 `node` 起的实例
  `kickstart` 会失败，得改脚本里的 `URANUS_LABEL`
- 卸载：`patches/01-nosleep-guard/uninstall.command`（只删定时任务，不动 Uranus 主服务）
- 更细的判据与参数见 [它的 README](../patches/01-nosleep-guard/README.md) 和 [USAGE.md](../patches/01-nosleep-guard/USAGE.md)

---

## 七、自检在检查什么

`tests/smoke.mjs` 在临时目录里跑（`URANUS_DATA_DIR` 指到 tmp），**不联网、不碰你的真数据**：

| 补丁 | 检查项 |
|---|---|
| 02 | 手改留底、重 roll 进暂存、新回复接走旧稿、删除进存档、恢复写回正文、存档不进上下文 |
| 03 | 白名单只剩合法字段、越界值夹回、`GET`/`PUT` 两条路由挂上、index 真的挂载了 |
| 04 | OpenAI / Gemini 原生 / Claude 三种用量形状都认得、老轮次无用量不报错 |

只检查**装上的**那些补丁 —— 只装 02 时不会因为缺少 `bubblestyle.js` 报假错。
