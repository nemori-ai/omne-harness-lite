# tool 测试索引

- [测试范围与运行入口](README.md)。
- [根入口与依赖方向测试](public-entry.spec.ts)。
- [独立作用域行为测试](independent-scope.spec.ts)。
- [等待请求树的判定与字节上限测试](json-tree-wait.spec.ts)。
- [执行包装器行为测试](execute-tool.spec.ts)。
- [执行函数签名类型测试](execution.spec-d.ts)。
- [构造形状类型测试](construction.spec-d.ts)。
- [托管受理行为测试](managed-admission.spec.ts)。
- [托管查询与分页测试](managed-reads.spec.ts)。
- [交付解除测试](managed-delivery.spec.ts)。
- [runtime 工厂与后续增量测试](runtime-factory.spec.ts)。
- [到启动为止的托管路径测试](managed-start.spec.ts)。
- [启动路径的排除与已收场调用的队列条目测试](start-exclusion.spec.ts)。
- [队列域的释放记忆、释放依据、认回与对账测试](queue-release.spec.ts)。
- [推进协程的重新推进测试](driver-retrigger.spec.ts)。
- [绑定启动、失败与未知认回测试](binding-start.spec.ts)。
- [绑定启动的并发交错测试](binding-races.spec.ts)。
- [未知异常与未处理拒绝的观察工具](caught-rejection.ts)。
- [测试依赖装配行为](testing-dependencies.spec.ts)。
- [测试依赖装配类型](testing-dependencies.spec-d.ts)。
- [调用方测试端口](testing-values.ts)。
- [非耐久记录仓测试](memory-store.spec.ts)。
- [工厂签名类型测试](runtime.spec-d.ts)。
- [托管路径构造器与可控端口](runtime-values.ts)。
- [测试构造器与可控端口](scope-values.ts)。
- [导入图遍历工具](module-graph.ts)。
- [测试夹具](fixtures/index.md)。
- [包索引](../index.md)。

- [普通调用与引用行为](invocation-runtime.spec.ts)。
- [来源绑定与篡改拒绝](invocation-source.spec.ts)。

- [公开原意图恢复组合](invoke-recovery.spec.ts)。

- [主体语义快照与真实来源签发切点](source-principal.spec.ts)。
