#!/bin/bash
# Hook: PostToolUse (matcher: Edit|Write)
# 代码文件被修改后标记需要 review
# 条件性 hook：仅在项目有 code-review 角色时安装

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 排除非代码文件（配置、文档、日志不触发 review 标记）
case "$FILE_PATH" in
  */.claude/*|*/dev-log/*|*/docs/*|*.md|*.json|*.yaml|*.yml|*.toml|*.gitignore)
    exit 0
    ;;
esac

# 标记需要 review
echo "needs_review" > "$CLAUDE_PROJECT_DIR/.claude/.needs-review"

exit 0
