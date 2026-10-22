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
- 不迁移封存件的冻结旧修订、完整输出组计量、可选校准与费用解释。

## 结果与不变量

<a id="记录"></a>
### 记录

`OPENAI_RECORDS` 是本包唯一的型号清单。档案、采用、指纹与夹具都从它派生。

1. 每个型号一条 `current` 记录，`revision` 为 `1`。记录名等于 OpenRouter 路由名，例如 `openai/gpt-6-astra`。路由为 `{ recipient: 'openrouter', model: <路由名> }`。
2. 记录是纯 JSON 数据。共用的线数据以常量展开。记录的采用由 `recordAdoption('@omne-harness/pi-ai-openai', record)` 算出。
3. 记录不得原地修改。行为或数据变化时，新增一个修订并把旧记录标为 `frozen`。`tests/fixtures/adoptions.json` 记录每条记录的摘要，原地修改使指纹测试失败。
4. 线数据：
   - `serving.order` 为 `['openai']`，`serving.reports` 为 `['OpenAI', 'openai']`；
   - 系统指令与提醒的角色都是 `developer`；内容为 `compact`；不加缓存标记；
   - 图片类型为 png、jpeg、webp 与 gif，`detail` 为 `auto`；
   - 每次请求写 `store: false`；收场之后最多接受 2 帧尾帧。
5. 参数：
   - `max-output-tokens` 受支持，上限 128000，写入 `max_tokens`，没有默认值；
   - `reasoning-effort` 的 `low`、`medium`、`high` 受支持，写入 `reasoning.effort`，没有默认值；
   - `reasoning-effort` 的 `none` 与 `max` 为 `unsupported`。引擎的网关词表没有这两个强度值，本包不写其他值代替；
   - `temperature`、`top-p`、`stop`、`seed` 与两个 penalty 为 `unsupported`。封存件静默丢弃它们，现行行为是发出前明确失败。
6. 回放：声明取默认值，即 `produces` 为 `openrouter/<路由名>`，`accepts` 只含它自己，`foreignThinking` 为 `omit`。格式 `produces` 与 `accepts` 都是 `openai-responses-v1`。没有前缀要求。
7. 档案数据：输入为文本与图片，输出为文本。窗口 1050000，输入 922000，输出 128000，三项的上游值为有限值，证据是记录中的 `profile.evidence`。单图 4194304 字节，上游值未知。

<a id="规则"></a>
### 规则

每条记录为四个 hook 各指名一条规则。规则名带修订号，规则表用 `satisfies` 检查，写错名字编译失败。改变一条规则的行为时，必须新增规则名，并让新修订的记录引用它。

| hook | 规则 | 行为 |
| --- | --- | --- |
| `reasoning` | `openai-encrypted/1` | 封存：`reasoning.encrypted` 项、格式为 `openai-responses-v1`、`data` 非空且不是 `[REDACTED]` 时，每项一个载荷；载荷是该项的排序键 JSON。其他项不成为状态。回放：可续接消息的部件按部件顺序写回 `reasoning_details`；载荷不是这样的一项时返回 `invalid`（`field` 为 `reasoning_state`）。有部件时原生思考不写出。没有部件时，原生思考连接后写成 `reasoning` |
| `reasoning` | `none/1` | 没有编解码器。当前没有记录使用 |
| `usage` | `openai-usage/1` | `input` 为 prompt 减去缓存读与缓存写；余量为负或某项缺失时为 `unknown`，不写零。`output`、`cache-read`、`cache-write`、`reasoning` 取对应计数，缺失为 `unknown`。单位为 `token`，计数是十进制整数串 |
| `usage` | `unknown-scope/1` | 同上，但 `input` 恒为 `unknown`：6 个 Pro 型号的 prompt 统计范围未知 |
| `toolSchema` | `object-root/1` | 参数 schema 的根是对象时原样通过；其他时返回 `unsupported`，`field` 为 `argumentsSchema` |
| `check` | `none/1` | 没有跨字段规则，参数表已写明全部规则 |

`usage` hook 当前不被引擎调用，见 [pi-ai-transport SPEC“账目”](../pi-ai-transport/SPEC.md#账目)。

<a id="计量"></a>
### 计量

每条记录的计量器由 `createOpenAiMeter` 构造，`binding.counting` 等于 `binding.meter.basis`。

1. 表示采用：`<记录名>#representation`。`represent` 从引擎的投影写出 `openai-visible-json/1` 的 token 输入：消息按线顺序；文本、工具调用与工具结果保留；图片只留类型与 `detail`；推理写 `reasoning` 文本，加密项只写数量；工具与参数采用一并写入。
2. `measure` 按下列顺序，第一个失败即返回：
   1. 供应商不是本记录：`invalid`，`field` 为 `supplier`；
   2. 表示采用不是本记录的：`unsupported`，`field` 为 `representation`；
   3. 表示为 `pending-media`：`unsupported`，`field` 为 `representation.kind`；
   4. token 输入不是这个 schema：`invalid`，`field` 为 `tokenInput`；
   5. 有加密推理：`unavailable`，诊断为 `encrypted-reasoning-not-countable`。密文不分词，也不被去掉；
   6. token 输入中的图片数与 `media` 中图片事实数不同：`unavailable`，诊断为 `image-measurement-missing`；
   7. 记录的图片规则不覆盖某张图片：`unsupported`，`field` 为 `image <序号>`；
   8. tokenizer 失败：`unavailable`，`dependency` 为 `tokenizer`。
3. 成功时，`input-tokens` 检查为 `estimate`：数额是 token 输入的排序键 JSON 经 o200k 计数，加上每张图片的规则数；余量是数额乘以配置百分比再向上取整；`method` 为 `<记录名>#meter`，`marginSource` 为配置给出的采用。上限是 `context.input`，没有时为窗口减输出。档案的 `image-bytes`、`image-count` 与 `request-bytes` 限额各给出 `exact` 检查。报告为 `complete`。
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
| [规则](#规则) | `rules.spec.ts` | `usage` 直接调用，引擎不调用它 |
| [计量](#计量) | `meter.spec.ts` | 图片规则用封存件的金值；带图片事实的表示由测试构造 |
| [官方档案](#官方档案) | `profiles.spec.ts` | 每份档案的供应商都能取得绑定并规划请求 |
| [家族与取得](#家族与取得) | `family.spec.ts`、`plan.spec.ts` | — |
| 回放夹具与封存件逐条一致 | `fixtures.spec.ts` 与 [tests/fixtures](tests/fixtures/README.md) | 有意不同逐条列在夹具 README |
| 跨家族回放（OpenAI 一侧） | `cross-family-replay.spec.ts` | 历史用纯数据构造，不导入 Anthropic 家族 |

未覆盖：

- 经真实传输与本地 HTTPS 服务的回放、符合性套件与真实路由，归后续联调与 #466。
- 解码器不产生 `account` 事实，用量规则只经直接调用验证。
- `none` 与 `max` 推理强度不受支持，直到网关词表能写出它们。
