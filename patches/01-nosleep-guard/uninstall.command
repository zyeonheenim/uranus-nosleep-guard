#!/bin/bash
# ============================================================
#  卸载「唤醒后自动恢复」防断流补丁
# ============================================================

set -u

# --yes：给统一卸载器（node uninstall.mjs）调的时候用
YES=0
[ "${1:-}" = "--yes" ] && YES=1
pause() { [ "$YES" = 1 ] || read -r -p "$1" _; }

LABEL="com.uranus.wake-restart"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

echo ""
echo "卸载 Uranus 防断流补丁…"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
rm -f "$PLIST" "$HOME/Uranus_Imessage/uranus-wake-restart.sh"
rm -f "$HOME/Uranus_Imessage/uranus-wake-restart.out" "$HOME/Uranus_Imessage/uranus-wake-restart.err"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "⚠️ 还在跑，手动执行：launchctl bootout $DOMAIN/$LABEL"
else
  echo "✅ 已卸载（Uranus 主服务不受影响）"
fi

echo ""
echo "注：如果之前手动执行过 sudo pmset -a sleep 0，电源设置不会被这里改回。"
echo "    要恢复默认睡眠，执行：sudo pmset -a sleep 1"
echo ""
pause "按回车关闭…"
