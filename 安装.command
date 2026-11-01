#!/bin/bash
# ============================================================
#  uranus_patches_awesome · 双击安装（全装）
#
#  双击前请确认：这个文件夹放在了 Uranus_Imessage 里面
#  （和 server/、client/ 同级）。放别处也行，脚本会问路径。
#
#  想只装某几个：别用这个文件，进终端跑
#     node install.mjs --only 02 --run
# ============================================================

set -u
cd "$(dirname "$0")" || exit 1

# 访达里双击时 PATH 很短，nvm / homebrew 装的 node 常常找不到
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/current/bin:$PATH"

pause() { read -r -p "$1" _; }

echo ""
echo "=========================================="
echo " uranus_patches_awesome"
echo "=========================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 node。"
  echo "   这个安装器要 node（Uranus 本身也要），装好 node 再来。"
  echo "   Homebrew:  brew install node"
  pause "按回车退出…"
  exit 1
fi

node install.mjs --all --run
echo ""
pause "按回车关闭…"
