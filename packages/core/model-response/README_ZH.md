# @omne-harness-lite/model-response

[English](README.md)

本包实现 MR7 的纯响应体表示与有序判定。一条 `ModelResponse` 记录一次实际发出的路由和档案快照、收场、时序、回复或已交付的部分、实际用量与费用，以及可选的原始响应引用。`PendingModelResponse` 是交给消息写入者的完整待提交回复事实；写入者完成自己的提交决定后，才给持久响应填 `replyDisposition`，并在适用时判断 `late`。本包不发起模型请求，也不持久化记录。

本包是工作区内的私有 ESM 包。当前公开入口只有包根和 `./schema`。旧响应版本没有可执行子入口。不兼容的历史值会明确拒绝，不会从当前模型目录补齐缺失字段。

## 判定待提交回复和持久响应

下列例子可在构建工作区包后作为 ESM 文件运行。它构造的是纯文本档案。真实运行时必须从实际发出和上游交接获取路由、时刻、用量、费用与回复，不能为通过判定而伪造事实。

```js
import assert from 'node:assert/strict'
import {
  judgeModelResponse,
  judgePendingModelResponse,
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
  raw: { headers: { 'x-example': ['first', 'first', ''] } },
}

assert.deepEqual(judgePendingModelResponse(pending), { ok: true })
assert.equal(validate('ModelResponse', pending).valid, false)

// 消息写入者在确认自己的提交决定之后才提供这个事实。
const persisted = { ...pending, replyDisposition: 'persisted' }
assert.deepEqual(judgeModelResponse(persisted), { ok: true })
assert.deepEqual(persisted.raw.headers['x-example'], ['first', 'first', ''])
```

`validate(defName, value)` 校验 MR7 的 19 个 JSON Schema 定义之一，返回 `{ valid: boolean }`。`judgeModelResponse(value)` 与 `judgePendingModelResponse(value)` 按 MR7 S-27 的顺序返回 `{ ok: true }` 或 `{ rejected: reason }`。它们保留精确 JSON 数值，不修改输入。表示合法不证明上游确实返回这些事实，也不证明回复已提交或响应体已耐久；这些保证由运行时和写入者承担。

MR7 Schema 通过各 owner 的公开 Schema 入口装配固定的 22 份规范资源；资源缺失或错版会明确导致初始化失败。接受的[MR7 契约](../../../.meta_harness/design/spec/data/model-response/v7/contract.md)和[本包 v7 实现映射](../../../.meta_harness/design/realization/packages/core/model-response/v7-design.md)是语义依据。
