# tool 源码索引

- [源码职责与现状](README.md)。
- [根入口](index.ts)。
- [独立执行作用域](independent-scope.ts)。
- [执行包装器](execute-tool.ts)。
- [作者限额检查](limits.ts)。
- [等待请求的 JSON 树](json-tree.ts)。
- [构造形状](construction.ts)。
- [配置检查](configuration.ts)。
- [记录仓端口与记录](ledger-store.ts)。
- [账本受信快照](ledger-guards.ts)。
- [边界检查](boundary.ts)。
- [证据与身份铸造](evidence.ts)。
- [受理与交付解除决定器](ledger-decider.ts)。
- [到启动为止的决定器：队列域与调用域](ledger-start.ts)。
- [队列维护入口：等待者对账](ledger-queue.ts)。
- [推进协程](driver.ts)。
- [绑定发起、原启动查询与 live 句柄保管](driver-binding.ts)。
- [读取投影](ledger-reads.ts)。
- [排除规则](ledger-exclusion.ts)：同提交全部 operation 的排除围栏。
- [账本工厂](ledger.ts)。
- [runtime 工厂](runtime.ts)。
- [公共流协议上的观察门面](stream-facade.ts)。
- [测试入口与依赖装配](testing.ts)。
- [非耐久记录仓](testing-store.ts)。
- [公开接口](../docs/public-api.md)。
- [包索引](../index.md)。

- [引用访问解析](invocation-access.ts)。
- [配对来源与身份测试替身](testing-source.ts)。

- [控制意图的封闭复制](control-intent.ts)。
- [原控制主体的认回和传播核验](ledger-control-subjects.ts)。

- [执行事实边界](facts-boundary.ts)。
- [事实保管决定与读取](ledger-facts.ts)。

- [fact-acknowledgements.ts](fact-acknowledgements.ts) 从同一 bindings.recover 构造来源确认守卫。
- [ledger-fact-ack.ts](ledger-fact-ack.ts) 核原回执与 operation，并同提交记录确认和清除责任。

- [受管原事实读取](driver-facts.ts)。

- [ledger-settlement.ts](ledger-settlement.ts)：原 final 核验、唯一原结果与后继责任写集。
- [ledger-environment-release.ts](ledger-environment-release.ts)：历史保管闭包、canonical 计划与释放观察。
- [cleanup-boundary.ts](cleanup-boundary.ts)：清理 Mutation 的封闭复制。
- [driver-settlement.ts](driver-settlement.ts)：按原 task 恢复 final 和 preserveResult。
- [ledger-suspension.ts](ledger-suspension.ts)：暂停计划、suspend 提交、登记接入、停泊待办与拒绝登记的阻塞。
- [suspension-boundary.ts](suspension-boundary.ts)：暂停记录与检查点的封闭检查。
- [driver-suspension.ts](driver-suspension.ts)：段在等待处结束后的计划、检查点提交、停泊与登记。
- [ledger-resumption.ts](ledger-resumption.ts)：决定的接受、恢复记录与在 `continued` 事实处关闭等待。
- [driver-resumption.ts](driver-resumption.ts)：向决策方读决定并接受、重新取得名额与关闭等待。
