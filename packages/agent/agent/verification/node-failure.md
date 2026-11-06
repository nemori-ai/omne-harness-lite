# 节点故障验证映射

本页把 [SPEC 的确定节点故障收尾](../SPEC.md#确定节点故障的收尾)映射到生产实现与行为测试。测试使用真实 Agent coordinator、receiver 和内存 Journal，Model/Tool 提供者使用脚本替身。

| 性质                  | 实现条件                                                                                     | 回归                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| NoBusinessAfterFault  | 私有故障意图只允许原写认回、F0/F1/F2/F3、终态读取与等待；已保存 node-failed 可恢复为相同意图 | loop-node-failure 的 F1/F3 暂拒、同候选恢复与新 coordinator 接续；业务求值和新调用次数不增加                                                 |
| NoPrematureEnd        | F3 只接受 Journal 真实清单；不清 calls，不合成 Tool custody                                  | Model/Tool 尚未 received 时保持 settling；原结果保存后才 ended；未应用 Passage、Tool association-unknown 与永久不可读不结束                  |
| UnknownOriginal       | mutation 调用前固定原请求；认回先于故障与取消路由                                            | loop-node-failure 的 F1/F2/prepareFinish/tryFinish 真写后抛错；original-writes 保留正常与取消路线                                            |
| OldExecutionIsolation | receiver 使用原 ConsumerRef、reference 和 consumption；故障不注册新消费者                    | loop-node-failure 的 Model/Tool 原 received；model-receiver、tool-receiver 的原关联与跨租户守护；provider-run-failure 的旧输入保留及后继入场 |
| 第一故障保持          | 原 node、分类、时刻与已形成候选不被收尾不可用替换                                            | 多个暂拒位置重试仍采用同一候选；安全字段断言拒绝任意诊断正文                                                                                 |
| 有效取消优先          | 原写认回后先读 ended，再处理有效取消                                                         | 故障等待期间取消经 F0 到 cancelled；original-writes 与 provider-control 保留终态和取消竞争                                                   |

主要资源是 [loop-node-failure.spec.ts](../tests/loop-node-failure.spec.ts)、[provider-run-failure.spec.ts](../tests/provider-run-failure.spec.ts)、[original-writes.spec.ts](../tests/original-writes.spec.ts)、[model-receiver.spec.ts](../tests/model-receiver.spec.ts) 与 [tool-receiver.spec.ts](../tests/tool-receiver.spec.ts)。输入 held 的共同 Journal conformance 归 agent-contract。

先在仓库根构建本成员，再运行守护。

```sh
pnpm --dir packages/agent/agent run build
pnpm --dir packages/agent/agent exec vitest run --mode fast tests/loop-node-failure.spec.ts tests/provider-run-failure.spec.ts tests/original-writes.spec.ts tests/provider-control.spec.ts tests/model-receiver.spec.ts tests/tool-receiver.spec.ts
```

这些用例不证明 SQL 事务、Session AD-02、完整宿主装配、杀进程恢复或任意并发。有限模型的安全与活性结论只适用于其显式责任集合和公平性前提，不能替代这里的实现守护。无来源 Tool unknown、未应用 Passage/card、永久 unavailable、失权和接收者资格缺失不在最终 ended 的承诺内。

[故障来源隔离验证](failure-provenance/README.md) 另行约束本地分类的所有权。一次能力拒绝的标记不得污染其他端口或 execution 返回的同一 Failure 对象。收场状态模型没有表达该身份关系，不能替代此项守护。
