# arrival-events

`data.arrival-events` v2 的纯函数包。采用版本、责任和外部义务见[实现节点](../../../.meta_harness/design/realization/packages/core/arrival-events/README.md)与[契约](../../../.meta_harness/design/spec/data/arrival-events/v2/contract.md)。

通过包名导入构建后的公开入口；`./schema` 是冻结原字节 Schema。`validate` 检查全部十四个定义的形状；`judgeArrivalEnvelope` 实现表示层拒绝的固定优先级。文本边界 `judgeArrivalEnvelopeText` 使用共享严格无损 JSON 读取，拒绝任意嵌套重复成员。判定不改动或修补输入。

调用方可传入 `openBlock(index)`，提供合法只读的已开块视图。只有整体替换是否合开块，以及帧流语音填字节这两项借它判定；没有视图、或查不到该块时，两项不参与。这不证明事件序列合法。序列判断、路由、会话与租户隔离归消费者。

`reduceFills(mode, fills)` 只归约一个块，输入为合法的 `ReductionMode` 和属于该块的合法载荷序列。零次填返回 `undefined`；追加文本原样相接，追加语音按解码后的字节相接并返回标准 Base64；替换取最后一次。工具参数始终保持原文。违反归约前提可抛 `TypeError`，不生成表示层拒绝或补造内容。`isStandardBase64` 可供消费者共用严格的非空语音载荷判据。

先构建 workspace 依赖，在根运行 `pnpm --filter @omne-harness-lite/arrival-events run build`、`typecheck`、`test`。这些检查覆盖本包纯值责任；生产者的封口一致性、节流和实际跨进程交付仍需各自的组合证据。
