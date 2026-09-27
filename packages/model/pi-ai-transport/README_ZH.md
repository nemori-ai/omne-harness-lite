# @omne-harness-lite/pi-ai-transport

[English](README.md)

规划一次 OpenRouter 请求，通过 HTTPS 发送，再把 SSE 转为公开到达事件。本包是实验性 ESM workspace 成员，使用 pi 0.86.1 定向 fork，尚未发布到 npm。

调用者必须显式提供完整模型定义，没有默认模型。`officialModelIds` 是冻结的 37 个已确认**目标身份**，不是可注册定义或已认证提供清单。官方完整能力、路由配置事实及真实认证尚待闭合，不补造未知值。状态见[实现映射](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md)。

## 公开接口

| 导出 | 用途 |
| --- | --- |
| `ModelDefinition`、`ModelRoute`、`ParameterRule`、`ParameterRules` | 完整能力及逐路由提醒、八项参数规则、已认得的私有键和缓存允许值 |
| `readModelDefinition(definitions, coordinates)` | 精确版本的不可变观察，不取得使用权 |
| `configurationSchema(definition, provider)` | 路由数据生成的闭合 Draft 2020-12 Schema，没有默认值 |
| `interpretConfiguration(definition, values, provider)` | 从同一路由声明严格、无损解释配置 |
| `createOfficialProfileContent(definition, options)` | 构造并判定 core 内容，不写目录、不登记、不生成时间 |
| `planRequest(input, definitions)` | 纯不可变规划，含实际参数、调整和丢项原键 |
| `createPiAiTransport(options)` | 显式定义与自持连接池的 plan/send/read/close、诊断计数 |
| `sendRequest`、`readStream` | 借用明确网络资源的独立函数 |
| `createModelTransportService`、`AdaptationLease`、`RetirementPolicy` | 进程内精确登记、固定引用和显式排空 |
| `parseSSE`、`canonicalInteger`、`generatedCallId` | 分帧与精确确定性标识辅助 |
| `officialModelIds`、`OPENROUTER_BASE_URL`、`PI_AI_CARRIABLE_MODALITIES` | 目标身份、产品端点与当前可承载的 text/image 输入 |

纯读取返回 `{ ok }`、invalidInput 或 unavailable。内容构造器保留 core 表示拒绝原名（如 parameter_out_of_range、max_output_exceeds_profile）；定义/路由/配置一致性失败仍为提供者 invalidInput。陌生精确版本/路由不可用，非法定义/配置为输入错误。失败只给有限拒绝类别，不输出配置正文。根入口不加载 Cordis；`./plugin` 显式依赖 Cordis 4.0.4。

## 显式声明教学定义

保存为 `example-definition.ts`，后面的例子引用这些值。能力和参数事实都是用于本地受控测试的合成教学值，不描述官方模型，禁止发布或用于真实路由。生产定义需要已核实事实与明确采用的配置来源。

```ts
import type { ModelDefinition, RetirementPolicy, TransportPolicy } from '@omne-harness-lite/pi-ai-transport'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'

// Synthetic teaching data for controlled tests only. Never publish or call this as a live model.
export const definition: ModelDefinition = {
  modelId: 'example/controlled-text', revision: 'example-1',
  implementation: { name: 'example:openrouter-text', revision: '7' },
  capabilities: {
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 1024, maxOutputTokens: 128, inputConstraints: {},
  },
  routes: { 'example-provider': {
    reminderRole: 'developer',
    parameters: {
      reasoningEffort: { kind: 'pass' }, temperature: { kind: 'pass' },
      topP: { kind: 'pass' }, seed: { kind: 'pass' }, maxOutputTokens: { kind: 'pass' },
      stopSequences: { kind: 'pass' }, frequencyPenalty: { kind: 'pass' },
      presencePenalty: { kind: 'pass' },
    },
    extra: { example_flag: { kind: 'pass' } }, cache: { mode: 'automatic' },
  } },
}
export const definitions: readonly ModelDefinition[] = [definition]
const reminder = judgeMessage({
  id: 'reminder-example', type: 'system_reminder', nature: 'event',
  source: { kind: 'extension', extension: 'example:reminder' },
  createdAt: '2026-09-27T00:00:00Z',
  blocks: [{ id: 'text-example', kind: 'text', text: 'Continue the task.',
    visibility: { toHuman: true, toModel: true } }],
})
if ('rejected' in reminder) throw new Error(reminder.rejected)
export const request: PlanInput = {
  target: { kind: 'model_call', callId: unwrap(parseOpaqueIdentifier('call-example', 'ModelCallId')), dispatch: 1 },
  routeName: definition.modelId, provider: 'example-provider', messages: [reminder.ok], tools: [],
  parameters: { maxOutputTokens: 64 },
  snapshot: {
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: { revision: 'example-automatic-1', values: { cache: { mode: 'automatic' } } },
    },
    providers: ['example-provider'], allowFallback: false,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 1024, maxOutputTokens: 128, updatedAt: '2026-09-27T00:00:00Z',
  },
}
export const networkPolicy: TransportPolicy = {
  maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
}
export const retirement: RetirementPolicy = {
  waitMilliseconds: 1000, force: false,
  schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
}
```

## 只规划提醒不发送请求

四个纯公开面与规划不依赖 runtime、目录、租户或连接池。

```ts
import {
  readModelDefinition, configurationSchema, interpretConfiguration,
  createOfficialProfileContent, planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { definition, definitions, request } from './example-definition.js'

const binding = request.snapshot.adaptation
console.log(readModelDefinition(definitions, { implementation: binding.implementation, definition: binding.definition }))
console.log(configurationSchema(definition, request.provider))
console.log(interpretConfiguration(definition, binding.configuration.values, request.provider))
const content = createOfficialProfileContent(definition, {
  providers: request.snapshot.providers, allowFallback: false, configuration: binding.configuration,
})
if ('rejected' in content) throw new Error(content.rejected)
// This is a construction example only; it does not publish the synthetic content.
const result = planRequest(request, definitions)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // developer; no HTTP request
```

提醒角色由精确路由声明决定，不按模型名前缀猜策略。OpenAI 路由使用 developer，其他路由使用已核实的合适专用角色或 user。保留提醒身份/次序与单独的 compaction 映射。

pass 保持原值，drop 记录项名，select 接受明确值集合或数值区间，否则按声明丢弃或调整。缺席不补值；小数和整数比较不经 Number 舍入。当前 G-22 下 maxOutputTokens 只可 pass，档案/请求表示上限照常校验。陌生或受保护私有键按**原键**丢弃留痕，键名原本以 extra. 开头也不剥前缀；实际 extra 为空时省略。

自动缓存配置恰为 `{ cache: { mode: 'automatic' } }`，不发送手工控制。显式路由声明 ttlValues 与完整 breakpointLayouts；配置必须给 mode、TTL 和一个已列完整布局。共享代码不写死 TTL、默认值或布局组合。Schema 和解释器同源；规划控制不代表上游采纳、命中或到期行为。

## 持有传输资源

```ts
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import { definitions, request, networkPolicy } from './example-definition.js'

const transport = createPiAiTransport({ definitions, policy: networkPolicy })
try {
  const result = transport.plan(request)
  if ('rejected' in result) throw new Error(result.rejected)
  console.log(result.planned.parameters)
  // To send: supply a real complete definition, owned credential and AbortSignal,
  // then use send/read or invokeModel from the companion package.
} finally { await transport.close() }
```

definitions 必填，缺席、undefined、非数组或不完整定义在建立连接池前同步抛 TypeError；纯 planRequest 对应报 invalidInput。明确 definitions: [] 合法，静态合法请求规划均 unavailable；动态服务内部用它建立空网络 owner，不授予通用发送权。宿主签发的计划不能交另一个宿主，send 只消费固定字节，不读最新定义或重新解释配置。

独立消费者显式给凭据/取消，持有资源到执行停止，并以原计划只读一次响应。没有环境凭据回退、隐藏重试、供应商回退或重定向。装配、首内容门与时限使用配套 invokeModel。测试可显式给 HTTPS baseUrl 与 CA，产品模型路由仍是 OpenRouter。

凭据脱敏覆盖解码后的错误键/值、首部键/值、实报模型/供应商/请求 ID 与结束原因。转义不能绕过；非 ASCII 替换不会重造合法 ASCII 凭据或保护片段；键碰撞保留普通成员与精确数字。直接 send/read 隔离抛错、拒绝或未决诊断，借用 sink 健康由调用者负责。factory 的 failed/pending/dropped 计数不改业务结果。

四项基础 token 都未知时 source 为 none，省略 reasoning_tokens；任一有效基础计数（含零）则 source 为 upstream，费用独立保留。推理 opaque 元数据与供应商变化保留 revision 6 行为。本完整定义公共实现为 revision 7，旧证据不自动认证它；definition/configuration 修订归实际事实与配置来源拥有者。

## 登记、取得与撤除精确版本

```ts
import { createModelTransportService } from '@omne-harness-lite/pi-ai-transport'
import { definition, request, networkPolicy, retirement } from './example-definition.js'

const service = createModelTransportService({ policy: networkPolicy })
const registered = service.registerAdaptation(definition, {}, () => {})
if ('rejected' in registered) throw new Error(registered.rejected)
const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
if ('rejected' in acquired) throw new Error(acquired.rejected)
const lease = acquired.lease
try {
  const result = lease.transport.plan(request)
  if ('rejected' in result) throw new Error(result.rejected)
  console.log(result.planned.parameters)
} finally { lease.release() }
console.log(await service.retire(registered.registered, retirement))
console.log(await service.close(retirement)) // no HTTP request
```

注册递归拥有并校验完整声明。同键不同能力、规则、角色、TTL 或布局均拒绝，撤除后也不改同修订含义。读得到不等于可取得；acquire 验路由联集，plan 验本次明确供应商。lease 固定完整配置值，不只固定修订名。

调用用 lease.transport，执行用 lease.track(handle.outcome)。独立内容门、回调、结算和交接先登记再释放。release 幂等，停本持有者新工作，已登记工作继续持有资源。撤单项贡献停新 acquire，旧引用仍可使用；关整个服务立即停旧 lease 新发送及排队准入。force false 时已发送工作可自然结束；强制取消本身不是释放证明。remaining_active 保留可见所有权，service.closed 在实际流/回调排空及池关闭后才完成。注册不持久化、不发布目录档案、不授权租户。

## 使用可信 Cordis 贡献

```ts
import { Context } from '@deepseek-ai/cordis'
import { piAiTransportPlugin, createModelPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'
import { definition, networkPolicy, retirement } from './example-definition.js'

const ctx = new Context()
const stable = ctx.plugin(piAiTransportPlugin, { retirement, policy: networkPolicy })
await stable
const contribution = ctx.plugin(createModelPlugin(definition, retirement), {})
await contribution
await contribution.dispose()
await stable.dispose() // no acquired lease and no HTTP request
```

稳定插件提供 modelTransport，起步没有隐式贡献；可信模型插件登记完整声明、共享池。非法配置不发布；缺必需服务时贡献待定。租户配置只是声明式数据，不可执行插件代码。

先登记新版，再由目录明确采用，最后撤旧，三个动作分开。包代际迁移时保留旧宿主 A 的原代码/数据至实际流与回调排空；新宿主 B 不接管 A 计划/lease，也不以 latest 重建缺失旧绑定。没有独立并存宿主所有权时，先排空 A 再启动 B，不承诺无中断。

## 开发与验证

```sh
pnpm --filter @omne-harness-lite/pi-ai-transport... run build
pnpm --filter @omne-harness-lite/pi-ai-transport run typecheck
pnpm --filter @omne-harness-lite/pi-ai-transport run test
```

测试使用完整非官方 fixture、真实临时 HTTPS、公开 core 判定/装配器、独立 Schema validator 和真实 Cordis 生命周期。它们不认证 37 个真实模型、工具/replay/模态、TTL 到期、耐久恢复或完整观测链。fork 来源：[UPSTREAM.md](UPSTREAM.md)、[provenance.json](provenance.json)、[LICENSE.pi](LICENSE.pi)。
