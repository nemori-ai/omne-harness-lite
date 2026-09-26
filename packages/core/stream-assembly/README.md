# stream-assembly

本包采用 [capability.stream-assembly v2](../../../.meta_harness/design/spec/capabilities/stream-assembly/v2/contract.md)，实现映射与节点义务见 [realization](../../../.meta_harness/design/realization/packages/core/stream-assembly/README.md)。实际依赖是已经释放的 `arrival-events`、`content-blocks` 与 `call-accounts` 的公开入口。

当前是实施中间版本：纯状态构件、快照、结算、放弃及独立用例已实现；根入口暂只释放数据类型。两个拒绝示例及非法工具名封口存在已报主调度的冻结输入冲突，正在发布后续采用版本。内部 `acceptWithSealer` 是施工期间的组合入口，不是对外策略端口；正式接受后将收为固定的 `accept(state, event)`。本版本不作为五操作公开面或整个包通过验收的声明。

状态由调用方持有，内部使用冻结记录数组和共享片段链。块索引以精确数学值查找，查找与记录更新为 O(B)，追加片段链头为 O(1)，读取与结算遍历现存块、片段和物化内容。所有权在准入时建立，旧状态与已交出的快照不可变；块、账和不透明载荷沿其原公开契约携带。参数严格解析仅在已接受、内容未被砍的工具调用封口执行一次。

包内 [tests](tests/) 验证规范事件串、拒绝次序、严格解析次数、精确数、语音字节归约和运行时不可变性；[fixtures](tests/fixtures/) 保留规范来源摘要与原文位置。构建、类型检查和测试分别用 `pnpm --filter @omne-harness-lite/stream-assembly build`、`typecheck`、`test`。宿主路由、流的持有、落盘、时刻、卸载收口、执行工具和模型请求均由对应消费者承担。
