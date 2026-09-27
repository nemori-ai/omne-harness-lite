# @omne-harness-lite/model-request-runtime

[English](README.md)

调用一次显式模型传输，把响应流装配为最终结果，提供取消、内容时限和异步首内容门。本包是实验性 ESM workspace 成员，尚未发布到 npm。

当前实现范围是独立函数。耐久十三操作服务、Cordis 插件、租户准入、恢复、重试和回复结算尚待交付。精确采用与覆盖见[实现映射](../../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md)。

## 公开接口

| 导出 | 用途 |
| --- | --- |
| `invokeModel(input)` | 返回包含 `outcome`、`snapshot()` 与 `abort()` 的句柄 |
| `classifyCause(facts, hasContent, table)` | 按显式状态码表分类来源，保留原始状态码 |
| `dispatchGuard(input)` | 按显式调用、发出与档案事实同步判定一次重试计划 |
| `DispatchGuardInput`、`DispatchGuardResult`、`DispatchGuardFact<T>` | 只读守卫输入、闭合答案与明确的已知／未知事实 |
| `TransportAdapter`、`PlanInput` | 调用者持有的 plan/send/read 端口与显式请求输入 |
| `InvocationPolicy`、`ModelInvocationResult` | 调度、脱敏、诊断政策与尚未结算的结果投影 |

## 调用显式传入的请求

将两个包声明为直接 workspace 依赖。先按[传输示例](../pi-ai-transport/README_ZH.md#只规划提醒不发送请求)构造 `PlanInput`，再交入明确持有的凭据和取消信号。示例函数只在被调用时发送，不读环境凭据。

```ts
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createPiAiTransport, type TransportOptions } from '@omne-harness-lite/pi-ai-transport'

export async function invokeOnce(
  request: PlanInput, transportOptions: TransportOptions, credential: string, signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const transport = createPiAiTransport(transportOptions)
  const fragmentLength = transportOptions.policy.credentialFragmentMinLength
  try {
    const handle = invokeModel({
      ...request, transport, credential, signal,
      ...(beforeFirstContent ? { beforeFirstContent } : {}),
      policy: {
        now: () => new Date().toISOString(),
        schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
        firstContentTimeoutMs: 60000, idleContentTimeoutMs: 60000,
        statusCauseTable: { '401': 'credential_unavailable', '429': 'upstream_unavailable', '503': 'upstream_unavailable' },
        redact: text => {
          let value = text.split(credential).join('█')
          for (let offset = 0; offset <= credential.length - fragmentLength; offset++)
            value = value.split(credential.slice(offset, offset + fragmentLength)).join('█')
          return value
        },
        diagnostic: event => { console.log(event.kind) },
      },
    })
    console.log(handle.snapshot().position)
    return await handle.outcome
  } finally { await transport.close() }
}
```

transportOptions.definitions 必须显式给已核实的完整定义与自持网络政策。没有默认 pilot，officialModelIds 只列目标；缺定义或旧形状在资源建立前失败。传输 README 的教学值不能配真实凭据使用。

示例状态码表和脱敏器属于调用者政策，不是全局强制默认值。生产调用者应交入完整已确认政策。输出上限、供应商、快照、绑定和消息全部来自 request，函数不自行查找。

异步工作开始前，调用固定自己持有的请求值及政策成员；借用函数和资源的寿命仍归调用者。使用动态适配引用时，交入 `lease.transport`，用 `lease.track(...)` 登记调用结果及独立的异步内容门/结算，等待它们实际停止后释放。

## 观察、内容门与取消

`handle.snapshot()` 读取已接受序列，不再次发送。可选 `onAccepted(event, snapshot)` 观察同一序列。交入 `beforeFirstContent` 后，内容在门成功前保持不可见；门失败会停止执行，返回本地失败且不交出私有块。没有交门时不具有耐久落盘保证。

调用 `handle.abort()` 或中止传入信号后，等待 `handle.outcome` 再释放资源。出网前取消返回 `{ cancelledBeforeSend: true }`，没有请求结果。已开始发送的调用收敛为 `complete`、`truncated`、`interrupted` 或 `failed`。首内容后失败保留已经交付的部分。usage、缓存零与未知、精确实报费用保真；上游缺身份时不从请求路由补造。

规划拒绝不产生模型响应。意外实现缺陷仍表现为被拒绝的 promise。结果没有会话、租户、ResponseId，也没有耐久入账或回复落盘含义。

## 不发送就判定一次重试计划

`dispatchGuard` 是同步纯函数。调用者交入合法取得的当前调用事实、跨所有尝试的完整开口历史、最近失败、原完整档案快照和重试计划。`{ known: null }` 表示已知该调用不存在；`{ unknown: true }` 表示当前无法确定该事实。不能把本地过时阶段当作已知的当前权威。非法数据返回 `invalidInput`；当前守卫所需事实无法判定时返回 `unavailable`。

函数依次判调用存在、终态或 `reply_pending`、任何一次开口、阶段、失败类别和供应商限制。它使用快照中原有的有序供应商与 `allowFallback`，通过严格 JSON 复制接收输入，不调用 getter、不改入参、不跨调用持有调用状态。守卫没有 Cordis、存储、时钟、调度或网络操作。

下面的教学示例无需服务或凭据即可执行。使用精确 JSON 数时，把 `content-blocks` 与本包一起声明为直接依赖。

```ts
import { dispatchGuard, type DispatchGuardInput } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const input: DispatchGuardInput = {
  session: 'example-session',
  callId: 'example-call',
  call: { known: {
    session: 'example-session', callId: 'example-call', phase: { known: 'awaiting_decision' },
  } },
  dispatches: { known: {
    session: 'example-session', callId: 'example-call', opened: [{ known: false }],
  } },
  latestFailure: { known: 'upstream_unavailable' },
  snapshot: { known: {
    adaptation: {
      implementation: { name: 'teaching', revision: 'one' },
      definition: { modelId: 'teaching/model', revision: 'one' },
      configuration: { revision: 'one', values: {} },
    },
    providers: ['first', 'second'], allowFallback: true,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: new LosslessNumber('9007199254740993'), maxOutputTokens: 10,
    updatedAt: '2026-09-27T00:00:00Z',
  } },
  plan: { provider: 'second', after: 'PT9007199254740993.0000000001S' },
}
const answer = dispatchGuard(input)
if (!('allowed' in answer)) throw new Error('Expected this example retry plan to be allowed')
```

`after` 沿共享 ISO 时长字符串（`PT` 后的时／分／秒），不设数值上限、不转成毫秒。缺席表示不等，函数本身从不等待。答案是 `{ allowed: true }`、`{ refused: { why } }` 或 `{ rejected }`（`wrongPhase` 另带 `phase`）。拒绝原因恰为 `already_spoke`、`fact_class`、`provider_not_allowed`；错误恰为 `invalidInput`、`callNotFound`、`alreadyEnded`、`wrongPhase`、`unavailable`。允许只对应已交入事实，后续实际操作仍核当前状态、宿主停止与依赖。耐久 `canDispatchAgain`／`dispatchAgain` 服务尚待交付。

## 开发与验证

```sh
pnpm --filter @omne-harness-lite/model-request-runtime... run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```

配套传输测试用真实本地 HTTPS 和公开 core 装配器验证本函数。完整服务/耐久保证及真实模型认证仍需后续阶段验收。
## 日志值的捕获、构造与认回

成员检查消费 [D089 已采用](../../../.meta_harness/design/record/decisions/model-time-order-projection-adoption/decision.md) 的 offer-expiry 公共根比较器，在捕获的原 timing 字符串上核 `sentAt <= firstTokenAt <= endedAt`；首 token 缺席时核 `sentAt <= endedAt`。静态非法日期和逆序不能返回成员完整。任意小数与时区同点保留精度，opened 的原字符串仍须精确相同。

本包根入口公开 `modelLogFormat`、`encodeModelLogKey`、`decodeModelLogKey`、`captureModelLogValue`、`prepareModelLogEntry`、`inspectModelLogEntry`、`inspectSettlementMembers`、`modelLogJsonEqual`、`recognizeMessageValue` 及其类型，消费 [D088 的精确采用](../../../.meta_harness/design/record/decisions/model-runtime-log-codec-adoption/decision.md)。所有这些构件均为纯函数；静态导入和调用不打开日志、不装 Cordis、不读取环境凭据或时钟、不发号。日志类型只从 session-log-jsonl 根入口借用。

文本与值接收是两个显式模式。任意层重复成员、getter、`toJSON`、非 JSON 对象及伪数字品牌均拒绝。捕获返回自有不可变原 JSON，保留数字词法；响应 judge 的 `{ ok: true }` 不会替调用方制造 owned ModelResponse。

```ts
import { captureModelLogValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const captured = captureModelLogValue({
  category: 'record',
  input: { kind: 'text', text: '{"kind":"model_call_opened","call":"example-call","dispatch":1.0,"firstTokenAt":"2026-09-27T00:00:01Z"}' },
})
if (!('ok' in captured)) throw new Error(captured.reason)
if (!writeJsonLossless(captured.ok.value).includes('"dispatch":1.0'))
  throw new Error('Original numeric spelling must survive capture')
```

构造条目时显式交会话、租户、成对 run/attempt、用途及这条消息之前的完整合法消息前缀。`messagePrefix: null` 表示前缀不可得，日志消息会拒绝，不能偷偷代传空数组。写前 OwnedLogEntry 没有耐久 position。实际写方负责权限、栅栏、condition、追加和清理；selection 恒无判重键，其余 D 必须显式出现在 R 中。persisted AssistantMessage 使用 `{ kind: 'persistedMessage', response: capturedResponse }`，与响应的完整 reply 一致；普通 assistant 和 SystemMessage 不得独立写入。

```ts
import { captureModelLogValue, prepareModelLogEntry, encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { parseTenantId } from '@omne-harness-lite/identity-values'

const tenant = parseTenantId({ organization: 'example-organization', account: 'example-account' })
const message = captureModelLogValue({ category: 'message', input: { kind: 'value', value: {
  id: 'example-message', type: 'user', createdAt: '2026-09-27T00:00:00Z', blocks: [],
} } })
if (!('ok' in tenant) || !('ok' in message)) throw new Error('Invalid example value')
const prepared = prepareModelLogEntry({
  session: 'example-session', shell: { tenant: tenant.ok }, captured: message.ok,
  purpose: { kind: 'message' }, messagePrefix: [],
})
if (!('ok' in prepared)) throw new Error(prepared.reason)
const key = encodeModelLogKey({ kind: 'message', message: 'example-message' })
if (!('ok' in key) || prepared.ok.dedupeKey !== key.ok || !prepared.ok.readKeys.includes(key.ok))
  throw new Error('D and R must explicitly share the MessageId key')
if ('position' in prepared.ok) throw new Error('A candidate has no durable position')
```

全值相等按精确数学数字、对象成员无序、数组有序和原字符串判断；缺席不等于 null。消息认回保留原捕获值，不用本次候选覆盖原值；仅比 id、正文或 source 不够。

```ts
import { recognizeMessageValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const original = '{"id":"example-reminder","type":"system_reminder","nature":"event","source":{"kind":"extension","extension":"teaching","payload":{"amount":1.00}},"blocks":[],"createdAt":"2026-09-27T00:00:00Z"}'
const candidate = original.replace('1.00', '1e0')
const recognized = recognizeMessageValue({
  candidate: { kind: 'text', text: candidate }, original: { kind: 'text', text: original },
})
if (!('same' in recognized)) throw new Error('Expected the same mathematical JSON value')
if (!writeJsonLossless(recognized.original.value).includes('1.00'))
  throw new Error('Recognition must retain the original value')
```

`inspectModelLogEntry` 接收实际 LogEntry、预期 session/tenant、明确用途及该位置之前的消息前缀，反核闭合 `{ format, category, value }` wrapper、壳、position 和全部 D/R；R 读取时按集合核对，不把排列次序当业务值。`inspectSettlementMembers` 接收 `{ mode: 'read', session, tenant, prefix: { entries, tail }, target: { call, dispatch, response }, anchors: { dispatched, opened, intent }, current }`；`current` 为 null，或已指定 `{ messageId, disposition }`（缺席成员用 null）。write 模式还交完整 position-free `candidates` 数组，不要求新 R 已在前缀中。

认回先看原批自己的身份、绑定、参数、原金额和完整回复；败方未提交 MessageId 不同或被另批占用，不单独否定合法原批。原批不存在时，当前候选 MessageId 占用才阻止 absent。`completeMembers` 附原捕获值和条目，以及 `disposition: 'same' | 'firstWinner' | 'unrequested'`；不同合法处置保留先到原批，具体服务的成功/alreadyEnded 映射仍归原操作。

成员检查不证明一次物理 append、合法历史、读权限、Run 生命周期或旧任务实际停止。H1 一次 `[M,R]` 与 H2 分次 `[M]`/`[R]` 可有相同 SL3 读面；G29-P/H 仍由宿主和全部写方关闭。withRun late 认回在 G28 原生产解释器未交付时返回 `undetermined: true, reason: 'run_history_unavailable'`，不能把未知历史当 false，也不能用归账 attempt 代原发出 attempt。十三操作服务、真实 runner/app 采用、G30/G31 和生产模型认证仍待交付。

```ts
import { captureModelLogValue, modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'

const sent = '2026-09-27T00:00:00.0004Z'
const first = '2026-09-27T00:00:00.0003Z'
const order = compareRfc3339Instants(sent, first)
if (!('ok' in order) || order.ok !== 1) throw new Error('Sub-millisecond reverse order must remain visible')
const alias = '2026-09-27T01:00:00.0003+01:00'
const sameInstant = compareRfc3339Instants(first, alias)
if (!('ok' in sameInstant) || sameInstant.ok !== 0) throw new Error('Expected offset-equivalent instants')
if (modelLogJsonEqual(first, alias)) throw new Error('Original strings remain different')
const opened = captureModelLogValue({ category: 'record', input: { kind: 'value', value: {
  kind: 'model_call_opened', call: 'example-call', dispatch: 1, firstTokenAt: first,
} } })
if (!('ok' in opened) || opened.ok.record?.kind !== 'model_call_opened' || opened.ok.record.firstTokenAt !== first)
  throw new Error('Capture must retain the original opened string')
```

比较器与 completeMembers 在声明的合法 RFC3339 输入域内给条件性结果，不认证实际时间来源、闰秒公告、合法历史或物理提交。真正生产边界的生产者／宿主／历史 owner 仍须兑现 TL-G1；未核外部值或历史在该边界保持 unavailable。旧毫秒 Instant／Clock 行为保持原状。
