# tests/e2e 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：旅程表、装配的边界、目标 P 的环境
- [journey.spec.ts](journey.spec.ts)（慢层）：七步旅程表 `JOURNEY`，每个目标跑适用的步；两个现代目标的结局序列逐步相等（MC3-12）
- [assembly.ts](assembly.ts)：测试用的租户与 `Access`、起真实进程的 `ProcessLanding`、计数的 `OutputValidator`，以及 `createMcp` 加本地传输的装配
- [targets.ts](targets.ts)：五个目标（`server-everything` 的三种传输、`server-filesystem`、`mcp-server-fetch`）的启动方式、预期修订，以及每步的工具与参数
- [command.ts](command.ts)：按命令起非 Node 进程的 `ProcessHandle`，并登记到子进程登记表
