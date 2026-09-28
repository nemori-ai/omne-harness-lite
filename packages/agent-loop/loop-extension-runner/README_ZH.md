# `@omne-harness-lite/loop-extension-runner`

runner 结论的纯构件包。它负责生成与检查完整的 `runner/5` 结论条目、派生经过键、从同一份完整会话日志前缀提取已生效的重试结论，并依据原始主体与有序结论重新合成效果。

当前包没有 Cordis 插件或 runner 服务；不会调用拓展件、认证调用方、获取完整日志前缀、拥有 Run、追加结论或决定是否再次发送。调用方须通过对应服务取得这些事实。`readRunnerRetryConclusions` 会检查传入条目和稠密位置，但单凭数组不能证明读取权限或来源确实是完整读取。

采用范围见 [D-106](../../../.meta_harness/design/record/decisions/runner-current-pure-provider-adoption/decision.md)，依据 [Runner5](../../../.meta_harness/design/spec/capabilities/loop-extension-runner/v5/contract.md)、[LC6](../../../.meta_harness/design/spec/data/loop-extension/v6/contract.md) 和[当前实现映射](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v5-current-design.md)。尚待实现的服务义务见[验证说明](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/verification.md)。

## 公开接口

- `passKeys(input)` 返回经过、全域及可选的最终、ask、模型调用键；输入不合法返回 `{ invalidInput: true }`。键使用固定 JSON 数组，ask 序号保持精确正整数值。
- `prepareRunnerConclusion(input)` 检查完整 LC6 结论、轮次、租户与运行壳、提醒关联和键，返回尚未写入的 `LogEntryInput`。
- `inspectRunnerConclusion(input)` 返回复制后的完整结论及其关联；真正外域条目返回 `{ unrelated: true }`，runner 标记不一致返回 `{ invalid: true }`。
- `readRunnerRetryConclusions(input)` 按日志顺序读取传入的同会话、完整、稠密前缀。不同日志位置即使值相同也保留两条；不能信任前缀或其中的 runner 条目时返回 `{ unavailable: true }`。
- `composeEffect(initial, conclusions)` 按当前主体依次校验结论，返回 Runner5 的五类效果之一；不一致返回 `{ invalidInput: true }`。`initial` 必须是**未叠加结论的原始** `PositionedSubject`。

下面的示例可直接运行，只演示纯函数。本地构造的位置仅代替日志提供者返回的条目；生产调用必须传真实持久化条目。

```js
import {
  composeEffect,
  inspectRunnerConclusion,
  prepareRunnerConclusion,
} from '@omne-harness-lite/loop-extension-runner'

const session = 'session-example'
const tenant = { organization: 'org-example', account: 'account-example' }
const at = '2026-09-28T10:00:00Z'
const originalPositionedSubject = {
  position: 'before_persist_message',
  subject: {
    message: { id: 'message-example', type: 'user', blocks: [], createdAt: at },
    producer: 'user',
  },
}
const conclusion = {
  extension: 'example-extension',
  position: 'before_persist_message',
  power: 'observe',
  at,
  output: { kind: 'observed' },
}
const prepared = prepareRunnerConclusion({
  session,
  tenant,
  execution: { kind: 'noRun' }, // 仅 before_persist_message 合法
  anchor: 'message-example',
  occurrence: { kind: 'final' },
  value: conclusion,
  reminders: [],
})
if ('invalidInput' in prepared) throw new Error('结论输入无效')

const persistedEntry = { ...prepared.entry, session, position: 1 }
const found = inspectRunnerConclusion({ session, tenant, entry: persistedEntry })
if ('invalid' in found || 'unrelated' in found) throw new Error('日志条目不符合预期')
const result = composeEffect(originalPositionedSubject, [found.conclusion])
if ('invalidInput' in result) throw new Error('结论与原主体不一致')
console.log(result.effect.kind) // proceed
```

除 `before_persist_message` 外，调用方须提供真实的 `{ kind: 'withRun', run, attempt }` 壳；`before_persist_message` 可以继承外层真实栅栏，但不会把 Run 字段传给拓展件。`composeEffect` 当前为调用 core 的 LC6 判定而使用局部校验占位值；此实现细节仍待集成审查，不能成为生产 Run 的来源。提醒的 MessageId 采用与模型运行时相同的 `mrr/3` 消息键；结论内同时保留完整提醒副本，以便恢复时精确比对。

所有函数均为同步纯函数，不访问网络、时钟、随机源或隐藏存储。返回值本身不证明已经写入，也不证明读取具有授权和完整性。
