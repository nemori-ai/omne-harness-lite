# @omne-harness-lite/pi-ai-transport

[English](README.md)

规划一次 OpenRouter 请求，通过 HTTPS 发送，再把 SSE 转为公开到达事件。本包是实验性 ESM workspace 成员，使用 pi 0.86.1 定向 fork，尚未发布到 npm。

调用者必须显式提供完整模型定义，没有默认模型。`officialModelIds` 是冻结的 37 个已确认**目标身份**，不是可注册定义或已认证提供清单。官方完整能力、路由配置事实及真实认证尚待闭合，不补造未知值。状态见[实现映射](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md)。

## 公开接口

| 导出                                                                    | 用途                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ModelDefinition`、`ModelRoute`、`ParameterRule`、`ParameterRules`      | 完整能力及逐路由提醒、八项参数规则、已认得的私有键和缓存允许值 |
| `readModelDefinition(definitions, coordinates)`                         | 精确版本的不可变观察，不取得使用权                             |
| `configurationSchema(definition, provider)`                             | 路由数据生成的闭合 Draft 2020-12 Schema，没有默认值            |
| `interpretConfiguration(definition, values, provider)`                  | 从同一路由声明严格、无损解释配置                               |
| `createOfficialProfileContent(definition, options)`                     | 构造并判定 core 内容，不写目录、不登记、不生成时间             |
| `planRequest(input, definitions)`                                       | 纯不可变规划，含实际参数、调整和丢项原键                       |
| `createPiAiTransport(options)`                                          | 显式定义与自持连接池的 plan/send/read/close、诊断计数          |
| `sendRequest`、`readStream`                                             | 借用明确网络资源的独立函数                                     |
| `createModelTransportService`、`AdaptationLease`、`RetirementPolicy`    | 进程内精确登记、固定引用和显式排空                             |
| `parseSSE`、`canonicalInteger`、`generatedCallId`                       | 分帧与精确确定性标识辅助                                       |
| `officialModelIds`、`OPENROUTER_BASE_URL`、`PI_AI_CARRIABLE_MODALITIES` | 目标身份、产品端点与当前可承载的 text/image 输入               |

纯读取返回 `{ ok }`、invalidInput 或 unavailable。内容构造器保留 core 表示拒绝原名（如 parameter_out_of_range、max_output_exceeds_profile）；定义/路由/配置一致性失败仍为提供者 invalidInput。陌生精确版本/路由不可用，非法定义/配置为输入错误。失败只给有限拒绝类别，不输出配置正文。根入口不加载 Cordis；`./plugin` 显式依赖 Cordis 4.0.4。

## 显式声明教学定义

保存为 `example-definition.ts`，后面的例子引用这些值。能力和参数事实都是用于本地受控测试的合成教学值，不描述官方模型，禁止发布或用于真实路由。生产定义需要已核实事实与明确采用的配置来源。

```ts
import type {
  ModelDefinition,
  RetirementPolicy,
  TransportPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import { openRouterCredentialRedactionConfig, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'

// Synthetic teaching data for controlled tests only. Never publish or call this as a live model.
export const definition: ModelDefinition = {
  modelId: 'example/controlled-text',
  revision: 'example-1',
  implementation: { name: 'example:openrouter-text', revision: '7' },
  capabilities: {
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1024,
    maxOutputTokens: 128,
    inputConstraints: {},
  },
  routes: {
    'example-provider': {
      reminderRole: 'developer',
      parameters: {
        reasoningEffort: { kind: 'pass' },
        temperature: { kind: 'pass' },
        topP: { kind: 'pass' },
        seed: { kind: 'pass' },
        maxOutputTokens: { kind: 'pass' },
        stopSequences: { kind: 'pass' },
        frequencyPenalty: { kind: 'pass' },
        presencePenalty: { kind: 'pass' },
      },
      extra: { example_flag: { kind: 'pass' } },
      cache: { mode: 'automatic' },
    },
  },
}
export const definitions: readonly ModelDefinition[] = [definition]
const reminder = judgeMessage({
  id: 'reminder-example',
  type: 'system_reminder',
  nature: 'event',
  source: { kind: 'extension', extension: 'example:reminder' },
  createdAt: '2026-09-27T00:00:00Z',
  blocks: [
    {
      id: 'text-example',
      kind: 'text',
      text: 'Continue the task.',
      visibility: { toHuman: true, toModel: true },
    },
  ],
})
if ('rejected' in reminder) throw new Error(reminder.rejected)
export const request: PlanInput = {
  target: {
    kind: 'model_call',
    callId: unwrap(parseOpaqueIdentifier('call-example', 'ModelCallId')),
    dispatch: 1,
  },
  routeName: definition.modelId,
  provider: 'example-provider',
  messages: [reminder.ok],
  tools: [],
  parameters: { maxOutputTokens: 64 },
  snapshot: {
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: { revision: 'example-automatic-1', values: { cache: { mode: 'automatic' } } },
    },
    providers: ['example-provider'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1024,
    maxOutputTokens: 128,
    updatedAt: '2026-09-27T00:00:00Z',
  },
}
export const networkPolicy: TransportPolicy = {
  maxConnections: 4,
  idleConnectionTimeoutMs: 30000,
  connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536,
  maxSseEventBytes: 8388608,
  credentialRedaction: openRouterCredentialRedactionConfig,
}
export const retirement: RetirementPolicy = {
  waitMilliseconds: 1000,
  force: false,
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
```

## 只规划提醒不发送请求

四个纯公开面与规划不依赖 runtime、目录、租户或连接池。

```ts
import {
  readModelDefinition,
  configurationSchema,
  interpretConfiguration,
  createOfficialProfileContent,
  planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { definition, definitions, request } from './example-definition.js'

const binding = request.snapshot.adaptation
console.log(
  readModelDefinition(definitions, {
    implementation: binding.implementation,
    definition: binding.definition,
  }),
)
console.log(configurationSchema(definition, request.provider))
console.log(interpretConfiguration(definition, binding.configuration.values, request.provider))
const content = createOfficialProfileContent(definition, {
  providers: request.snapshot.providers,
  allowFallback: false,
  configuration: binding.configuration,
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
} finally {
  await transport.close()
}
```

definitions 必填，缺席、undefined、非数组或不完整定义在建立连接池前同步抛 TypeError；纯 planRequest 对应报 invalidInput。明确 definitions: [] 合法，静态合法请求规划均 unavailable；动态服务内部用它建立空网络 owner，不授予通用发送权。宿主签发的计划不能交另一个宿主，send 只消费固定字节，不读最新定义或重新解释配置。

独立消费者显式给凭据/取消，持有资源到执行停止，并以原计划只读一次响应。没有环境凭据回退、隐藏重试、供应商回退或重定向。装配、首内容门与时限使用配套 invokeModel。测试可显式给 HTTPS baseUrl 与 CA，产品模型路由仍是 OpenRouter。

成功的 `sendRequest` 返回冻结、无原型的不透明 `RawResponse` 句柄，公开成员仅有 `stop(): void` 和 `stopped: Promise<void>`。`stop()` 请求关闭网络，实际返回 `undefined`；请求/响应与拥有的回调任务实际停止、连接名额释放后，`stopped` 才结算。以原计划通过 `readStream(response, originalPlan, signal, deps)` 或所属传输的 `read` 仅读正文一次。原始 Node 流、状态、脱敏器和成功响应头均不能从句柄取得；同次 send 的 response、failed、aborted 分支可带自有不可变 `rawHeaders`；没有 `failed.headers` 或 reader 头出口。完整配置在排队/连接之前，通过 runtime 公开凭据策略校验、复制和绑定。头捕获先于错误体读取，后续正文/流处理失败保持已采头与真实状态事实。本实现消费 D095 凭据接线；回复文本和工具参数保持原值，完整 S-20 内容保护与真实模型认证仍待完成。

凭据脱敏覆盖解码后的错误键/值、首部键/值、实报模型/供应商/请求 ID 与结束原因。转义不能绕过；非 ASCII 替换不会重造合法 ASCII 凭据或保护片段；键碰撞保留普通成员；独立的 HTTP/带内状态及 usage/cost 保留精确值，raw/error 中匹配的数字、布尔和 null 则替换。直接 send/read 隔离抛错、拒绝或未决诊断，借用 sink 健康由调用者负责。factory 的 failed/pending/dropped 计数不改业务结果。

四项基础 token 都未知时 source 为 none，省略 reasoning_tokens；任一有效基础计数（含零）则 source 为 upstream，费用独立保留。推理 opaque 元数据与供应商变化保留 revision 6 行为。本完整定义公共实现为 revision 7，旧证据不自动认证它；definition/configuration 修订归实际事实与配置来源拥有者。


此路径采用 [D095](../../../.meta_harness/design/record/decisions/model-credential-path-adoption/decision.md) 与 [transport 凭据投影 revision 3](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v6-credential-path-design.md)。将下例保存为 `execute-once.ts`，传入拥有已核实完整定义的 transport。函数借用 transport，保留同次已处理 H 并在返回前停止响应；transport 拥有者在使用完毕后关闭它。

```ts
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { PiAiTransport } from '@omne-harness-lite/pi-ai-transport'

export async function executeOnce(
  transport: PiAiTransport,
  request: PlanInput,
  credential: string,
  signal: AbortSignal,
) {
  const plan = transport.plan(request)
  if ('rejected' in plan) return plan
  const sent = await transport.send(plan.planned, credential, signal)
  if (!('response' in sent)) return sent
  const reader = transport.read(sent.response, plan.planned, signal)
  const events: ArrivalEvent[] = []
  try {
    while (true) {
      const next = await reader.next()
      if (next.done)
        return { events, end: next.value, ...('rawHeaders' in sent ? { rawHeaders: sent.rawHeaders } : {}) }
      events.push(next.value)
    }
  } finally {
    try { await reader.return({ aborted: true }) }
    finally {
      sent.response.stop()
      await sent.response.stopped
    }
  }
}
```

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
} finally {
  lease.release()
}
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

### 显式的 DeepSeek Pro 定义

`deepseekV4Pro0813Definition` 提供固定模型 `deepseek/deepseek-v4-pro-0813`、固定路由 `deepinfra/fp8` 的一个窄定义。它复用 OpenRouter 公共规划器和 DeepSeek 家族规则，完整实现坐标为 `pi-ai:deepseek / d095-1`，定义修订为 `1`。导入不会注册模型、分配连接池或发送请求。

模型记载的能力是文本输入、文本输出。所选路由提供 1,048,576 token 共享窗口和 16,384 token 输出容量；1,032,192 token 输入预算预留了完整输出容量。这是换算的只计输入预算，不是路由 `max_prompt_tokens` 的原值，也不是极值请求实测。空输入限制对象只表示该纯文本声明没有活动的图片限制，不代表无限大小的图片输入。

系统提醒映射为带标识的 `user` 消息。自动前缀缓存采用下面的显式配置，不配置 TTL 或断点。该路由的历史请求曾在没有手工缓存控制时报告缓存读取 token；这不保证下一次命中，也不认证生产 runtime。

首修订主动只提供 `reasoningEffort: 'low'`、`seed: 0` 和 `stopSequences: ['END']`，其它值丢弃并记录项名。temperature、top-p 和两种 penalty 主动不提供，丢弃均留痕；不会把路由所报支持或原生条件行为改说成“不支持”。`maxOutputTokens` 通过档案通常的输出上限核对后原样发送，不根据动态元数据夹取。私有 `extra` 项的提供集合为空。

```ts
import {
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
  createOfficialProfileContent,
  configurationSchema,
} from '@omne-harness-lite/pi-ai-transport'

const content = createOfficialProfileContent(deepseekV4Pro0813Definition, {
  providers: ['deepinfra/fp8'],
  allowFallback: false,
  configuration: deepseekV4Pro0813Configuration,
})
if ('rejected' in content) throw new Error(content.rejected)
const schema = configurationSchema(deepseekV4Pro0813Definition, 'deepinfra/fp8')
if ('rejected' in schema) throw new Error(schema.rejected)
```

配置是明确选用的来源值（`revision: '1'`、`values: { cache: { mode: 'automatic' } }`），不会作为隐藏的传输默认值。静态传输需显式传入定义，动态使用经既有模型贡献插件登记；目录发布和租户准入分别归已有 owner。

本次只验证本地构造和纯规划。seed／stop 真正生效、完整参数调优与生产 public／service 认证仍待完成。首次端到端调用只使用已有观察的 `low` 与 `1024`。另一个固定 DeepSeek 模型需另行补齐事实与窄定义，不会自动发现或纳入模型。

### Moonshot 路由实现进展

Kimi K3 和 K2.7 Code 的内部路由规则复用公共规划器的带标识 user 提醒及自动缓存配置。K3 提供文档列出的 low/high/max 推理强度子集；K2.7 Code 丢弃显式 effort 请求并保留参数处置记录。不在当前供给子集中的采样控制同样在丢弃时留痕。

这些规则尚未作为公开模型定义或可选官方档案提供。图像大小政策、K3 视频传输及完整模型认证仍待完成。离线测试使用虚构容量，仅验证请求规划。在本包目录运行：

```sh
pnpm exec vitest run tests/official-moonshot-routes.spec.ts
```
