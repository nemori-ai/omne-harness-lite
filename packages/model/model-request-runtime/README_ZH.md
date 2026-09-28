# @omne-harness-lite/model-request-runtime

[English](README.md)

调用一次显式模型传输，把响应流装配为最终结果，提供取消、内容时限和异步首内容门。本包是实验性 ESM workspace 成员，尚未发布到 npm。

当前提供独立调用、纯政策函数、限定范围的耐久消费者、四项会话选择／查询操作，以及不属于 Run 的纯调用历史解释器。内部施工已定义十三个操作各自的输入／结果类型和进程内调用容器，并提供显式有界的 reservation 等待。`./plugin` 可把应用已组成的十三操作服务交给 Cordis，但统一服务仍在集成，不能声称十三操作已经交付。回复处分使用原锚定调用句柄；本地容器消失后，通过有归属的恢复作用域认回已完成的不属于 Run 的原批。恢复目前只认回已结算调用，缺响应的追补因原发出时刻没有耐久来源而保持不可用。装配义务见[当前服务设计](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v7-current-design.md)，采用和覆盖见[实现映射](../../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md)；属于 Run 的成功路径仍依赖真实 Run 历史解释器。

## 公开接口

| 导出 | 用途 |
| --- | --- |
| `invokeModel(input)` | 返回包含 `outcome`、`snapshot()` 与 `abort()` 的句柄 |
| `classifyCause(facts, hasContent, table)` | 按显式状态码表分类来源，保留原始状态码 |
| `dispatchGuard(input)` | 按显式调用、发出与档案事实同步判定一次重试计划 |
| `DispatchGuardInput`、`DispatchGuardResult`、`DispatchGuardFact<T>` | 只读守卫输入、闭合答案与明确的已知／未知事实 |
| `retryDelay(input)`、`RetryBackoffPolicy`、`RetryDelayInput`、`RetryDelayResult` | 按显式政策、重试序号、sample 及 decorrelated 前值计算精确 TD3 Duration |
| `TransportAdapter`、`PlanInput` | 调用者持有的 plan/send/read 端口与显式请求输入 |
| `InvocationPolicy`、`ModelInvocationResult` | 调度、脱敏、诊断政策与尚未结算的结果投影 |
| `createSessionModelSelection(input)` | 借用提供者的消费者：`legalTargets`、`selectModel`、`displayList`、`effectiveModel` 与操作收口 |
| `interpretCallHistory({ prefix, callId })` | 从完整自有 SL3 前缀经当前 `mrr/3` codec 解释不属于 Run 的一次调用；不完整或属于 Run 的历史保持不可用 |
| `projectCallState({ session, callId, history, local? })` | 仅在耐久响应尚未覆盖时叠加进程自有 `open` 或 `reply_pending` 责任 |

## 仍在集成的 Cordis 服务装配

`@omne-harness-lite/model-request-runtime/plugin` 导出 `createModelRuntimePlugin` 与 `modelRuntime` 服务键。应用通过 `construct` 交入完整的 `ModelRuntimeAssembly`；插件不会替缺失操作填占位实现。Cordis 等声明的必需提供者齐备才构造。单个收口 effect 先关闭 `openCall`、`dispatch`、`dispatchAgain` 的新准入，再等待装配自身的实际停止和资源清理。已有服务引用在撤除期间仍可执行允许的结算和读取。收口不可用仍是具名持有的恢复责任并被记录，不表示调用已经结算。

```ts
import type { Context } from '@deepseek-ai/cordis'
import {
  createModelRuntimePlugin,
  type ModelRuntimeAssembly,
} from '@omne-harness-lite/model-request-runtime/plugin'

export async function installRuntime(
  ctx: Context,
  construct: () => Promise<ModelRuntimeAssembly>,
) {
  return ctx.plugin(createModelRuntimePlugin({ construct }), {})
}
```

内部 `createCallContainerStore().waitReserve(...)` 要求显式的正数等待者上限和超时，以及有归属的调度器与取消信号。调用容器插入后，活跃 reservation 绑定原锚定调用句柄；释放短 reservation 不丢该句柄、待处分回复、未知写者或精确传输租约。`container.close()` 只有在原句柄报告实际释放且其余 owner 核查通过后才释放租约。reservation 本身不产生耐久授权。

## 读取调用，不把本地状态当作耐久事实

先由已认证的会话日志绑定与已登记读取任务经 `readSettlementPrefix` 取得 `prefix`。它会拒绝缺号、租户或会话错误、提供者代际变化。解释器只读该完整前缀，不发送、不写入，也不猜 Run 终结。对不属于 Run 的调用，完整响应批得出的耐久终态优先于旧的本地 `reply_pending` 责任。调用方在凭缺席决定重新发出前，仍须处理未停止的旧写者。

```ts
import { interpretCallHistory, projectCallState, type SettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'

export function readNoRunCall(prefix: SettlementPrefix, session: SessionRef, callId: string) {
  const history = interpretCallHistory({ prefix, callId })
  return projectCallState({ session, callId, history })
}
```

返回的 `CallHistoryDispatch` 保留原「已出门」条目、「已开口」锚点、经验证的完整原响应值及其投影。`in_flight`、`speaking` 只描述耐久事实前沿，不证明旧网络请求或写者已实际停止。只有中断意图、没有发出记录时，历史保留 `phase: null` 供对账，状态投影在收场未明前返回 `unavailable`。未知模型日志格式也返回 `unavailable`，不冒充缺席。属于 Run 的历史在原 Run/attempt 认法被正式采用前返回 `run_history_unavailable`。

## 调用显式传入的请求

传入完整 `PlanInput`、明确持有的类型化适配器、凭据与取消信号。本例只导入 runtime 公开包并使用实际流装配器，将它声明为直接依赖；适配器须配置相同的完整凭据政策。资源由调用者持有，在 outcome 与独立门任务实际停止后释放。不读环境凭据。

```ts
import {
  invokeModel, openRouterCredentialRedactionConfig,
  type PlanInput, type PlannedSemantics, type TransportAdapter, type InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime'

export const callerPolicy: InvocationPolicy = {
  now: () => new Date().toISOString(),
  schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
  firstContentTimeoutMs: 60000, idleContentTimeoutMs: 60000,
  statusCauseTable: { '401': 'credential_unavailable', '429': 'upstream_unavailable', '503': 'upstream_unavailable' },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic: event => { console.log(event.kind) },
}

export async function invokeOnce<P extends PlannedSemantics, R>(
  request: PlanInput, transport: TransportAdapter<P, R>, credential: string, signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const handle = invokeModel({ ...request, transport, credential, signal, policy: callerPolicy,
    ...(beforeFirstContent ? { beforeFirstContent } : {}),
  })
  return await handle.outcome
}
```

实际 OpenRouter 适配器通过[传输包](../pi-ai-transport/README_ZH.md)传入已核实完整定义与自持网络政策。没有默认 pilot；officialModelIds 只列目标，教学数据不能配真实凭据使用。

示例时限与状态表由调用者选择。`credentialRedaction` 是必需的完整显式配置，在规划和发送前校验、绑定；缺失或非法配置返回 `invalidInput` 且不发送。旧任意 `redact` 回调已删除，没有兼容回退。模型、供应商、档案、参数和消息均来自传入请求。

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

## 计算精确重试退避

`retryDelay` 是同步纯函数，实现 [RT4 S-60](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v4/contract.md#s-60-纯判定与可单取用构件)，沿 D086 接受与 D076 R3-P7 投影、D087 保留范围采用。结果为 `{ ok: duration }` 或 `{ invalidInput: { reason: 'malformed' } }`。五个政策成员、正整数 `n` 和 `[0, 1)` 内的精确 `uniformSample` 均须显式给出，`none` 也不例外。decorrelated 另需 `previousDelay`；第一次重试须按时长值等于 `base`。函数不提供默认值或随机源。

```ts
import { retryDelay } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const delay = retryDelay({
  policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT25S', jitter: 'half' },
  n: 3, uniformSample: new LosslessNumber('0.999'),
})
if ('invalidInput' in delay) throw new Error(delay.invalidInput.reason)
if (delay.ok !== 'PT24.9875S') throw new Error('unexpected exact delay')

const next = retryDelay({
  policy: { kind: 'constant', base: 'PT1M', factor: 1.5, max: 'PT2M', jitter: 'decorrelated' },
  n: 1, uniformSample: 0.25, previousDelay: 'PT60S',
})
if ('invalidInput' in next) throw new Error(next.invalidInput.reason)
if (next.ok !== 'PT67.5S') throw new Error('unexpected decorrelated delay')
console.log(delay.ok, next.ok)
```

构造 `LosslessNumber` 时将 content-blocks 声明为直接依赖。时长接受 TD3 的 H/M/S 字符串、小数秒及等值写法，输出采用精确秒。系数复用公开 `JsonNumber` 表示，可保留十进制字面量及超过 2^53 的重试序号。普通 JavaScript 数值按调用时已有的十进制值处理，函数无法恢复调用前已经丢失的精度。

函数复制并校验 JSON 数据、不读取 getter、不改调用者输入，也不取整到毫秒。算术结果不表示已经允许重试，不执行等待、发送、回退或默认重试贡献。实际定时精度和大时长调度仍受 R3-G7 约束；P-5/runner 接线及 37 模型认证尚待交付。

## 显式共享凭据脱敏

`createCredentialRedactionPolicy(config)` 构造 [D093](../../../.meta_harness/design/record/decisions/model-credential-policy-adoption/decision.md) 采用的纯政策。三个具名参数缺一不可。`openRouterCredentialRedactionConfig` 是显式交入、深度不可变的 `openrouter-redaction/1` 基线：片段最小长度 8、已采用的 11 项头名单与 sk-/Bearer/Basic 三个有限描述。算法没有隐式配置、环境、网络、存储或 Cordis 依赖。

`policy.bind(knownCredential)` 返回 `{ ok: bound }` 或 `{ rejected: 'invalidInput' }`。冻结的闭包只公开 `text(value)`、`headers(value)`、`json(value)`，三个操作沿同一明确结果壳。已知凭据须为非空可打印 ASCII；完整凭据即使短于片段阈值也会保护。所有匹配均从原输入求区间并集，每段变为 `█`，不正规化、不猜未知编码、不执行开放正则。头先按原键的 ASCII 大小写折叠剥除名单项，再处理键和值；字符串／有序字符串数组的形状、重复与空值保留。JSON 处理键及全部 scalar token，包括精确数字、布尔和 null；命中的非字符串 scalar 整体变成标记字符串，未命中的类型与数字词法保持。输出独立且冻结，安全值再次处理在值意义上相等。 精确数字准入在模块初始化时捕获可信的公开 LosslessNumber source getter，显式读取品牌源后立即复制为标准自有数字；token 匹配在这份副本上调用 jsonNumberSource，调用者原型的 Get trap 不能替换该数字 token。

`redact(value, knownCredential, params)` 是独立 RT5 S60 JSON／字符串函数，复用同一内核。实际响应头应调用 `bound.headers`，它还会剥除名单项。精确数字示例需把本包和 content-blocks 声明为直接依赖；示例只处理合成数据，不发送请求。

```ts
import {
  createCredentialRedactionPolicy, openRouterCredentialRedactionConfig, redact,
} from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'

const policy = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig)
const binding = policy.bind('teaching-secret')
if (!('ok' in binding)) throw new Error(binding.rejected)
const text = binding.ok.text('teaching-secret / Bearer example-token')
if (!('ok' in text) || text.ok !== '█ / █') throw new Error('Unexpected safe text')
const headers = binding.ok.headers({ Authorization: 'discard', X: ['', 'teaching-secret', 'again', 'again'], Empty: [] })
if (!('ok' in headers) || 'Authorization' in headers.ok || headers.ok.X?.length !== 4)
  throw new Error('Expected safe headers with their original array shape')
const rawError = redact([true, null, new LosslessNumber('9007199254740993')], 'true', openRouterCredentialRedactionConfig)
if (!('ok' in rawError) || writeJsonLossless(rawError.ok) !== '["█",null,9007199254740993]')
  throw new Error('Expected redacted boolean and unchanged exact number')
```

静态配置非法时抛固定文字、无输入或 cause 的 `CredentialRedactionConfigurationError`。凭据或数据准入非法返回 invalidInput，不调用 getter 或 toJSON。未预期内部处理缺陷抛固定文字、无输入的普通 Error，不伪报非法输入、不返回原文；这个异常表示缺陷，不是成功脱敏或新增领域失败。

通用构造接收最小长度 1～64、最多 128 个小写 ASCII HTTP-token 头名及最多 64 个有限描述，允许显式空名单。这不授予生产配置资格。已采用基线必须保留全部 11 项头与 3 个描述；生产加强配置可以增加项目或将阈值降低到 1～8，仍须单独核资源与误遮罩。大于 8 的值须另一个被接受的生产修订。未来装配 owner 负责核资格，并向两个消费者交入同一完整快照。

本构件处理 raw／error JSON。必需业务状态、身份和费用事实沿各自契约，不能把完整 ModelResponse 交给通用 mapper 改值。raw.body 字节／附件投影、transport/runtime policy 迁移、实际 send/read/头输出及完整 S20 验收尚待对应增量。现有 invoke/transport 回调保留原行为，直到明确的迁移完成。

设凭据长 k、输入长 n、最小片段 m、描述数 d；内核建立最多 k 个固定宽窗口及四个线性终点数组，每个位置最多比较 d 个长度不超过 64 的 literal。工作界为 O(km + n(m + 64d) + output)，以 Set 的精确字符串相等为判据，不以 hash 相同代相等；终点工作内存 O(n)，另有窗口／配置和输出数据。JSON 准入与投影使用迭代遍历，键碰撞后缀的工作包含所需输出键的大小。有限极端输入量测不证明无限输入或同进程沙箱，闭包也不承诺物理内存擦除。

## 从显式目录事实计算模型选择

`legalTargets(rows, allowed, projection, compatible)`、`displayList(rows, allowed, projection, compatible, selected, credentials)` 与 `effectiveModel(selected, lock, rows, allowed)` 是同步纯函数，落实 [RT5 S-10～S-12/S-60](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v5/contract.md#s-60-纯判定与可单取用构件)，复用目录公开的胜出规则。它们没有会话、授权、存储、Cordis 或 IO 端口。事实的当前性、完整性、合法取得及已经求得的会话之上层锁归调用方负责，函数不证明这些前提。

集合输入用无重复的只读数组表达，事实显式为 `{ known: value }` 或 `{ unknown: true }`。已知空投影合法；选中模型已知为 `null` 表示没有耐久初始选择，返回 `unavailable`。锁已知为 `null` 表示当前求值确认没有会话之上的锁，包括可选 model 项缺席；未知锁不能当作无锁。每行须为保留完整 adaptation 的 profile3，与 ref 匹配、同一格不重名，所有路由名共同属于同一组织／租户链。`compatible` 必须纯粹实现“投影 ⊆ 完整档案输入模态”，返回的 `ok` 或非空 `blocked` 集合会按该关系复核。这一显式调用方依赖不意味着已经实现或接入模态投影提供者。

下列教学数据无需凭据或服务即可验证三个操作。公开 import 所用的 runtime 与 model-profile-directory 须声明为直接依赖；它不是可发送的官方模型定义。

档案里的所有数字，包括深层适配配置与参数 extra，均在档案及胜出行判断之前复制。有限 JavaScript 数字和标准 `LosslessNumber` 保留边界上的精确值与数字拼写；普通子类继承可信公开 source getter 时同样支持。外来的 source accessor 或数据覆盖会返回 `invalidInput`，不调用它。数值捕获直接把可信 getter 应用于有真实私有品牌的接收者，再构造自有标准数字，调用者原型上的 Proxy `get` 不能替换数值。输入 getter 与 `toJSON` 均不调用。意外捕获缺陷抛固定普通错误 `model selection JSON capture failed`，不保留原异常或 cause。

```ts
import {
  legalTargets, displayList, effectiveModel, type SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'

const rows: readonly ProfileRow[] = [{
  ref: { origin: 'official', routeName: 'teaching/model' },
  profile: {
    routeName: 'teaching/model', origin: 'official', registration: 'listed',
    adaptation: {
      implementation: { name: 'teaching', revision: 'one' },
      definition: { modelId: 'teaching/model', revision: 'one' },
      configuration: { revision: 'one', values: {} },
    },
    providers: ['teaching-provider'], allowFallback: false,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 100, maxOutputTokens: 10, inputConstraints: {},
    updatedAt: '2026-09-27T00:00:00Z',
  },
}]
const compatible: SelectionCompatibility = (profile, projection) => {
  const blocked = projection.filter(modality => !profile.inputModalities.includes(modality))
  return blocked.length === 0 ? { ok: true } : { blocked }
}
const allowed = { known: ['teaching/model'] }
const projection = { known: [] }
const selected = { known: 'teaching/model' }
const legal = legalTargets({ known: rows }, allowed, projection, compatible)
if (!('ok' in legal) || legal.ok[0] !== 'teaching/model') throw new Error('Expected a legal target')
const list = displayList({ known: rows }, allowed, projection, compatible, selected, {
  known: [{ ref: { origin: 'official', routeName: 'teaching/model' }, present: { known: false } }],
})
if (!('ok' in list) || !list.ok[0]?.selected ||
  !list.ok[0].annotations.includes('credential_missing')) throw new Error('Expected missing-credential annotation')
const effective = effectiveModel(selected, { known: 'teaching/model' }, { known: rows }, allowed)
if (!('ok' in effective) || effective.ok.selectedBy !== 'layer_lock')
  throw new Error('An equal-name lock keeps its source')
console.log(legal.ok[0], list.ok[0].annotations, effective.ok.selectedBy)
```

合法目标不因凭据缺失或据点传输能力而过滤。租户行撤回后在册的更一般行可以胜出；胜出行缺凭据或模态不符时不回退。没有胜出行时，落点先取最具体在册行，再取已撤回行。展示列表为合法名字加选中名字，每条附自有不可变 ref 与注记；被覆盖行只作注记，不能另选。没有胜出行只标恰一个 `withdrawn` 或 `scope_disallowed`，不问该行的凭据或模态。

成功为 `{ ok: value }`；非法或缺必需数据返回 `{ invalidInput: { reason } }`，必需事实明确未知或兼容回调意外抛错返回 `{ unavailable: true }`，不交出原异常或部分集合。选中／有效名字在链上查无行时返回 `{ profileNotFound: true }`。凭据有无按完整胜出 ref 与来源匹配：缺必需事实是 malformed，显式未知有无是 unavailable。结果自持且深度不可变；借用回调寿命仍归调用者。完整十三操作耐久服务与持久投影缓存尚待交付；当前读取的限定消费者见下文「会话模型的耐久选择」。

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

## 当前模型日志 codec

包根只导出当前 codec，接收 MS6 记录与消息、MR7 响应。载荷与业务键格式为 `mrr/3`，保留有序字符串数组 `raw.headers`、精确数字以及缺席与空值的区别。旧 `mrr/1`、`mrr/2` 被识别为未知格式并拒绝；没有旧版运行 codec 导出或兼容读取器。

下面的独立示例构造完整 persisted `[M,R]` 批或一条非持久回复响应。传入完整实际响应与合法消息前缀；示例不执行 IO，也不授予日志权限。将导入的包声明为直接依赖。

```ts
import {
  captureModelLogValue, prepareModelLogEntry, inspectSettlementMembers,
  type InspectSettlementMembersInput,
} from '@omne-harness-lite/model-request-runtime'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { LogPrefixView } from '@omne-harness-lite/messages'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'

export function prepareReplyBatch(
  session: string, tenant: TenantId, responseValue: unknown, messagePrefix: LogPrefixView,
): readonly OwnedLogEntry[] {
  const response = captureModelLogValue({ category: 'response', input: { kind: 'value', value: responseValue } })
  if (!('ok' in response)) throw new Error(response.reason)
  const r = prepareModelLogEntry({ session, shell: { tenant }, captured: response.ok,
    purpose: { kind: 'response' }, messagePrefix })
  if (!('ok' in r)) throw new Error(r.reason)
  if (response.ok.response?.replyDisposition !== 'persisted') return [r.ok]
  const message = captureModelLogValue({ category: 'message',
    input: { kind: 'value', value: response.ok.response.reply } })
  if (!('ok' in message)) throw new Error(message.reason)
  const m = prepareModelLogEntry({ session, shell: { tenant }, captured: message.ok,
    purpose: { kind: 'persistedMessage', response: response.ok }, messagePrefix })
  if (!('ok' in m)) throw new Error(m.reason)
  return [m.ok, r.ok]
}

export function inspectReplyBatch(input: InspectSettlementMembersInput) {
  return inspectSettlementMembers(input)
}
```

通过实际 SL3 提供者**一次追加整个返回数组**。当前检查器保留原载荷值与位置，但不认证物理同批、合法读取或旧写方实际停止。历史值若要成为新的写入候选，须在当前 codec 重新捕获。当前表示依据 [RT7](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v7/contract.md) 与 [v8 codec 投影](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v8-current-codec-design.md)。

## 单次响应头交接

`SendResult` 仅 response／failed／aborted 分支可带 `rawHeaders`，rejected 分支不带；`TransportFailure.headers` 和 `StreamEnd` 的第二头口不存在。sender 必须已按同一显式政策处理并持有自有不可变 MR7 头 map。invoke 立即保留这一原值，有序数组重复／空值、缺席与空 map 在四种收场、内容门取消中均不丢失，不再运行第二次头脱敏。非法或可变头表示是整份端口违约，请求实际 reader 停止；独立 HTTP 失败事实仍保留。

上游错误与本地文本经绑定的共享 JSON／text 政策处理，raw/error 的 key 与所有 scalar 都覆盖；独立协议状态和真实 usage/cost 即使字面值与凭据巧合仍保真。处理拒绝或 defect 时省略不安全载荷，交固定阶段诊断，已持有 H 保留。发送前 bind defect 以受控阶段异常拒绝 outcome，不造发出结果；诊断 sink 失败不改变业务。

业务 reply／工具片段保持原装配语义。本实现不关闭内容回显政策、raw.body 附件、完整 S20、生产 TLS 组合或耐久服务。精确采用范围见 [D095](../../../.meta_harness/design/record/decisions/model-credential-path-adoption/decision.md)。

## 耐久结算构件

`readSettlementPrefix`、`interpretSettlementPrefix` 和 `createSettlementCoordinator` 是可独立取用的构件，消费实际 SL3 日志和包根 `mrr/3` 表示。首个交付路径为 noRun：一次 unfenced、unconditional 追加完整 `[消息,响应]` 或 `[响应]` 批。合法原批优先，保留其身份、格式和原账；协调器不会规划或发出模型请求。

由宿主提供实际 session/tenant/log 代际绑定与已登记 owner。`SettlementRegistration.start` 必须先登记、再执行；`stopped` 表示资源实际停止。owner 负责同一所有者的并发准入，并提供实际 opened 回执及全部尚未确认的旧写方。这些接口形状不授予权限或认证历史物理同批。具名争用预算和精确单调调度器须显式提供，不安装默认次数、计时器或等待政策。

```typescript
import {
  createSettlementCoordinator,
  type SettlementCoordinatorInput,
  type SettlementRequest,
} from '@omne-harness-lite/model-request-runtime'

export async function settleResponse(
  dependencies: SettlementCoordinatorInput,
  request: SettlementRequest,
) {
  const coordinator = createSettlementCoordinator(dependencies)
  try {
    const task = coordinator.settle(request)
    const result = await task.completion
    await task.stopped
    return result
  } finally {
    await coordinator.close()
  }
}
```

`completion` 返回结算结果或不可用原因；`requestStop` 只请求取消，`stopped` 和 `close()` 等实际任务停止后才释放额度。旧任务仍在途时可认回已提交原批，但仍保留旧任务的真实 owner；unknown 后的一次缺席读取不允许重交。opened unknown 阻断普通响应。恢复后的缺席只能由原宿主在既有 S-33 时机、全部旧写方停止之后建立，本构件没有新增在线恢复 API。

示例接收实际宿主依赖与完整 MR7 响应，不注册服务。十三操作统一组合、官方模型认证、生产 withRun 认法 G28、合法读权接线及全部写方来源仍待交付。采用依据：[D087/v4 投影](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v4-design.md)、[v8 当前 codec](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v8-current-codec-design.md)。

## 耐久 noRun 调用

`createAnchoredModelInvocation` 将独立 `invokeModel`、真实 SessionLog 绑定与共同结算协调器
直接组合。当前交付范围是单次 noRun 发出，工具列表可包含已解析的模型面工具定义。宿主提供固定的调用、响应与
消息身份、完整档案绑定和选中来源、实际凭据范围与值、策略、传输、owner 和日志代际。
本函数校验这些值；形状不证明授权或凭据来源。一次调用借用精确传输引用，当前交付没有
实现传输热替换。

原传输只规划一次。dispatched 确认先于 HTTP，opened 确认先于任何可见内容。完整 MR7
响应使用原 opened 时刻、实际用量与费用、上游事实和同次调用已交接的安全响应头。
成功或截断回复先交给调用者承担完整的 `PendingModelResponse`，尚无处置或晚到标记；底层 `settleReply('persisted')` 通过同一协调器一次追加
`[AssistantMessage, ModelResponse]`；明确的 vetoed/consumed 处置只追加响应。
确定的失败和系统中断在 outcome 返回前结算；系统中断没有回复，已交付内容保留在 delivered。

`abort()` 请求系统停止。用户中断需要另有耐久意图协议，不在本切片范围内。`close()`
关闭准入、请求停止，并等待调用、门回调、追加与结算的实际任务停止。只有已确认结算
或从未发出才调用 `releaseBorrowed`。未知锚点或未知结算返回 unavailable，保留句柄、
候选和借用引用，由真实宿主承担恢复责任。本函数不执行 S-33 恢复、不重发，也不把
未知回执解释成确定缺席。

完成实际宿主准备后，把输入和明确的回复处置传给下例。close 为 unavailable 时，保留返回的 call 和实际宿主 owner。完整十三操作服务、Run 集成与生产模型认证仍待交付。

```ts
import {
  createAnchoredModelInvocation,
  type AnchoredInvocationInput,
  type PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'

/** Supply actual host preparation and an explicit caller disposition. */
export async function runPreparedInvocation<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
  disposition: ReplyDisposition,
) {
  const call = createAnchoredModelInvocation(input)
  const outcome = await call.outcome
  const settlement = 'replyPending' in outcome ? await call.settleReply(disposition) : null
  const close = await call.close()
  // Retain call and its host owner when close is unavailable; neither abort nor outcome proves release.
  return { call, outcome, settlement, close }
}
```

### 会话模型的耐久选择

`createSessionModelSelection` 从真实会话日志的完整前缀、当前目录行和当前求值输入提供者读取事实。`selectModel` 是交付面的显式命令：先核合法，再核重复，选中名字变化时追加一条共享 codec 记录。没有模型切换记录的会话仍不可得；目录次序和根设置都不会自动制造初选。

`effectiveModel` 返回既有选择 basis 与实际当前 `EffectiveAssembly`，包含根设置。会话层之上的模型锁得到 `layer_lock`，即使锁定名字与选中名字相同。当前读失败不能变成已知无锁。

`legalTargets` 和 `selectModel` 每次都独立读取当前 EvaluationInput，并调用采用的 AE4 evaluator 后再计算合法目标。根可选 `model` 缺席仍合法；模型锁不筛选合法目标集合。`displayList()` 读取本次合法目标和权威最后选中，再按每条展示胜出行的来源调用目录 `credentialPresent(tenant, origin)`，返回每个路由一条的当前来源、被覆盖行、注记和选中标记。选中名字全被撤回时仍展示；目录没有该选中名字的任何一行时返回 `profileNotFound`；输入读不到返回 `unavailable`。presence 读不暴露凭据本体或引用，也不保证后续取值成功。兑现范围为 [RT5 S9–S14/S24–S27/S66](../../../.meta_harness/design/spec/capabilities/model-request-runtime/v5/contract.md#s-24-legaltargets)，沿采用的 [R3-P2 投影](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v3-design.md#契约到-cordis-的投影)。

```ts
import {
  createSessionModelSelection,
  type SessionModelSelectionInput,
} from '@omne-harness-lite/model-request-runtime'

// ports come from the authenticated host's actual scoped providers.
export async function initializeExplicitSelection(
  ports: SessionModelSelectionInput,
  requestedRoute: string,
) {
  const selection = createSessionModelSelection(ports)
  const legal = await selection.legalTargets()
  if (!('ok' in legal)) return { selection, legal }
  const selected = await selection.selectModel(requestedRoute)
  if (!('selected' in selected)) return { selection, selected }
  const display = await selection.displayList()
  const basis = await selection.effectiveModel()
  return { selection, selected, display, basis }
}
```

保留返回组件，直到它借用的提供者生命周期结束。关闭提供者前先等待 `selection.close()`；若得到 `{ unavailable: true }`，说明原未知写入或清理责任尚保留，应继续持有依赖，不能当作已经释放。每项操作在调用提供者前登记工作，实际停止之后才解除登记。宿主负责真实身份授权、同范围提供者、真正由完整前缀所得的模态投影，以及显式并发上限；类型形状和回调不认证生产来源。本组件不登记完整十三操作服务、不拥有提供者，也不发送模型 HTTP。

## 默认重试的有限决策

`decideRetry` 消费完整 LC4 失败主体和显式退避输入，返回 LC4 的 `retry`／`observed` 或拒绝值。它不等待、不发送；实际再发仍须经过 `dispatchGuard` 和耐久调用服务。下面的政策值由调用者明确选择，不是 runtime 默认值。

```ts
import { decideRetry } from '@omne-harness-lite/model-request-runtime'
import type { AfterModelCallFailureSubject } from '@omne-harness-lite/loop-extension'

export function chooseRetry(subject: AfterModelCallFailureSubject) {
  return decideRetry({
    subject: { known: subject },
    policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT10S', jitter: 'none' },
    uniformSample: 0,
  })
}
```

不允许回退且同一家已有多次发出时，当前失败主体无法区分运行时失联后的续接与已用掉的一次重试。因此本实现返回 `unavailable`，不猜测是否试尽；完整 P-5 接线仍待完成。


## 在耐久调用中携带工具

通过 `planInput.tools` 传入已解析的 `ModelToolEntry`。`modelEntry` 把已校验的工具定义转换为模型面形状；使用下面示例的消费者应直接依赖 tool-definition 包。

```ts
import {
  createAnchoredModelInvocation,
  type AnchoredInvocationInput,
  type PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import { modelEntry, type ToolDefinition } from '@omne-harness-lite/tool-definition'

export function invokeWithTools<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
  definitions: readonly ToolDefinition[],
) {
  return createAnchoredModelInvocation({
    ...input,
    planInput: { ...input.planInput, tools: definitions.map(modelEntry) },
  })
}
```

runtime 负责发送定义并装配流式工具调用；调用者负责在后续历史中提供各调用对应的工具结果。该函数不执行工具，也不自动回填结果。非法定义、重名或孤儿调用在新的 dispatched 锚点和 HTTP 请求之前拒绝。内部服务组合构件已能按捕获的会话或 Run 报告范围解析名字；这不是公开的工具执行 API。交互 demo 仍传空工具列表。
