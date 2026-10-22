# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口
- [construction.ts](construction.ts)：工厂的构造形状
- [runtime.ts](runtime.ts)：`createAgentRuntime` 与创建校验的次序
- [configuration.ts](configuration.ts)：配置七项与绑定字段的校验
- [access.ts](access.ts)：公开操作前的租户核对与 `access.check`
- [provider.ts](provider.ts)：四个面、单执行槽与状态投影；`invoke` 与 `observe` 之外的操作本体是阶段性临时做法
- [loop/nodes.ts](loop/nodes.ts)：节点词汇与转移表（正常路径），每行来自该节点在节点表中的行
- [loop/evaluator.ts](loop/evaluator.ts)：纯评估器 `agentEvaluator` 与 `agentCheckpointSchema`，在 E4 与 I8 决定去向
- [loop/wait.ts](loop/wait.ts)：W0 的原来源重读、观察窗口与注入时钟等待
- [loop/diagnostic.ts](loop/diagnostic.ts)：协调者与等待窗口共用的未知抛错值诊断转换
- [loop/coordinator.ts](loop/coordinator.ts)：执行协调者，按伪代码分组的节点处理与驱动
- [loop/processed-result.ts](loop/processed-result.ts)：本包 processed facts 的版本采用、原关联与解释读取；被根入口证据适配接缝采用
- [loop/model-result.ts](loop/model-result.ts)：原 Model 收场的回复、部分结果与无回复分类，以及缺推理回放元数据时的支持边界
- [loop/identities.ts](loop/identities.ts)：确定派生的操作身份、调用身份与依据
- [testing/index.ts](testing/index.ts)：`./testing` 入口与 `createTestAgentDependencies`
- [testing/journal.ts](testing/journal.ts)：内存 Journal
- [testing/journal-values.ts](testing/journal-values.ts)：内存 Journal 的值辅助
- [testing/fixtures.ts](testing/fixtures.ts)：端口的可编排替身
- [testing/tools.ts](testing/tools.ts)：`ToolRuntime` 替身
- [testing/clock.ts](testing/clock.ts)：可控时钟
- [testing/script.ts](testing/script.ts)：替身共用的编排方法
