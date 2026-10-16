# tool-cordis-contract 公开接口

根入口 `.` 不导出值。`./cordis` 由 [src/cordis.ts](../src/cordis.ts) 定义，源码是唯一定义，本页不手写签名。

- 18 个抽象或具体 Service 类与 18 个键常量。
- `Context` 增补：每个键对应的服务类型。
- `Events` 增补：`tool-cordis-contract/call-changed`，参数是 tenant、ToolCallId 与 ToolRevision。
- 实例目录的登记类型：`ToolPublication`、`ToolRegistrationInput`、`ToolRegistrationFailure`、`ToolRegistration` 与 `ToolPublicationAuthority`。

类型参数取自 `@omne-harness/tool-contract`。服务行为与依赖分类见 [cordis](cordis.md)。目录职责见 [README](README.md)。
