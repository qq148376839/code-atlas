#!/bin/bash
# Hook: UserPromptSubmit
# 检测用户 prompt 中是否包含修正/反馈信号
# 关键词对齐 feedback-writer SKILL.md 观察维度第 1 条"用户修正"的信号定义

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)

if [ -z "$PROMPT" ]; then
  exit 0
fi

# 只保留强信号——明确修正/反馈，去掉日常对话中常见的弱信号
if echo "$PROMPT" | grep -qE "不是这样|别这样做|你搞错|搞错了|你错了|不应该|你漏了|你忘了|不合理|你理解错|我说的不是|没有执行|没有生效|你又忘|强调了|说过了|提醒过|每次都|我不是让你"; then
  echo '{"additionalContext": "检测到修正信号。处理完用户请求后派发 feedback-observer 记录。"}'
fi

exit 0
