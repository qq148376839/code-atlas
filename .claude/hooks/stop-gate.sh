#!/bin/bash
# Hook: Stop
# 代码文件被修改但未 review 时阻止停止
# 状态文件 .needs-review：needs_review = 阻止，clean = 放行并删除文件，不存在 = 放行
# 条件性 hook：仅在项目有 code-review 角色时安装

STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/.needs-review"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

STATE=$(cat "$STATE_FILE" 2>/dev/null | tr -d '[:space:]')

case "$STATE" in
  "needs_review")
    echo '{"decision": "block", "reason": "代码已修改但未进行 code review。请先完成审查再结束 session。"}'
    exit 0
    ;;
  "clean")
    rm -f "$STATE_FILE"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
