# 固定工具运行入口

以下命令从已采用的固定工具检出运行。所有尖括号由运行绑定具体化，不能直接执行占位。JSON 输入按该版本共享 schema 生成，不手拼 shell JSON。安装描述符先按安装入口核验 SHA256 和工具完整 SHA；工具/技能/策略作为同一版本采用。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/integration-request-cli.ts --help
node --experimental-strip-types tools/dev-flow/src/delivery/integration-request-cli.ts submit --repo <owner/name> --input <request.json> --operation-id <UUID> --journal <目录>
node --experimental-strip-types tools/dev-flow/src/delivery/integration-request-cli.ts recover --repo <owner/name> --input <同一request.json> --operation-id <同一UUID> --journal <同一目录>
node --experimental-strip-types tools/dev-flow/src/delivery/line-inbox-cli.ts inbox --repo <owner/name> --parent <N> --milestone <N> --since <已消费评论ID> --protocol-version 1
node --experimental-strip-types tools/dev-flow/src/delivery/line-inbox-cli.ts delta --repo <owner/name> --parent <N> --input <delta.json> --journal <目录> --protocol-version 1
node --experimental-strip-types tools/dev-flow/src/delivery/line-inbox-cli.ts state --repo <owner/name> --parent <N> --input <state.json> --journal <目录> --protocol-version 1
node --experimental-strip-types tools/dev-flow/src/delivery/reduce-watch-cli.ts watch --repo <owner/name> --parent <N> --operation-id <UUID> --journal <文件> --file <事件文件> --watch-reduce-issue <当前R>
```

非成功交接等待在同一 watch 命令追加 `--purpose disposition --request-input <原request.json>`。nextHint 已知且确为实际直接后继时，才可追加 `--next-reduce-issue <N>`；未知省略。恢复沿原 journal 和身份核对，不能删除锁或另造 operation 逃避未知状态。锁恢复须先证明旧进程停止并按该版本帮助操作。

inbox 仅按 marker/schema 发现 delta，再按共享权限与修订验证可信性。完整分页、连续序号、唯一前项和摘要缺一不可；同序异文、缺号、缺页失败，不能取最后一条掩盖冲突。delta 发布与 state 消费写入未知均先从原输入/journal 恢复。读取 inbox 不授权在波中消费变更。

订阅演练不创建真实业务交付：在 reduce 指定的隔离 fixture 上先核对完整输入、事件路径、当前 R 与 continuation；用真实 watch 核对已有有效结果可立即返回、idle 可续挂和不完整 release 拒绝。delta 写入演练只能用工具明确支持的 fixture/验证入口，不向生产卡发“试验”记录，不虚构 `--dry-run` 参数。保存完整命令、输入、退出码和读回，再由 reduce 接受演练证据。
