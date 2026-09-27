# @omne-harness-lite/pi-ai-transport

[English](README.md)

规划单次 OpenRouter 请求，经 HTTPS 发出，并把 SSE 响应译为公开到达事件。本包是实验性的 ESM workspace 成员，使用 pi 0.86.1 定向 fork，尚未发布到 npm。

缺省静态试运行定义只有 `openai/gpt-6-sol` 和 `anthropic/claude-sonnet-5`。另行导出的 `officialDefinitions` 包含确认的 37 个模型身份、提醒角色及路由/缓存规则，需要显式选择。存在定义或成功登记不代表模型、缓存已经认证。完整能力声明、目录发布及真实模型认证仍待完成。已接受范围和验证状态见[实现映射](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md)。

## 公开接口

| 导出 | 用途 |
| --- | --- |
| `planRequest` | 纯校验与不可变线上规划，返回拒绝及丢弃参数 |
| `sendRequest`、`readStream` | 接受显式网络资源、可分别复用的发送和读取函数 |
| `createPiAiTransport` | 持有连接池，提供 `plan`、`send`、`read`、`close` 和诊断计数 |
| `pilotDefinitions`、`officialDefinitions`、`ModelDefinition` | 显式静态模型/实现修订及供应商路由策略 |
| `createModelTransportService` | 持有共享池及进程内适配注册表 |
| `AdaptationLease`、`RetirementPolicy` | 固定绑定、执行保留及显式撤除调度 |
| `parseSSE`、`canonicalInteger`、`generatedCallId` | 严格分帧与精确、确定性的调用身份辅助函数 |
| `OPENROUTER_BASE_URL`、`PI_AI_CARRIABLE_MODALITIES` | 缺省端点和可承载输入模态 |

## 只规划提醒，不发送请求

```ts
import { planRequest, pilotDefinitions } from '@omne-harness-lite/pi-ai-transport'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'

const definition = pilotDefinitions.find(d => d.modelId === 'openai/gpt-6-sol')
if (!definition) throw new Error('Definition not installed')
const reminder = judgeMessage({
  id: 'reminder-example', type: 'system_reminder', nature: 'event',
  source: { kind: 'extension', extension: 'example:reminder' },
  createdAt: '2026-09-27T00:00:00Z',
  blocks: [{ id: 'text-example', kind: 'text', text: 'Continue the task.',
    visibility: { toHuman: true, toModel: true } }],
})
if ('rejected' in reminder) throw new Error(reminder.rejected)
const input: PlanInput = {
  target: { kind: 'model_call', callId: unwrap(parseOpaqueIdentifier('call-example', 'ModelCallId')), dispatch: 1 },
  routeName: definition.modelId, provider: 'openai', messages: [reminder.ok], tools: [],
  parameters: { maxOutputTokens: 128 },
  snapshot: {
    adaptation: {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
      configuration: { revision: 'example-automatic-1', values: { cache: { mode: 'automatic' } } },
    },
    providers: ['openai'], allowFallback: false,
    inputModalities: ['text'], outputModalities: ['text'],
    maxInputTokens: 128000, maxOutputTokens: 4096, updatedAt: '2026-09-27T00:00:00Z',
  },
}
const result = planRequest(input)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // role: developer; no network operation
```

精确修订或路由未知时返回 unavailable；无法解释的配置返回 invalidInput。自动缓存不发显式控制。Anthropic 试运行定义要求 `configuration.values.cache = { mode: 'explicit', ttl: '5m' | '1h', breakpoints: [...] }`，断点名支持 `system`、`last_tool`、`last_message`。TTL 必须显式传入。缓存命中只取上游 usage，规划不能证明命中。

## 持有传输资源

```ts
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'

const transport = createPiAiTransport({
  policy: {
    maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
    maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
  },
  onDiagnostic: event => { console.log(event.kind) },
})
// transport.plan(input), then transport.send(planned, credential, signal),
// then transport.read(response, planned, signal), or use invokeModel.
await transport.close()
```

调用配套 runtime 包的 `invokeModel` 可使用流装配、首内容门、时限和最终结果。独立调用者明确传入凭据与取消信号，持有资源直到实际停止。没有环境凭据查找、重试、供应商回退或重定向。每个响应只用原计划读取一次。工具参数片段与精确数字保留原文；传输不解析工具参数 JSON，也不生成宿主的 finish 事件。

公开测试调用者可传入显式 HTTPS `baseUrl` 与 CA；产品端点为 OpenRouter。这些选项不构成其他生产提供者的支持承诺。

直接 send/read 的表示错误返回 `{ rejected: "invalidInput" }`，已关闭传输返回 `unavailable`。竞争读取同一响应会被拒绝，不启动第二次读取。

HTTP 失败保留脱敏后的实际响应头，重复值分别保存。token 减法不一致时交出未知计数和诊断，不填成零；这些事实不能替代上游计费语义的核对。

推理片段只有在其余全部元数据相同时才拼接；不同明细身份或未知元数据分别保存在 opaque 中，供同路由回放。上游报告的供应商发生变化时保留首次原值，并输出 `model_transport.serving_provider_changed`。这些共享解析规则使用 implementation revision 4；先前 revision 3 的证据不构成此修订认证。

## 登记与撤除精确版本

`createModelTransportService(options)` 初始没有贡献。交入定义、所有者对象及清理函数完成登记，取得精确 binding，再用登记返回的 token 撤除。相同精确修订不能换成不同内容，已撤除后同样拒绝。未知或 retiring 的版本返回 unavailable，不改取新版。

```ts
import {
  createModelTransportService, officialDefinitions, type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'

const retirement: RetirementPolicy = {
  waitMilliseconds: 1000, force: false,
  schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
}
const service = createModelTransportService({ policy: {
  maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
} })
const definition = officialDefinitions.find(d => d.modelId === 'openai/gpt-6-sol')
if (!definition) throw new Error('Definition not installed')
const registered = service.registerAdaptation(definition, {}, () => {})
if ('rejected' in registered) throw new Error(registered.rejected)
console.log(await service.retire(registered.registered, retirement))
console.log(await service.close(retirement)) // 没有发出 HTTP 请求
```

取得引用后使用 `lease.transport`，通过 `lease.track(handle.outcome)` 保留调用结果的完成条件。其他异步内容门、回调、结算或交接也要在 release 前登记完成条件。工作收口后调用 `lease.release()`，重复 release 无副作用。release 关闭该持有者的新工作准入，未完成的已登记工作继续保留资源；调用者仍负责释放引用。

撤除立即停止新 acquire。`force: true` 通过引用信号和传输请求取消。等待超时返回 `remaining_active`，资源仍保留，abort 本身不是完成证据。清理失败保持可见所有权。贡献和所属连接池实际停止后，`service.closed` 才完成。登记仅在当前进程生效，不负责发布档案、租户授权或版本持久化。

## 使用可信 Cordis 贡献

`./plugin` 子入口导出 `piAiTransportPlugin`、`createModelPlugin` 与 `MODEL_TRANSPORT_SERVICE`，要求 Cordis 4.0.4，使用共用内核插件助手。包根入口可以不加载 Cordis。稳定插件提供一个 `modelTransport`，模型贡献插件在该服务内登记精确版本并共用连接池。

```ts
import { Context } from '@deepseek-ai/cordis'
import { officialDefinitions } from '@omne-harness-lite/pi-ai-transport'
import { piAiTransportPlugin, createModelPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'

const ctx = new Context()
const retirement = {
  waitMilliseconds: 1000, force: false,
  schedule: (ms: number, callback: () => void) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
const stable = ctx.plugin(piAiTransportPlugin, { retirement, policy: {
  maxConnections: 4, idleConnectionTimeoutMs: 30000, connectTimeoutMs: 10000,
  maxErrorBodyBytes: 65536, maxSseEventBytes: 8388608, credentialFragmentMinLength: 8,
} })
await stable
const definition = officialDefinitions.find(d => d.modelId === 'openai/gpt-6-sol')
if (!definition) throw new Error('Definition not installed')
const contribution = ctx.plugin(createModelPlugin(definition, retirement), {})
await contribution
await contribution.dispose()
await stable.dispose() // 没有 acquire，也没有 HTTP 请求
```

缺少必需服务时贡献处于 pending；插件配置错误在发布前失败。新增模型贡献不替换稳定服务，档案采用与撤旧是独立动作。撤除期间，活动引用或已登记回调会在报告超时后继续阻止清理完成。贡献用于可信装配代码，租户声明式配置不作为可执行插件代码。

## 开发与验证

```sh
pnpm --filter @omne-harness-lite/pi-ai-transport... run build
pnpm --filter @omne-harness-lite/pi-ai-transport run typecheck
pnpm --filter @omne-harness-lite/pi-ai-transport run test
```

测试使用真实临时 HTTPS 服务、公开 runtime/core 装配器和真实 Cordis 生命周期。当前检查不构成全模型真实路由、缓存到期、耐久恢复或完整可观测链认证。fork 来源和许可见 [UPSTREAM.md](UPSTREAM.md)、[provenance.json](provenance.json) 和 [LICENSE.pi](LICENSE.pi)。
