# Qwen 商业六叶可见推理详情的参考计量

2026-09-30，revision 1，candidate，**已过独立架构评审（无阻断，M1～M3 与 N1、N2、N4、N5 已按[评审记录](../../../../record/proposals/model-input-usage-calibration/qwen-commercial-visible-reasoning-review.md)闭合）**；起草基线 HUB SHA `63980767`。尚未评审、未技术采用、未实施、未实际验证，新增 bindings 0。方向来自用户 2026-09-30「按开源页同法给商业六叶补一条候选并实现」（尚未入档，见 QG9）。方法沿已采用的 [Qwen 开源两叶可见推理计量 revision 2](qwen-open-visible-reasoning-estimate-design.md)（[采用决定](../../../../record/decisions/model-input-usage-calibration-adoption/qwen-visible-reasoning-decision.md)，下称「开源页」）；**本页只写差异**，共同部分按节引用、不复制，不改开源页、[v10](v10-token-estimate-design.md)、[v12](v12-usage-calibration-design.md) 的受审字节。持续消费者为六款商业叶官方定义、`createQwenInputMeter` 的商业分支与模型调用规划器；阿里 `preserve_thinking` 默认名单、固定公开模板、OpenRouter 推理详情协议或六叶上游快照变化时复核本页（触发条件见 QG7）。

六叶以执行仓库 `official-models/qwen.ts` 的 `qwenVisibleBindings` 为准：`qwen/qwen3.8-max-0902`、`qwen/qwen3.8-max-prime`、`qwen/qwen3.8-flash`、`qwen/qwen3.7-max`、`qwen/qwen3.7-plus`、`qwen/qwen3.7-flash`。定义表里没有 `qwen/qwen3.8-max` 这一叶。开源两叶 `qwen/qwen3.8-2.4t-a95b`、`qwen/qwen3.8-27b` 只作回归对象。

## 基准、性质与证据

基准为已接受 [RT12](../../../../spec/capabilities/model-request-runtime/v12/contract.md)／[MR11](../../../../spec/data/model-response/v11/contract.md) 的计量语义（接受依据沿 [D107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)）与当前实现：六叶 definition `3`、`pi-ai:qwen@mp4-17`，algorithm `<叶名>-final-visible-json-proxy-1`，即把整份最终请求 JSON 当文本、用固定公开 tokenizer 全量编码的可见 JSON 替身（[研究](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-29-visible-full-surrogate.md)）。它已按 JSON 字节放行可见 `reasoning.text`／`reasoning.summary` details 与 `reasoning` 串，图片一律 unavailable，full-only；八叶 factory 方法已接共同包装（[本机覆盖](verification.md#2026-09-30-qwen-可见推理本机覆盖)）。[D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md) 的 R-A（full-only）适用；R-B 原只点名 2.4T／27B，0902 是否同形见 QG8。封存性质、相关对象与「不声明新双盲」同[开源页](qwen-open-visible-reasoning-estimate-design.md#基准性质与证据)。

**与开源页的根本差别**：开源页在已有公开模板路径上**加**一种表示；本页把六叶的**整个计数口径**从 JSON 替身换成公开模板渲染，并逐叶设定两个模板量。同一 body 即使不带推理，数值也会变，因此 basis 换代（见[计量映射](#计量映射与-fullφδ-同源差异)）。

### 证据

| 证据 | 支持什么 | 不支持什么 |
|---|---|---|
| 阿里百炼参数参考（一手，[研究页逐字核对](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-30-community-harness-commercial-reasoning.md#阿里云百炼dashscope-的官方说法)） | `preserve_thinking` 对 `qwen3.8-max`／`-0902`／`-flash` 默认 true 且须完整回传 `reasoning_content`；`qwen3.7-max`／`-plus`／`-flash` 支持、默认 false；开启时历史推理计入输入 | 同站深度思考、QwenCloud、多轮对话三页说法与之[矛盾](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-30-community-harness-commercial-reasoning.md#阿里文档之间的不一致)；`max-prime` 不在任何名单；不说 OpenRouter 怎样转发 |
| [batch8 离线复算](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-30-community-harness-commercial-reasoning.md#本仓库-batch8-的离线复算推断级)（推断级） | 六叶当前绑定下带工具三轮真实请求 18 个，按本页逐叶规则预测全部比上游 `prompt_tokens` 多 1，12 个轮间增量残差 0；同批 JSON 替身残差 −186～+609。3.8 的轮间增量恰为「3.7 增量＋上一轮 reasoning＋5」；若 QC-V0 证实 wire 只带 details，这说明 details 回放后在 3.8 上进了推理槽位 | 只有一个场景（一个工具、英文 ASCII、每轮新 user；场景 effort 为 `high`，按路由规则只有 0902 发出，其余五叶在规划时丢弃——推断）；作者一次性计算、无入库脚本、无独立复核；原始 SSE 在 HUB 私有目录未入库；对 3.7 分不开「OpenRouter 丢 details」与「阿里按 false 丢弃」 |
| 单 user 旧观察按同一渲染 | 3.8-flash 四例（英文、中文、代码、混合）−9，3.7-flash 四例 0（研究页）；0902 与 3.8-flash、3.7-max／plus 与 3.7-flash 的上游数和旧代理数逐值相同（[六例观察](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-fixed-route-six-observations.md)、[Flash](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-flash-final-wire-input-meter.md)、[3.7-Flash](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-flash37-final-wire-input-meter.md)、[Plus／Max](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-plus37-max37-final-wire-input-meter.md)），所以同一渲染的残差按算术同为 −9 与 0（推论，研究页未单列） | 无 system、无工具、`max_tokens:16` 截断的一种形状；常数随形状变 |
| 固定 tokenizer（`tokenizer.json` SHA-256 `0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3`） | JSON 替身已用同一文件；本页不换 tokenizer | 商业叶私有 tokenizer 与之相同未证。[公开模板研究](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-public-template-gaps.md)写明开源两叶的 tokenizer 与模板「不得按家族名复用」——本页复用模板的依据是 batch8 计数，不是家族名 |
| details 形状 | 研究页记 18 轮 `delta.reasoning` 拼接串与 details `text` 逐字相同 | 四键、`format`、`index`、有无 `id`／签名／显式 `signature: null`，以及第 2、3 轮实际发出体是否只带 details，都没有入库记录——**待核对**，QC-V0 |

### 上游与固定模板（差异）

模板仍是开源页那份固定 2.4T `chat_template.jinja`（执行仓库 `tokenizers/qwen-38-24t/`，SHA-256 `40ce34a5bcbc0231462740761215bc31a83882a8b3a4b6aa1c6e869b95945e4e`），本页用到它的两个开关（第 24–33、65–97 行）：

- `preserve_thinking` 缺省或为真：全部历史 assistant 渲 `<think>\n…\n</think>\n\n`，即开源两叶现行路径。为假：只有下标大于 `last_query_index` 的 assistant 渲 think 块，其余只渲 `content` 与工具调用，**连空 think 块也不留**。`last_query_index` 是倒序扫描遇到的第一条内容（trim 后）不被 `<tool_response>…</tool_response>` 包裹的 `user` 消息的下标，下标按整份 `messages`（含 system 与 tool）计。
- effort 说明：缺省 `xhigh` 在 system 前加一句说明，即现行路径。「无说明」在公开模板里等同 `reasoning_effort` 取 `medium` 的渲染（该档没有说明句）；这只是渲染等价，不主张 3.7 以 `medium` 运行。无 system 且无工具时不渲 system 块。

OpenRouter 侧同[开源页](qwen-open-visible-reasoning-estimate-design.md#上游与固定模板)：details 到阿里原生字段的转换未文档化。本页多一项未知：OpenRouter 是否转发或自行设置 `preserve_thinking`，一手文档未写。开源两叶的 P2 对照（[采用决定](../../../../record/decisions/model-input-usage-calibration-adoption/qwen-visible-reasoning-decision.md#2026-09-30-qv4-真实路线与-p2-同路由对照结果)）只证明那两叶在 `alibaba` 路由上 details 与 `reasoning` 串同槽位，本页**不**外推：3.8 三叶只由 batch8 增量间接支持，3.7 三叶无从判定（QC-V6）。两项都是**待核对主张**（`design/basis/` 无条目）。

## 逐叶设定

| 叶 | 现绑定 | wire effort 域（路由规则） | `preserve_thinking` 分支 | effort 说明 | 缓存档 | 常数读数（预测 − 上游） | 设定依据 |
|---|---|---|---|---|---|---|---|
| `qwen/qwen3.8-max-0902` | `3`／`mp4-17` | 缺省、`high`、`max`（select，其余丢弃） | 缺省（全部渲染） | xhigh（`high`／`max` 剥离后同） | 显式 5m，`system` | 三轮带工具 +1 ×3（`high`）；单 user −9 ×4（推论） | 参数参考点名默认开；batch8 计数 |
| `qwen/qwen3.8-max-prime` | `3`／`mp4-17` | 仅缺省（effort 丢弃） | 缺省（**假设**） | xhigh（**假设**） | 显式 5m，`system` | 三轮带工具 +1 ×3；单 user 无样本 | 不在阿里任何名单；只有 batch8 计数与 OpenRouter「Max 高吞吐变体」血缘 |
| `qwen/qwen3.8-flash` | `3`／`mp4-17` | 仅缺省（effort 丢弃） | 缺省（全部渲染） | xhigh | 自动 | 三轮带工具 +1 ×3；单 user −9 ×4 | 参数参考点名默认开；batch8 与单 user 计数 |
| `qwen/qwen3.7-max` | `3`／`mp4-17` | 仅缺省（effort 丢弃） | false | 无 | 显式 5m，`system` | 三轮带工具 +1 ×3；单 user 0 ×4（推论） | 参数参考：支持、默认关；「无说明」只有 batch8 计数 |
| `qwen/qwen3.7-plus` | `3`／`mp4-17` | 仅缺省（effort 丢弃） | false | 无 | 显式 5m，`system` | 同上 | 同上 |
| `qwen/qwen3.7-flash` | `3`／`mp4-17` | 仅缺省（effort 丢弃） | false | 无 | 自动 | 三轮带工具 +1 ×3；单 user 0 ×4 | 同上 |

- 3.8-flash 与 max-prime 的 wire 不带 effort，缺省档取 xhigh 由公开模板缺省与 batch8 计数支持；阿里对商业 3.8 缺省 effort 档的逐字依据未见于研究页，是**待核对主张**。0902 的 `high`／`max` 剥离后渲 xhigh，沿阿里「high／max → xhigh」映射；`high` 有 batch8 三轮，`max` 未观察。
- 常数 +1 是高估，−9 是低估，0 无偏；**误差方向未知**，来源也未知。本页不建模常数（[关键选择](#关键选择)），由宿主 margin 在门上一次覆盖。
- 缓存档只影响费用，不影响上游 `prompt_tokens`（该数含缓存读写）；模板不渲 `cache_control`。缓存档在本页只用于结构前置核验与 QC-V7 的 service 路径。

## 最小承载与范围

落点为现有 Qwen InputMeter 的纯数据投影（#1）：六叶从 JSON 替身分支切到公开模板分支，渲染器加两个逐叶参数；不是新服务，也不是新的消息或组 walker。逐叶设定是随修订发布的绑定常量。范围只为六叶经 OpenRouter `alibaba` 的官方贡献及其后继唯一修订；开源两叶数值不变（回归预言）；不外推到其他家族。

### 有限适用表（只列与开源页不同的行）

其余行（消息角色、details 数组、detail 形状、与推理字符串的等同）同[开源页有限适用表](qwen-open-visible-reasoning-estimate-design.md#有限适用表)，并行键集合同为 `['reasoning']`。

| 维度 | 适用值（同时满足才投影） | 其余 |
|---|---|---|
| 定义与实现 | 六叶后继唯一 definition 与 `pi-ai:qwen` 修订（数值由主线接口账本分配） | 现 `3`／`mp4-17` 保持 JSON 替身数值直到发布；未知修订沿既有 factory 构造期抛错，贡献不发布 |
| 路由与结构前置 | 开源页路由条件，**另保留**现行商业路径的结构核验：`provider` 键恰为 `order`／`allow_fallbacks`／`require_parameters` 且后者为 true；`cache_control` 只许在显式档叶的 system 文本块上且恰为 `ephemeral`／`5m`，自动档叶不许出现；工具与工具定义键集同现行 | 沿现行 unavailable，不因换渲染而放宽 |
| effort | 0902：缺省或 `high`／`max`；其余五叶：`reasoning` 参数缺席 | 五叶带任何 `reasoning`、0902 其他档：unavailable |
| 模板分支 | 按[逐叶设定](#逐叶设定) | — |
| 图片 | 无 | 任何 `image_url`：unavailable（沿现行；27B 图片公式不外推） |
| 回合内工具循环（assistant 位于 `last_query_index` 之后） | 估算，**未覆盖**：按模板渲 think 块 | — |
| 非 ASCII | 估算，**未覆盖**（多轮与工具）；单 user 文本已有中文样本 | — |
| 其余字段 | 渲染器可渲染：工具调用参数解析为 JSON 对象、存在非 `<tool_response>` 包裹的 user、system 只在首位、工具定义与参数中的 JSON 数为规范安全整数 | unavailable |

两类「未覆盖」估算而不拒，理由有三：拒绝会让六叶的回合内工具循环（不带新 user 的工具结果续轮）与全部中文会话停在第二轮，而现行 JSON 替身对这两类都给估算，拒绝是可用性倒退；对 3.7，回合内几何下两种上游可能（OpenRouter 转发且阿里按模板保留本回合推理，或整条推理被丢弃）只差本回合推理，本页按前者计，所以这处分叉只会高估；非 ASCII 的用户文本不经转义，单 user 中文样本与英文同常数，只有工具 schema 与参数经模板 `tojson` 转义，私有模板若不转义本页高估。[D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md) 的 R-K 管的是换路由时带 opaque 的思考块，不管同路由可见形状的估算与拒绝，本页不引它作依据（派发任务的引用对不上，见 QG9）。

### 与现行商业路径相比的域变化

| 形状 | 现行 JSON 替身 | 本页 |
|---|---|---|
| 单项四键 `reasoning.text` details | estimated，按 JSON 字节计 | estimated，进模板槽位；3.7 在 `last_query_index` 之前计 0 |
| `reasoning.summary`、带 `id`、多项、非 `unknown` format、非 0 index 的 details | estimated | unavailable |
| 并行 `reasoning` 与 detail text 不逐字相同 | estimated，两者都计 | unavailable |
| 3.7 在 `last_query_index` 之前的纯 `reasoning` 串 | estimated，计入 | estimated，计 0 |
| 工具调用参数不是 JSON 对象；没有非 `<tool_response>` 的 user | estimated | unavailable |

收窄的形状在 batch8 中未见，产品路径是否会产出由 QC-V0 核；它们对多轮可用性可见，交主线确认（QG8）。

## 计量映射与 full/φ/δ 同源（差异）

派生副本同开源页：effort 剥离（只对 0902 生效）与共享 `projectVisibleReasoningBody(body, ['reasoning'])` 只动各自字段。渲染用同一 `renderQwenPrompt` 加两个逐叶参数（候选名 `preserveThinking`、`effortInstruction`）：（真，xhigh）即现行输出，开源两叶与 3.8 三叶用它；（假，无）用于 3.7 三叶。假分支中位于 `last_query_index` 之前的 assistant 只渲 `content` 与工具调用，它的 details 或 `reasoning` 在 wire 上照发、在计数里为 0——这正是「阿里按默认 false 丢弃」的主张，本页因此只到 estimated。计数用同一固定 tokenizer、关闭自动 special token；不加 O、`reasoning_tokens` 或修正常数；宿主 margin 只在规划器最终门应用一次。

三条可检查的预言：**模板预言**——渲染结果等于固定 Jinja 模板在对应 `preserve_thinking` 与 effort 开关下的输出（独立 Python／Jinja 黄金值）；**等价预言**——任一命中消息的派生计数等于把 `reasoning_details` 换成 `reasoning: text` 的同一 wire 的计数；**回归预言**——开源两叶在现有夹具上的渲染逐字节不变。三者合起来说明本地参考层与固定模板一致；与 OpenRouter／阿里私有转换的差异仍是 estimated，无误差上界。

φ/δ 同[开源页](qwen-open-visible-reasoning-estimate-design.md#计量映射与-fullφδ-同源)：保持 `unsupported-marginal/1`，不开增量。

修订：六叶 definition、implementation 与 algorithm 各升新唯一值（候选形如 `<叶名>-public-template-1`，数值与名称由主线账本分配）。`tokenizerRevision` **显式设为新值**，不钉现值。统一规则（本页是先例的例外，规则只写这一处）：`tokenizerRevision` 标识 tokenizer 文件**加渲染基**；渲染基换类（JSON 替身→公开模板）即换值，只扩投影域（开源页情形）不换值。六叶现值由 `defineInputMeter` 默认派生、命名的正是即将删除的 JSON 替身，钉住它才是错的（评审 N2）。与开源页相反：同一 body 的计数函数整体改变，属 [S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效) 所列 `basis_changed`（模板与隐式变换语义改变），旧 basis 上的观察不能被判兼容；显式而非默认派生沿[独立评审](../../../../record/proposals/model-input-usage-calibration/moonshot-qwen-visible-reasoning-review.md)第 4 项。`transformRevision` 保持 `openrouter-wire/2`，`replayRevision` 保持 `unsupported-marginal/1`。`evidence` 逐叶写明：分支与依据（参数参考默认值，或 max-prime 仅观察推断）、batch8 计数、已知常数 +1／−9／0 与「误差方向未知、无 holdout、无误差界」、OpenRouter 转换与 `preserve_thinking` 转发未知；0902 另写显式 effort 的 R-B 同形条件（待主线确认）。

## 与共享机制的接缝（差异）

| 共享件 | 本页依赖 | 改什么／不改什么 |
|---|---|---|
| `renderQwenPrompt` | 加两个逐叶参数，不另写第二个渲染器 | 开源两叶传现行值，输出逐字节不变；按本页规则（计数函数不变则依据不变）开源两叶的 `implementationRevision` 保持 `mp4-19`，**不随签名变化换代**（评审 N5）；假分支的 `last_query_index` 按模板逐字实现 |
| `projectVisibleReasoningBody`／`visibleReasoningDetailText`（`input-meters/shared.ts`） | 直接复用，同文键 `['reasoning']` | 不改；Qwen 八叶的并行键政策统一，P1 已知差异清单不增 |
| `withoutXhighEffort` | 只对 0902 生效；其余五叶路由丢弃 effort，body 带 `reasoning` 即拒 | 不改 |
| `renderQwenVisibleInput`（`qwen-visible.ts`）与 `qwenVisibleBindings` | 发布后无消费者（仓内检索只有 Qwen 源码自身引用） | 结构前置核验迁入商业分支（搬移，不复制）；其余随发布删除，不留兼容路径 |
| `guardInputMeter` | 八叶已接线 | 不改；六叶直接入口测试（开源页 G7 的欠账）由 QC-V5 补 |
| `stream.ts`（R-F＋R-L）、`projectAssistant`（R-K）、`inlineImageTokens` | 同[开源页接缝表](qwen-open-visible-reasoning-estimate-design.md#与共享-walker分组的接缝) | 不改；图片计数只属 27B |
| 路由 `cache` 声明（`official-models/qwen.ts`） | 商业分支的缓存标记核验读它 | 不改声明 |

## 契约责任到兑现点

| 契约责任 | 本页兑现点 | 实现 | 依据或缺口 |
|---|---|---|---|
| [S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③ 有适用依据的 tokenizer 估算，覆盖消息、system、工具、协议附加与缓存处理 | 逐叶模板分支＋固定 tokenizer；缓存标记按路由档核验，不进渲染 | `renderQwenPrompt`＋逐叶参数（候选） | batch8 +1、单 user −9／0；无误差界（QG4） |
| S-74⑤ 依据不足即明确拒绝 | 有限适用表之外一律 unavailable，经规划器为 `input_size_unavailable` | 既有 PlanFailure 映射 | 反例 15、16 |
| S-77 来源真实性先于计量；语义变更判 `basis_changed` | 共同包装不变；algorithm 与 tokenizerRevision 换代 | `guardInputMeter`；修订常量 | QC-V5；旧观察不作复用锚 |
| [S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准) reasoning 不双加、不无条件 I+O、margin 一次 | 不加 O；3.7 在 `last_query_index` 之前的推理计 0；margin 在门上 | 既有规划器 | 3.7 依赖 QG1 的待核对主张 |
| [S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)④⑥⑧ 纯函数、坏输入映射、缺席不填零 | 无隐藏读取；factory 直接入口经包装 | 既有 | QC-V5 |
| [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放) 下一请求贡献由实际回放决定，wire 与上游 usage 保留 | 只改计量副本，wire 原样带 details | 既有 | 反例 7（开源页） |

## 失败层、版本与装卸

三层失败、固定旧 lease 不热替换、Cordis 不新增 service／fiber／inject／effect／事件、采用版本沿 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)、新增 Storage 要求 0、装配节点 0、bindings 0、无跨 owner 提交，均同[开源页](qwen-open-visible-reasoning-estimate-design.md#失败层版本与装卸)。差异三条：

1. 逐叶设定随 definition／implementation 修订发布，是绑定常量，不是宿主配置，也不经 `intercept` 下发：改它就是改计数函数，必须换 basis。配置错误沿同一政策：未知或滞后的修订在 factory 构造期抛错，贡献不发布半份。
2. 六叶同批发布。发布前已借出的 JSON 替身 meter 跑完各自规划；发布后不保留旧 factory、替身分支或双路径。
3. JSON 替身时期的观察（旧 basis）在新 meter 下只是历史事实，不作复用锚；原坐标保留。

## 对账

| 对账 | 结果及承担 |
|---|---|
| A 性质承载 | 原 wire 保真与费用沿共同层；家族只给有来源估算，本地一致由三条预言核实；上游误差不承诺 |
| B 内核负面清单 | 同开源页：无新增持久、跨 fiber 事务、可靠投递、权限或时序保证 |
| C 原边界复查 | 不新增来源真值、O 转换、公开操作或消费方身份；R-A full-only 不变；R-B 守门对四键 `reasoning.text` 的读法同 P4。收窄了现行商业路径已估算的若干形状（域变化表），属于实现换方案、不改契约，但对多轮可用性可见，交主线确认（QG8）。若实现发现须改变语言无关性质，停该分支回 spec |
| D 代价 | 六叶修订、渲染器两个参数、结构前置搬移与替身删除、QC-V0 零付费核对、QC-V6 付费对照。收益：batch8 形状残差由 −186～+609 收到 +1；3.7 长会话不再随历史推理累积高估。**代价中的退步（评审 M3）**：无 system、无工具的极短单 user 形状在 3.8 叶上由替身的 ±2 变为 −9（上游 68～83 token，约 −13%）；对准入门无实际影响（该形状远离输入上限，且 margin 由宿主承担），但它正是「常数项」落选分析里否定 −1 常数的数字。置信度只到 estimated |

## 关键选择

| 选择 | 本方 | 落选方及其最强论据 | 本方弱点 | 置信度 |
|---|---|---|---|---|
| 六叶计数口径 | 公开模板＋逐叶两开关 | 保留 JSON 替身、只补 details 等同：已采用，逐字节不漏，不依赖任何模板槽位或 `preserve_thinking` 主张 | 全部依据是一个场景的 18 个请求、单人离线复算；依赖 OpenRouter 未文档化的行为 | 中 |
| 3.7 分支 | `preserve_thinking=false`、无 effort 说明 | 沿用缺省分支：只会高估、与开源两叶同形；OpenRouter 哪天开始转发 `preserve_thinking=true` 或阿里改默认值，也不会低估 | 上述变化发生时本页**静默低估**全部历史推理（QG1）；回合内几何未测 | 中 |
| 常数项 | 不建模，只记录残差 | 加性常数（如 −1）：18 个请求恒为 +1，修正后该形状精确；ZAI Prime／FlashX 有减 1 先例 | 常数随形状变（+1／−9／0），−1 会把单 user 3.8 推到 −10；没有事先声明的 fit／holdout；开源两叶 QV4 的 +38／+39 同样只记录 | 中高 |
| max-prime | 归 3.8 设定，标假设，由 QC-V6 判 | 单列（保持 JSON 替身或拒绝回放）：阿里无文档，OpenRouter 称独立 SKU，缓存写入计数异常暗示服务路径不同 | 只有观察推断；好在错配方向是高估——若它实为 false，本页按真计会多算，不会少算 | 中 |
| 分词口径 | 固定公开 tokenizer 全量。锚定即 φ/δ，R-A 本轮不开；展示名 `Alibaba` 与路由 tag 不等会判 `basis_changed`；I＋O 锚定在 3.7 上会把被丢弃的推理算进去（S-78 禁止无条件 I＋O）；首轮本来就要全量 | 上一轮 usage 锚定加增量近似（pi、Qwen Code 的做法）：大头用上游原生计数，逐轮自校正，不依赖私有 tokenizer 同一性 | 商业叶 tokenizer 与公开件同一只到「这批计数相同」 | 中高 |
| 逐叶设定归属 | 版本化绑定常量 | 宿主可配置：上游改默认值时不必发版即可跟进，合「策略不写死」 | 跟进上游变化要发修订；但这两个量是上游路由的计数事实而非策略，做成配置会让计数函数变了而 basis 不变，违背 S-77 | 高 |
| 未覆盖形状 | 回合内工具循环与非 ASCII 估算 | 拒绝：没有样本，早暴露比静默估错诚实 | 无样本；私有模板若不转义非 ASCII 的工具 schema，本页高估 | 中 |

## 反例义务

[开源页反例](qwen-open-visible-reasoning-estimate-design.md#反例义务) 1–10 在六叶上全部复用，effort 按各叶 wire 域（0902 缺省、`high`、`max`；其余缺省），反例 4 中「27B `none`」换成「五叶带任何 `reasoning` 参数、0902 `none`／`low`／`medium`」。新增：

11. 3.7 分支：位于 `last_query_index` 之前、带合格 details 或 `reasoning` 串的 assistant，计数等于删去其推理后的同一 body；位于其后（回合内工具循环）时照样计入，且与真分支渲出的该片段相同。
12. `last_query_index`：内容被 `<tool_response>…</tool_response>` 包裹的 user 不算 query；tool 消息不算；按路由 `reminderRole: 'user'` 插入的提醒按模板字面算 query；下标含 system。
13. 无说明分支：无 system 且无工具时不渲 system 块；system 内容为空且无工具时也不渲；有工具时工具段前没有说明句。
14. 回归：开源两叶在 QV1／QV2 现有夹具上的计数逐值不变，algorithm 与 tokenizerRevision 不变。
15. 域收窄：六叶的 `reasoning.summary`、带 `id`、多项 details，并行 `reasoning` 不同文，工具参数非 JSON 对象：经规划器为 `input_size_unavailable`，零 HTTP，原消息不变。
16. 结构前置：自动档叶带任何 `cache_control`；显式档叶 system 以外或非 `ephemeral`／`5m` 的标记；`require_parameters` 缺席或为假；任何 `image_url`：unavailable（现行行为保持）。
17. 复现：QC-V0 入库的 batch8 18 个请求重建体，本页预测逐值等于研究页模板规则列（上游 +1），不以常数修正去凑。
18. 修订错配：旧 `3`／`mp4-17` 或未知修订与新 factory 组合，构造期抛错。

## 逐叶采用矩阵

| 叶 | 路由／缓存档 | 当前绑定 | 算法修订 | 已有真实读数 | 未观察 | 本页建议 |
|---|---|---|---|---|---|---|
| `qwen/qwen3.8-max-0902` | `alibaba`／显式 5m | `3`／`mp4-17` | `qwen3.8-max-0902-final-visible-json-proxy-1` → 新唯一值 | 单 user ×4 与正式规划路径 ×1；batch8 带工具三轮（`high`），details 回放被上游接受（研究页读数，待 QC-V0 核） | 缺省与 `max` 的多轮、无工具多轮、回合内工具循环、非 ASCII 多轮 | QC-V0 后采用，机制接线先行，QC-V6 作认证门 |
| `qwen/qwen3.8-max-prime` | `alibaba`／显式 5m | 同上 | `qwen3.8-max-prime-final-visible-json-proxy-1` → 新唯一值 | batch8 带工具三轮 | 单 user、无工具、文档依据、缓存写入计数口径 | 同上；分支是假设，QC-V6 证伪则后继改分支 |
| `qwen/qwen3.8-flash` | `alibaba`／自动 | 同上 | `qwen3.8-flash-final-visible-json-proxy-1` → 新唯一值 | 单 user ×4；batch8 带工具三轮 | 无工具多轮、回合内工具循环、非 ASCII 多轮 | 同 0902 |
| `qwen/qwen3.7-max` | `alibaba`／显式 5m | 同上 | `qwen3.7-max-final-visible-json-proxy-1` → 新唯一值 | 单 user ×4；batch8 带工具三轮 | 回合内工具循环（两条规则在此分叉）、details 是否到达上游 | 同 0902；回合内几何由 QC-V6 判 |
| `qwen/qwen3.7-plus` | `alibaba`／显式 5m | 同上 | `qwen3.7-plus-final-visible-json-proxy-1` → 新唯一值 | 同 3.7-max | 同 3.7-max；图片已声明但本页不放行 | 同 3.7-max |
| `qwen/qwen3.7-flash` | `alibaba`／自动 | 同上 | `qwen3.7-flash-final-visible-json-proxy-1` → 新唯一值 | 同 3.7-max | 同 3.7-max | 同 3.7-max |

## 实施与验收义务

| 编号 | 覆盖什么（正向、反例、必须失败的负控） | 门类 | owner／受阻消费者 |
|---|---|---|---|
| QC-V0 | 只读核对 batch8 六叶 18 轮原始 SSE：details 逐帧恰四键、`reasoning.text`、`format: unknown`、`index: 0`、无 `id`／签名、无显式 `signature: null`，并行 `reasoning` 逐字同文；第 2、3 轮实际发出体只带 details、被上游接受。把离线复算做成可重跑脚本连同输入哈希入 research 或 record，由第二执行者复现 18 个预测与 12 个增量残差。任一不符即修订本页，不据研究页推断放行 | 采用前置，零付费 | 主线／研究 owner；本页采用 |
| QC-V1 | 六叶 × 各自 wire effort 域 × 有／无工具 × {public transport，Cordis transport service} 三轮受控 SSE：第 2、3 轮 full／`estimated`，每轮恰一次 HTTP 且字节等于计划，wire 只带 details，显式档叶带唯一的 5m `system` 标记、自动档叶不带，资源实停。`qwen-family-current.spec.ts` 商业叶第 2 轮的 `summary` 用例由估算改为拒绝，`text` 用例数值随新口径更新 | 本机 | transport 实施者；六叶真实多轮 |
| QC-V2 | 模板预言：独立 Jinja 在 `preserve_thinking` ∈ {缺省，false} × effort ∈ {缺省，无说明} × 几何 {assistant 在末个 query 之前／之后、连续工具结果、被包裹成 `<tool_response>` 的 user、提醒 user} × 非 ASCII（用户文本、工具 schema、工具参数）下的黄金 prompt 哈希；参数化渲染器逐个相等；回归预言覆盖开源两叶。变异负控各自单独施加须失败：3.7 叶误配真分支（反例 11）、`last_query_index` 不识别 `<tool_response>` 包裹（反例 12）、开源叶误传假分支（反例 14） | 本机 | 同上 |
| QC-V3 | 等价预言：六叶 details 版与 `reasoning` 串版逐值相等；反例 17 的 batch8 复现（依赖 QC-V0 入库） | 本机 | 同上 |
| QC-V4 | 开源页反例 1–10 在六叶上复跑；新增反例 11–16、18；夹具经真实 reader 合成，不手写合并后的条目 | 本机 | 同上 |
| QC-V5 | 直接调用 `createQwenInputMeter` 为六叶返回的 full／φ／δ：非法显式 history 由共同包装拒绝，body-only 合法 full 为 `estimated` 且等于新口径，包装无递归；不以规划器或独立包装函数的测试代证。闭合开源页 G7 的六叶测试欠账 | 本机 | 同上；直接调用公开函数的消费者 |
| QC-V6 | root 沿唯一预算账本：每叶有、无工具各至少一组当前绑定三轮真实流，第 2 轮起回放 details，记录上游接受、`prompt_tokens` 残差、cache、cost 与逐帧形状。**必做**同路由对照：同一第 2 轮历史（推理 assistant 在末个 query 之前）以 (A) details、(B) `reasoning` 串、(C) 无推理发送。3.8 三叶期望 A＝B＞C 且 A−C 等于 trim 后推理文字的 token 数；3.7 三叶期望 A＝B＝C。3.7 另发回合内几何（assistant 带工具调用在末个 query 之后，续轮只加工具结果）的 A 与 C：A＞C 与本页一致，A＝C 表明该几何高估，记录并由后继改口径。**对照体必须由真实规划器生成（评审 M2）**：主线核实（HUB `0f1d9efa`）运行时不在工具结果之后常规插入 `system_reminder`——`loop-extension-runner` 只在扩展失败且策略为 record 时造一条提醒，模型请求运行时自身不造——故回合内几何在产品路径真实出现；读数记录须写明提醒是否在场，并各发一组「工具结果后带一条 `[system_reminder …]` 前缀 user」的 A／C，以覆盖提醒把 `last_query_index` 推到工具结果之后的情形。**明列的补充场景（评审 M1）**：非 ASCII（中文）多轮带工具至少一组（期望与英文同带 ±个位数）；0902 的缺省 effort 与 `max` 各一组三轮（期望 A＝B＞C，`max` 的 xhigh 说明映射由此首次观察）。max-prime 得 A＝B＝C 即假设被证伪，由后继改为 false 分支；任一叶 A≠B 即 details 映射证伪，认证前由后继撤回。残差只作记录，不引入常数 | 认证门，付费 | root 唯一账本；六叶 D7 逐模型真实多轮 |
| QC-V7 | service 路径：两 flash 叶（自动档）可按认证工具现有 service 配置档执行；0902、max-prime、3.7-max、3.7-plus（显式 5m `system`）须等认证工具 R8 按路由取缓存档——开源两叶已因同一原因在 prepare 被拒（[逐叶证据](verification.md#2026-09-30-真实认证逐叶证据r6r7-认证工具唯一预算账本)） | 认证门，付费 | root 认证工具 owner；四叶 service 认证 |
| QC-V8 | 六叶 definition／implementation／algorithm 唯一修订与显式新 tokenizerRevision、逐叶 `evidence` 字串、包 README／README_ZH 双语段与制品消费；删除 `qwen-visible.ts` 与 `qwenVisibleBindings` 并迁移结构前置；`qwen-input-meter`、`official-qwen-definitions`、`official-reader-bindings` 跟随新发布；未知与失败原件保留。研究页的 `reevaluate.mjs` 对新绑定拒绝属预期，不改写 | 交付 | 实施者＋主线；包文档读者 |

无新代数或并发性质，不扩 TLA 范围，以既有共享形式边界和上述正反例承接。候选须经 QC-V0、独立 architecture-reviewer 与主线技术采用后才释放 QC-V1–V5 与 QC-V8 的实施；QC-V6、QC-V7 的付费观测不因本页登记而获授权。

## 缺口与受阻消费者

- QG1 上游转换与 `preserve_thinking` 转发：OpenRouter 怎样把 details 转成 `reasoning_content`、是否转发或自设 `preserve_thinking`，一手文档都没写，是待核对主张。**静默失效方向不对称**：若 OpenRouter 改为丢弃 details，3.8 三叶高估；若它开始对 3.7 发 `preserve_thinking=true`，或阿里把 3.7 默认值改为开，本页对 3.7 **低估**全部历史推理，而 meter 看不到上游，不会报错。发现只能靠 QC-V6 的对照重跑，或对已保留的上游 usage 与估算残差做持续复核；后者目前没有 owner。**消费者后果**：3.7 三叶的长会话在门放行后可能被上游以超长拒收；若上下文压缩以本估算为触发（MR11 G-17），压缩会延后——消费者不能把 3.7 三叶的 full 估算当作上游计数的下界。受阻：3.7 三叶估算的可信度。owner：主线裁定归 root 认证工具（R9 起每次真实认证按叶记录残差带并对偏出者报警，见采用决定 O-4）；R9 之前本页 QG7 明示「行为变化无检测」。
- QG2 max-prime 分支：阿里无文档，只有 batch8 三轮计数，但该计数已有判别力——3.8 各叶轮间增量恰为「3.7 增量＋上一轮 reasoning＋5」，若 max-prime 走 false 分支其增量应不含上一轮推理（评审 N3）；QC-V0 复核这两个增量后标签由「假设」改「单场景观察推断」；由 QC-V6 判。受阻：max-prime 认证。
- QG3 max-prime 缓存写入计数：batch8 第 1 轮报告写入 0、第 2 轮读到 1170，计数方式未知。只影响费用与缓存认证，不影响本页输入计数。归 usage／cost 口径 owner；受阻：max-prime 的缓存命中声明。
- QG4 常数与误差界：+1、−9、0 随形状变、来源不明，误差方向未知，无误差界；由宿主 margin 承担。只记录，不建模。
- QG5 未覆盖形状：回合内工具循环（3.7 两规则分叉处）、非 ASCII 多轮与工具、0902 缺省与 `max` 多轮、无工具多轮、带工具调用回复的 details 形状。前三项已逐项写进 QC-V6（含期望读数）；后两项仍未观察、不在 QC-V6 内。
- QG6 证据归档：batch8 原始 SSE 与汇总在 HUB 私有目录；研究页复算无入库脚本、无独立复核。归主线／研究 owner（QC-V0）；受阻：本页采用。
- QG7 修订触发：阿里参数参考的 `preserve_thinking` 默认名单或 effort 映射变化（含 max-prime 入表、3.7 改默认）；OpenRouter 文档写明 Alibaba 推理字段转换或 `preserve_thinking` 转发；固定公开模板换版；六叶上游快照（生成查询所见的带日期规范名）变化；QC-V6 任一期望被证伪；共享 `stream.ts` 推理分组／合并规则变化（域收窄的前提是 reader 合并后只出四键单项，评审 N4）。触发即出后继修订，不原地改本页。
- QG8 主线待裁：域收窄（`summary`、带 `id`、多项 details 与并行串不同文由估算变拒绝）是否接受；R-B 的无 holdout 显式 effort 扩展是否及于 0902（`max` 未观察）；max-prime 归 3.8 设定；两类未覆盖形状取估算而非拒绝。
- QG9 入档：用户 2026-09-30 的方向尚无记录；派发引用的「按 R-K 列为未覆盖」与 D-111 中 R-K 的内容（换路由 opaque 规划拒绝）对不上，引用的 R-V 在本基线的 record 中不存在。已随[采用决定](../../../../record/decisions/model-input-usage-calibration-adoption/qwen-commercial-visible-reasoning-decision.md)入档并更正（R-K 引用系派发笔误，本页未用；R-V 为主调度临时裁决簿条目，不在 record）。
- QG10 P2 外推：开源两叶在 `alibaba` 路由上的同槽位结论不外推到商业六叶，由 QC-V6 逐叶取得。

## 修订记录

| revision | 日期 | 变更 | 基线 |
|---|---|---|---|
| 1 | 2026-09-30 | 初稿，candidate；同日独立架构评审无阻断，M1～M3、N1～N5 闭合措辞落页，主线技术采用（实施待 QC-V0） | HUB `63980767` |
