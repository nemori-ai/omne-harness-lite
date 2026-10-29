# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，契约类型的重导出，不导入 Cordis
- [cordis.ts](cordis.ts)：`./cordis` 入口，`SessionService` 与十一个依赖 Service、各自唯一键、intercept 配置与事件，含 `SessionAccessCheckService` 与 `sessionAccessCheckKey`

访问检查键取自抽象类的 `provide`。本成员只交付定义。事务端口与内存工厂的接入范围见[当前访问检查的实现范围](../../session-contract/docs/access-check.md)。生产必需注入尚未交付。
