# Tool 文档索引

先读 [SPEC](../SPEC.md) 的行为和采用范围，再按以下顺序阅读设计。

1. [architecture](architecture.md)：包内职责、实施机制及外部缺项。
2. [object-model](object-model.md)：对象、生命周期、参数与依赖。
3. [public-api](public-api.md)：公开入口和设计声明。
4. [flows](flows.md)：操作时序及七条业务旅程。
5. [context](context.md)：消费者使用与系统定位。
6. [cordis](cordis.md)：本包不含 Cordis；装配和资源交接归 [tool-cordis-contract](../../tool-cordis-contract/docs/cordis.md)。

编写工具函数时，从 [emit 与 wait 示例](flows.md#作者调用-emit-和-wait)进入，再核对 [作者上下文声明](public-api.md#作者执行上下文)与 [P11 行为](../SPEC.md#p11-作者输出与等待原语)。这些类型已从根入口导出，`executeTool` 与 `createIndependentToolScope` 已在 `@omne-harness/tool`（[本增量未交付](../../README.md#未交付标注)） 实现。

自定义等待读取 [P12](../SPEC.md#p12-等待-schema-与响应提交)和 [请求响应流程](flows.md#自定义等待协议与无效提交)。普通返回、直接 ToolResult 和 程序输出声明读取 [P13](../SPEC.md#p13-双返回形态与程序输出契约)及 [settle 流程](flows.md#两种返回在-settle-汇合)。

多个独立函数组成工具时，读取 [逐命令注册规则](../SPEC.md#多命令作者注册与返回选择)和 [不同返回示例](flows.md#多命令函数与独立返回)。单函数与多命令共用操作及返回声明，按选中的命令验证。

详细行为仍在 [SPEC](../SPEC.md#定义可用性与发起)，[操作协议](../SPEC.md#tool-操作协议)和 [程序执行方组合协议](../SPEC.md#code-与-tool-的组合协议)也在同一文件。按 [验证覆盖](../verification/README.md)和 [TL-V01 至 TL-V07](../verification/README.md)核对必要验证，目录职责见 [README](README.md)。
