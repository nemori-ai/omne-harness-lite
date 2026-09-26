# stream-assembly

本包采用 [capability.stream-assembly v3](../../../.meta_harness/design/spec/capabilities/stream-assembly/v3/contract.md)，精确依赖为 `arrival-events` v2、`content-blocks` v3 和 `call-accounts` v2。接受与采用以设计区 registry 和 [realization](../../../.meta_harness/design/realization/packages/core/stream-assembly/README.md) 为准。

公开入口提供 `start(target)`、`accept(state, event)`、`snapshot(state)`、`closeOut(state)` 和 `abandon(state, reason?)`，可独立导入使用。`AssemblyState` 仅导出为不透明类型，由 `start` 创建。成功返回 `{ ok }`，契约拒绝返回 `{ rejected }`；`snapshot` 直接交出快照。目标和事件边界接受未知值并校验，状态输入须是本包创建的状态。

```ts
import { start, accept, snapshot, closeOut } from '@omne-harness-lite/stream-assembly'

const initial = start({ kind: 'model_call', callId: 'mc_1', dispatch: 1 })
if ('ok' in initial) {
  const finished = accept(initial.ok, { t: 'finish', reason: 'end' })
  if ('ok' in finished) {
    const view = snapshot(finished.ok)
    const settlement = closeOut(finished.ok)
  }
}
```

调用方持有每份状态。内部冻结记录数组共享未变记录，追加填充使用不可变片段链；替换只保留本版最后一次填。领域索引按精确数学值查找，查找和记录更新为 O(B)，链头追加的结构操作为 O(1)，另计校验和载荷复制；读与结算为 O(B + F + L)，保留多版状态还会保留各版数组槽位。没有可变缓存、全局目标表或载荷大小拒绝上限。

参数严格解析只在已接受、内容未被砍且模型工具名合法的封口执行一次。被砍调用落半截；坏字符或超过 128 字符的名字落完整未解析调用，原名和原参数保留。重复 JSON 键或语法失败也落未解析调用。快照、结算和放弃不重解析参数。块、账、精确数值及不透明载荷沿各自公开契约携带；准入时建立所有权，返回值运行时冻结。

[tests](tests/) 覆盖规范事件、全部拒绝表行、固定种子切分与字节归约、参数解析次数和试写不可变性；[fixtures](tests/fixtures/) 保留规范来源摘要与原文位置。本能力不发布自己的 Schema；测试核对全部八份能力资源及依赖 Schema 闭包。开发检查为 `pnpm --filter @omne-harness-lite/stream-assembly build`、`typecheck`、`test`，源码规则使用仓库统一检查器。

宿主负责会话路由、逐个投递、流的持有、时刻、落盘、一次记录、卸载收口和工具执行。模型与工具运行时以及跨进程前提的验收由对应 owner 完成；本包测试不证明这些外部保证。
