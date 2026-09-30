# @omne-harness-lite/pi-ai-transport

[English](README.md)

规划一次 OpenRouter 请求，通过 HTTPS 发送，再把 SSE 转为公开到达事件。本包是实验性 ESM workspace 成员，使用 pi 0.86.1 定向 fork，尚未发布到 npm。

调用者必须显式提供完整模型定义，没有默认模型。`officialModelIds` 从八个公开的 `<family>Definitions` 列表派生；这 37 个已确认模型均已有 MP4 六项能力的完整声明。项目供给上限明确且有限，未知的上游限制显式写为 `unknown`。完整声明可供纯读取和建档，真实模型／供应商发送与缓存认证仍需另行验证。状态见[实现映射](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/README.md)。

## 公开接口

| 导出                                                                    | 用途                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ModelDefinition`、`ModelRoute`、`ParameterRule`、`ParameterRules`      | 完整能力及逐路由提醒、八项参数规则、已认得的私有键和缓存允许值 |
| `readModelDefinition(definitions, coordinates)`                         | 精确版本的不可变观察，不取得使用权                             |
| `configurationSchema(definition, provider)`                             | 路由数据生成的闭合 Draft 2020-12 Schema，没有默认值            |
| `interpretConfiguration(definition, values, provider)`                  | 从同一路由声明严格、无损解释配置                               |
| `createOfficialProfileContent(definition, options)`                     | 构造并判定 core 内容，不写目录、不登记、不生成时间             |
| `planRequest(input, definitions, meter, execution, preparer?)`                                | 固定字节规划与可信逐路由计量器的最终输入准入                   |
| `createPiAiTransport(options)`                                          | 显式定义、绑定计量器与自持连接池的 plan/send/read/close        |
| `sendRequest`、`readStream`                                             | 借用明确网络资源的独立函数                                     |
| `createModelTransportService`、`AdaptationLease`、`RetirementPolicy`    | 进程内精确登记、固定引用和显式排空                             |
| `parseSSE`、`canonicalInteger`、`generatedCallId`                       | 分帧与精确确定性标识辅助                                       |
| `officialModelIds`、八个 `<family>Definitions` 与 `<family>ModelRoutes` | 完整 MP4 声明、精确路由策略及派生的目标身份                    |
| `OPENROUTER_BASE_URL`、`PI_AI_CARRIABLE_MODALITIES`                     | 产品端点与当前可承载的 text/image 输入                         |

纯读取返回 `{ ok }`、invalidInput 或 unavailable。内容构造器保留 core 表示拒绝原名（如 parameter_out_of_range、max_output_exceeds_profile）；定义/路由/配置一致性失败仍为提供者 invalidInput。陌生精确版本/路由不可用，非法定义/配置为输入错误。失败只给有限拒绝类别，不输出配置正文。根入口不加载 Cordis；`./plugin` 显式依赖 Cordis 4.0.4。

## 显式声明教学定义

保存为 `example-definition.ts`，后面的例子引用这些值。能力和参数事实都是用于本地受控测试的合成教学值，不描述官方模型，禁止发布或用于真实路由。生产定义需要已核实事实与明确采用的配置来源。

```ts
import type {
  ModelDefinition,
  InputMeter,
  RetirementPolicy,
  TransportPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  openRouterCredentialRedactionConfig,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime'
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
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
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
export const controlledMeter: InputMeter = {
  modelId: definition.modelId,
  definitionRevision: definition.revision,
  implementation: definition.implementation,
  provider: 'example-provider',
  algorithmRevision: 'local-controlled-example-1',
  evidence: 'synthetic local fixture; never use for real model admission',
  tokenizerRevision: 'synthetic/1',
  replayRevision: 'unsupported/1',
  transformRevision: 'openrouter-wire/2',
  measureReplay: () => ({ kind: 'unavailable' }),
  measureNew: () => ({ kind: 'unavailable' }),
  measureFull: () => ({ kind: 'exact', tokens: 1 }),
}

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
  calibration: { kind: 'none', reason: 'no_observation' },
  outputHistory: [],
  tokenMargin: { multiplier: 1, reserveTokens: 0 },
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
    inputConstraints: definition.capabilities.inputConstraints,
    upstreamInputLimits: definition.capabilities.upstreamInputLimits,
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
import { definition, definitions, request, controlledMeter } from './example-definition.js'

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
const result = await planRequest(request, definitions, controlledMeter, {
  signal: new AbortController().signal,
})
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // developer; no HTTP request
```

提醒角色由精确路由声明决定，不按模型名前缀猜策略。OpenAI 路由使用 developer，其他路由使用已核实的合适专用角色或 user。保留提醒身份/次序与单独的 compaction 映射。

pass 保持原值，drop 记录项名，select 接受明确值集合或数值区间，否则按声明丢弃或调整。缺席不补值；小数和整数比较不经 Number 舍入。当前 G-22 下 maxOutputTokens 只可 pass，档案/请求表示上限照常校验。陌生或受保护私有键按**原键**丢弃留痕，键名原本以 extra. 开头也不剥前缀；实际 extra 为空时省略。

自动缓存配置恰为 `{ cache: { mode: 'automatic' } }`，不发送手工控制。显式路由声明 ttlValues 与完整 breakpointLayouts；配置必须给 mode、TTL 和一个已列完整布局。共享代码不写死 TTL、默认值或布局组合。Schema 和解释器同源；规划控制不代表上游采纳、命中或到期行为。

## 最终输入准入

每次规划都必须显式提供 `PlanInput.tokenMargin`：`{ multiplier, reserveTokens }`，其中乘数是至少 1 的有限十进制数，预留量是非负整数。签发 `planned` 前检查最终序列化请求。请求 UTF-8 字节数、内联图片解码字节数和图片数量均精确计算；重复图片及工具结果中的图片逐次计入。缺上限返回 `input_limit_missing`；精确超限返回带 `basis: 'exact'` 的 `input_limit_exceeded`；估算 token 经余量计算后超限返回 `basis: 'estimated'`，同时给出原估值和准入值；无法可靠计量返回 `input_size_unavailable`。上界超过上限属于无法判断，不冒充实际超限。发前拒绝不会发 HTTP 请求。

`InputMeter` 是提供给函数或 transport factory 的可信可执行构件，不进 model profile JSON，也不是调用者传入的准入布尔值。定义、供应商、算法版本及证据绑定到贡献；另一计量来源签发的计划不能经本宿主发送。`createDeepSeekV4ProInputMeter(deepseekV4Pro0813Definition)` 针对精确的 `deepseek/deepseek-v4-pro-0813` / `deepinfra/fp8` 路由，固定 DeepSeek V4 Pro 公开提示词编码器与 tokenizer。由于已查来源未公开 OpenRouter／DeepInfra 的字节完全一致的私有提示词装配，它返回的是**估算**。打包 tokenizer/config 的哈希及官方文本、推理、工具 golden 离线验证。余量由调用者显式选择；估算不替代上游 usage 和费用。没有计量证据的官方定义无法成功规划。上面的合成 `controlledMeter` 只演示本地协议，绝不可用于真实供应商。

37 个供给型号共用拒答文本读取器。当前 OpenAI、Anthropic 定义绑定各家族 `mp4-18` 实现，DeepSeek 与 xAI 绑定 `mp4-19`，其他家族仍为 `mp4-17`。`tests/official-reader-bindings.spec.ts` 对照明确的发布样本，验证所有当前工厂、完整 profile 和实际 planner 调用；工厂拒绝旧执行绑定。这些本地检查不等于 37 型号真实 OpenRouter 认证，Pro 上下文用量仍明确未知。

`createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)` 将单独的 V4.1 Flash tokenizer 和公开编码器绑定到 `deepseek/deepseek-v4.1-flash` / `deepinfra/fp8`。多轮工具与双图提示词使用固定的上游官方向量校验。`mp4-19` 实现按内联图片实际尺寸，使用固定公开图像处理器的 patch／下采样网格和 1,024-token 上限估算，并替换提示词已计入的图片占位符；实际供应商预处理并未公开。图片字节和数量仍由最终请求体的精确门检查。未知图片 URL 或不支持的内容在 HTTP 前返回计量不可得。估算包含提示词之外的序列化请求字段，不把内联 base64 当文本 token。余量由每次请求配置；估算不替代上游 usage，也不证明真实图片发送。

DeepSeek Flash／Pro 当前分别绑定 definition 修订 5／6 与 `mp4-19`（Flash 算法 `deepseek-v41-flash-reference-5`，Pro `deepseek-v4-pro-reference-4`，边界 `deepseek-reference-boundary/2`，transform `/2`），共用 wire 元数据、可见详情投影及增量计量，保留不同的参考编码器。只解释一种有限的 `reasoning_details` 形态：assistant 消息恰有一项详情，其自有键恰为 `type`、`text`、`format`、`index`，取值为 `reasoning.text`、字符串文字、原字面 `unknown` 与精确值为 0 的 index，且消息不同时带 `reasoning` 或 `reasoning_content`。仅在计量副本中把该文字交给参考编码器的 `reasoning_content`；full、φ、δ 共用同一投影。实际请求体、序列化字节、输出块及摘要不变，该文字不再作为序列化元数据重复计数，也不加原输出计数 O 或 `reasoning_tokens`。结果仍是**估算**：OpenRouter／DeepInfra 的私有投影未知，不声称误差上界。其他详情形态、summary、密文或混合推理来源一律不可计量，请求在 HTTP 前被拒；不以密文 JSON 分词代替隐藏推理计量。两款工厂的公开方法本身经过共同的 `measureFull`／`measureReplay`／`measureNew` 来源守门。旧 `mp4-18` basis 未证明兼容，回落 full；不保留旧工厂。

`createOpenAiInputMeter(definition)` 通过唯一 `openaiFamilyRecord` 表和 `openAiOutputHistoryPolicy` 提供 12 个当前 OpenAI 型号。GPT-6 Astra/Sol/Luna 的 definition 修订为 5/6/7，三个 Pro 为 6；GPT-5.6 Sol/Terra/Luna 为 9，三个 Pro 为 8，统一绑定 `pi-ai:openai/mp4-18`。工厂拒绝旧执行绑定，精确留存的原绑定仅作为有限历史事实解释 O。

可见输入沿固定 `js-tiktoken` 的 `o200k_base` 代理。GPT-5.6 base 视觉规则及 Astra 原有尺寸规则保留已说明的本地取整；Sol/Luna 和 Pro 图像仍是显式估算代理，不承诺精确词表或上游预处理一致。实际图片、完整历史、提醒角色、工具参数及结果仍保留在请求中。未知远程 URL、非法或 MIME 不匹配图片、动画或不完整 GIF 以及不支持的 detail 不可计量。调用方配置 `tokenMargin`，实际 usage 与费用保留上游事实。

公共输出组算法对完整 `openai-responses-v1` 加密历史只计一次原上游 O，净 framing 暂取零，结果标记 `estimated`；O 已包含推理 tokens。原模型、provider、mode、binding 及每个原 block 与顺序必须符合有限策略。换到没有适用 opaque 投影的型号会在计量和发送前拒绝，原块不会被剥离。未知 format、缺失密文、部分选择和不可解释 opaque 单元均不回退密文分词。full/new 可在原 I 不可用时解释合法 O；φ 必须有已知原 I 且完整 effective basis 相同。六个 Pro 保留 `scope_unknown`，不能重锚 I。本地规则不认证真实保留行为、零 framing 或误差上界。

`createAnthropicInputMeter(definition)` 以唯一有限家族策略提供四个当前 Claude 型号，definition 修订 4 / `pi-ai:anthropic/mp4-18`。可见文字与图像保留固定的旧 Claude BPE 与视觉 patch 粗估，不声称等于新的官方 tokenizer。signed `reasoning.text` 与 encrypted `reasoning.encrypted` 必须具备完整、未变的 assistant 输出组及已知上游 O；公共 full/new/φ 只将整组替换一次，贡献为 estimated O 加实验性的零净 framing。不将密文、签名或未知推理当普通 JSON 分词。Opus 5.5/Fable 5.1 另需包内持有未变原前缀证据，缺少必要依据则贡献不可用。原 `/2` 事实完整保留，不能证明 `/3` 签名前缀。

不透明 Anthropic 历史块的路由与所选型号不一致时，规划返回 unavailable；不会靠丢弃签名内容让请求出门。同路由完整组保留不透明字节和工具配对。

Anthropic 配置的 `last_message` 布局选择最后一个真实非空 text block。末端纯图 user 消息使用 OpenRouter 顶层 `cache_control`，TTL 来自已验证配置。空目标或不能明确证明的目标不回溯，也不补造文本。唯一公共选择函数同时核计量投影，仅移除其精确配置的缓存控制；wire 字节仍保留控制。公开函数与 Cordis 服务本地测试覆盖组合行为，上游缓存命中及当前逐型号 usage 精度仍需独立真实观测。

`createQwenInputMeter(definition)` 为八个固定 Alibaba 型号提供计量。两个开源权重叶仍采用固定公开词表/Jinja 全量估算：Qwen3.8 2.4T-A95B（`mp4-17`）和 27B（`mp4-17`），27B 保留既有不缩放内联 PNG 子集。六个商业叶（Max 0902、MaxPrime、3.8 Flash、3.7 Max／Plus／Flash）统一绑定 definition 修订 3／`mp4-17`，采用完整**可见最终 JSON** 估算器。以固定 Qwen 公开 tokenizer 为代理，计入实际请求中按序的 system/user/assistant/tool 消息、提醒、schema、调用参数/结果、可见推理和协议/缓存控制；保留空白及 schema 无损数值。这是在私有 OpenRouter/Alibaba framing 未公开条件下的估算，不声称各型号词表相同或 JSON 就是原生 prompt。旧单 user 的 `+51`／`0` 拟合不迁移到新表示。正常可见多轮已具备全量计量；非空增量仍回全量。商业叶的图片/视频、加密/未知推理及未知字段仍不可计量，拒绝不会删除历史。调用方显式配置余量，实际 usage/cost 始终保留上游事实。当前精确 binding 的真实 public/service holdout 及剩余声明模态仍是完整型号交付的待验门。

`createGlm52InputMeter(definition)` 与 `createGlm53InputMeter(definition)` 使用固定公开模板和词表，覆盖 GLM-5.2、GLM-5.3、GLM-5.3-Flash 的文本与工具请求。结果是固定 OpenRouter 路由的估算，调用方显式提供余量。历史推理、不支持的媒体及未证的 effort 映射返回不可用；`createZaiCommercialInputMeter(definition)` 分别将 Prime 的 `alibaba` 与 FlashX 的 `z-ai/fp8` 路由绑定到限定文本／工具粗估：固定公开 GLM-5.3 模板与词表投影减去一个 token，依据八次固定路由的拟合及独立留出观测。这不证明托管模型的词表身份、精确计费或误差上界。调用方显式给余量；历史推理、媒体、未验 effort 与不支持的缓存布局仍不可计量。各自上游许可随 tokenizer 原件打包，其中 GLM-5.3 使用独立许可。 Prime definition 3／`mp4-17` 沿同一公共模板识别已声明的请求 effort `low`／`high`／`max`，不重拟合一 token 修正；该 estimated 扩域尚无实际 effort 留出证据或托管模板保证。FlashX 保留 definition 2／`mp4-17`，不供给 effort。历史推理、不支持的媒体和未声明／畸形 effort 仍明确不可计量。

`createGoogleInputMeter(definition)` 绑定两个 Gemini 3.7／3.8 Flash AI Studio 定义 revision 3／`mp4-17`，只用单一 `google-ai-studio` provider 且关闭回退。它以固定 Gemma4 对照词表和冻结的逐型号偏置计入可见文本及工具，结果明确为粗略 `estimated`，调用方必须显式给余量。八次固定路由观测区分拟合与留出输入：样本中最多少估 10 token，最大绝对误差 60；这两个数都不是误差上界，也不是 Gemini 自身 tokenizer。已声明的请求 effort `low`／`medium`／`high` 作为生成控制被识别，不进入 messages/tools 代理计数；这是既有代理的输入域扩展，没有重拟合偏置，也不声称 effort 专属上游准确性。缺席仍不发送；其他值继续按定义原有规则丢弃。实际 effort 留出验证仍待完成。词表和许可随包提供给独立制品消费者。

Google 只有全量计量。该计量器不提供增量 replay/new 贡献（`unsupported-marginal/1`），因此每一轮（包括多轮续接）都按全量计量，不报告任何 φ/δ 值。纯文本可见推理历史（`reasoning`）会回放并计入。带签名的 Gemini 推理历史（`reasoning_details`，例如 `google-gemini-v1` 的文本条目与签名条目）由 wire 投影原样回放，但该计量器对其返回不可计量：这类续接在发送前以 `input_size_unavailable` 拒绝，历史不会被剥离。内联图片同样由 wire 投影承载，但没有离线图片计量依据，计量器以同样方式拒绝。音频与视频仍保留为已声明输入模态，但属于本期范围外：不承载，以 `modality_not_carried` 拒绝。不支持的 effort 结构、其他不透明推理及未知控制字段仍不可计量。本机 TLS 场景以合成上游覆盖三轮 public 与 Cordis transport 调用；两款型号的真实 OpenRouter public/service 认证仍待完成。

`createXaiInputMeter(definition)` 为固定 xai 路由的 Grok 4.6／4.7 绑定 definition 5／`mp4-19`。可见文本／工具仍按第一方 Grok Build UTF-8 字节代理估算，保留两个 fit 样本得出的偏移 141／1181；独立可见工具历史 holdout 分别对完整输入高估 35／34 token。对于来源有限且完整、原样保留的 assistant 输出组，full/new/φ 把原上游输出计数 O 作为一次与工作负载相关的 **estimated** 输入代理；O 已包含 reasoning，同组 summary、密文、文本和工具不再另计。旧 definition 3／4 只用于解释保存的来源事实，不保留旧工厂。未知格式、partial 组以及存在但尚无真实映射的上游身份字段均不可计量，原 wire 保持不变。当前 effort 或 max-token 改变会使输入锚失效；full 仍可独立解释合法原 O。它不是精确输入占用或可证明上界，调用方仍配置余量。完整上下文输入包含未缓存输入及缓存读／写两项，任一分项未知时总数未知。可见偏移未按 effort 单独拟合；真实密文回放、身份映射、图片及完整 public/service 认证仍未完成。

OpenRouter 的流式加密推理数据可能是 `[REDACTED]` 占位值。它不是完整可回放输出组，不能用于按 O 估算。

`tests/xai-x5-local-replay.spec.ts` 在本机 TLS 上用合成的 `xai-responses-v1` summary 与密文 detail、原工具 callId 和三轮工具场景，经公开 invoke 与 Cordis transport service 租约两条入口，钉住两款当前守卫：回复带上游身份时，后续轮在任何新 HTTP 之前返回 `input_size_unavailable`；不带身份时完整组原样重发，第二轮上游拒绝记为失败调用。这些合成用例不是真实回放证据。

仅含可见内容的响应复用采用共享 JSON 净增量估算：相对于空消息 framing 计算新回放的可见单元及新增输入，不重复计算稳定前缀及工具声明。空消息仅可用于内部 framing，完整请求计量仍返回不可计量。新算法／回放依据使旧输入锚失效；旧保存的完整输出组经来源核验后仍可贡献 O。无需新增用户配置。图片仍不在此计量器的支持范围内。

```ts
import { createXaiInputMeter, xaiDefinitions } from '@omne-harness-lite/pi-ai-transport'

const definition = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')!
const meter = createXaiInputMeter(definition)
// 向 createPiAiTransport({ ..., inputMeters: [meter!] }) 显式传入计量器。
```

`createMoonshotInputMeter(definition)` 将 Kimi K3 与 K2.7 Code 绑定到固定词表及各自 XTML／Jinja 提示词模板。文本、明文推理及配对工具历史参与估算，不再重复计入完整 JSON 外壳。K3 的 `mp4-17` 沿固定 encoder 按前一 assistant 的 call IDs 排序连续并行工具结果，仅用于提示词估算；实际发出的历史不改序，K2.7 使用 `mp4-17`。两型号按各自固定视觉处理规则估算内联 PNG/JPEG/WebP 图片，计入完整文本、工具与图片历史；远程图片、视频、加密／未知推理及未识别模型输入字段仍返回不可用。此估算不代表已认证 OpenRouter 实际用量或缓存保留期；余量由调用方显式提供。随包的 `LICENSE.K3`、`LICENSE.K27` 保留各自上游许可和归属要求。

## 持有传输资源

```ts
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import { definitions, request, networkPolicy, controlledMeter } from './example-definition.js'

const transport = createPiAiTransport({
  definitions,
  inputMeters: [controlledMeter],
  policy: networkPolicy,
})
try {
  const result = await transport.plan(request, { signal: new AbortController().signal })
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

共享读取器把流式 `reasoning_details` 重建进思考块的 `opaque`，不猜测身份。相邻的 `reasoning.text` 片段只有在除 `text` 与 `signature` 之外的所有成员（type、id、index、format 及任何未知元数据，后者原样保留）逐值相等，且满足以下两种情形之一时，才按到达顺序拼接文本。一是双方 `id` 相同且非空：缺席或 `null` 的签名可以续接，直到被后到的一个非空签名填上，此后只允许同一签名继续。二是双方都没有 id，且都不带签名（缺席或 `null`），即普通的流式推理增量。其余情形一律保留为独立的原始条目：身份或元数据不同、签名冲突、已签名后又来未签名片段、无 id 却带签名，或签名不是字符串或为空串。`reasoning.encrypted` 从不拼接；`reasoning.summary` 维持原有的等头拼接。各家族的签名回放规则不变，因此未签名或被拆开的 Anthropic 组在规划时仍为 unavailable，不会被修补。

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
  const plan = await transport.plan(request, { signal: new AbortController().signal })
  if ('rejected' in plan) return plan
  const sent = await transport.send(plan.planned, credential, signal)
  if (!('response' in sent)) return sent
  const reader = transport.read(sent.response, plan.planned, signal)
  const events: ArrivalEvent[] = []
  try {
    while (true) {
      const next = await reader.next()
      if (next.done)
        return {
          events,
          end: next.value,
          ...('rawHeaders' in sent ? { rawHeaders: sent.rawHeaders } : {}),
        }
      events.push(next.value)
    }
  } finally {
    try {
      await reader.return({ aborted: true })
    } finally {
      sent.response.stop()
      await sent.response.stopped
    }
  }
}
```

## 登记、取得与撤除精确版本

```ts
import { createModelTransportService } from '@omne-harness-lite/pi-ai-transport'
import {
  definition,
  request,
  networkPolicy,
  retirement,
  controlledMeter,
} from './example-definition.js'

const service = createModelTransportService({ policy: networkPolicy })
const registered = service.registerAdaptation(definition, controlledMeter, {}, () => {})
if ('rejected' in registered) throw new Error(registered.rejected)
const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
if ('rejected' in acquired) throw new Error(acquired.rejected)
const lease = acquired.lease
try {
  const result = await lease.transport.plan(request, { signal: new AbortController().signal })
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

### 观察注册与退役

装配可把已绑定作用域的只写 emitter 借给一个 transport 服务。构造服务前应绑定 **local** 诊断作用域和独立的服务代际关联：

```ts
const emitter = collector.emitter({ kind: 'local' }, { executionId: 'transport-generation-a' })
const service = createModelTransportService({
  policy: networkPolicy,
  registryDiagnostics: emitter,
})
// piAiTransportPlugin 的配置也接受同一个可选项。
```

`registration` 与 `retirement` 记录实际发布、取得、引用与执行数量、退役等待、强制取消请求、清理失败，以及贡献或整个服务真正停止。同一 owner 重复登记不产生第二条发布记录；请求 force 不表示工作已经停止。binding 仅含已拥有的实现、模型、定义和已取得时的配置修订，不含配值、凭据与原始错误。服务只借用 `record`，emitter 与 collector 的关闭责任仍由装配持有，直到服务实际停止。

`service.inspect()` 分别给出本实例累计的 `registryDiagnosticFailures` 和 `registryDiagnosticDropped` 精确计数，溢出为 `unknown`。回调抛错或同步结果无效计失败；仅合法的 `{ dropped }` 计拒收。没有 emitter 时两项从零起。同步端口违规返回 Promise 时只计一次失败，随后停止向该实例继续投递；其拒绝会被观察，但不会等待它。源计数与 collector 健康是两个视角，不能相加成两次故障。`service.diagnostics()` 仍只表示底层网络诊断的投递状态，关闭后也可读。

## 使用可信 Cordis 贡献

```ts
import { Context } from '@deepseek-ai/cordis'
import { piAiTransportPlugin, createModelPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'
import { definition, networkPolicy, retirement, controlledMeter } from './example-definition.js'

const ctx = new Context()
const stable = ctx.plugin(piAiTransportPlugin, { retirement, policy: networkPolicy })
await stable
const contribution = ctx.plugin(createModelPlugin(definition, controlledMeter, retirement), {})
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

`deepseekV4Pro0813Definition` 提供固定模型 `deepseek/deepseek-v4-pro-0813`、固定路由 `deepinfra/fp8` 的一个窄定义。它复用 OpenRouter 公共规划器和 DeepSeek 家族规则，完整实现坐标为 `pi-ai:deepseek / mp4-19`，定义修订为 `6`。Flash 型号在同一实现下为修订 `5`。导入定义不会注册模型、分配连接池或发送请求。

模型记载的能力是文本输入、文本输出。所选路由提供 1,048,576 token 共享窗口和 16,384 token 输出容量；1,032,192 token 输入预算预留了完整输出容量。这是换算的只计输入预算，不是路由 `max_prompt_tokens` 的原值，也不是极值请求实测。空输入限制对象表示该纯文本声明没有活动的图片限制；两个适用的上游事实明确为 `unknown`，不表示无限。

系统提醒映射为带标识的 `user` 消息。自动前缀缓存采用下面的显式配置，不配置 TTL 或断点。该路由的历史请求曾在没有手工缓存控制时报告缓存读取 token；这不保证下一次命中，也不认证生产 runtime。

当前供给策略主动只提供 `reasoningEffort: 'low'`、`seed: 0` 和 `stopSequences: ['END']`，其它值丢弃并记录项名。temperature、top-p 和两种 penalty 主动不提供，丢弃均留痕；不会把路由所报支持或原生条件行为改说成“不支持”。`maxOutputTokens` 通过档案通常的输出上限核对后原样发送，不根据动态元数据夹取。私有 `extra` 项的提供集合为空。

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

本地已验证纯构造、规划及当前绑定的受控三轮 public／Cordis transport 路径。完整生产 public／runtime-service 认证、seed／stop 真正生效和完整参数调优仍待完成。本地三轮场景使用 `low` 与 `2048`；合成上游用量不能证明远端缓存命中或 tokenizer 准确度。Flash 声明有图片上限，上游图片事实明确为未知。历史真实图片观察早于当前绑定，不认证当前生产路径。

### 家族策略与完整模型定义

`src/official-models/` 中有两个不同的实现层次：

1. 家族复用 `ModelRoute` 策略片段，各型号／供应商的具名路由记录实际差异。这些声明交给同一套参数、提醒、缓存与消息规划器。
2. 完整 `ModelDefinition` 还需要能力属性、精确实现／定义修订和供应商路由。整份值统一经 `readModelDefinition` 校验和拥有；显式配置与 `createOfficialProfileContent` 再产生目录输入。插件注册沿既有贡献生命周期。

八个模块均使用同一个内部入口形状：`<family>ModelRoutes[modelId][providerId]`，模型 ID 和供应商 slug 都明确列出。每份文件先写公共策略，再写模型差异，随后列出精确映射。全部 37 条六字段定义放在最后，有来源的显式配置按需列出；DeepSeek Pro 直接从 `deepseekModelRoutes` 取得路由。已有具名路由导出复用同一组值。

例如，从包根可用同一方式选择两家的路由和完整定义：

```ts
import {
  deepseekDefinitions,
  deepseekModelRoutes,
  moonshotDefinitions,
  moonshotModelRoutes,
} from '@omne-harness-lite/pi-ai-transport'

const deepseekRoute = deepseekModelRoutes['deepseek/deepseek-v4-pro-0813']['deepinfra/fp8']
const moonshotRoute = moonshotModelRoutes['moonshotai/kimi-k3']['moonshotai/mxfp4']
const deepseek = deepseekDefinitions.find(item => item.modelId === 'deepseek/deepseek-v4-pro-0813')
const moonshot = moonshotDefinitions.find(item => item.modelId === 'moonshotai/kimi-k3')
if (!deepseek || !moonshot) throw new Error('missing official definition')
```

这些映射和八个完整定义列表均由包根公开导出。完整定义沿公共校验与配置路径接入；家族不另行实现注册、连接池或生命周期。

| 家族      | 已有内部路由策略的目标型号数 | 提醒角色  | 声明的缓存配置                                                   |
| --------- | ---------------------------: | --------- | ---------------------------------------------------------------- |
| OpenAI    |                           12 | developer | automatic                                                        |
| Anthropic |                            4 | user      | explicit；调用方显式选择已声明的 `1h` TTL 与 `last_message` 布局 |
| DeepSeek  |                            2 | user      | automatic                                                        |
| Google    |                            2 | user      | automatic；显式列出 Google AI Studio 与 Vertex 路由              |
| xAI       |                            2 | user      | automatic                                                        |
| Qwen      |                            8 | user      | 六款显式 `5m`／`system`；两款 Flash 为 automatic                 |
| Moonshot  |                            2 | user      | automatic                                                        |
| Z.ai      |                            5 | user      | 四款 automatic；Prime 有 Alibaba 显式缓存路由策略                |

Google 路由映射还列有 Vertex；首批完整 Google 定义只绑定已有输入限制事实的所选 AI Studio 端点。路由映射本身不会把第二端点变成完整官方供给。

37 条完整定义现为公开数据，可用来构造官方档案内容；导入它们不会自动安装可选档案。测试按精确型号验证公共规划器的规则，多家还通过本地 HTTPS／SSE 验证下一轮工具与推理历史；其中的合成容量夹具不发布真实模型能力，也不认证上游行为。有限项目上限与未知上游事实已显式声明；多模态承载、逐型号输入计量及真实 public／service 认证仍须逐项完成。缓存声明或历史暖读不能证明 TTL 保留期。

在本包目录运行家族测试：

```sh
pnpm exec vitest run tests/official-*.spec.ts
```

## 计量源码布局

具体估算实现集中在 [`src/input-meters/`](src/input-meters/)：[`deepseek-v4-pro.ts`](src/input-meters/deepseek-v4-pro.ts)、[`deepseek-v41-flash.ts`](src/input-meters/deepseek-v41-flash.ts) 和 [`openai.ts`](src/input-meters/openai.ts)。同一家族在事实依据允许时共用算法，每个供给模型及供应商路由明确绑定；消息编码或 tokenizer 确有差异时可拆独立模块。公共接口、余量及绑定校验保留在 [`input-meter.ts`](src/input-meter.ts)，最终输入限额检查在 [`input-limits.ts`](src/input-limits.ts)。消费者从包根导入工厂。

Anthropic 缓存探针（`tests/fixtures/anthropic/cache-public.mjs`）显式配置 TTL，分写入／读取／过期三个命令执行。当前官方绑定只接受 `1h`；`5m` 在规划或网络请求前被拒绝。它记录公开调用结果、已接收的到达事件和响应头；`capture.rawSseBody: false`、`capture.protocolFailureFrame: false` 表示没有捕获原始 SSE 正文及被拒绝帧。非空且不受支持的 `images`、`audio` 仍按协议失败处理；这两个字段的空串、空数组和 null 继续忽略。[D-108](../../../.meta_harness/design/record/decisions/openrouter-refusal-mapping-adoption/decision.md) 对 `delta.refusal` 采用严格值域：缺席、null、空串无内容；非空字符串（包括纯空白）保持原值进入 `delta.content` 共用的文本块；其他类型，包括空数组，以固定 `invalid refusal` 诊断失败。值型检查发生在同帧任何内容交付之前。同帧先追加 content 再追加 refusal，不依赖 JSON 键顺序；跨帧按到达次序追加。拒答文字沿已有首内容门、终止理由、取消和计量路径。正常尾帧继续读取 usage 至 DONE；故障及时停止，不等未来账。合法且实际选入上下文的回复按普通文本回放，故障 delivered 仅留在响应记录，不自动进入历史。公开调用保留已有来源脱敏政策：实际回复文字不改写，raw/error/诊断文字仍按来源脱敏。这些诊断不能还原历史拒绝帧；受控 TLS 测试不代表真实厂商认证，也不结清旧未知费用。

`tests/openai-sol-calibration.spec.ts` 覆盖 Sol 全部已声明 effort 与缺省、精确十进制余量边界、本机 TLS 的真实公开 invoke、full→marginal→marginal、确认稳定前缀不进入 tokenizer 的 spy，以及前缀／依据／来源负控。`tests/openai-visible-history-candidate.spec.ts` 以保留的冻结历史输入验证正式 Sol/Luna 工厂。原 Sol 文字代理观察与新最终 JSON 估值分别保留。本机符合性不冒称新的 OpenRouter 认证。

Moonshot 图片探针分别验证 PNG 完整性与生产输入限额：`node --test tests/fixtures/moonshot/repair-image.test.mjs` 和 `pnpm exec vitest run tests/fixtures/moonshot/repair-image.spec.ts`。这些本机检查不证明上游接受或缓存命中。

### ZAI 历史候选验证

`src/input-meters/zai-candidate.ts` 中的 ZAI 历史思考候选复用固定 GLM
tokenizer 和模板，保留完整的助手纯文本历史。它未从包入口导出，也未绑定到
官方模型。Prime/FlashX 托管路由的历史计量、混合 opaque/plain 历史仍待验证。
五份已保存的完整 SSE 经本地 TLS 检查生产流装配，独立 Jinja 黄金输出只验证
公开模板的投影。混合历史用例保留一个具名预期失败，不能算验收通过。

构建后可执行上述命令，用显式输出上限冻结十五条尚未发送的 control/plain/details
请求；命令不访问网络、凭据或付费账本。512 是这次探针的调用者参数，不是模型上限。

```sh
node packages/model/pi-ai-transport/tests/fixtures/zai/history-candidate-probes.mjs --max-output-tokens 512 > tmp/zai-history-probes.json
node --test packages/model/pi-ai-transport/tests/fixtures/zai/history-candidate-probes.check.mjs
```

`src/input-meters/xai-candidate.ts` 中未绑定的研究用 `createXaiHistoryCandidateInputMeter` 保持原 opaque 历史不变，按固定上游一方启发式估算已知 `xai-responses-v1` encrypted 项及可选的相邻 summary。四份冻结请求的 planner 到本地 TLS 验证只用于历史比较；该候选不是当前官方 V5 计量器或旧执行绑定。未知 wrapper 或多 encrypted 项返回不可计量。官方完整组估算的真实回放仍未验证。研究估算要求调用者显式配置余量，不能当作误差上界。

`ModelTransportService.diagnostics()` 无需取得 lease 即可读取底层实例的诊断投递 `failed`、`pending`、`dropped` 计数，关闭后仍可读取。`send` 与 `read` 可在末参接收本次请求专用 emitter，两个阶段由同一 emitter 持有；类型化事实不包含消息正文或凭据，工程身份不进入 HTTP。不同 emitter 的重绑定被拒绝。完整 runtime 调用接线与多会话验收仍须单独完成。

同一助手消息含同路由 opaque 推理块及额外独立的纯文本思考块时，当前规划返回 unavailable、零 HTTP，原历史不删不改。单块 opaque 与纯文本历史沿原路径及计量门处理。选定路由如何共同消费两种表示仍待核实；明确拒绝不代表已支持混合历史发送。

## 响应校准输入规划

`PlanInput.calibration` 和 `PlanInput.outputHistory` 均必填。没有前序响应的首次请求显式给 `{kind:'none',reason:'no_observation'}` 和 `[]`。后续输入锚传合法取得的原 `inputCalibration`、`usage`、完整保留的 `outputBlocks` 与 `replaySelection`。独立的 `outputHistory` 交出所有实际选入且输出组已知的较早响应，包括输入计数不可用的响应。每组保留原 route binding、provider、parameters 及实际存在的 serving provider／upstream model；按首个选入目标排序。缺失 `outputHistory` 是 malformed，planner 不默补 `[]`。selection 定位源块及当前消息/块，planner 核实际内容和最终投影覆盖，不接受 caller trust 开关。

`InputMeter` 破坏性改为 `measureFull`、`measureReplay`（φ）、`measureNew`（δ），并固定 tokenizer/replay/transform 修订；根入口可独立导入三操作以及 `projectInput`、`projectOutput`、`canonicalProjection`。有符号贡献按 I+φ+δ 合成，estimated 最终总量只应用一次 `tokenMargin`。`planned.measurement` 显式给 full/marginal、精度、贡献及来源/前缀/依据回退原因；实际 usage/cost 不混入预测。

`measureFull` 接收 `FullMeterInput`：实际最终 body／serialized、唯一最终 `InputProjection`、全部选入输出组及 `historySpans`。`measureReplay` 接收 `ReplayMeterInput`，包含原锚 `observation`、存在时与锚一致的历史组、绝对 `unitIndices` 与 `selectionSpans`。`measureNew` 接收 `NewMeterInput`，包含仅归 N 的绝对 `unitIndices`、当前 `countingBasis`、仅归 N 的完整组及其位置。history span 以组和 selection 索引标识来源，并给最终 unit 半开范围；多个块可以共享范围，但一个共享 unit 不能双计。planner 先复制、验证并深冻结各值；两个增量 unit 数组都不含稳定 P 正文。

公共 planner 在调用任何 meter 前核完全部组，沿同一个最终投影把每组归到稳定 P、锚回放 G 或新增 N。P 已由准确输入观察覆盖，不额外加 O；G 经 φ 只算一次；N 交 δ。组跨区域则转 full。没有可用输入观察时，full 仍收到所有合法组。部分、重复或改序选择必须有型号映射依据或全量计量，不能把 aggregate O 按块均分。独立 `measureFull(meter,input)` 对已知事实非法返回 `unavailable`；独立 `measureReplay`／`measureNew` 返回 `invalidInput`。无法识别的旧投影版本属于依据缺口，不冒判摘要错误。实际内容完整保留在发出 wire 中，最终 estimated 总量只应用一次配置余量。采用交接见 [runtime v19](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v19-output-history-design.md) 与 [transport v13](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v13-output-history-design.md)。

Replay 实现可结合原组与实际选入关系读取 `input.observation.usage.output_tokens`，这不等于获准把该总量加到输入 tokens。整组判断必须核覆盖、源身份、目标实际顺序以及仅选入一次，不能依赖 selection 数组顺序。一个源块映射多个目标仍可合法存在，事实明确交出，不全局禁止；部分、重复、改序的组不能静默套整组公式。独立调用公开 `measureReplay(meter, input)` 时，调用者仍须提供合法来源与投影关系，TypeScript `readonly` 不认证来源。型号不能解释的关系保留 `invalidInput`／`unavailable` 及 planner 原有 full 回退路径。本接口没有新增任何型号的 I+O 规则。

当前 Anthropic 定义使用 revision 4 / `pi-ai:anthropic/mp4-18` 与投影 `/3`。固定文本数组和精确缓存中性元数据维持 full/marginal 边界；稳定前缀仍扫描与哈希，不重新分词。末条纯图片缓存共用上文的已验证选择函数。

Anthropic及适用OpenAI可见历史路径给新增回放/追加单元的JSON净贡献估算，减去估算表示中的空封装。它不是私有模板/BPE边界恒等证明，不从总output或ciphertext长度推算隐藏thinking。其余既有full meter保留原适用域；尚无依据的增量明确unavailable，未供给型号不补造。增量不可判回退full，full仍不可判则零HTTP拒绝，保留全部历史。

reader每个终态都交同一个累积器的 `readFacts`；解析即保存usage，后续坏帧或取消不抹掉已知I。完整prompt total不依赖伪造缓存零项；实际响应头 `X-OpenRouter-Cache-Status: HIT` 为response-cache不可用，不是输入零锚。重复累计事实不相加。取消停止并等待真实资源，只交已有事实，不等未来usage。

本地回归包括纯planner和实际TLS reader；37模型线上认证与完整runtime/service组合另验，本地通过不冒称上游路由认证。

### OpenAI Pro 输入观察范围

六个当前 OpenAI Pro 型号统一绑定 `pi-ai:openai/mp4-18`。实际 usage/cost 保留，但继承上下文的统计范围未确认，输入观测仍为 `unavailable/scope_unknown`。缺失 usage、响应缓存与统计冲突保持原有优先顺序。Pro 请求使用全量估算和显式余量；原 request basis 即使看起来已知，也不能在原 I 统计范围未知时授权 φ。完整且适用的原 O 仍可由公共 full/new 算法解释。

规划与 reader 共用私有固定规则，由实际已拥有的请求绑定选择；不新增公开信任开关或额外 I/O。新 Pro transform revision 为 `openrouter-input-transform/pro-scope-1`，该统计范围边界与所供估算算法修订分别约束。精确旧贡献身份仅在已有 lease 随 registry 退役协议排空时保留原捕获 reader 语义；默认官方表和工厂只供新身份。这不构成历史兼容入口，也不新增针对可信自定义完整代码贡献的全局禁入机制；其它可信贡献继承原 reader 前提，不因此取得新的上游统计范围认证。

### DeepSeek 有符号增量参考计量

Pro0813 修订 6 与 Flash 修订 5 / `mp4-19` 在固定 `deepinfra/fp8` 上用各自已钉 public reference renderer 提供 full 与有符号 replay/new 估算。固定绑定识别 OpenRouter 的 `DeepInfra` 显示名；其他 provider/model 身份仍使锚失效。纯投影比较旧/新参考 prompt，不分词稳定历史；只有锚外片段和有限末端 assistant framing 进入增量 tokenizer。有 N 时由 δ 承担最终 framing 变化，否则由 φ 承担。锚内正文或 substantive reasoning 重写回退 full。上述有限可见详情形态经同一计量副本投影进入边界；含该详情的稳定 P 仍不分词。密文长度不会使未知 opaque reasoning 获得增量支持。

`MarginalMeterInput.boundary` 是可选的 provider-owned 边界描述，在来源、前缀和 basis 校验后产生，不是调用者 trust 标志。DeepSeek 在拆分 G/N 之前保留实际顺序，计算有符号后缀差分，覆盖缺 usage 的多轮、user/tool 合并及空分支。φ 估算 P→P+G 后缀变化，δ 估算 P+G→实际最终顺序的变化，因此 δ 可以扣掉因后继 user 而排除的本次新增回放 reasoning；两者是估算净贡献，不是逐消息实测 token。独立后缀分词与 OpenRouter/DeepInfra 私有模板均仍为 **estimated**，不是精确值或上界；合成后只应用一次配置余量。本次不新增付费 serving 认证或缓存命中保证。完整请求 bytes/图片限制继续检查；完整线性序列化、参考渲染和 hash 仍然存在，稳定 P 不进入增量 tokenizer。

Flash 保留自身钉住的 renderer、tool result 排序、tokenizer 与 image span 公式；增量只加新图片 span，已在 prompt 中的占位 token 只扣一次。追加工具结果若重排了锚内实质内容，则回退 full。

`tests/deepseek-visible-reasoning.spec.ts` 将捕获的详情形态与带／不带 tools 的官方编码器向量对照，并覆盖全部拒绝形态、带非法历史的工厂直接调用，以及前缀、tools、basis 变化时回落 full。`tests/deepseek-visible-reasoning-rounds.spec.ts` 经本机 TLS 流式发送捕获的 `delta.reasoning_details` 形态，分别走公开 transport 与 Cordis transport 服务，有／无 tools 各三轮。这些是本地一致性检查；相对真实 OpenRouter／DeepInfra 输入用量的误差尚未在此测量。

### 显式图片准备

transport 导出 `createImagePreparer`、`createSharpImageCodec` 和显式选择的 `modelImageBalancedV1` 政策。装配先 import 已安装的 sharp 0.35.3；导入或构造 preparer 不隐式加载 native codec、读文件或联网。英文片段中的示例可直接用于本节，两种语言共用同一公开调用。

完整 JSON 请求的 `nonImageWireBytes` 必须是最终序列化中各选入图片的 data URL 字符串值替换为空串后的 UTF-8 长度。helper 加上实际 JSON data URL 内容贡献，包含 MIME 和 base64 膨胀；transport 规划仍独立序列化并验收最终 body，才发布计划。

有限搜索按固定候选序号推进，cache 命中不会扩大搜索额度，原 bytes 保持不变。缓存表归调用方给的进程内 opaque scope，所有表共同遵循 bytes/entry 限额与 LRU 淘汰；scope 不赋予授权。省略 scope 即不跨调用复用。取消准备或调用 `close()` 都等待实际 native 工作终结及 decoded 句柄释放；preparer 借用 codec，不销毁共享 codec。显式在途 buffer 预算与 native RSS 分开，不是进程内存限额。

```ts
import sharp from 'sharp'
import {
  createImagePreparer,
  createSharpImageCodec,
  modelImageBalancedV1,
} from '@omne-harness-lite/pi-ai-transport'

const codec = createSharpImageCodec(sharp)
const instance = createImagePreparer(modelImageBalancedV1, codec)
if ('unavailable' in instance) throw new Error('Image codec unavailable')
const scope = {}
try {
  const bytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: 'blue' },
  }).png().toBuffer()
  const result = await instance.ready.prepareRequestImages({
    images: [{ position: 'user/0/image/0', bytes, mediaType: 'image/png', targetMaxBytes: 1_000_000 }],
    maxRequestBytes: null,
    nonImageWireBytes: 0,
    signal: new AbortController().signal,
  }, scope)
  // 先判 prepared/rejected，再消费自有 bytes。
  if ('rejected' in result) throw new Error(result.rejected.reason)
  console.log(result.prepared.images.map(({ width, height, changed }) => ({ width, height, changed })))
} finally {
  instance.ready.clearScope(scope)
  await instance.ready.close()
}
```

### 图片与异步规划装配

`planRequest` 必须 await，显式接收 `{ signal, reuseScope? }`；有图时还需传入 `createImagePreparer` 返回的实际 ready 实例。无图不增加图片复合 revision。有图时，规划先校验结构、模态、工具配对和必要限额，再准备实际 bytes，用同一固定 body 序列化、投影和计量；原输入与历史不被改写。`ReplayMeterInput.countingBasis` 必须是当前请求 basis，不能借原观测补值。完整/新部分计量可在有限来源规则成立时复用旧原 O；表示或有效 basis 改变时不复用原前缀 I。

工厂和 Cordis 插件配置显式接收 `imagePreparation: { policy: modelImageBalancedV1, codec: createSharpImageCodec(sharp) }`。工厂拥有 preparer，并在 `close()` 中停止接纳、取消规划并等待真实原生任务和连接排空；借用的 codec 不被销毁。显式 `codec: null` 保持 codec 缺席，policy 仍在初始化时严格校验；有图请求返回 unavailable，纯文本保持原路径。没有隐式 codec、policy 或限额回填。

`ModelTransportService.clearReuseScope(scope)` 对服务拥有的固定 preparer 集合同步清理；租约释放、贡献退役和服务停止接纳后仍可调用。scope 是进程内不透明对象，不进入 durable binding 或日志，也不授予租户权限。独立函数调用者管理自己的 scope；省略它即不跨请求复用。

### 组合完整历史输出

`fullOutputHistory`、`newOutputHistory` 和 `replayOutputHistory` 使用同一完整输出组遍历算法。调用者提供包含有限厂商来源与 basis 规则的 `OutputHistoryPolicy`，以及纯可见 body 计数函数。单元分类分为可见、需要完整输出组、无法解释三态。公共实现只将完整且唯一选中的 assistant 单元替换为原上游 output 计数一次；其中已经包含推理 tokens。这是估算贡献，不承诺输入与输出 token 精确相等。未知映射返回 unavailable，不对 opaque 字节做 tokenizer 回退。

全量计量核对真实 body 与缓存中性投影。投影版本 `openrouter-input-projection/3` 只移除经验证且来自配置的 Anthropic 缓存控制，提交的 wire 不变。历史 `/2` 摘要按原版本核验，不因此复用旧输入锚点。签名前缀规则通过最终 marginal 输入对象上的私有同步 planner 能力消费；独立 marginal 调用缺少该能力时返回 unavailable。

为自定义有限家族，将公开公共核与纯可见计数函数、具版本的规则组合：

```ts
import { fullOutputHistory, newOutputHistory, replayOutputHistory } from '@omne-harness-lite/pi-ai-transport'
import { meter, finiteFamilyPolicy, visibleBodyCounter } from './my-finite-model.js'

const full = fullOutputHistory(fullInput, meter, visibleBodyCounter, finiteFamilyPolicy)
const added = newOutputHistory(newInput, meter, visibleBodyCounter, finiteFamilyPolicy)
const replay = replayOutputHistory(replayInput, meter, visibleBodyCounter, finiteFamilyPolicy)
```

三种输入都携带实际原组及选择区间；只有不存在已选入的原观测时才显式给空历史。`fullInput` 另携带真实序列化 body 及其投影。独立 full 的畸形输入返回 unavailable；畸形 new/replay 返回 invalidInput。合法来源缺少必要解释或签名前缀依据时，贡献返回 unavailable。planner 先从增量回退全量；全量仍不可计量时，既有 `invalidInput/input_size_unavailable` 表示准入失败，不表示签名或参数值非法。
