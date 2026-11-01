# 使用指导 · uranus-nosleep-guard

这份是「手把手」版。README 是速览，这里把**每一步会看到什么、看不懂的输出怎么解读、
出问题怎么排查**都写全了。

---

## 0. 三十秒版

```bash
# 1) 双击 install.command（或终端里 ./install.command）
# 2) 验证
launchctl print gui/$(id -u)/com.uranus.wake-restart
#    有输出 = 装好了；报 "Could not find service" = 没装上
# 3) 完事。日志平时是空的，只有真重启过才会有内容。
```

---

## 1. 背景：为什么会「睡醒就哑」

Mac 进入睡眠时，内核会把网络栈一起挂起。唤醒后大多数 App 能自己恢复，
但**长驻的 Node 服务经常恢复不了**——它手里的 socket / DNS 缓存还停留在睡前状态：

| 现象 | 本质 |
|---|---|
| 控制台能打开、进程在、8787 在监听 | 服务本身没死 |
| 但日志里一片 `ENOTFOUND` / `UND_ERR_CONNECT_TIMEOUT` | 出网全挂 |
| 角色不回消息、IG 不动、定时主动消息不发 | 依赖出网的功能全部停摆 |
| 手动重启 Uranus 后立刻恢复 | 印证是网络栈问题，不是配置/模型问题 |

关键特征：**重启就活**。所以解法不是改配置，而是「检测到这种情况时自动重启一次」。

### 为什么必须检测，不能定时重启？
无脑定时重启会在你正聊到一半时把服务打断（正在生成的回复会丢、iMessage 桥接会闪断）。
所以必须判断「这次是真的睡醒导致的」。

---

## 2. 判据：它怎么知道该不该重启

每 5 分钟跑一次，下面三个条件**全部满足**才动手：

```
① 8787 端口有进程在监听
     └─ 没有 → 说明服务压根没起来，交给 Uranus 自带的 KeepAlive 拉，本脚本不管

② 这个进程的「启动时刻」 < 「最近一次真正的唤醒时刻」
     └─ 进程是睡觉之前就起来的 → 它手里的网络栈是旧的

③ 距离那次唤醒已经过了 90 秒（WAKE_GRACE）
     └─ 避开刚唤醒时的网络抖动，也保证一次唤醒只重启一次
```

### 「真正的唤醒」怎么取
`pmset -g log` 里会记下所有唤醒事件，但绝大部分是你看不见的后台维护
（`DarkWake`——比如夜间备份、网络唤醒）。这些**不算**，脚本用
`grep -v -E "Dark|Maintenance|Wake request"` 把它们过滤掉，只认用户真正开盖/按键的那次。
否则你每晚会看到一堆假唤醒、可能误触发重启。

### 拿不到信息时怎么办
获取进程启动时间优先用 `ps lstart`，失败则回退 `etime` 解析。
**两者都拿不到时脚本直接跳过、不盲重启**（日志里会写一行 `SKIP`）。
宁可漏一次，也不乱重启。

---

## 3. 安装

### 方式 A：双击（推荐）

在访达里双击 `install.command`。macOS 可能会提示
「无法打开，因为它来自身份不明的开发者」——右键点它 → **打开** → 再点「打开」即可。
（这是 Gatekeeper 对未签名脚本的常规提示，不是报错。）

### 方式 B：终端

```bash
cd 你解压出来的目录
chmod +x install.command
./install.command
```

### 安装过程到底做了什么

1. 检查 `~/Uranus_Imessage` 存在（不存在会直接退出并提示）
2. 把 `files/uranus-wake-restart.sh` 复制到 `~/Uranus_Imessage/`
3. 生成 `~/Library/LaunchAgents/com.uranus.wake-restart.plist`，
   里面的路径**写死成你当前的家目录**（所以换机器要重装）
4. 先 `bootout` 再 `bootstrap` —— 重复运行无副作用，可以放心多点几次
5. 立刻 `kickstart` 跑一次自检
6. 打印状态

### 装完你应该看到

```
✅ 脚本已放到 /Users/你的名字/Uranus_Imessage/uranus-wake-restart.sh
✅ 已写 /Users/你的名字/Library/LaunchAgents/com.uranus.wake-restart.plist
✅ 已注册并运行中（每 5 分钟检查一次）
```

---

## 4. 验证装好了

```bash
launchctl print gui/$(id -u)/com.uranus.wake-restart
```

- ✅ **有一大段输出**（含 `state = running`、下次触发时间等）→ 装好了
- ❌ `Could not find service "com.uranus.wake-restart"` → 没装上，见第 10 节

顺手确认主服务也在（本补丁不管它，但它是前提）：

```bash
launchctl print gui/$(id -u)/com.uranus.imessage   # 应正常输出
lsof -nP -iTCP:8787 -sTCP:LISTEN                   # 应有 LISTEN 行
```

---

## 5. 不用真的睡一觉，也能测一次

想确认脚本逻辑通不通（不等睡觉）：

```bash
# 手动触发一次执行（不等那 5 分钟）
launchctl kickstart -p gui/$(id -u)/com.uranus.wake-restart

# 看它有没有跑、有没有往日志写东西
tail -5 ~/Uranus_Imessage/uranus-wake-restart.log
tail -5 ~/Uranus_Imessage/uranus-wake-restart.out
```

- 现在没睡过觉 → 脚本什么都不做、日志**不新增任何内容**，这是**正确行为**
- 想看它真的重启一次，可以用 `sudo pmset sleepnow` 强制睡一次，
  等两分钟开盖唤醒，再过 90 秒看日志（会出现一行 `RESTART`）

---

## 6. 日志在哪、怎么看

| 文件 | 内容 |
|---|---|
| `~/Uranus_Imessage/uranus-wake-restart.log` | 脚本自己写的，只有真重启时才有一行 |
| `~/Uranus_Imessage/uranus-wake-restart.out` / `.err` | launchd 捕获的标准输出/错误，一般为空 |

日志行的样子：

```
2026-10-23 08:12:03 RESTART pid=1234 (启动于 2026-10-22 23:41:09，早于最近唤醒 2026-10-23 08:05:00；已唤醒 210s)
```

可能出现的另一种：

```
2026-10-18 10:07:56 SKIP pid=2806 (无法获取进程启动时间)
```

表示拿不到启动时间、保守跳过。**偶尔出现正常**；如果每一行都是 SKIP，
说明 `ps` 被限制（少见，多发生在从 SSH/脚本环境调用时）。

> **日志为空 = 一切正常**，别因为它没东西而以为没在跑。

---

## 7. 可调参数

脚本本体 `~/Uranus_Imessage/uranus-wake-restart.sh` 顶部：

```bash
PORT=8787                        # Uranus 端口，改过端口就要改这里
URANUS_LABEL="com.uranus.imessage"   # launchd 服务名
WAKE_GRACE=90                    # 唤醒后至少等多少秒再重启
```

检查频率在 plist 里：`StartInterval = 300`（秒）。

改完**必须重新注册**才生效：

```bash
launchctl bootout gui/$(id -u)/com.uranus.wake-restart
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.uranus.wake-restart.plist
```

### 怎么调
- 想更快恢复 → `WAKE_GRACE` 调到 30、`StartInterval` 调到 120
- 觉得太敏感 → `WAKE_GRACE` 调到 180
- 默认 90 秒 / 5 分钟是平衡值，一般不用动

---

## 8. 可选：根本不让它睡

补丁是「睡醒后自愈」。如果你**压根不想让它睡**（24 小时挂角色）：

```bash
sudo pmset -a sleep 0          # 禁止整机睡眠，要输开机密码
pmset -g custom | grep sleep   # 确认 sleep 一行是 0
sudo pmset -a sleep 1          # 改回来
```

只关屏、机器不睡（推荐搭配，省电又不影响）：

```bash
sudo pmset -a displaysleep 10  # 10 分钟后关屏，机器继续跑
```

⚠️ 两点必须知道：
1. **macOS 大版本更新会把 `pmset` 重置**，更新后要重跑一次（这补丁也一样会被重置，重装即可）
2. 建议 **两个都留着**：`pmset` 减少睡眠次数，本补丁兜住偶尔发生的睡眠（合盖、断电、系统更新重启后的首次睡眠）

---

## 9. 卸载

双击 `uninstall.command`，或：

```bash
launchctl bootout gui/$(id -u)/com.uranus.wake-restart
rm -f ~/Library/LaunchAgents/com.uranus.wake-restart.plist
rm -f ~/Uranus_Imessage/uranus-wake-restart.sh
```

只删这个定时任务，**Uranus 主服务完全不受影响**。

注：如果之前手动设过 `sudo pmset -a sleep 0`，卸载**不会**帮你改回来，
需要的话执行 `sudo pmset -a sleep 1`。

---

## 10. 排错手册

| 症状 | 原因 | 怎么办 |
|---|---|---|
| `Could not find service "com.uranus.wake-restart"` | launchd 没注册上 | 重新双击 `install.command`；若是在「远程/脚本」环境里执行的，改在访达里双击 |
| 安装时 `Bootstrap failed: 5: Input/output error` | 从受限的 shell 环境（如被沙箱的终端、SSH）跑 bootstrap | 同上，在自己打开的「终端」App 里双击或手敲 |
| 双击提示「来自身份不明的开发者」 | Gatekeeper 常规拦截 | 右键 → 打开 → 再点「打开」 |
| `launchctl print` 有输出，但日志永远空 | 正常 | 没睡过觉就不会重启；按第 5 节强制睡一次验证 |
| 日志每行都是 `SKIP (无法获取进程启动时间)` | `ps` 取不到信息 | 确认是从正常终端注册的任务；重装一次 |
| 睡醒后还是断了，日志没写 | 条件没满足（比如进程其实是唤醒后新起的） | 先看 `pmset -g log` 有没有真唤醒记录；再确认 `ps -o lstart= -p <8787的pid>` 能正常输出 |
| 装的不是默认端口 8787 | 脚本里 `PORT=8787` 写死 | 改脚本顶部 `PORT` 并重新注册（第 7 节） |
| Uranus 是手动 `node` 启动的 | 服务不在 launchd 里，`kickstart` 必然失败 | 改脚本里的重启方式为你自己的启动命令 |
| 系统更新后失效 | 更新重置了电源设置/启动项 | 重新双击 `install.command` |

### 查 Uranus 进程的启动时间（排错常用）

```bash
PID=$(lsof -nP -iTCP:8787 -sTCP:LISTEN | awk 'NR==2{print $2}')
echo "pid=$PID"
ps -o lstart= -p $PID          # 进程什么时候起的
pmset -g log | grep -E "Wake" | grep -v -E "Dark|Maintenance" | tail -3
```

进程启动时间 **早于** 最后一条真唤醒记录 = 补丁该动手了。

---

## 11. 进阶

- **换机器**：把整个目录拷过去，重新双击 `install.command`（plist 里的家目录要重新生成）
- **想让它顺带做别的事**：在 `uranus-wake-restart.sh` 的 `RESTART` 分支后面加你自己的命令
  （比如顺带重启代理、发一条通知）
- **多用户/多实例**：改 `URANUS_LABEL` 和 plist 的 `Label` 即可并存

---

## 12. 安全说明

- 脚本只用 macOS 自带命令：`lsof`、`ps`、`date`、`pmset`、`launchctl`
- 不做任何联网动作，不上传任何数据
- 不修改 Uranus 的任何文件，只调 `launchctl kickstart` 重启它
- 不读你的聊天内容、不碰 `data/` 下的任何数据

---

## English

See the **English quick start** section in [README.md](README.md).
In short:

```bash
chmod +x install.command && ./install.command
launchctl print gui/$(id -u)/com.uranus.wake-restart   # verify
```

Logs: `~/Uranus_Imessage/uranus-wake-restart.log` — empty means everything is fine.
