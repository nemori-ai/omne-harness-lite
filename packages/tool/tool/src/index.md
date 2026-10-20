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
- [排除规则](ledger-exclusion.ts)。
- [账本工厂](ledger.ts)。
- [runtime 工厂](runtime.ts)。
- [测试入口与依赖装配](testing.ts)。
- [非耐久记录仓](testing-store.ts)。
- [公开接口](../docs/public-api.md)。
- [包索引](../index.md)。

- [引用访问解析](invocation-access.ts)。
- [配对来源与身份测试替身](testing-source.ts)。

- [控制意图的封闭复制](control-intent.ts)。

- [执行事实边界](facts-boundary.ts)。
- [事实保管决定与读取](ledger-facts.ts)。
