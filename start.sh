#!/bin/sh
set -eu

weaver_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '未找到 Node.js。请安装 Node.js 22.13+ 的 22.x 或 24.x，再按 README.md 准备依赖。' >&2
  exit 1
fi
exec node "$weaver_dir/scripts/start-desktop.mjs" "$@"
