# uranus-nosleep-guard

![Platform](https://img.shields.io/badge/platform-macOS-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Dependencies](https://img.shields.io/badge/deps-none-brightgreen)

**Mac 睡一觉醒来，Uranus 还活着，但网络栈已经被休眠挂死了 —— 这个补丁让它自动恢复。**

Uranus 睡醒后常常「假活」：8787 端口照常监听、进程也在、控制台打得开，
但所有出网请求全部超时（`ENOTFOUND` / `UND_ERR_CONNECT_TIMEOUT`），
于是 iMessage 不回消息、IG 不动、定时主动发信不发。
本工具检测到这种情况后**只重启一次 Uranus**，把卡死的网络栈换掉。

- ✅ 不禁用系统睡眠
- ✅ 不 `pkill`、不轮询拨号
- ✅ 不额外耗电（5 分钟看一次，几毫秒结束）
- ✅ 纯系统自带命令，零依赖
- ✅ 只在「真的需要」时动手，平时完全静默

> 📖 **完整用户指导（安装每一步、验证、调参、排错手册）见 [USAGE.md](USAGE.md)。**

---

## 目录

- [一、它到底解决什么](#一它到底解决什么)
- [二、判据（怎么决定要不要重启）](#二判据脚本怎么决定要不要重启)
- [三、安装](#三安装)
- [四、卸载](#四卸载)
- [五、可选：彻底禁止整机睡眠](#五可选彻底禁止整机睡眠)
- [六、可调参数](#六可调参数)
- [七、为什么不用「杀进程重拨」那种看门狗](#七为什么不用杀进程重拨那种看门狗)
- [八、兼容性](#八兼容性)
- [九、和 Uranus 的关系](#九和-uranus-的关系)
- [English quick start](#english-quick-start)

---

## 一、它到底解决什么

| 症状 | 是不是它管 |
|---|---|
| 睡醒后 Uranus 全链路超时（`ENOTFOUND` 一片） | ✅ 正是 |
| 隔天早上发现角色一夜没回消息 | ✅ 多半是 |
| `Connection dropped` 刷屏 | ❌ 那是 iMessage 投票流，与睡眠无关 |
| 进程直接死了 | ❌ 那是 launchd `KeepAlive` 的活，本补丁不插手 |

## 二、判据（脚本怎么决定要不要重启）

每 5 分钟跑一次，三个条件**同时**满足才重启：

1. **8787 有进程在监听**（没监听就交给 `KeepAlive` 自己拉，脚本不管）；
2. **这个进程的启动时间 < 最近一次「真正的唤醒」时间**
   —— 即进程是在睡觉之前就起来的，网络栈是旧的；
   - 唤醒时间取自 `pmset -g log`，**排除 `DarkWake` / `Maintenance`**（后台维护唤醒很频繁，不算）；
3. **已经唤醒超过 90 秒**（`WAKE_GRACE`）—— 避开刚唤醒的网络抖动，也避免重复重启。

拿到进程启动时间用 `ps lstart`，拿不到就回退 `etime`；
两者都拿不到时**保守跳过、不盲重启**。

## 三、安装

**方式 A（推荐）**：双击 `install.command`

**方式 B（终端）**：

```bash
cd 本目录
chmod +x install.command
./install.command
```

装完验证：

```bash
launchctl print gui/$(id -u)/com.uranus.wake-restart
# 有输出 = 在跑
```

日志在 `~/Uranus_Imessage/uranus-wake-restart.log`。
**平时是空的＝正常**，只有真的重启过才会写一行：

```
2026-10-23 08:12:03 RESTART pid=1234 (启动于 2026-10-22 23:41:09，早于最近唤醒 …；已唤醒 210s)
```

## 四、卸载

双击 `uninstall.command`。只删这个定时任务，**不动 Uranus 主服务**。

## 五、可选：彻底禁止整机睡眠

补丁是「睡醒后自愈」。如果你**根本不想让它睡**（比如 24 小时开机挂角色）：

```bash
sudo pmset -a sleep 0     # 禁止整机睡眠（要输开机密码）
pmset -g custom | grep sleep   # 确认 sleep 是 0
sudo pmset -a sleep 1     # 想改回来
```

⚠️ 注意两点：

- **macOS 大版本更新后会把它重置**，更新完记得重跑一次；
- 只锁屏幕不睡（合盖/电源键仍会睡）的话，这个补丁依然有用，建议**两个都留着**。
- 屏幕可以照常关（不影响）：
  ```bash
  sudo pmset -a displaysleep 10   # 10 分钟后只关屏，机器不睡
  ```

## 六、可调参数

都在脚本顶部：

```bash
PORT=8787            # Uranus 端口
URANUS_LABEL="com.uranus.imessage"   # launchd 服务名
WAKE_GRACE=90        # 唤醒后至少等多少秒再重启
```

检查频率在 plist 里：`StartInterval = 300`（5 分钟）。

## 七、为什么不用「杀进程重拨代理」那种看门狗

曾经做过一个「代理端口不通就 `pkill` 重开」的看门狗，
结果两份看门狗互相 kill + 反复重拨，导致代理**每 15 秒重启一次**的死循环。

本补丁刻意避开了那条路：

- 只调 `launchctl kickstart`（优雅重启），不 `pkill`；
- 每 5 分钟才看一次，且有 90 秒冷静期；
- 判定条件严格（进程比唤醒还老），不会误伤正常运行的实例。

## 八、兼容性

- macOS（LaunchAgents / `pmset` / `ps` BSD 语法）；脚本只用系统自带命令，无需装任何东西。
- 依赖 Uranus 由 launchd 托管（服务名 `com.uranus.imessage`）；
  如果你是手动 `node` 起的，脚本里的 `kickstart` 会失败，需要改成你自己的启动方式。
- 不含任何个人数据，可自由分享/改造。

---

## 九、和 Uranus 的关系

这是一个**第三方小工具**，不是 Uranus 的一部分，也不修改 Uranus 的任何代码。
它只是在旁边盯着：Mac 睡醒后如果发现 Uranus 是「睡觉之前就启动的」，就调
`launchctl kickstart` 帮它重启一次。

Uranus 本体另有其自己的使用许可；本仓库只包含这个独立脚本，**不受那份许可约束**。

---

## English (quick start)

A tiny macOS helper for [Uranus](https://github.com/nikonotnicotine/Uranus_Imessage) users.

**Problem:** after your Mac wakes from sleep, Uranus is still running (port 8787 listens)
but its network stack is dead — every outbound request times out (`ENOTFOUND`,
`UND_ERR_CONNECT_TIMEOUT`), so iMessage stops replying and scheduled messages never fire.

**Fix:** every 5 minutes this job checks whether the Uranus process was started
*before* the last real wake. If so (and it's been awake > 90s), it runs
`launchctl kickstart` once to restart Uranus.

It does **not** disable sleep, does **not** `pkill` anything, and uses only built-in
macOS commands.

```bash
# install: double-click install.command, or:
chmod +x install.command && ./install.command

# verify
launchctl print gui/$(id -u)/com.uranus.wake-restart

# uninstall: double-click uninstall.command
```

Optional — never let the machine sleep at all:

```bash
sudo pmset -a sleep 0
```

Requires Uranus to be managed by launchd (`com.uranus.imessage`). If you start Uranus
manually with `node`, edit `URANUS_LABEL` in `files/uranus-wake-restart.sh`.

## License

MIT — see [LICENSE](LICENSE).
