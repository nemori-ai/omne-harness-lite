# tests/e2e 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：旅程表与装配的边界
- [journey.spec.ts](journey.spec.ts)（慢层）：七步旅程表 `JOURNEY`，每个目标跑适用的步；每个目标对实际跑过的步号断言
- [assembly.ts](assembly.ts)：测试用的租户与 `Access`、对任何值答 `conforms` 的 `OutputValidator`，以及 `createMcp` 加本地传输的装配
- [targets.ts](targets.ts)：两个目标（`server-everything` 的 Streamable HTTP 与旧 HTTP+SSE）的启动方式、预期修订、期望的步号表，以及每步的工具与参数
