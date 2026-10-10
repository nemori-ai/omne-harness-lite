# Tool result files

本包提供独立的文件结果存储。公开操作及业务承诺归 [core/tool-execution-runtime](../../core/tool-execution-runtime/SPEC.md)，文件后端的补充行为见 [SPEC.md](SPEC.md)。

根入口导出 `openToolResultStorage({ directory, storage }, dependencies)`。构造端口由 core 定义，包括访问校验、日志 backing、共同历史投影和维护授权。可选 reader 输入指定实际工具版本及实现注册表；没有可用 reader 时，`available` 返回 `storageUnavailable`。阈值及摘要策略归交付处理，本工厂不消费 `maxInlineBytes`。

`./cordis` 导出 `toolResultFiles`。Config 只含目录、storage id 和可选 reader 的普通定义数据。插件注入 core 定义的端口，提供 `ToolResultsService`，用本 fiber 的 effect 关闭文件 owner 和它的日志借用。服务不暴露 close、物理路径或文件句柄。工具只收到某次执行绑定的 `putAttachment`。

文件准备不是执行终局，也不是结果交付。共同日志中已确认的首胜终局决定可读作者结果；孤立文件不可成为结果。普通读取逐次核验当前授权。维护读取只接受当前有效的 RecoveryAccess，并限制在已确认终局及该调用实际持有的引用内。

根入口还导出 `openToolResultCustodySource({ directory, storage }, dependencies)`。可信根传入实际同库 Storage、日志 participant／读权限和 native 原身份核验端口。来源实现 Core 的 `ToolResultCustodySource`，在原 Unit 核日志，在原不可变目录核作者结果及全部引用，不发行执行权。原身份核验可由 `tool-execution-local` 根入口的 `createToolOriginalIssueVerifier(storage)` 提供。关闭只排空并释放本来源的文件资源。

本包检查使用真实临时目录、SQLite、Core codec 和 Cordis。跨领域历史、授权和 native 原身份核验在文件来源检查中仍是受控端口。完整 native 工厂／Session／driver 组合及真实工具产品验收仍归 B01；包内检查不能代替它们。
