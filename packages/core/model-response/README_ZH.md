# @omne-harness-lite/model-response

[English](README.md)

表示一次模型发出的记录：路由快照、实际参数、响应收场、时序、已交付内容、用量与费用。本包判定完整记录，不发送模型请求、不拥有持久化。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

包根入口和 `./schema` 精确采用 **MR4**；有序字符串数组响应头须显式导入 `./v5` 与 `./schema/v5`。保留的 `./v3`、`./schema/v3`、`./schema/v2` 维持原版本。同步判定不取得调用方输入的所有权，也不证明头值来自哪里。

## 显式 MR5 完整响应与原始头

下面用公开 v5 判定完整响应，并校验 `RawHeaders`。空数组、空串与缺席各自独立；旧根 MR4 仍拒绝混合数组值。

```ts
import assert from 'node:assert/strict'
import { judgeModelResponse as judgeV4 } from '@omne-harness-lite/model-response'
import {
  judgeModelResponse,
  validate,
  type ModelResponse,
  type RawHeaders,
} from '@omne-harness-lite/model-response/v5'

const headers: RawHeaders = {
  'x-one': 'a,b',
  'x-many': ['second', 'first', 'first', ''],
  'x-empty-array': [],
  'x-empty-string': '',
}
const adaptation = {
  implementation: { name: 'example-family', revision: 'impl-1' },
  definition: { modelId: 'vendor/chat', revision: 'model-1' },
  configuration: { revision: 'config-1', values: {} },
}
const response: ModelResponse = {
  id: 'response_1',
  call: { callId: 'model_call_1' },
  dispatch: 1,
  route: {
    adaptation,
    profile: { origin: 'official', routeName: 'vendor/chat' },
    profileSnapshot: {
      adaptation,
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 32000,
      maxOutputTokens: 8192,
      updatedAt: '2026-09-26T09:00:00Z',
    },
    selectedBy: 'session',
    provider: 'provider-a',
    credentialScope: { layer: 'factory' },
    parameters: {},
  },
  outcome: 'interrupted',
  initiator: 'user',
  timing: { sentAt: '2026-09-26T10:00:00Z', endedAt: '2026-09-26T10:00:02Z' },
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
  raw: { headers },
}
assert.deepEqual(validate('RawHeaders', headers), { valid: true })
assert.deepEqual(judgeModelResponse(response), { ok: true })
assert.deepEqual(judgeV4(response), { rejected: 'malformed' })
assert.deepEqual(headers['x-empty-array'], [])
```

| 公开 API                                      | 用途                         |
| --------------------------------------------- | ---------------------------- |
| `ModelResponse`、`Route`、`Failure`、`Timing` | 描述响应的条件形状           |
| `judgeModelResponse`                          | 按次序判定独立成员与收场关系 |
| `validate`、`SCHEMA_DEF_NAMES`、`schemaId`    | 使用 Schema 校验面           |

## 判定完整响应

通过公开 API 构造带类型身份的消息与块。此记录使用官方档案与出厂凭据范围。

```ts
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'

const block = judgeContentBlock({
  id: 'block_1',
  kind: 'text',
  text: 'Ready.',
  visibility: { toHuman: true, toModel: true },
})
if ('rejected' in block || block.ok.kind !== 'text') throw new Error('Text block required')
const { origin: _origin, ...replyBlock } = block.ok
const response: ModelResponse = {
  id: 'response_1',
  call: { callId: 'model_call_1' },
  dispatch: 1,
  route: {
    profile: { origin: 'official', routeName: 'vendor/chat' },
    adaptation: {
      implementation: { name: 'example-family', revision: 'r1' },
      definition: { modelId: 'vendor/chat', revision: 'd1' },
      configuration: { revision: 'c1', values: {} },
    },
    profileSnapshot: {
      adaptation: {
        implementation: { name: 'example-family', revision: 'r1' },
        definition: { modelId: 'vendor/chat', revision: 'd1' },
        configuration: { revision: 'c1', values: {} },
      },
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 32000,
      maxOutputTokens: 8192,
      updatedAt: '2026-09-26T09:00:00Z',
    },
    selectedBy: 'session',
    provider: 'provider-a',
    credentialScope: { layer: 'factory' },
    parameters: { maxOutputTokens: 64 },
  },
  outcome: 'complete',
  reply: {
    id: unwrap(parseOpaqueIdentifier('message_1', 'MessageId')),
    type: 'assistant',
    response: 'response_1',
    ending: 'complete',
    blocks: [replyBlock],
    createdAt: '2026-09-26T10:00:02Z',
  },
  replyDisposition: 'persisted',
  timing: {
    sentAt: '2026-09-26T10:00:00Z',
    firstTokenAt: '2026-09-26T10:00:01Z',
    endedAt: '2026-09-26T10:00:02Z',
  },
  usage: {
    input_tokens: 12,
    output_tokens: 2,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    source: 'upstream',
  },
  cost: { cost_usd: 0.0001, source: 'upstream_usage' },
}
console.log(judgeModelResponse(response)) // { ok: true }
console.log(
  judgeModelResponse({ ...response, reply: { ...response.reply, ending: 'truncated_at_limit' } }),
)
// { rejected: 'reply_ending_mismatch' }
```

## 判定故障与拒绝次序

未知费用保留为未知；带内故障与状态码的关系，在具名响应关系之后检查。

```ts
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'

const response: ModelResponse = {
  id: 'response_failed',
  call: { callId: 'model_call_2' },
  dispatch: 1,
  route: {
    profile: { origin: 'official', routeName: 'vendor/chat' },
    adaptation: {
      implementation: { name: 'example-family', revision: 'r1' },
      definition: { modelId: 'vendor/chat', revision: 'd1' },
      configuration: { revision: 'c1', values: {} },
    },
    profileSnapshot: {
      adaptation: {
        implementation: { name: 'example-family', revision: 'r1' },
        definition: { modelId: 'vendor/chat', revision: 'd1' },
        configuration: { revision: 'c1', values: {} },
      },
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 32000,
      maxOutputTokens: 8192,
      updatedAt: '2026-09-26T09:00:00Z',
    },
    selectedBy: 'session',
    provider: 'provider-a',
    credentialScope: { layer: 'factory' },
    parameters: {},
  },
  outcome: 'failed',
  failure: { cause: 'request_rejected', statusCode: 429 },
  timing: { sentAt: '2026-09-26T10:00:00Z', endedAt: '2026-09-26T10:00:02Z' },
  usage: {
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  },
  cost: { cost_usd: 'unknown', source: 'none' },
}
console.log(judgeModelResponse(response)) // { ok: true }
console.log(judgeModelResponse({ ...response, outcome: 'future', dispatch: 0 }))
// { rejected: 'outcome_unknown' }
console.log(
  judgeModelResponse({
    ...response,
    outcome: 'interrupted',
    initiator: 'user',
    failure: { cause: 'request_rejected', inBand: true },
  }),
) // { rejected: 'failure_on_interrupted' }
```

## 失败与边界

`judgeModelResponse` 返回 `{ ok: true }` 或一个 `{ rejected }`。优先次序是：未知收场、小于一的整数发出序号、未知故障成因、其他独立成员形状错误；随后依次是 `reply_missing`、`reply_on_failure`、`reply_and_delivered`、`failure_missing`、`failure_on_interrupted`、`failure_on_success`、`reply_ending_mismatch`、`first_token_inconsistent`；剩余跨成员违例是 `malformed`。例如 `failure.inBand: true` 缺 `statusCode` 不会盖过 `failure_on_interrupted`。只检查 Schema 的 `validate` 返回形状是否有效，不表达上述拒绝次序。

完整与截断响应带回复及其去向。回复中途故障带 `delivered` 与首 token 时刻，不带回复。中断有自己的条件形状，不属于故障。`late` 只属于关联运行的响应。计数与费用使用精确的 `JsonNumber`，未知金额不会被替换为零。

通过校验只说明表示有效。实际发出来源、身份唯一性、时钟来源、真实用量、脱敏、快照捕获与持久化仍由写入方负责。被拒绝的记录说明写入方有缺陷，不能被重新分类为模型调用故障，也不能据此自动重发。本模块不读时钟或存储，不调用模型。

公开 JSON Schema 入口是 `@omne-harness-lite/model-response/schema`（v4）、`/schema/v5`、`/schema/v3` 和 `/schema/v2`。参见[源码导出](src/index.ts)、[测试](tests/)与[模型档案](../model-profile/README_ZH.md)。

默认入口与 Schema 采用 version4；`./v3` 和 `./schema/v3` 保留 version3 纯值入口及精确资源。`./schema/v2` 仍仅为 Schema 资源。恢复请求记录或响应时请显式选择消费版本。
