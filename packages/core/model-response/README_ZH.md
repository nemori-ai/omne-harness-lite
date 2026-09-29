# @omne-harness-lite/model-response

[English](README.md)

本包实现 MR10 的纯响应体表示与有序判定。一条 `ModelResponse` 记录一次已确认耐久「已出门」责任的路由和档案快照、收场、时序、回复或已交付的部分、实际用量与费用，以及可选的原始响应引用。持久 `interrupted` 响应在无法取得实际发送时刻时可以明确记录 `timing.sentAt: null`；这不表示确知没有发送。`PendingModelResponse` 是交给消息写入者的完整待提交回复事实，始终要求实际发送时刻；写入者完成自己的提交决定后，才给持久响应填 `replyDisposition`，并在适用时判断 `late`。本包不发起模型请求，也不持久化记录。

本包是工作区内的私有 ESM 包。当前公开入口只有包根和 `./schema`。旧响应版本没有可执行子入口。不兼容的历史值会明确拒绝，不会从当前模型目录补齐缺失字段。

## 判定待提交回复和持久响应

下列例子可在构建工作区包后作为 ESM 文件运行。它构造的是纯文本档案。真实运行时必须从实际发出和上游交接获取路由、时刻、用量、费用与回复，不能为通过判定而伪造事实。

```js
import assert from 'node:assert/strict'
import {
  copyInputCalibration,
  judgeModelResponse,
  judgePendingModelResponse,
  judgeResponseFinalization,
  validate,
} from '@omne-harness-lite/model-response'

const adaptation = {
  implementation: { name: 'example-family', revision: '1' },
  definition: { modelId: 'example/chat', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const pending = {
  id: 'resp_1',
  call: { callId: 'model_call_1' },
  dispatch: 1,
  route: {
    adaptation,
    profile: { origin: 'official', routeName: 'example/chat' },
    profileSnapshot: {
      adaptation,
      providers: ['example'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1000,
      maxOutputTokens: 100,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: '2026-09-28T10:00:00Z',
    },
    selectedBy: 'session',
    provider: 'example',
    credentialScope: { layer: 'factory' },
    parameters: {},
  },
  outcome: 'complete',
  reply: {
    id: 'message_1',
    type: 'assistant',
    response: 'resp_1',
    ending: 'complete',
    blocks: [
      {
        id: 'block_1',
        kind: 'text',
        text: 'Hello.',
        visibility: { toHuman: true, toModel: true },
      },
    ],
    createdAt: '2026-09-28T10:00:02Z',
  },
  timing: {
    sentAt: '2026-09-28T10:00:00Z',
    firstTokenAt: '2026-09-28T10:00:01Z',
    endedAt: '2026-09-28T10:00:02Z',
  },
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    source: 'upstream',
  },
  cost: { cost_usd: 0.0001, source: 'upstream_usage' },
  inputCalibration: {
    requestInput: {
      kind: 'known',
      projectionRevision: 'example-projection-1',
      prefixBoundary: 1,
      prefixDigest: '1'.repeat(64),
      inputEnvelopeDigest: '2'.repeat(64),
      countingBasis: {
        binding: adaptation,
        model: 'example/chat',
        provider: 'example',
        tokenizerRevision: 'example-tokenizer-1',
        meterRevision: 'example-meter-1',
        projectionRevision: 'example-projection-1',
        replayRevision: 'example-replay-1',
        transformRevision: 'example-transform-1',
      },
    },
    observedInput: {
      kind: 'from_usage',
      provenance: { adapterRevision: 'example-adapter-1', fieldPaths: ['usage.prompt_tokens'] },
    },
    outputGroup: {
      kind: 'known',
      projectionRevision: 'example-projection-1',
      source: 'reply',
      blockDigests: ['3'.repeat(64)],
      completeness: 'complete',
      usageRef: 'usage',
    },
  },
  raw: { headers: { 'x-example': ['first', 'first', ''] } },
}

assert.deepEqual(judgePendingModelResponse(pending), { ok: true })
assert.equal(validate('ModelResponse', pending).valid, false)

// 消息写入者在确认自己的提交决定之后才提供这个事实。
const persisted = { ...pending, replyDisposition: 'persisted' }
assert.deepEqual(judgeModelResponse(persisted), { ok: true })
assert.deepEqual(judgeResponseFinalization(pending, persisted), { ok: true })
assert.deepEqual(
  judgeResponseFinalization(pending, { ...persisted, cost: { cost_usd: 0, source: 'upstream_usage' } }),
  { rejected: 'malformed' },
)
assert.deepEqual(
  judgeResponseFinalization(pending, { ...persisted, reply: { ...pending.reply, createdAt: '2026-09-28T10:00:03Z' } }),
  { rejected: 'malformed' },
)
assert.deepEqual(persisted.raw.headers['x-example'], ['first', 'first', ''])

// 独立的恢复形状只示范表示；写入者持久化前必须核实耐久锚点、实际停止与时序来源。
const recovered = {
  id: 'resp_recovery_1',
  call: { callId: 'recovery_call_1' },
  dispatch: 1,
  route: pending.route,
  outcome: 'interrupted',
  initiator: 'runtime_lost',
  timing: { sentAt: null, endedAt: '2026-09-28T10:01:00Z' },
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
  inputCalibration: {
    requestInput: { kind: 'unavailable', reason: 'send_unknown' },
    observedInput: { kind: 'unavailable', reason: 'missing_usage' },
    outputGroup: { kind: 'unavailable', reason: 'not_retained' },
  },
}
assert.deepEqual(judgeModelResponse(recovered), { ok: true })
assert.equal(recovered.cost.cost_usd, 'unknown')
assert.deepEqual(
  judgeModelResponse({ ...recovered, cost: { cost_usd: 0, source: 'none' } }),
  { rejected: 'malformed' },
)

const independentOutput = {
  ...pending,
  inputCalibration: {
    ...pending.inputCalibration,
    requestInput: { kind: 'unavailable', reason: 'not_retained' },
  },
}
assert.deepEqual(judgePendingModelResponse(independentOutput), { ok: true })
const copied = copyInputCalibration(independentOutput.inputCalibration)
if (!('ok' in copied)) throw new Error('invalid calibration')
assert.equal(Object.isFrozen(copied.ok.outputGroup), true)
assert.notEqual(copied.ok.outputGroup, independentOutput.inputCalibration.outputGroup)

assert.deepEqual(
  judgePendingModelResponse({ ...pending, timing: { ...pending.timing, sentAt: null } }),
  { rejected: 'malformed' },
)
```

`validate(defName, value)` 校验 MR10 的 25 个 JSON Schema 定义之一，返回 `{ valid: boolean }`。`judgeModelResponse(value)` 与 `judgePendingModelResponse(value)` 按 MR10 S-27 的顺序返回 `{ ok: true }` 或 `{ rejected: reason }`。它们保留精确 JSON 数值，不修改输入。表示合法不证明耐久锚点、时刻来源、实际用量、回复提交或响应体耐久；这些保证由运行时和写入者承担。

MR10 Schema 通过各 owner 的公开 Schema 入口装配完整固定依赖图；CA2/CA3、MS2/MS3/MS6/MS7、MP2/MP5/MP6 及其余可达依赖各保留原 `$id`，不做 URI 重定向；资源缺失或错版会明确导致初始化失败。接受的[MR10 契约](../../../.meta_harness/design/spec/data/model-response/v10/contract.md)和[本包 v10 实现映射](../../../.meta_harness/design/realization/packages/core/model-response/v10-reference-result-design.md)是语义依据。

## 输入校准值

持久响应与 Pending 都必填 `inputCalibration`。根入口公开六个 readonly 类型：`CountingBasis`、`RequestInputEvidence`、`ObservationProvenance`、`ObservedInput`、`OutputGroupEvidence`、`InputCalibration`。请求证据保存原投影及计量依据，输入观察保存上游事实，输出证据描述实际保留的组。`from_usage` 引用三个互斥输入分项，不另复制总量；缺失分项保持 `unknown`，不补零。

示例的重复数字摘要及版本标签仅演示表示，不能当作内容的真实摘要。生产适配器须提供固定投影、真实来源和实际内容摘要。请求证据不可用时，输出仍可 known，并保留自己的 projectionRevision；示例同时演示这种组合和 missing_usage。

`copyInputCalibration(value)` 返回 `{ ok: InputCalibration }` 或 `{ rejected: 'malformed' }`。它不执行 getter，拒绝循环、非 JSON 值、非法成员及片段内部的投影版本冲突。成功值是无损、自有且深冻结的快照；不认证 route/usage 关系、摘要对应或上游来源。

`validate` 仅判 Schema。两个 judge 在既有具名拒绝之后进一步判完整绑定、版本、同名来源事实、精确分项和、输出来源及块数。片段 copy 成功不表示整个响应合法。本包不读历史日志、不调用 tokenizer、不写校准记录；授权与响应／回复原批持久由 runtime 负责。缺字段旧值直接拒绝，不补全或回填。

## 最终化保留原响应

`judgeResponseFinalization(pending, final)` 先取得完整 Pending 的自有无损值并按原顺序完整判定，通过后才取得并判定 final。比较只移除 final 顶层的 `replyDisposition` 和 `late`；原回复和已有派生、usage/cost、raw 引用、头值顺序与 inputCalibration 等其余全部 JSON 值必须精确相等。对象键顺序和数字同值异拼写不影响相等；数组顺序、重复、缺席和精确小数差异有意义。结果沿既有冻结判定，不改输入。

S-46 允许 Pending 作为不可变内容保留，但它仍不是 final。本函数不证明原字节、来源、授权、耐久发布或费用选择，不查询当前 provider/meter、不重算原摘要、不把 unknown 补零。首次持久消息允许的成对 renderings/transcript 新增由 messages 的唯一 `judgeModelReplyMessage` 判断；final.reply 自身仍保留原值。runtime/写方组合两个值判定与真实来源、当前写权检查，再提交原批。[D-110](../../../.meta_harness/design/record/decisions/model-runtime-reference-lifecycle-adoption/decision.md) 采用本版，真实 runtime/存储组合仍需另行验证。
