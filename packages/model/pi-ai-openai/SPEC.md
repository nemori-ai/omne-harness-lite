# @omne-harness/pi-ai-openai 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包是 pi 传输的 OpenAI 家族。它给出 OpenAI 型号的记录、四个 hook 的规则、计量器与官方档案，并经家族表把它们交给共享传输。所有型号都经 OpenRouter 请求。

本包依据下列已接受的正文：

- 家族贡献的取得协议归[组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)。家族表、网关引擎与夹具检查归 pi-ai-transport SPEC 的[家族表](../pi-ai-transport/SPEC.md#家族表)、[网关引擎：请求](../pi-ai-transport/SPEC.md#网关引擎请求)与[网关引擎：流解释](../pi-ai-transport/SPEC.md#网关引擎流解释)。本包只给数据、规则与计量，不改这些行为。
- 档案、参数采用、回放声明、计量报告与 tokenizer 的形状与共同规则归 [model-contract SPEC](../model-contract/SPEC.md)。
- 文本计数归 [tokenizer-tiktoken](../tokenizer-tiktoken/SPEC.md)。本包传入 js-tiktoken 自带的 `o200k_base` 秩数据。
- 封存件的迁入范围归[迁移清单](../docs/migration.md)。迁入的数据与来源写在 [provenance.json](provenance.json)。

本包不做下列事情：

- 不发出请求，不读取凭据、环境、文件或网络。
- 不读取媒体字节，不解码 data URL，不核验单帧 GIF。图片尺寸来自媒体计量事实。
- 不迁移封存件的冻结旧修订与费用解释。完整输出组计量与可选校准的方法来自封存件，形状按现行契约重写，见[计量](#计量)。采用依据记在[迁移清单“本线的请求计量”](../docs/migration.md#本线的请求计量)。

## 结果与不变量

<a id="记录"></a>
### 记录

`OPENAI_RECORDS` 是本包唯一的型号清单。档案、采用、指纹与夹具都从它派生。

1. 每个型号一条 `current` 记录，`revision` 为 `1`。记录名等于 OpenRouter 路由名，例如 `openai/gpt-6-astra`。路由为 `{ recipient: 'openrouter', model: <路由名> }`。
2. 记录是纯 JSON 数据。共用的线数据以常量展开。记录的采用由 `recordAdoption('@omne-harness/pi-ai-openai', record)` 算出。
3. 记录不得原地修改。行为或数据变化时，新增一个修订并把旧记录标为 `frozen`。`tests/fixtures/adoptions.json` 记录每条记录的摘要，原地修改使指纹测试失败。
4. 线数据：
   - `serving.order` 为 `['openai']`，`serving.reports` 为 `['OpenAI', 'openai']`；
   - 系统指令（`SystemMessage`）的角色是 `system`，提醒（`SystemReminderMessage`）的角色是 `developer`；内容为 `compact`；不加缓存标记；
   - 图片类型为 png、jpeg、webp 与 gif，`detail` 为 `auto`；
   - 每次请求写 `store: false`；收场之后最多接受 2 帧尾帧。
5. 参数：
   - `max-output-tokens` 受支持，上限 128000，写入 `max_tokens`，没有默认值；
   - `reasoning-effort` 受支持，没有默认值。每个受支持的值原样写入 `reasoning.effort`，与封存件相同。每条记录支持 `low`、`medium`、`high` 与 `max`。`none` 在每条记录中为 `unsupported`：网关把 `none` 理解为关闭推理，而按[项目约定](../docs/architecture.md#厂商适配的内聚范围)，本包的记录不关闭推理。封存件中标准型号公布 `none`，Astra 的两个型号不公布 `none`；
   - `temperature`、`top-p`、`stop`、`seed` 与两个 penalty 为 `unsupported`。封存件静默丢弃它们，现行行为是发出前明确失败。
6. 回放：声明取默认值，即 `produces` 为 `openrouter/<路由名>`，`accepts` 只含它自己，`foreignThinking` 为 `omit`。格式 `produces` 与 `accepts` 都是 `openai-responses-v1`。外来工具轮次不能接续时，请求保持请求的推理强度。
7. 档案数据：输入为文本与图片，输出为文本。窗口 1050000，输入 922000，输出 128000，三项的上游值为有限值，证据是记录中的 `profile.evidence`。单图 4194304 字节，上游值未知。

<a id="规则"></a>
### 规则

每条记录为四个 hook 各指名一条规则。规则名带修订号，规则表用 `satisfies` 检查，写错名字编译失败。改变一条规则的行为时，必须新增规则名，并让新修订的记录引用它。

| hook | 规则 | 行为 |
| --- | --- | --- |
| `reasoning` | `openai-encrypted/1` | 封存：`reasoning.encrypted` 项、格式为 `openai-responses-v1`、`data` 非空且不是 `[REDACTED]` 时，每项一个载荷；载荷是该项的排序键 JSON。其他项不成为状态。回放：可续接消息的部件按部件顺序写回 `reasoning_details`；载荷不是这样的一项时返回 `invalid`（`field` 为 `reasoning_state`）。有部件时原生思考不写出。没有部件时，思考连接后写成 `reasoning`，可续接消息的原生思考与 `adapter` 规则下的外来思考都如此（`source` 不影响结果） |
| `reasoning` | `none/1` | 没有编解码器。当前没有记录使用 |
| `usage` | `openai-usage/1` | `input` 为 prompt 减去缓存读与缓存写；某项缺失时为 `unknown`，不写零。余量为负时 `input` 为 `unknown`，并返回一条 `usage-inconsistent` 诊断，`field` 为 `input`。`output`、`cache-read`、`cache-write`、`reasoning` 取对应计数，缺失为 `unknown`。单位为 `token`，计数是十进制整数串 |
| `usage` | `unknown-scope/1` | 同上，但 `input` 恒为 `unknown`：6 个 Pro 型号的 prompt 统计范围未知。余量为负时仍返回同一条诊断 |
| `toolSchema` | `object-root/1` | 参数 schema 的根是对象时原样通过；其他时返回 `unsupported`，`field` 为 `argumentsSchema` |
| `check` | `none/1` | 没有跨字段规则，参数表已写明全部规则 |

引擎的解码器在收场后调用 `usage` hook 一次，用它的结果形成账目报告与诊断事实，见 [pi-ai-transport SPEC“账目”](../pi-ai-transport/SPEC.md#账目)。

<a id="计量"></a>
### 计量

每条记录的计量器由 `createOpenAiMeter` 构造，`binding.counting` 等于 `binding.meter.basis`。计量器实现 `CalibratedInputMeter`：`measure(input)` 等于 `measureCalibrated(input, 空校准)`，一套算法两个入口。算术由 pi-ai-transport 的 [`calibratedAmount`](../pi-ai-transport/SPEC.md#校准算术) 共用。计量器外壳由 pi-ai-transport 的[共用计量规则](../pi-ai-transport/SPEC.md#共用计量规则)给出：核对供应商与表示采用，拒绝待定媒体，调用共用算术，组装预算（方法名的拼接、输入摘要、单元追加 token 的求和）。本包只给出家族自己的部分：内容提取（哪个单元带推理状态、怎样计数）、图片规则、owner、输出组方法名，以及不可计数时的诊断名。

1. 表示采用：`<记录名>#representation`。`represent` 从引擎的投影写出 `openai-visible-json/1` 的 token 输入：消息按线顺序；文本、工具调用与工具结果保留；图片只留类型与 `detail`；推理写 `reasoning` 文本，加密项只写数量；工具与参数采用一并写入。它同时写出 `units` 侧表：`messages` 的每个单元来自哪条消息，前置指令为 `null`，由同一列表构造，所以两者对齐。
2. `measureCalibrated` 按下列顺序，第一个失败即返回：
   1. 供应商不是本记录：`invalid`，`field` 为 `supplier`；
   2. 表示采用不是本记录的：`unsupported`，`field` 为 `representation`；
   3. 表示为 `pending-media`：`unsupported`，`field` 为 `representation.kind`；
   4. token 输入不是这个 schema：`invalid`，`field` 为 `tokenInput`；
   5. 带推理状态的单元需要来源的 O 时，按校准中它的条目判断：
      - 带推理状态的单元是带 `reasoning_details` 成员的单元。家族编解码器只为能回放的整组写出这个成员，条件即封存件 `classifyOpenAiDetail` 的整组条件：`reasoning.encrypted`、格式 `openai-responses-v1`、`data` 非空且不是 `[REDACTED]`。
      - 校准中没有它的条目：`unavailable`，诊断为 `encrypted-reasoning-not-countable`。
      - 条目为扣留：`unavailable`，诊断为扣留原因。原因有 `source-missing`、`source-unreadable`、`source-unavailable`、`ambiguous-dispatch`、`output-unknown`、`reasoning-exceeds-output` 与 `supplier-changed`，条件见 model-contract 的[来源扣留的原因](../model-contract/SPEC.md#来源扣留的原因)。
      - 锚点命中时，只有新增部分的推理单元需要来源。
      - 密文不分词，也不被去掉，不按零计。
   6. token 输入中的图片数与 `media` 中图片事实数不同：`unavailable`，诊断为 `image-measurement-missing`；
   7. 记录的图片规则不覆盖某张图片：`unsupported`，`field` 为 `image <序号>`；
   8. tokenizer 失败：`unavailable`，`dependency` 为 `tokenizer`。
   侧表与单元数不对齐、有锚点而没有侧表、锚点合计或 O 不是十进制整数时返回共用算术的 `invalid`。
3. 成功时，`input-tokens` 检查为 `estimate`，`marginSource` 为配置给出的采用，上限是 `context.input`，没有时为窗口减输出：
   - 没有锚点：数额是 token 输入（带推理状态的单元去掉）的排序键 JSON 经 o200k 计数，加上每张图片的规则数，再加每个被替换单元的来源 O；余量是数额乘以配置百分比再向上取整。`method` 为 `<记录名>#meter`；本包的输出组方法名是 `openai-complete-output-group-workload-estimated/1`，沿用封存件的方法名。后缀按[共用计量规则](../pi-ai-transport/SPEC.md#共用计量规则)拼接：有单元被 O 替换时为 `<记录名>#meter+openai-complete-output-group-workload-estimated/1`。
   - 锚点命中：数额是锚点的真实输入合计加新增部分，新增部分按共用[校准算术](../pi-ai-transport/SPEC.md#校准算术)的两个计数项计算，计数用 o200k，加新增的可见单元的图片规则数，加新增推理单元的 O。余量只按新增部分算。`method` 按共用计量规则加后缀 `+continuation-anchored/1`，两者都有时先输出组方法再锚点后缀。包络差为负时不命中，按没有锚点计量，`calibration.anchor` 为 `continuation-shrank`。
   - `calibration`：有锚点时写 `hit` 或 `continuation-shrank`；没有锚点时不写，准备租约补上它的判决。`inputDigest` 按共用计量规则计算：它纳入锚点与各 O，换锚点就是换输入；空校准的摘要与没有校准时相同。
   档案的 `image-bytes`、`image-count` 与 `request-bytes` 限额各给出 `exact` 检查。报告为 `complete`。O 估算是与工作量相关的代理，不是精确占用，也不是上界。实测一次延续请求（`openai/gpt-5.6-sol`，锚点命中）：发送前计量 151，真实输入合计 141，差（真实输入合计减计量）为 −10，计量偏大。Anthropic 家族的实测同样偏大，见 [pi-ai-anthropic SPEC“计量”](../pi-ai-anthropic/SPEC.md#计量)。这两个值由 model-host-local 的 [recording-c9.spec.ts](../model-host-local/tests/recording-c9.spec.ts) 用[pi-ai-transport 的回放件](../pi-ai-transport/tests/fixtures/README.md)复算，差值只记录，不是门槛。
4. o200k 是代理编码：OpenAI 的 tiktoken 表只把 gpt-5* 映射到 o200k_base，没有 GPT-6。所以结果始终是估算，不声称 tokenizer 身份。
5. 三条图片规则：

| 规则 | 行为 |
| --- | --- |
| `gpt56-patch/1` | 长边先缩放到 `low` 512、`high` 2048、其他 65535（向下取整）。`high` 超过 2500 块时再缩小。处理后超过 30000 块时不适用。数额为 `ceil(块数 × 6 / 5)` |
| `astra-patch/1` | 同上，`high` 的长边为 65535 |
| `sol-luna-auto-proxy/1` | 只接受 `auto`。按原始尺寸，`ceil(ceil(w/32) × ceil(h/32) × 6 / 5)`。超出安全整数时不适用 |

<a id="官方档案"></a>
### 官方档案

`officialOpenAiProfiles({ retryPolicy, compactionTriggerPercent })` 为每条 `current` 记录给出一份 `ModelProfileDefinition`，按记录顺序。它只做计算，不取得绑定。

- 供应商为记录的采用、路由与回放声明。`fallback` 为 `false`。`parameters` 为空。
- 三项 token 上限与图片限额来自记录。有限上游值的来源为 `<记录名>#evidence`。
- `representation` 与 `meter` 为 `<记录名>#representation` 与 `<记录名>#meter`。
- `retryPolicy` 是 Model 的策略，`compactionTriggerPercent` 是档案的配置项，二者都由装配传入。百分比不是 1 至 100 的十进制整数时，函数抛出 `RangeError`。

<a id="家族与取得"></a>
### 家族与取得

`createOpenAiFamily({ tokenizer, limits, margin })` 返回 `PiFamily`。它只做计算，不创建 tokenizer。`margin.percent` 不是非负十进制整数，或某一项不是对象时，它抛出 `RangeError`。

家族的 `acquire(record, supplier, signal)` 按下列顺序进行：

1. 配置的 tokenizer 定义与记录的不同：`unavailable`，诊断为 `tokenizer-definition-mismatch`。
2. 第一次取得时初始化 tokenizer，之后复用同一结果。初始化失败：`unavailable`，诊断为 `tokenizer-<失败种类>`。
3. `signal` 已中止：`unavailable`，诊断为 `cancelled`。
4. 用 `bindChatCompletions` 构造绑定并返回。

所有失败的 `dependency` 为 `@omne-harness/pi-ai-openai`。精确采用的查找、路由核对与绑定核对归家族表。

## 所有权、失败与生命周期

- 记录是模块常量，家族表保存冻结副本。
- tokenizer 由家族在第一次取得时创建，归该家族。tokenizer 没有需要释放的资源，所以绑定的 `release` 不释放任何东西，重复调用返回同一结果。
- 规则、计量、`represent` 与 `measure` 都是纯计算，不读环境、秘密、网络或文件。
- 契约规定失败值的边界（`acquire`、`plan`、`encode`、`measure`、hook）返回闭合失败；`createOpenAiFamily` 与 `officialOpenAiProfiles` 对不可用的配置抛出 `RangeError`；引擎对记录缺陷抛出的 `RangeError` 原样传出。

## 组合与验证

本包消费 model-contract、pi-ai-transport 的根入口与 `./chat-completions`、tokenizer-tiktoken、json-text、operation-result，以及 js-tiktoken 的 `ranks/o200k_base`。它不导入其他家族包。

每项义务的持续验证见 [tests/README.md](tests/README.md)：

| 义务 | 验证 | 前提与未覆盖 |
| --- | --- | --- |
| [记录](#记录)的迁入事实与线数据 | `records.spec.ts`、`adoptions.spec.ts` | 与封存件的表逐项比较 |
| [规则](#规则) | `rules.spec.ts` | `usage` 直接调用；经引擎形成的账目事实由回放夹具核对 |
| [计量](#计量) | `meter.spec.ts`、`calibration.spec.ts` | 图片规则用封存件的金值；带图片事实的表示由测试构造。校准经 `@omne-harness/model` 的真实准备租约与 `composeFamilies` 组合，表示来自真实 `rules.plan`，存储端口是 `dispatches` 替身；期望数额用 o200k 在用例里算出 |
| [官方档案](#官方档案) | `profiles.spec.ts` | 每份档案的供应商都能取得绑定并规划请求 |
| [家族与取得](#家族与取得) | `family.spec.ts`、`plan.spec.ts` | — |
| 回放夹具与封存件逐条一致 | `fixtures.spec.ts` 与 [tests/fixtures](tests/fixtures/README.md) | 有意不同逐条列在夹具 README |
| 跨家族回放（OpenAI 一侧） | `cross-family-replay.spec.ts` | 历史用纯数据构造，不导入 Anthropic 家族 |
| 经共享传输与本地 HTTPS 服务发送每条记录的夹具；符合性套件 transport 组 | `pi-ai-anthropic` 的 `two-families.spec.ts`（慢层） | 两家经同一 `composeFamilies` 与 `createPiTransport`；本地服务回放夹具，不是真实网关 |
| 示例经代理请求一个型号 | `examples.spec.ts`（慢层）运行 [examples/openai-request.ts](examples/openai-request.ts) | 只在 `OMNE_LIVE_TESTS=1` 时运行，否则跳过 |

未覆盖：

- 真实路由的发送只经 model-host-local 的手动录制器验证。持续验证只回放录下的[pi-ai-transport 的回放件](../pi-ai-transport/tests/fixtures/README.md)，不发出真实请求。示例的实跑只在手动设置开关时有证据。
- 夹具中没有余量为负的 usage，所以 `usage-inconsistent` 诊断只经直接调用验证。
- 网关对 `max` 的接受只有一次经代理的手工确认，不在持续验证中。
