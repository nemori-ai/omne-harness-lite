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
| `planRequest(input, definitions, meter)`                                | 固定字节规划与可信逐路由计量器的最终输入准入                   |
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
  measure: () => ({ kind: 'exact', tokens: 1 }),
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
const result = planRequest(request, definitions, controlledMeter)
if ('rejected' in result) throw new Error(result.rejected)
console.log(result.planned.body.messages) // developer; no HTTP request
```

提醒角色由精确路由声明决定，不按模型名前缀猜策略。OpenAI 路由使用 developer，其他路由使用已核实的合适专用角色或 user。保留提醒身份/次序与单独的 compaction 映射。

pass 保持原值，drop 记录项名，select 接受明确值集合或数值区间，否则按声明丢弃或调整。缺席不补值；小数和整数比较不经 Number 舍入。当前 G-22 下 maxOutputTokens 只可 pass，档案/请求表示上限照常校验。陌生或受保护私有键按**原键**丢弃留痕，键名原本以 extra. 开头也不剥前缀；实际 extra 为空时省略。

自动缓存配置恰为 `{ cache: { mode: 'automatic' } }`，不发送手工控制。显式路由声明 ttlValues 与完整 breakpointLayouts；配置必须给 mode、TTL 和一个已列完整布局。共享代码不写死 TTL、默认值或布局组合。Schema 和解释器同源；规划控制不代表上游采纳、命中或到期行为。

## 最终输入准入

每次规划都必须显式提供 `PlanInput.tokenMargin`：`{ multiplier, reserveTokens }`，其中乘数是至少 1 的有限十进制数，预留量是非负整数。签发 `planned` 前检查最终序列化请求。请求 UTF-8 字节数、内联图片解码字节数和图片数量均精确计算；重复图片及工具结果中的图片逐次计入。缺上限返回 `input_limit_missing`；精确超限返回带 `basis: 'exact'` 的 `input_limit_exceeded`；估算 token 经余量计算后超限返回 `basis: 'estimated'`，同时给出原估值和准入值；无法可靠计量返回 `input_size_unavailable`。上界超过上限属于无法判断，不冒充实际超限。发前拒绝不会发 HTTP 请求。

`InputMeter` 是提供给函数或 transport factory 的可信可执行构件，不进 model profile JSON，也不是调用者传入的准入布尔值。定义、供应商、算法版本及证据绑定到贡献；另一计量来源签发的计划不能经本宿主发送。`createDeepSeekV4ProInputMeter(deepseekV4Pro0813Definition)` 针对精确的 `deepseek/deepseek-v4-pro-0813` / `deepinfra/fp8` 路由，固定 DeepSeek V4 Pro 公开提示词编码器与 tokenizer。由于已查来源未公开 OpenRouter／DeepInfra 的字节完全一致的私有提示词装配，它返回的是**估算**。打包 tokenizer/config 的哈希及官方文本、推理、工具 golden 离线验证。余量由调用者显式选择；估算不替代上游 usage 和费用。没有计量证据的官方定义无法成功规划。上面的合成 `controlledMeter` 只演示本地协议，绝不可用于真实供应商。

`createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)` 将单独的 V4.1 Flash tokenizer 和公开编码器绑定到 `deepseek/deepseek-v4.1-flash` / `deepinfra/fp8`。多轮工具与双图提示词使用固定的上游官方向量校验。`mp4-2` 实现按内联图片实际尺寸，使用固定公开图像处理器的 patch／下采样网格和 1,024-token 上限估算，并替换提示词已计入的图片占位符；实际供应商预处理并未公开。图片字节和数量仍由最终请求体的精确门检查。未知图片 URL 或不支持的内容在 HTTP 前返回计量不可得。估算包含提示词之外的序列化请求字段，不把内联 base64 当文本 token。余量由每次请求配置；估算不替代上游 usage，也不证明真实图片发送。

`createOpenAiInputMeter(definition)` 绑定 `openai` 供应商下修订 3（`pi-ai:openai` `mp4-3`）的六个 GPT-5.6 Sol／Terra／Luna 基础版与 Pro 定义。它按[固定 GPT-5 前缀映射](https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/tiktoken/model.py)使用固定版本 `js-tiktoken` 的 `o200k_base`，不认证 GPT-5.6 精确型号词表。估算覆盖最终序列化的多轮消息、`developer` 提醒、工具定义与结果、推理及协议字段；内联图片的 base64 在文本分词前替换为标记。三个基础版按[OpenAI 图像指南](https://developers.openai.com/api/docs/guides/images-vision)计 low（512 像素）、high（2048 像素且最多 2500 patches）、original／auto（最多 30000 patches），使用 32 像素 patch 和 1.2 倍系数。首次像素尺寸缩放向下取整是本地估算约定，指南未指定该步的取整方向；之后的 patch 预算缩放遵循已给公式。OpenRouter／OpenAI 的私有 chat 格式仍使整请求结果只能标为 `estimated`。GIF 必须具有一个完整帧；动画或截断 GIF 不可计量。Pro 图片、远程／非法／尺寸未知图片以及超出本 meter 支持尺寸的图片均在发送前判不可用。GPT-6 Astra 及全部 GPT-6 Pro 型号仍无计量绑定；下述 Sol／Luna 限定估算不证明真实 tokenizer。调用方逐次显式给出 `tokenMargin`；实际 usage 与费用只取上游。

`createOpenAiInputMeter(definition)` 也绑定 definition revision 2／`mp4-2` 的 GPT-6 Sol 与 Luna：对最终文本块用 `o200k_base` 代理计数，加上分别观测的 14-token 包装估算。当前仅覆盖固定 OpenAI 路由、`low` effort、system/developer/user 三条消息及 1/2/1 文本块；普通提醒包含 developer 标签块。工具、媒体、assistant 历史、不透明推理及其他消息结构或 effort 明确不可计量，不删除上下文。这不是多轮支持或完整认证。样本长度不构成新增硬上限，更长文本仍是误差未知的粗估；现有 profile 容量门和调用方余量保持。输出限额继续独立配置；线上校准只用 16，更大的输出控制目前仅本机验证。

`createAnthropicInputMeter(definition)` 仅绑定 `anthropic` 供应商下修订 1 的四个指定 Claude 5.x 定义。它使用固定的 [Anthropic 旧版 Claude BPE](https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b)；Anthropic 将其称为自 Claude 3 起的**非常粗略估算**。[Claude 4.7 及后续型号使用新 tokenizer](https://platform.claude.com/docs/en/build-with-claude/token-counting)，本构件不是那个 tokenizer，也没有统一误差上界。它先核完整最终 wire 值的一致性，再对承载输入的消息和工具投影估算，保留多轮文字、user 提醒、工具结果与明文推理。生成、路由和缓存控制值不增加提示词 token；合法 TTL 取自绑定路由声明。该 JSON 输入投影仍是对私有转换的粗略近似。用户及工具结果历史中的内联 PNG/JPEG/WebP/GIF 图片沿 Claude 4.7+ 文档的 28 像素视觉图块估算（2576 像素边长、4784 图块限制），请求中保留原始图片。加密或未知推理回放仍在发送前返回不可计量；密文字节长度不是保留推理 token 数的依据。四份定义绑定 `pi-ai:anthropic/mp4-4`。每次请求必须显式配置余量，逐型号真实认证还须对照上游 usage 与本粗估误差；估算及余量不替代实际上游 usage 或费用。

`createQwenInputMeter(definition)` 使用固定公开词表和 Jinja 模板，计量 Qwen3.8 2.4T-A95B（`mp4-2`）与 27B（`mp4-3`）的文本、提醒、工具和多轮历史。27B 另支持已在阿里云文档无缩放尺寸区间内、且按 32 像素对齐的内联 PNG 粗估；需要缩放、远程图片及其他视觉形态仍不可计量。Max 0902（`mp4-3`）依据阿里云公开 ChatML 示例提供单条用户文本估算，加上三个固定路由拟合样本得到、并由独立留出验证的 51-token 偏移，不声称托管模型采用公开词表；受控字符串／文本数组／正式 wire 三种请求均观测到 68 个输入 token，支持此单条用户消息的正式 planner 形状。正式调用在推理中耗尽 16-token 输出上限而截断；这是输入计量证据，不是完整回复或 service 认证。Flash（`mp4-4`）使用单独拟合的 51-token 偏移，估算正式 planner 在 Alibaba 路由的单条 user 文本数组请求，已有三例拟合和一例独立留出验证。这些观测只验证输入转换；完整回复及 service 认证仍待完成。3.7 Flash（`mp4-5`）共用最终文本数组 renderer，采用单独验证的零偏移（三例拟合、一例独立留出，以及实际供应商和费用查询核对）。其余三个商业叶仍不可计量。显式 reasoning effort 和 opaque 回放尚未计量。公开模板遵循 Jinja 的 Unicode 转义和键序，未核实的 Python JSON 浮点渲染返回不可用。调用方显式配置 token 余量。

`createGlm52InputMeter(definition)` 与 `createGlm53InputMeter(definition)` 使用固定公开模板和词表，覆盖 GLM-5.2、GLM-5.3、GLM-5.3-Flash 的文本与工具请求。结果是固定 OpenRouter 路由的估算，调用方显式提供余量。历史推理、不支持的媒体及未证的 effort 映射返回不可用；`createZaiCommercialInputMeter(definition)` 分别将 Prime 的 `alibaba` 与 FlashX 的 `z-ai/fp8` 路由绑定到限定文本／工具粗估：固定公开 GLM-5.3 模板与词表投影减去一个 token，依据八次固定路由的拟合及独立留出观测。这不证明托管模型的词表身份、精确计费或误差上界。调用方显式给余量；历史推理、媒体、未验 effort 与不支持的缓存布局仍不可计量。各自上游许可随 tokenizer 原件打包，其中 GLM-5.3 使用独立许可。

`createGoogleInputMeter(definition)` 绑定两个 Gemini 3.7／3.8 Flash AI Studio 定义的 `mp4-2`。它以固定 Gemma4 对照词表和冻结的逐型号偏置计入可见文本及工具，结果明确为粗略 `estimated`，调用方必须显式给余量。八次固定路由观测区分拟合与留出输入：样本中最多少估 10 token，最大绝对误差 60；这两个数都不是误差上界，也不是 Gemini 自身 tokenizer。媒体、不透明推理回放、请求级 reasoning effort 及未知控制字段仍不可计量。词表和许可随包提供给独立制品消费者。

`createXaiInputMeter(definition)` 为固定 xai 路由的 Grok 4.6／4.7（`mp4-2`）提供可见文本／工具粗估：将第一方 Grok Build 的 UTF-8 字节算法投影到最终 wire，加上各型号仅用两个 fit 样本得出的偏移（4.6 为 141、4.7 为 1181 token）；独立工具历史 holdout 分别对完整输入高估 35、34 token。它不是精确 tokenizer 或可证明上界，调用方仍配置余量。完整上下文输入包含未缓存输入及缓存读／写两项，任一分项未知时总数未知。opaque reasoning、媒体和未覆盖 effort 保持不可计量，不删除历史；完整模型认证仍未完成。

```ts
import { createXaiInputMeter, xaiDefinitions } from '@omne-harness-lite/pi-ai-transport'

const definition = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')!
const meter = createXaiInputMeter(definition)
// 向 createPiAiTransport({ ..., inputMeters: [meter!] }) 显式传入计量器。
```

`createMoonshotInputMeter(definition)` 将 Kimi K3 与 K2.7 Code 绑定到固定词表及各自 XTML／Jinja 提示词模板。文本、明文推理及配对工具历史参与估算，不再重复计入完整 JSON 外壳。K3 的 `mp4-3` 沿固定 encoder 按前一 assistant 的 call IDs 排序连续并行工具结果，仅用于提示词估算；实际发出的历史不改序，K2.7 使用 `mp4-2`。两型号按各自固定视觉处理规则估算内联 PNG/JPEG/WebP 图片，计入完整文本、工具与图片历史；远程图片、视频、加密／未知推理及未识别模型输入字段仍返回不可用。此估算不代表已认证 OpenRouter 实际用量或缓存保留期；余量由调用方显式提供。随包的 `LICENSE.K3`、`LICENSE.K27` 保留各自上游许可和归属要求。

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

`deepseekV4Pro0813Definition` 提供固定模型 `deepseek/deepseek-v4-pro-0813`、固定路由 `deepinfra/fp8` 的一个窄定义。它复用 OpenRouter 公共规划器和 DeepSeek 家族规则，完整实现坐标为 `pi-ai:deepseek / mp4-1`，定义修订为 `2`。导入不会注册模型、分配连接池或发送请求。

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

本次只验证本地构造和纯规划。seed／stop 真正生效、完整参数调优与生产 public／service 认证仍待完成。首次端到端调用只使用已有观察的 `low` 与 `1024`。Flash 已在 `deepseekDefinitions` 中单独声明，有限单图上限和未知上游图片事实明确记录；这两条声明都不证明图片真实发送已通过。

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

Anthropic 缓存探针（`tests/fixtures/anthropic/cache-public.mjs`）显式配置 TTL，分写入／读取／过期三个命令执行。它记录公开调用结果、已接收的到达事件和响应头；`capture.rawSseBody: false`、`capture.protocolFailureFrame: false` 表示没有捕获原始 SSE 正文及被拒绝帧。不能仅凭协议失败确定触发字段或重建缺失字节。非空且不受支持的 `images`、`audio` 和 `refusal` 内容仍按协议失败处理。

`src/input-meters/openai.ts` 中尚未绑定的 Sol/Luna 可见多轮候选以 o200k 对完整 low-effort 文本与工具历史的无损 JSON 估算；密文推理和媒体仍拒绝。它不是官方模型绑定，也不从包根导出。运行 `pnpm exec vitest run tests/openai-visible-history-candidate.spec.ts` 可验证六个冻结的规划／TLS 场景；正式采用仍需真实路由验证。

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

`src/input-meters/xai-candidate.ts` 中未绑定的 `createXaiHistoryCandidateInputMeter` 保持原 opaque 历史不变，按固定上游一方启发式估算已知 `xai-responses-v1` encrypted 项及可选的相邻 summary。四份冻结请求已做 planner 到本地 TLS 验证；未知 wrapper 或多 encrypted 项返回不可计量。真实回放和官方绑定仍待完成；此结果是需要调用者显式余量的估算，不是误差上界。
