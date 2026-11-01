#!/bin/bash
# uranus-wake-restart.sh
# 目的：Mac 从睡眠唤醒后，若 Uranus 进程是在「上一次唤醒之前」启动的
#       （即网络栈被休眠挂死、出网全超时），自动 kickstart 重启它，
#       恢复 iMessage 桥接 / IG 互动 / 主动消息。
# 不禁用睡眠、不杀进程、不额外耗电池——只在“唤醒后发现进程是旧的”时才重启。
#
# 由 ~/Library/LaunchAgents/com.uranus.wake-restart.plist 每 5 分钟调用一次。

export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export LANG=C

LOG="$HOME/Uranus_Imessage/uranus-wake-restart.log"
URANUS_LABEL="com.uranus.imessage"
PORT=8787
DOMAIN="gui/$(id -u)"
WAKE_GRACE=90   # 唤醒后至少等 90 秒再重启，避开唤醒瞬间的网络抖动，也避免重复重启

ts() { /bin/date "+%Y-%m-%d %H:%M:%S"; }
NOW_EPOCH=$(/bin/date +%s)

# 找到正在监听 8787 的 Uranus 进程
PID=$(/usr/sbin/lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | /usr/bin/awk 'NR==2{print $2}')
if [ -z "$PID" ]; then
  # 没在监听：交给 launchd KeepAlive 自己拉起，本脚本不插手
  exit 0
fi

# ---- 进程启动时间(epoch)：优先 lstart，回退 etime ----
PROC_START=""
LST=$(/bin/ps -o lstart= -p "$PID" 2>/dev/null | /usr/bin/sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -n "$LST" ]; then
  PROC_START=$(/bin/date -j -f "%a %b %e %H:%M:%S %Y" "$LST" +%s 2>/dev/null)
fi
if [ -z "$PROC_START" ]; then
  ET=$(/bin/ps -o etime= -p "$PID" 2>/dev/null | /usr/bin/sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ -n "$ET" ]; then
    days=0; hms="$ET"
    if [[ "$ET" == *-* ]]; then days=${ET%%-*}; hms=${ET#*-}; fi
    IFS=':' read -r a b c <<< "$hms"
    case $(echo "$hms" | tr -cd ':' | wc -c | tr -d ' ') in
      0) secs=$a ;;
      1) secs=$((a*60 + b)) ;;
      2) secs=$((a*3600 + b*60 + c)) ;;
      *) secs="" ;;
    esac
    if [ -n "$secs" ]; then
      PROC_START=$(( NOW_EPOCH - days*86400 - secs ))
    fi
  fi
fi
if [ -z "$PROC_START" ]; then
  # 连启动时间都拿不到：保守跳过，不盲重启
  echo "$(ts) SKIP pid=$PID (无法获取进程启动时间)" >> "$LOG"
  exit 0
fi

# ---- 最近一次系统唤醒时间(epoch) ----
# 只认“真正的用户唤醒”，排除 DarkWake(维护/网络唤醒，频繁发生) 与 Maintenance
LAST_WAKE=$(/usr/bin/pmset -g log 2>/dev/null \
  | /usr/bin/grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}.*Wake" \
  | /usr/bin/grep -v -E "Dark|Maintenance|Wake request" \
  | /usr/bin/grep -aoE "[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}" | tail -1)
if [ -z "$LAST_WAKE" ]; then
  # 本次启动后没有任何睡眠/唤醒记录（只有 reboot），无事可做
  exit 0
fi
LAST_WAKE_EPOCH=$(/bin/date -j -f "%Y-%m-%d %H:%M:%S" "$LAST_WAKE" +%s 2>/dev/null)
if [ -z "$LAST_WAKE_EPOCH" ]; then
  exit 0
fi

# ---- 判定：进程比上次唤醒还老 + 已唤醒超过 WAKE_GRACE 秒 → 重启 ----
WAKE_AGE=$(( NOW_EPOCH - LAST_WAKE_EPOCH ))
if [ "$PROC_START" -lt "$LAST_WAKE_EPOCH" ] && [ "$WAKE_AGE" -gt "$WAKE_GRACE" ]; then
  /bin/launchctl kickstart -k "$DOMAIN/$URANUS_LABEL"
  echo "$(ts) RESTART pid=$PID (启动于 $(/bin/date -r $PROC_START '+%Y-%m-%d %H:%M:%S')，早于最近唤醒 $LAST_WAKE；已唤醒 ${WAKE_AGE}s)" >> "$LOG"
fi

exit 0
