# @omne-harness/pi-ai-anthropic 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包是 pi 传输的 Anthropic 家族。它给出 Anthropic 型号的记录、四个 hook 的规则、计量器、词表资源与官方档案，并经家族表把它们交给共享传输。所有型号都经 OpenRouter 请求。

本包依据下列已接受的正文：

- 家族贡献的取得协议归[组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)。家族表、网关引擎与夹具检查归 pi-ai-transport SPEC 的[家族表](../pi-ai-transport/SPEC.md#家族表)、[网关引擎：请求](../pi-ai-transport/SPEC.md#网关引擎请求)与[网关引擎：流解释](../pi-ai-transport/SPEC.md#网关引擎流解释)。本包只给数据、规则与计量，不改这些行为。
- 档案、参数采用、回放声明、回放投影、计量报告与 tokenizer 的形状与共同规则归 [model-contract SPEC](../model-contract/SPEC.md)。
- 文本计数归 [tokenizer-tiktoken](../tokenizer-tiktoken/SPEC.md)。本包传入 `resources/tokenizers/anthropic-legacy/claude.json` 的秩数据。
- 封存件的迁入范围归[迁移清单](../docs/migration.md)。迁入的数据与来源写在 [provenance.json](provenance.json)。

本包不做下列事情：

- 不发出请求，不读取凭据、环境或网络。只有 `anthropicTokenizerResources` 读取本包发布的 `claude.json`。
- 不读取媒体字节，不解码 data URL，不核验图片头或单帧 GIF。图片尺寸来自媒体计量事实。
- 不迁移封存件的冻结旧修订与费用解释。完整输出组计量与可选校准按 PanQiWei 2026-10-23 的决定（#466 revision 3）采用，形状按现行契约重写，见[计量](#计量)。

## 结果与不变量

<a id="记录"></a>
### 记录

`ANTHROPIC_RECORDS` 是本包唯一的型号清单。档案、采用、指纹与夹具都从它派生。

1. 每个型号一条 `current` 记录，`revision` 为 `1`。四个型号是 `anthropic/claude-opus-5.5`、`anthropic/claude-opus-5`、`anthropic/claude-sonnet-5` 与 `anthropic/claude-fable-5.1`。记录名等于 OpenRouter 路由名。路由为 `{ recipient: 'openrouter', model: <路由名> }`。
2. 记录是纯 JSON 数据。共用的线数据以常量展开。记录的采用由 `recordAdoption('@omne-harness/pi-ai-anthropic', record)` 算出。
3. 记录不得原地修改。行为或数据变化时，新增一个修订并把旧记录标为 `frozen`。`tests/fixtures/adoptions.json` 记录每条记录的摘要，原地修改使指纹测试失败。
4. 线数据：
   - `serving.order` 为 `['anthropic']`，`serving.reports` 为 `['Anthropic', 'anthropic']`；
   - 系统指令的角色是 `system`，提醒的角色是 `user`；内容为 `parts`，所有内容都写成部件数组；
   - 缓存为 `last-message`，`ttl` 为 `1h`；
   - 图片类型为 png、jpeg、webp 与 gif，`detail` 为 `auto`；
   - 每次请求写 `store: false`；收场之后最多接受 2 帧尾帧。
5. 参数：
   - `max-output-tokens` 受支持，上限 128000，写入 `max_tokens`，没有默认值；
   - `stop` 受支持，至多 16 项，每项至多 1024 个字符，写入 `stop`，没有默认值；
   - `reasoning-effort` 受支持，没有默认值。`low`、`medium`、`high` 与 `max` 原样写入 `reasoning.effort`。四个型号的 `none` 都是 `unsupported`：按[项目约定](../docs/architecture.md#厂商适配的内聚范围)，本包的记录不关闭推理。实测依据见本节末的“依据”；
   - `temperature`、`top-p`、`seed` 与两个 penalty 为 `unsupported`。封存件静默丢弃它们，现行行为是发出前明确失败。
6. 回放：声明取默认值，即 `produces` 为 `openrouter/<路由名>`，`accepts` 只含它自己，`foreignThinking` 为 `omit`。格式 `produces` 与 `accepts` 都是 `anthropic-claude-v1`。
7. 外来工具轮次：最后一个用过工具的 assistant 消息来自另一来源时，请求保持请求的推理强度，请求体写 `reasoning.effort`，encode 只对略去的外来状态给出 `replay-omitted` 诊断。封存件要求 `claude-opus-5.5` 与 `claude-fable-5.1` 有签名前缀，否则关闭推理。本包不迁入这项要求，因为按[项目约定](../docs/architecture.md#厂商适配的内聚范围)，本包的记录不关闭推理。实测依据见本节末的“依据”。
8. 档案数据：输入为文本与图片，输出为文本。窗口 1000000，输入 872000，输出 128000，单图 4194304 字节。四项的上游值都是未知：封存件引用的路由报告不在仓库中。

依据：第 5 条的 `none` 与第 7 条的外来工具轮次来自 2026-10-22 经代理对 OpenRouter 的实测，记录在 [#465 的实测记录](https://github.com/nemori-ai/omne-harness-lite/issues/465#issuecomment-6341479528)。实测结果如下：

- `claude-opus-5` 与 `claude-sonnet-5` 接受 `reasoning.enabled: false`（HTTP 200）。`claude-opus-5.5` 与 `claude-fable-5.1` 以 HTTP 400 拒绝它（“Reasoning is mandatory for this endpoint and cannot be disabled.”）。
- 历史中有未签名的外来工具轮次时，四个型号都在推理开启时接受请求。历史以工具结果结束或以之后的 user 消息结束，结果相同。

这些观察不改变上面的规则。持续验证不覆盖网关的这些行为，见[测试说明](tests/README.md#未覆盖)。

<a id="规则"></a>
### 规则

每条记录为四个 hook 各指名一条规则。规则名带修订号，规则表用 `satisfies` 检查，写错名字编译失败。改变一条规则的行为时，必须新增规则名，并让新修订的记录引用它。

| hook | 规则 | 行为 |
| --- | --- | --- |
| `reasoning` | `anthropic-signed-group/1` | 封存：一次响应的全部推理项是一组。每一项都可以回放时，整组是一个载荷：各项排序键 JSON 组成的数组，按到达顺序。可以回放的项是格式为 `anthropic-claude-v1`、`id` 缺失或为字符串或 `null`、`index` 缺失或为非负整数，并且满足下列之一的项：`reasoning.text` 有字符串 `text` 与非空 `signature`；`reasoning.encrypted` 的 `data` 非空且不是 `[REDACTED]`。组中有任何一项不可以回放，或组为空时，不产生载荷。回放见下文 |
| `usage` | `anthropic-usage/1` | `cache-read` 为 `prompt_tokens_details.cached_tokens`，`cache-write` 为 `prompt_tokens_details.cache_write_tokens`。`input` 为 prompt 减去缓存读与缓存写；某项缺失时为 `unknown`，不写零。余量为负时 `input` 为 `unknown`，并返回一条 `usage-inconsistent` 诊断，`field` 为 `input`。`output` 与 `reasoning` 取对应计数，缺失为 `unknown`。单位为 `token`，计数是十进制整数串 |
| `toolSchema` | `object-root/1` | 参数 schema 的根是对象时原样通过；其他时返回 `unsupported`，`field` 为 `argumentsSchema` |
| `check` | `none/1` | 没有跨字段规则，参数表与回放数据已写明全部规则 |

`anthropic-signed-group/1` 的回放 `replay(parts, thinking, source)`。`source` 由引擎给出：`continuable` 是本回放范围中可续接的消息，`foreign` 是 `foreignThinking` 为 `adapter` 的外来消息。

1. `parts` 非空：按部件顺序读出每个载荷的项，写回 `reasoning_details`。载荷不是一组可以回放的项时，返回 `invalid`，`field` 为 `reasoning_state`。原生思考不另写出，签名组已带有它。
2. `parts` 为空，`source` 为 `foreign`，`thinking` 中有非空文本：返回 `unsupported`，`field` 为 `thinking`，`adapter` 为记录采用。Anthropic 不接受未签名的思考，`adapter` 要求的写法不存在。
3. `parts` 为空，`source` 为 `continuable`：不写回放成员，思考不写出，请求照常发出。这种消息有思考但没有部件，例如流中的组不可以回放，或载荷过长而没有产生部件。Anthropic 没有未签名思考的原生写法。把思考写成文本会改变消息的含义；返回失败会使之后每次对同一型号的请求都失败。
4. `parts` 为空，`thinking` 为空或只有空文本：不写回放成员。

引擎的解码器在收场后调用 `usage` hook 一次，用它的结果形成账目报告与诊断事实，见 [pi-ai-transport SPEC“账目”](../pi-ai-transport/SPEC.md#账目)。

<a id="计量"></a>
### 计量

每条记录的计量器由 `createAnthropicMeter` 构造，`binding.counting` 等于 `binding.meter.basis`。计量器实现 `CalibratedInputMeter`：`measure(input)` 等于 `measureCalibrated(input, 空校准)`，一套算法两个入口。算术由 pi-ai-transport 的 [`calibratedAmount`](../pi-ai-transport/SPEC.md#校准算术) 共用，本包只给出哪个单元带推理状态、怎样计数、图片规则与方法名。

1. 表示采用：`<记录名>#representation`。`represent` 从引擎的投影写出 `anthropic-visible-json/1` 的 token 输入：`messages` 按线顺序，每条有 `role`、部件数组 `content`，以及需要时的 `tool_calls`、`tool_call_id` 与回放成员；`tools` 为函数工具。文本部件只留类型与文本，图片写成 `{ "type": "image_url", "image_url": { "url": "[image]" } }`，签名组只写数量。缓存标记不在 token 输入中。它同时写出 `units` 侧表：`messages` 的每个单元来自哪条消息，前置指令为 `null`，由同一列表构造，所以两者对齐。
2. `measureCalibrated` 按下列顺序，第一个失败即返回：
   1. 供应商不是本记录：`invalid`，`field` 为 `supplier`；
   2. 表示采用不是本记录的：`unsupported`，`field` 为 `representation`；
   3. 表示为 `pending-media`：`unsupported`，`field` 为 `representation.kind`；
   4. token 输入不是这个 schema：`invalid`，`field` 为 `tokenInput`；
   5. 带签名组的单元（带 `reasoning_details` 成员的单元；家族编解码器只为能回放的整组写出它，条件即封存件 `classifyAnthropicReasoning` 的整组条件：格式 `anthropic-claude-v1`，签名的 `reasoning.text` 或 `data` 非空且不是 `[REDACTED]` 的 `reasoning.encrypted`）需要来源的 O 而校准中没有它的条目：`unavailable`，诊断为 `signed-reasoning-not-countable`；条目为扣留：`unavailable`，诊断为扣留原因（`source-missing`、`source-unreadable`、`source-unavailable`、`ambiguous-dispatch`、`output-unknown`、`reasoning-exceeds-output`、`supplier-changed`）。签名组不分词，也不被去掉，不按零计。锚点命中时只有新增部分的签名组需要来源；
   6. token 输入中的图片数与 `media` 中图片事实数不同：`unavailable`，诊断为 `image-measurement-missing`；
   7. 某个图片事实的媒体类型不是 png、jpeg、webp 或 gif，或尺寸不是正的安全整数：`unsupported`，`field` 为 `image <序号>`；
   8. tokenizer 失败：`unavailable`，`dependency` 为 `tokenizer`。
   侧表与单元数不对齐、有锚点而没有侧表、锚点合计或 O 不是十进制整数时返回共用算术的 `invalid`。
3. 成功时，`input-tokens` 检查为 `estimate`，`marginSource` 为配置给出的采用，上限是 `context.input`，没有时为窗口减输出。特殊 token 字样按普通文本计：
   - 没有锚点：数额是 token 输入（带签名组的单元去掉）的排序键 JSON 经 NFKC 规范化后用 `claude.json` 计数，加上每张图片的规则数，再加每个被替换单元的来源 O；余量是数额乘以配置百分比再向上取整。`method` 为 `<记录名>#meter`；有单元被 O 替换时为 `<记录名>#meter+anthropic-complete-signed-encrypted-output-zero-framing-estimated/1`，沿用封存件的方法名。
   - 锚点命中：数额是锚点的真实输入合计加新增部分，新增部分是新增非签名单元按完整包络差的计数（包络去掉工具与前置指令，同样经 NFKC）加它们的图片规则数加新增签名单元的 O；余量只按新增部分算。`method` 加后缀 `+continuation-anchored/1`，两者都有时先输出组方法再锚点后缀。包络差为负时不命中，按没有锚点计量，`calibration.anchor` 为 `continuation-shrank`。
   - `calibration`：有锚点时写 `hit` 或 `continuation-shrank`；没有锚点时不写，准备租约补上它的判决。`inputDigest` 纳入锚点与各 O：换锚点就是换输入；空校准的摘要与没有校准时相同。
   档案的 `image-bytes`、`image-count` 与 `request-bytes` 限额各给出 `exact` 检查。报告为 `complete`。O 估算是与工作量相关的代理，不是精确占用，也不是上界；首份实测差值归 #466 的 C9。
4. `claude.json` 是 Anthropic 发布的旧 Claude BPE。Anthropic 称它对 Claude 3 以后的型号只是很粗的近似，它不是这些型号的 tokenizer。所以结果始终是估算，不声称 tokenizer 身份。
5. 图片规则 `claude-patch-28/1`：两边都不超过 2576 像素且 `ceil(w/28) × ceil(h/28)` 不超过 4784 时，数额就是这个积。否则保持宽高比，二分查找满足两项限制的最大长边，短边取四舍五入且至少为 1，数额为缩放后尺寸的块数。尺寸不是正的安全整数时规则不适用。

<a id="词表资源"></a>
### 词表资源

`anthropicTokenizerResources()` 读取本包发布的 `resources/tokenizers/anthropic-legacy/claude.json`，返回 `TiktokenResources`：

1. 文件字节的 SHA-256 必须等于 `58dad83d85e9cd57be209172449ebfbc395df2b455c11fe8b7e5b661e6f462ad`。不等时抛出 `TokenizerResourceError`，不换文件，不用其他词表。
2. 文件必须是带字符串 `pat_str`、字符串 `bpe_ranks` 与特殊 token 表的对象，特殊 token 的值是非负安全整数。不符时抛出 `TokenizerResourceError`。
3. `definition` 是记录指名的 tokenizer 定义。`ranks` 是文件的秩数据，`specialTokens` 为空表：计量只数可见文本，不经显式段使用特殊 token。
4. 每次调用都读文件并核对摘要。装配方调用一次，把结果放进家族配置。

文件的来源、许可证与摘要写在 `resources/tokenizers/anthropic-legacy/provenance.json` 与 [provenance.json](provenance.json)。

<a id="官方档案"></a>
### 官方档案

`officialAnthropicProfiles({ retryPolicy, compactionTriggerPercent })` 为每条 `current` 记录给出一份 `ModelProfileDefinition`，按记录顺序。它只做计算，不取得绑定。

- 供应商为记录的采用、路由与回放声明。`fallback` 为 `false`。`parameters` 为空。
- 三项 token 上限与图片限额来自记录。上游值都是 `unknown`。
- `representation` 与 `meter` 为 `<记录名>#representation` 与 `<记录名>#meter`。
- `retryPolicy` 是 Model 的策略，`compactionTriggerPercent` 是档案的配置项，二者都由装配传入。百分比不是 1 至 100 的十进制整数时，函数抛出 `RangeError`。

<a id="家族与取得"></a>
### 家族与取得

`createAnthropicFamily({ tokenizer, limits, margin })` 返回 `PiFamily`。它只做计算，不创建 tokenizer。`margin.percent` 不是非负十进制整数，或某一项不是对象时，它抛出 `RangeError`。

家族的 `acquire(record, supplier, signal)` 按下列顺序进行：

1. 配置的 tokenizer 定义与记录的不同：`unavailable`，诊断为 `tokenizer-definition-mismatch`。
2. 第一次取得时初始化 tokenizer，之后复用同一结果。初始化失败：`unavailable`，诊断为 `tokenizer-<失败种类>`。
3. `signal` 已中止：`unavailable`，诊断为 `cancelled`。
4. 用 `bindChatCompletions` 构造绑定并返回。

所有失败的 `dependency` 为 `@omne-harness/pi-ai-anthropic`。精确采用的查找、路由核对与绑定核对归家族表。

## 所有权、失败与生命周期

- 记录是模块常量，家族表保存冻结副本。
- 词表资源由装配方读取一次，归家族配置。家族不读文件。
- tokenizer 由家族在第一次取得时创建，归该家族。tokenizer 没有需要释放的资源，所以绑定的 `release` 不释放任何东西，重复调用返回同一结果。
- 规则、计量、`represent` 与 `measure` 都是纯计算，不读环境、秘密、网络或文件。
- 契约规定失败值的边界（`acquire`、`plan`、`encode`、`measure`、hook）返回闭合失败；`createAnthropicFamily` 与 `officialAnthropicProfiles` 对不可用的配置抛出 `RangeError`；`anthropicTokenizerResources` 对不符的文件抛出 `TokenizerResourceError`；引擎对记录缺陷抛出的 `RangeError` 原样传出。

## 组合与验证

本包消费 model-contract、pi-ai-transport 的根入口与 `./chat-completions`、tokenizer-tiktoken、json-text 与 operation-result。它不导入其他家族包。js-tiktoken、`@omne-harness/pi-ai-openai`、`@omne-harness/model`、`@omne-harness/stream-arrival` 与 `@omne-harness/message` 只是开发依赖，供测试与示例使用。

每项义务的持续验证见 [tests/README.md](tests/README.md)：

| 义务 | 验证 | 前提与未覆盖 |
| --- | --- | --- |
| [记录](#记录)的迁入事实与线数据 | `records.spec.ts`、`adoptions.spec.ts` | 型号清单与封存件逐项比较；每条记录的推理强度 `none` 都是 `unsupported` |
| [规则](#规则) | `rules.spec.ts`、`cross-family-replay.spec.ts` | `usage` 直接调用；经引擎形成的账目与诊断事实由回放夹具核对 |
| [计量](#计量) | `meter.spec.ts`、`calibration.spec.ts` | 图片规则用封存件的金值；带图片事实的表示由测试构造。校准经 `@omne-harness/model` 的真实准备租约与 `composeFamilies` 组合，表示来自真实 `rules.plan`，存储端口是 `dispatches` 替身；期望数额用 `claude.json` 在用例里算出 |
| [词表资源](#词表资源) | `meter.spec.ts` | 经 tokenizer-tiktoken 的计数与 @anthropic-ai/tokenizer 0.0.4 的参考值 150 相等 |
| [官方档案](#官方档案) | `profiles.spec.ts` | 每份档案的供应商都能取得绑定并规划请求 |
| [家族与取得](#家族与取得) | `family.spec.ts`、`plan.spec.ts` | — |
| 回放夹具与封存件逐条一致 | `fixtures.spec.ts` 与 [tests/fixtures](tests/fixtures/README.md) | 有意不同逐条列在夹具 README |
| 跨家族回放（Anthropic 一侧），外来工具轮次之后保持推理强度 | `cross-family-replay.spec.ts` | 历史用纯数据构造，不导入 OpenAI 家族 |
| 两个家族经共享传输与本地 HTTPS 服务发送每条记录的夹具；符合性套件 transport 组 | `two-families.spec.ts`（慢层） | 两家经同一 `composeFamilies` 与 `createPiTransport`；本地服务回放夹具，不是真实网关 |
| 示例经代理请求一个型号，以及跨家族的四轮历史 | `examples.spec.ts`（慢层）运行 [examples/](examples/README.md) 中的两个示例 | 只在 `OMNE_LIVE_TESTS=1` 时运行，否则跳过 |

未覆盖：

- 真实路由的持续验证与凭据解析归 #466。示例的实跑只在手动设置开关时有证据。
- 网关对 `max` 的接受、对 `reasoning.enabled: false` 的处理，以及在推理开启时对外来工具轮次的接受，只有经代理的手工确认，不在持续验证中。图片部件的 `detail` 成员与空 assistant 内容 `[]` 只由示例在手动运行时发出，不在持续验证中。
- 网关在有 id 的片段上分开签名的情况没有实测样本。引擎按封存件的规则拼接同 id 的片段，夹具只用手写的合成片段检查这个情况。
