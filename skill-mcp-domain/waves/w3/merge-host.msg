merge(skill-mcp): 闭包 w3-mcp-host 合入父分支（#1119）

本地传输工厂 @omne-harness/mcp-host-local：stdio 与 Streamable HTTP（含旧 HTTP+SSE 回退）。
相 → 结局的规则归契约（stopAnswerOf、lineGoneAnswerOf），stdio 关闭一律中止写端，缺陷
出口是第五个注入点。第 1–4 轮评审、修复与处置见 PR #1138 正文与卡评论 6679800023、
6680928470。

与已合入的 w3-mcp-call 在契约 SPEC.md 与 docs/public-api.md 冲突，两边的句子都保留：
调用口加的 R2 值树前提、S8 的 refresh 与建连、裁定第 31 条，宿主口加的 T3 值树前提、
T5、T8 与「真实传输兑现时的裁定」。

Harness: claude-code
Agent-Role: main
