#!/bin/bash
# ============================================================
#  Uranus「唤醒后自动恢复」防断流补丁 —— 一键安装
#  双击这个文件即可（macOS）。
#
#  它做什么：
#    每 5 分钟检查一次：如果 Mac 睡过一觉、而 Uranus 进程是在「上一次唤醒之前」
#    就启动的（网络栈被休眠挂死，出网全超时），就自动 kickstart 重启 Uranus，
#    恢复 iMessage 桥接 / IG 互动 / 主动发信。
#
#  它不做什么（很重要）：
#    - 不禁用系统睡眠、不改任何电源设置（想彻底不睡见 README 的可选步骤）
#    - 不杀进程、不轮询拨号、不额外耗电
#    - 只在「唤醒后 90 秒 + 进程确实比上次唤醒还老」时才重启，且只重启一次
# ============================================================

set -u
cd "$(dirname "$0")" || exit 1

# --yes：给统一安装器（node install.mjs）调的时候用，不等人按键
YES=0
[ "${1:-}" = "--yes" ] && YES=1
pause() { [ "$YES" = 1 ] || read -r -p "$1" _; }

HOME_DIR="$HOME"
LABEL="com.uranus.wake-restart"
PLIST="$HOME_DIR/Library/LaunchAgents/$LABEL.plist"
SRC="files/uranus-wake-restart.sh"
DST="$HOME_DIR/Uranus_Imessage/uranus-wake-restart.sh"
DOMAIN="gui/$(id -u)"

echo ""
echo "=========================================="
echo " Uranus 防断流补丁 · 安装"
echo "=========================================="
echo ""

# ---- 0. 检查 Uranus 目录 ----
if [ ! -d "$HOME_DIR/Uranus_Imessage" ]; then
  echo "❌ 没找到 $HOME_DIR/Uranus_Imessage"
  echo "   请把 Uranus 装在用户主目录下，或改好路径再运行。"
  pause "按回车退出…"
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "❌ 同目录下缺少 files/uranus-wake-restart.sh"
  pause "按回车退出…"
  exit 1
fi

# ---- 1. 放脚本 ----
cp "$SRC" "$DST"
chmod +x "$DST"
echo "✅ 脚本已放到 $DST"

# ---- 2. 写 launchd 配置（路径写死成当前用户的家目录）----
mkdir -p "$HOME_DIR/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$DST</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>StartInterval</key>
    <integer>300</integer>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>LANG</key>
        <string>C</string>
    </dict>

    <key>StandardOutPath</key>
    <string>$HOME_DIR/Uranus_Imessage/uranus-wake-restart.out</string>
    <key>StandardErrorPath</key>
    <string>$HOME_DIR/Uranus_Imessage/uranus-wake-restart.err</string>
</dict>
</plist>
PLISTEOF
echo "✅ 已写 $PLIST"

# ---- 3. 注册到 launchd（先卸后装，重复运行无副作用）----
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null || launchctl load "$PLIST" 2>/dev/null

# ---- 4. 立刻跑一次自检 ----
launchctl kickstart -p "$DOMAIN/$LABEL" 2>/dev/null

sleep 1
echo ""
if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "✅ 已注册并运行中（每 5 分钟检查一次）"
  launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "state|last exit|runs" | head -4
else
  echo "⚠️ 注册可能没成功（常见于从「远程/脚本」环境运行）。"
  echo "   请在访达里双击本文件、或自己在终端里执行："
  echo "     launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/$LABEL.plist"
fi

echo ""
echo "日志：$HOME_DIR/Uranus_Imessage/uranus-wake-restart.log"
echo "（只有真的重启过才会写，平时是空的＝正常）"
echo ""
echo "=========================================="
echo " 可选：彻底禁止整机睡眠（需输入开机密码）"
echo "   sudo pmset -a sleep 0"
echo "   注意：系统大版本更新后会重置，需要重跑一次。"
echo "=========================================="
echo ""
pause "安装完成，按回车关闭…"
