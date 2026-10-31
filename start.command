#!/bin/sh

weaver_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
"$weaver_dir/start.sh" "$@"
weaver_status=$?
if [ "$weaver_status" -ne 0 ]; then
  printf '\n%s' '启动未完成，按回车关闭此窗口…'
  read -r weaver_reply
fi
exit "$weaver_status"
