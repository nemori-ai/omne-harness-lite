# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口
- [construction.ts](construction.ts)：工厂的构造形状
- [runtime.ts](runtime.ts)：`createAgentRuntime` 与创建校验的次序
- [configuration.ts](configuration.ts)：配置七项与绑定字段的校验
- [access.ts](access.ts)：公开操作前的租户核对与 `access.check`
- [provider.ts](provider.ts)：四个面；`observe` 之外的操作本体是阶段性临时做法
- [testing/index.ts](testing/index.ts)：`./testing` 入口与 `createTestAgentDependencies`
- [testing/journal.ts](testing/journal.ts)：内存 Journal
- [testing/journal-values.ts](testing/journal-values.ts)：内存 Journal 的值辅助
- [testing/fixtures.ts](testing/fixtures.ts)：端口的可编排替身
- [testing/tools.ts](testing/tools.ts)：`ToolRuntime` 替身
- [testing/clock.ts](testing/clock.ts)：可控时钟
- [testing/script.ts](testing/script.ts)：替身共用的编排方法
