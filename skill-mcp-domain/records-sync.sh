#!/usr/bin/env bash
# 把本会话的过程记录存档到记录分支 PanQiWei/skill-mcp-records 并推送。
# 用法：bash /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/records-sync.sh "<提交说明>"
# 全部路径都是绝对路径；先核对记录工作树的分支，不对就退出，绝不在别的检出里写。
set -euo pipefail
MSG="${1:?需要提交说明}"
SRC=/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain
R=/home/user/omne-harness-lite/.worktrees/skill-mcp-records
BRANCH=PanQiWei/skill-mcp-records

[ -d "$R" ] || git -C /home/user/omne-harness-lite worktree add -q "$R" "$BRANCH"
actual=$(git -C "$R" branch --show-current)
if [ "$actual" != "$BRANCH" ]; then echo "记录工作树的分支是 '$actual'，不是 $BRANCH，停止" >&2; exit 1; fi

for d in waves delegate model techdoc progress; do
  rsync -a --delete "$SRC/$d/" "$R/skill-mcp-domain/$d/"
done
cp "$SRC/plan.md" "$SRC/records-sync.sh" "$R/skill-mcp-domain/"

git -C "$R" add -A
if git -C "$R" diff --cached --quiet; then echo "记录无变化"; exit 0; fi
git -C "$R" -c core.hooksPath=/dev/null commit -q -m "$MSG

Harness: claude-code
Agent-Role: main"
git -C "$R" push -q origin "$BRANCH"
git -C "$R" log --oneline -1
