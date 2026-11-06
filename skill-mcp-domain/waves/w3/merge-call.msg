merge(skill-mcp): 闭包 w3-mcp-call 合入父分支（#1119）

MCP 调用口：invoke、continueWithInput、cancel 与四个任务操作，createMcp 交出契约的五个服务。
答复只在出口决定一次（调用口、任务操作、refresh 同一次序），调用方给的值树在边界判定，
请求的每个字段只读一次；任务表按账户隔离，歧义一直保持。第 1–4 轮评审、修复与处置见
PR #1141 正文与卡评论 6680037685、6681108939。

Harness: claude-code
Agent-Role: main
