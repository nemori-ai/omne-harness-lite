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

37 个官方叶均绑定本家族实现 `mp4-17`，采用共享拒答文本读取器。各 definition 修订递增一次；计量算法、tokenizer／replay／transform 修订、声明能力与路由不变。`tests/official-reader-bindings.spec.ts` 对照发布前固定算法／范围样本，逐一验证工厂、完整 profile 和真实 planner 调用。工厂拒绝旧定义；这次发布不冒充 37 型号实机 OpenRouter 认证，Pro 输入上下文用量仍明确未知。

`createDeepSeekV41FlashInputMeter(deepseekV41FlashDefinition)` 将单独的 V4.1 Flash tokenizer 和公开编码器绑定到 `deepseek/deepseek-v4.1-flash` / `deepinfra/fp8`。多轮工具与双图提示词使用固定的上游官方向量校验。`mp4-17` 实现按内联图片实际尺寸，使用固定公开图像处理器的 patch／下采样网格和 1,024-token 上限估算，并替换提示词已计入的图片占位符；实际供应商预处理并未公开。图片字节和数量仍由最终请求体的精确门检查。未知图片 URL 或不支持的内容在 HTTP 前返回计量不可得。估算包含提示词之外的序列化请求字段，不把内联 base64 当文本 token。余量由每次请求配置；估算不替代上游 usage，也不证明真实图片发送。

`createOpenAiInputMeter(definition)` 绑定 `openai` 供应商下修订 8（`pi-ai:openai` `mp4-17`）的三个 GPT-5.6 Sol／Terra／Luna 基础版，以及修订 7（`mp4-17`）的三个 Pro 定义。它按[固定 GPT-5 前缀映射](https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/tiktoken/model.py)使用固定版本 `js-tiktoken` 的 `o200k_base`，不认证 GPT-5.6 精确型号词表。估算覆盖最终序列化的多轮消息、`developer` 提醒、工具定义与结果、可见明文推理及协议字段。`reasoning_details` 可包含可见的 `reasoning.text`／`text`、`reasoning.summary`／`summary` 及 `id`、`index`、`format` 元数据；这里只估最终发送的可见表示，不据此推定隐藏推理保留量。full/new 对加密 details 需要下文完整原输出组事实；无法解释的 details 仍不可计量，密文分词不能证明输入上下文贡献。拒绝保留原历史、模型及路由；内联图片的 base64 在文本分词前替换为标记。三个基础版按[OpenAI 图像指南](https://developers.openai.com/api/docs/guides/images-vision)计 low（512 像素）、high（2048 像素且最多 2500 patches）、original／auto（按比例缩至最长边 65535 像素，再检查最多 30000 patches），使用 32 像素 patch 和 1.2 倍系数。首次像素尺寸缩放向下取整是本地估算约定，指南未指定该步的取整方向；之后的 patch 预算缩放遵循已给公式。OpenRouter／OpenAI 的私有 chat 格式仍使整请求结果只能标为 `estimated`。GIF 必须具有一个完整帧；动画或截断 GIF 不可计量。源图最长边超过 65535 像素时先按比例缩放估算，不把处理后尺寸上限误作源尺寸拒绝门。三个 GPT-5.6 Pro 型号把上述基础版图像规则作为**估算代理**复用：[精确 OpenRouter 型号页](https://openrouter.ai/openai/gpt-5.6-sol-pro)声明同一基础模型使用 pro 推理模式，与 [OpenAI 推理指南](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode)一致。这属于有来源的推论，不是 Pro 预处理实测或统一误差上界。算法 `openai-gpt-5.6-pro-base-image-proxy-1/response-calibration-1` 使旧纯文本计量基准失效。Pro 输入观测仍为 `scope_unknown`，每轮完整估算并应用配置余量；远程／非法／尺寸未知图片仍在发送前判不可用。下述已供 GPT-6 估算不证明真实 tokenizer。调用方逐次显式给出 `tokenMargin`；实际 usage 与费用只取上游。

三个 GPT-5.6 基础版现在使用 `openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1` 和 replay 修订 `openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2`。旧档案、meter 和锚不是新版本别名；该加密回放规则不适用于 Pro，其 `scope_unknown` 边界保持。仅在完整同源 reply 输出组按原序恰好一次回放到一个未改内容的 assistant wire 消息、O 已知、绑定/供应商/envelope 一致、details 为已识别的 `openai-responses-v1` 时，回放贡献估算为 **O + 0**，绝不再加 reasoning。[OpenAI 推理指南](https://developers.openai.com/api/docs/guides/reasoning)说明 GPT-5.6 默认跨轮保留推理；[OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)在省略 context 时采用模型默认值（2026-09-29 核对）。这是固定标准路由、只发 effort 或省略 reasoning 控制下的版本化适用推论，不是实测 effective mode。framing 净修正为零是预先冻结的实验假设，不是等式或上界；仍须实际后继 I 残差及 holdout 认证。余量只对 I + estimated 回放 + estimated 新增总量应用一次。此增量路径不对密文或稳定历史分词。

部分选择、重排、重复、修改或拆跨消息的组、未知 mode/format 或缺原来源／O 均不能使用合计 O。三个非 Pro 型号现共用一个完整组函数覆盖 full、φ、δ：full 为剩余可见输入加各完整组 O 一次；δ 只计 N 内剩余可见单位及其 O，稳定 P 和锚 G 不重复计量。前缀／basis 失效仍回退 full。原输入观察不可用时，完整原 O 可通过已有 `origin` 和不变输出事实继续参与；不补造来源或 I。

有限映射只允许同型号原 definition `6`／`mp4-12`、`7`／`mp4-16` 和当前 `8`／`mp4-17`，逐一检查已列 algorithm、tokenizer、replay、transform 与 projection。工厂仍只接受当前定义；解释保留的历史事实不等于旧实现别名。[适用账本](../../../.meta_harness/research/model-request-adaptation/vendor-continuation/openai/2026-09-29-complete-output-group-estimate.md)保留依据和未知。未知 basis、跨型号／Pro／GPT-6 来源和无依据 opaque 输入继续不可计量，历史不改。`tests/openai-output-history.spec.ts` 核 full／φ／δ 独立数字 oracle、无输入依据、有限原基准和非法来源；demo `openai-output-history-service.spec.ts` 用三轮持久本机 TLS 保留中间缺 I 的回复，再分别核旧锚复用和 envelope 改变后的 full。这些本机测试不证明真实零封装等式或通用误差上界。

`createOpenAiInputMeter(definition)` 将 GPT-6 Sol 修订 `5`／实现 `mp4-17` 绑定到 `js-tiktoken@1.0.21` 的 `o200k_base` 可见历史代理估算。支持单条 user、完整 system/developer/提醒历史、assistant 可见文本与明文 reasoning、完整配对工具调用／结果及工具 schema。Sol 新估算计入完整最终 JSON，包括实际发送的控制参数；接受已声明的 `none`／`low`／`medium`／`high`／`max` effort 及缺省，不补造上游默认。这是基于 Sol 自身 low-effort 文字观测的协议估算扩展，不证明 GPT-6 词表身份、私有 framing、误差上界或各 effort 已实机认证。[OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-mode) 区分执行模式与 effort；实现仍限定固定 OpenAI 路由的标准 Sol slug。调用方显式提供 `tokenMargin`。取得可用响应锚后，回放／新增贡献仅分词已核前缀之外的单元；JSON 边界差值仍是 `estimated`，规划器对合成量只施一次余量。前缀或计量依据改变时回退全量。不透明或未知推理仍明确不可用，不删历史。Luna 现采用下述 final-visible 后继，三份历史观测仍绑定原算法与坐标；Sol 不再另留未绑定候选工厂。实际 usage/cost 始终来自上游响应。

GPT-6 Sol 修订 `5`、Luna 修订 `6` 及 Sol/Luna Pro 修订 `5` 共用 `pi-ai:openai/mp4-17`。公共最终可见 JSON 估算器覆盖完整可见历史、system/developer 提醒、配对工具调用／结果、schema 和实际发送的各档已声明 effort。内联 PNG/JPEG/WebP 与完整单帧 GIF 使用按尺寸计算的**估算代理**：`ceil(ceil(width / 32) * ceil(height / 32) * 1.2)`，再加最终 JSON 的 `o200k_base` 计量；仅计量副本把图片字节替换为 `[image]`。公开 planner 不发送 detail；直接最终 body 计量只接受未指定／`auto`。这是一项有有限观测依据的家族代理，不是上游 Sol/Luna 预处理规则；不继承 Astra 缩放或 patch 上限，不按测试字节白名单供给，也不扣除观测残差。

四个算法为 `openai-gpt-6-{sol,luna,sol-pro,luna-pro}-final-visible-json-image-proxy-2/response-calibration-1`，不保留旧绑定／校准别名。profile 的逐图 4 MiB 仍精确检查；未知远端 URL、非法／MIME 不符图片、动画／不完整 GIF、未支持 detail 和 opaque 推理仍不可计量，不删除历史。显式 `tokenMargin` 作用于合成估算，上游 usage/cost 原样保留。基础型号可复用合法响应校准，只计新增图片／文字；Pro 因上游上下文统计范围未知而保持全量。当前 profile 的有限 token 上限及四种图片格式不变；样本尺寸是证据点，不成为新增产品白名单或误差上界。

[图片研究](../../../.meta_harness/research/openai-sol-luna-image-estimation/README.md) 保留六次基础型号图片请求和两次 Pro 双图请求的精确源／绑定哈希。基础型号观察为 `low` effort 合成 PNG；Pro 接受请求不验证上下文准确度。实现沿已接受 D-101 估算政策及调用方配置余量。运行 `pnpm --filter @omne-harness-lite/pi-ai-transport exec vitest run tests/openai-sol-luna-images.spec.ts --maxWorkers=1` 核通用尺寸、完整图片／历史／工具 wire、当前绑定、原计量与零 HTTP 准入失败；demo 的 `openai-sol-luna-images-service.spec.ts` 验证三轮持久组合及精确字节／token 拒绝。这些本机检查不认证所有真实格式／effort 或整型号 public/service 交付。

GPT-6 Astra 定义 revision `4`／`pi-ai:openai/mp4-17` 提供最终可见文本及内联 user 图片的 full/replay/new 估算。共享 patch 算法依据归档 [OpenAI 图像指南](https://developers.openai.com/api/docs/guides/images-vision)（2026-09-28，`image-doc.md` SHA256 `4936284cccfc38f22281d6a698b6f190ccc857849ea8dc533ed68617984b608d`）：32px patch × 1.2；`low` 最大边 512，`high` 最大边 65,535 且限 2,500 patch；`original`／`auto` 最大边 65,535，处理后超过 30,000 patch 拒绝。指南中的 4096×512 `high` 示例为 2,458 tokens。GPT-5.6 使用独立的 high 最大边 2,048，并保留现有来源尺寸支持边界。首次整数缩放采用已说明的本地下取整约定；供应商实际预处理及总协议封装仍属估算。

计量副本将内联图像数据替换为 `[image]`，每图视觉贡献只加一次；HTTP body、原历史、实际字节／图数门及上游 usage/cost 保持原值。当前 planner 按实际图像默认 detail 发送，不补造 wire detail；直接最终 body 计量也校验显式 detail。合法 PNG/JPEG/WebP 及完整单帧 GIF 共用 MIME／尺寸检查；未知 URL、MIME 不符、非法 base64、动画／不完整 GIF 和 opaque 推理仍不可计量。标准 Astra 使用其命名图像规则；单独修订的 Astra Pro 估算代理见下文。算法 `openai-gpt-6-astra-final-visible-json-o200k-patches-1/response-calibration-1` 与 replay 修订 `openai-gpt-6-astra-visible-image-units-json-net-estimated/1` 使先前纯文本校准失效，工厂拒绝 revision `2` / `mp4-8`。稳定图片历史不交给增量 tokenizer，新增图片沿同一尺寸规则计量；前缀图像变化回退全量，显式 `tokenMargin` 对合成估算只施一次。`tests/openai-astra-images.spec.ts` 核数值示例、限额、wire 不变、旧依据和前缀图片失效；demo 的 `openai-astra-images-service.spec.ts` 核真实认证三轮本机 TLS 调用。这些检查不认证真实 OpenRouter 图像接受、私有预处理、精确词表或普遍误差上界。

GPT-6 Astra Pro、Sol Pro、Luna Pro 共用最终可见 JSON／o200k 代理，保留各型号及证据身份、各自声明的 effort 集合。meter 返回 `estimated`，各自计费样本不充当上下文校准点或固定开销拟合依据；工具、提醒、可见明文推理及历史按实际序列化内容估算。Sol Pro／Luna Pro 图片及三款 Pro 的不透明推理暂无适用 meter，完整保留后拒绝；Astra Pro 图片估算代理见下文。官方工厂拒绝旧的无计量绑定。本次补齐本地发前计量供给，不代表逐型号实机认证或上游统计范围已明确；该 Pro 变更不改变上文标准 Sol/Luna 的计量范围。

`createAnthropicInputMeter(definition)` 仅绑定 `anthropic` 供应商下修订 3 的四个指定 Claude 5.x 定义。它使用固定的 [Anthropic 旧版 Claude BPE](https://github.com/anthropics/anthropic-tokenizer-typescript/tree/4d75e64d32fe5cd2b5a24d954242f9fab12e8b4b)；Anthropic 将其称为自 Claude 3 起的**非常粗略估算**。[Claude 4.7 及后续型号使用新 tokenizer](https://platform.claude.com/docs/en/build-with-claude/token-counting)，本构件不是那个 tokenizer，也没有统一误差上界。它先核完整最终 wire 值的一致性，再对承载输入的消息和工具投影估算，保留多轮文字、user 提醒、工具结果与明文推理。生成、路由和缓存控制值不增加提示词 token；合法 TTL 取自绑定路由声明。该 JSON 输入投影仍是对私有转换的粗略近似。用户及工具结果历史中的内联 PNG/JPEG/WebP/GIF 图片沿 Claude 4.7+ 文档的 28 像素视觉图块估算（2576 像素边长、4784 图块限制），请求中保留原始图片。加密或未知推理回放仍在发送前返回不可计量；密文字节长度不是保留推理 token 数的依据。四份定义绑定 `pi-ai:anthropic/mp4-17`。每次请求必须显式配置余量，逐型号真实认证还须对照上游 usage 与本粗估误差；估算及余量不替代实际上游 usage 或费用。

`createQwenInputMeter(definition)` 为八个固定 Alibaba 型号提供计量。两个开源权重叶仍采用固定公开词表/Jinja 全量估算：Qwen3.8 2.4T-A95B（`mp4-17`）和 27B（`mp4-17`），27B 保留既有不缩放内联 PNG 子集。六个商业叶（Max 0902、MaxPrime、3.8 Flash、3.7 Max／Plus／Flash）统一绑定 definition 修订 3／`mp4-17`，采用完整**可见最终 JSON** 估算器。以固定 Qwen 公开 tokenizer 为代理，计入实际请求中按序的 system/user/assistant/tool 消息、提醒、schema、调用参数/结果、可见推理和协议/缓存控制；保留空白及 schema 无损数值。这是在私有 OpenRouter/Alibaba framing 未公开条件下的估算，不声称各型号词表相同或 JSON 就是原生 prompt。旧单 user 的 `+51`／`0` 拟合不迁移到新表示。正常可见多轮已具备全量计量；非空增量仍回全量。商业叶的图片/视频、加密/未知推理及未知字段仍不可计量，拒绝不会删除历史。调用方显式配置余量，实际 usage/cost 始终保留上游事实。当前精确 binding 的真实 public/service holdout 及剩余声明模态仍是完整型号交付的待验门。

`createGlm52InputMeter(definition)` 与 `createGlm53InputMeter(definition)` 使用固定公开模板和词表，覆盖 GLM-5.2、GLM-5.3、GLM-5.3-Flash 的文本与工具请求。结果是固定 OpenRouter 路由的估算，调用方显式提供余量。历史推理、不支持的媒体及未证的 effort 映射返回不可用；`createZaiCommercialInputMeter(definition)` 分别将 Prime 的 `alibaba` 与 FlashX 的 `z-ai/fp8` 路由绑定到限定文本／工具粗估：固定公开 GLM-5.3 模板与词表投影减去一个 token，依据八次固定路由的拟合及独立留出观测。这不证明托管模型的词表身份、精确计费或误差上界。调用方显式给余量；历史推理、媒体、未验 effort 与不支持的缓存布局仍不可计量。各自上游许可随 tokenizer 原件打包，其中 GLM-5.3 使用独立许可。 Prime definition 3／`mp4-17` 沿同一公共模板识别已声明的请求 effort `low`／`high`／`max`，不重拟合一 token 修正；该 estimated 扩域尚无实际 effort 留出证据或托管模板保证。FlashX 保留 definition 2／`mp4-17`，不供给 effort。历史推理、不支持的媒体和未声明／畸形 effort 仍明确不可计量。

`createGoogleInputMeter(definition)` 绑定两个 Gemini 3.7／3.8 Flash AI Studio 定义 revision 3／`mp4-17`。它以固定 Gemma4 对照词表和冻结的逐型号偏置计入可见文本及工具，结果明确为粗略 `estimated`，调用方必须显式给余量。八次固定路由观测区分拟合与留出输入：样本中最多少估 10 token，最大绝对误差 60；这两个数都不是误差上界，也不是 Gemini 自身 tokenizer。已声明的请求 effort `low`／`medium`／`high` 作为生成控制被识别，不进入 messages/tools 代理计数；这是既有代理的输入域扩展，没有重拟合偏置，也不声称 effort 专属上游准确性。缺席仍不发送；其他值继续按定义原有规则丢弃。直接提交不支持的 effort 结构、媒体、不透明推理回放及未知控制字段仍不可计量，实际 effort 留出验证仍待完成。词表和许可随包提供给独立制品消费者。

`createXaiInputMeter(definition)` 为固定 xai 路由的 Grok 4.6／4.7（definition 3／`mp4-17`）提供可见文本／工具粗估：将第一方 Grok Build 的 UTF-8 字节算法投影到最终 wire，加上各型号仅用两个 fit 样本得出的偏移（4.6 为 141、4.7 为 1181 token）；独立工具历史 holdout 分别对完整输入高估 35、34 token。它不是精确 tokenizer 或可证明上界，调用方仍配置余量。完整上下文输入包含未缓存输入及缓存读／写两项，任一分项未知时总数未知。opaque reasoning 和媒体保持不可计量，不删除历史；完整模型认证仍未完成。已声明的 `low`／`medium`／`high` effort 进入完整 wire 估算；冻结偏置不是按 effort 单独拟合，本次扩域尚无实际 effort 留出证据。直接提交未声明或畸形 effort 仍不可计量。

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

`deepseekV4Pro0813Definition` 提供固定模型 `deepseek/deepseek-v4-pro-0813`、固定路由 `deepinfra/fp8` 的一个窄定义。它复用 OpenRouter 公共规划器和 DeepSeek 家族规则，完整实现坐标为 `pi-ai:deepseek / mp4-17`，定义修订为 `4`。导入不会注册模型、分配连接池或发送请求。

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

`src/input-meters/xai-candidate.ts` 中未绑定的 `createXaiHistoryCandidateInputMeter` 保持原 opaque 历史不变，按固定上游一方启发式估算已知 `xai-responses-v1` encrypted 项及可选的相邻 summary。四份冻结请求已做 planner 到本地 TLS 验证；未知 wrapper 或多 encrypted 项返回不可计量。真实回放和官方绑定仍待完成；此结果是需要调用者显式余量的估算，不是误差上界。

`ModelTransportService.diagnostics()` 无需取得 lease 即可读取底层实例的诊断投递 `failed`、`pending`、`dropped` 计数，关闭后仍可读取。`send` 与 `read` 可在末参接收本次请求专用 emitter，两个阶段由同一 emitter 持有；类型化事实不包含消息正文或凭据，工程身份不进入 HTTP。不同 emitter 的重绑定被拒绝。完整 runtime 调用接线与多会话验收仍须单独完成。

同一助手消息含同路由 opaque 推理块及额外独立的纯文本思考块时，当前规划返回 unavailable、零 HTTP，原历史不删不改。单块 opaque 与纯文本历史沿原路径及计量门处理。选定路由如何共同消费两种表示仍待核实；明确拒绝不代表已支持混合历史发送。

## 响应校准输入规划

`PlanInput.calibration` 和 `PlanInput.outputHistory` 均必填。没有前序响应的首次请求显式给 `{kind:'none',reason:'no_observation'}` 和 `[]`。后续输入锚传合法取得的原 `inputCalibration`、`usage`、完整保留的 `outputBlocks` 与 `replaySelection`。独立的 `outputHistory` 交出所有实际选入且输出组已知的较早响应，包括输入计数不可用的响应。每组保留原 route binding、provider、parameters 及实际存在的 serving provider／upstream model；按首个选入目标排序。缺失 `outputHistory` 是 malformed，planner 不默补 `[]`。selection 定位源块及当前消息/块，planner 核实际内容和最终投影覆盖，不接受 caller trust 开关。

`InputMeter` 破坏性改为 `measureFull`、`measureReplay`（φ）、`measureNew`（δ），并固定 tokenizer/replay/transform 修订；根入口可独立导入三操作以及 `projectInput`、`projectOutput`、`canonicalProjection`。有符号贡献按 I+φ+δ 合成，estimated 最终总量只应用一次 `tokenMargin`。`planned.measurement` 显式给 full/marginal、精度、贡献及来源/前缀/依据回退原因；实际 usage/cost 不混入预测。

`measureFull` 接收 `FullMeterInput`：实际最终 body／serialized、唯一最终 `InputProjection`、全部选入输出组及 `historySpans`。`measureReplay` 接收 `ReplayMeterInput`，包含原锚 `observation`、存在时与锚一致的历史组、绝对 `unitIndices` 与 `selectionSpans`。`measureNew` 接收 `NewMeterInput`，包含仅归 N 的绝对 `unitIndices`、当前 `countingBasis`、仅归 N 的完整组及其位置。history span 以组和 selection 索引标识来源，并给最终 unit 半开范围；多个块可以共享范围，但一个共享 unit 不能双计。planner 先复制、验证并深冻结各值；两个增量 unit 数组都不含稳定 P 正文。

公共 planner 在调用任何 meter 前核完全部组，沿同一个最终投影把每组归到稳定 P、锚回放 G 或新增 N。P 已由准确输入观察覆盖，不额外加 O；G 经 φ 只算一次；N 交 δ。组跨区域则转 full。没有可用输入观察时，full 仍收到所有合法组。部分、重复或改序选择必须有型号映射依据或全量计量，不能把 aggregate O 按块均分。独立 `measureFull(meter,input)` 对已知事实非法返回 `unavailable`；独立 `measureReplay`／`measureNew` 返回 `invalidInput`。无法识别的旧投影版本属于依据缺口，不冒判摘要错误。实际内容完整保留在发出 wire 中，最终 estimated 总量只应用一次配置余量。采用交接见 [runtime v19](../../../.meta_harness/design/realization/packages/model/model-request-runtime/v19-output-history-design.md) 与 [transport v13](../../../.meta_harness/design/realization/packages/model/pi-ai-transport/v13-output-history-design.md)。

Replay 实现可结合原组与实际选入关系读取 `input.observation.usage.output_tokens`，这不等于获准把该总量加到输入 tokens。整组判断必须核覆盖、源身份、目标实际顺序以及仅选入一次，不能依赖 selection 数组顺序。一个源块映射多个目标仍可合法存在，事实明确交出，不全局禁止；部分、重复、改序的组不能静默套整组公式。独立调用公开 `measureReplay(meter, input)` 时，调用者仍须提供合法来源与投影关系，TypeScript `readonly` 不认证来源。型号不能解释的关系保留 `invalidInput`／`unavailable` 及 planner 原有 full 回退路径。本接口没有新增任何型号的 I+O 规则。

四个 Anthropic 定义现为 revision 3 / `pi-ai:anthropic` `mp4-17`：非空 assistant/tool 文本从首轮起固定单 text 数组，仅精确支持的1h缓存控制从输入内容投影排除。发送体缓存标记、完整bytes/images检查仍保留，布局仍为last_message，未增加omne-next多断点。新修订首次full；稳定前缀以后只扫描/哈希，不重新分词。

Anthropic及适用OpenAI可见历史路径给新增回放/追加单元的JSON净贡献估算，减去估算表示中的空封装。它不是私有模板/BPE边界恒等证明，不从总output或ciphertext长度推算隐藏thinking。其余既有full meter保留原适用域；尚无依据的增量明确unavailable，未供给型号不补造。增量不可判回退full，full仍不可判则零HTTP拒绝，保留全部历史。

reader每个终态都交同一个累积器的 `readFacts`；解析即保存usage，后续坏帧或取消不抹掉已知I。完整prompt total不依赖伪造缓存零项；实际响应头 `X-OpenRouter-Cache-Status: HIT` 为response-cache不可用，不是输入零锚。重复累计事实不相加。取消停止并等待真实资源，只交已有事实，不等未来usage。

本地回归包括纯planner和实际TLS reader；37模型线上认证与完整runtime/service组合另验，本地通过不冒称上游路由认证。

### OpenAI Pro 输入观察范围

GPT-5.6 Sol/Terra/Luna Pro 使用定义 revision 7／`pi-ai:openai/mp4-17`；GPT-6 Astra Pro 使用定义 revision 5／`mp4-17`；GPT-6 Sol/Luna Pro 使用定义 revision 5／`mp4-17`。由于上游输入统计范围尚未确认，真实 usage/cost（包括部分未知项）原样保留，`observedInput` 为 `unavailable/scope_unknown`。缺失 usage、响应缓存命中和统计冲突继续优先沿原有具体分支处理；真实零值也不证明统计范围。规划阶段同时拒绝这些新贡献的历史锚及伪造的当前同形 known 锚。GPT-5.6 Pro 使用全量估算和配置余量准入；GPT-6 Pro 现通过官方工厂提供可见输入全量估算，每次施加显式余量；输入观察范围未知期间继续全量计量。

规划与 reader 共用私有固定规则，由实际已拥有的请求绑定选择；不新增公开信任开关或额外 I/O。新 Pro transform revision 为 `openrouter-input-transform/pro-scope-1`，该统计范围边界与所供估算算法修订分别约束。精确旧贡献身份仅在已有 lease 随 registry 退役协议排空时保留原捕获 reader 语义；默认官方表和工厂只供新身份。这不构成历史兼容入口，也不新增针对可信自定义完整代码贡献的全局禁入机制；其它可信贡献继承原 reader 前提，不因此取得新的上游统计范围认证。

### DeepSeek 有符号增量参考计量

Pro0813 修订 4 / `mp4-17` 与 Flash 修订 3 / `mp4-17` 在固定 `deepinfra/fp8` 上用已钉 public reference renderer 提供 full 与有符号 replay/new 估算。固定绑定识别 OpenRouter 的 `DeepInfra` 显示名；其他 provider/model 身份仍使锚失效。纯投影比较旧/新参考 prompt，不分词稳定历史；只有锚外片段和有限末端 assistant framing 进入增量 tokenizer。有 N 时由 δ 承担最终 framing 变化，否则由 φ 承担。锚内正文或 substantive reasoning 重写回退 full；密文长度不会使未知 opaque reasoning 获得增量支持。

`MarginalMeterInput.boundary` 是可选的 provider-owned 边界描述，在来源、前缀和 basis 校验后产生，不是调用者 trust 标志。DeepSeek 在拆分 G/N 之前保留实际顺序，计算有符号后缀差分，覆盖缺 usage 的多轮、user/tool 合并及空分支。φ 估算 P→P+G 后缀变化，δ 估算 P+G→实际最终顺序的变化，因此 δ 可以扣掉因后继 user 而排除的本次新增回放 reasoning；两者是估算净贡献，不是逐消息实测 token。独立后缀分词与 OpenRouter/DeepInfra 私有模板均仍为 **estimated**，不是精确值或上界；合成后只应用一次配置余量。本次不新增付费 serving 认证或缓存命中保证。完整请求 bytes/图片限制继续检查；完整线性序列化、参考渲染和 hash 仍然存在，稳定 P 不进入增量 tokenizer。

Flash 保留自身钉住的 renderer、tool result 排序、tokenizer 与 image span 公式；增量只加新图片 span，已在 prompt 中的占位 token 只扣一次。追加工具结果若重排了锚内实质内容，则回退 full。

GPT-6 Astra Pro 定义 revision `5`／`pi-ai:openai/mp4-17` 根据[精确同基础模型 Pro 模式身份](https://openrouter.ai/openai/gpt-6-astra-pro)，把命名 Astra 图像规则作为**估算代理**复用。算法 `openai-gpt-6-astra-pro-final-visible-json-o200k-image-proxy-1/response-calibration-1` 替换旧纯文本计量基准。它共享既有计数器，图片字节逐轮保留在真实请求中；由于上游输入范围仍为 `scope_unknown`，每次完整估算并应用显式余量。这不是真实 Pro 预处理实测。Sol/Luna 使用上文单独修订的经验估算代理。`tests/openai-pro-images.spec.ts` 覆盖这四个已提供图估算的 Pro 绑定、分型号 high 尺寸限制、原始 wire/accounts 与不支持输入；demo 服务测试验证三轮持久图像历史。

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
