# Google 两叶 `google-gemini-v1` 推理历史的完整输出组计量

2026-09-30，revision 3，**candidate：登记待观测；未采用、未实施、未实际验证；新增 bindings 0**。主调度 2026-09-30 裁决：机制接线（policy、countBody、共享核委托、K3 域、K4 身份、K5 修订规则；replay 名保留 `unsupported-marginal/1`）可比照 xAI 决定先行实施与正反验证；definition `4`、implementation `mp4-N`、meter algorithm 三个坐标在 GS-V7 观测前不钉为已采用。坐标一经官方发布就进入已保存的 basis，所以观测前不以它们发布官方 factory（推导；发布时机归主线采用决定）。接续已采用的 [v13 多输出组交接](v13-output-history-design.md)、[共享家族机制 revision 5](priority-family-output-cache-candidate.md)（[priority-family 决定](../../../../record/decisions/model-input-usage-calibration-adoption/priority-family-decision.md)）、[xAI 有限适用 revision 2](xai-complete-output-applicability-candidate.md)（[xAI 决定](../../../../record/decisions/model-input-usage-calibration-adoption/xai-family-decision.md)）与[原 basis 适用接缝](image-preparation-basis-applicability-candidate.md)，不改它们的受审字节。

本页只回答一件事：**full 估算怎样对待同模型、完整的 `google-gemini-v1` 推理历史组**，目标是让第二轮带回首轮 `reasoning_details` 的请求不再在发送前被官方 meter 拒绝。证据关系先写清：**唯一观测到的真实完整形状是只含文本条目的组（T-only），它是本页的主承载**，映射待 GS-V7 决定，观测前 unavailable（K2），结果与现行 meter 相同；**带签名的组（K1）是从 8 份 `MAX_TOKENS` 截断帧外推的形状**，真实完整形态未观测。因此 GS-V7 之前本页对唯一真实形状不产生新的可估结果。不开 φ/δ，不涉图片与音视频，不新增公共契约、服务、插件、状态、存储或第二个 walker。持续消费者是两款 Google 官方定义及其 InputMeter、公开 `planRequest`/`invokeModel`、transport service 的 lease 消费者；上游推理流形状、身份字面值或计费口径变化，或共享输出组核、reader 分组规则换方案时，复核本页。

## 基准、坐标与共同约定

| 项 | 内容 | 认知状态 |
|---|---|---|
| 装配基准 | 目标态＝已采用的共享完整输出组机制＋两叶当前 definition `3` / `pi-ai:google` `mp4-17`（源码 `packages/model/pi-ai-transport/src/input-meters/google.ts`，起草基线 `f4ea05ef`）。该 meter 的逐消息成员白名单不含 `reasoning_details`（同文件 `supported()`），首轮真实形状的回复带回后，第二轮 full 为 unavailable，规划以 `input_size_unavailable` 拒绝、零 HTTP | 已知：源码与本机三轮用例 |
| 契约 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)、[S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)、[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)、[S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)；[MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)。catalog 均 accepted；计量义务沿 RT10/MR9（[D-107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)），RT12 S-77 另有「真实性先于复用」一段 | 契约承诺 |
| 共同约定 | ① Google 本轮 **full-only**：φ/δ 保持 `defineInputMeter` 默认 unavailable，不作交付门；② 共享 reader 对无 id `reasoning.text` 的分组以 `src/stream.ts` 的 `continueReasoningText` 为准——无 id 且相邻、type/format/index 及其余成员逐值相等时拼接，签名允许从缺席到一次非空值（仅签名片段只贡献签名），之后只许重复同值，签名到达后再来的无签名片段为新条目（[D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md) R-F＋R-L，不按 format 分支）；③ 本期模型运行时只交付 text 与 image，音视频声明保留、不承载。三项由主调度 2026-09-30 裁定，record 家为 [D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md)（GG-9 已闭合） | 共同约定裁定 |
| Cordis | 沿 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 采用 4.0.4；本页不新增上游语义主张 | 采用决定 |

## 真实原件核读

fit、holdout 两次 09-28 付费运行由研究页 `research/model-request-adaptation/vendor-continuation/google/2026-09-28-gemma4-pilot.md` 登记（含两份 result 的 SHA-256）；其中逐份 raw SSE 的推理详情形状、3.8 公开文本探针的领域结果，**研究区没有记录**。下表是本页逐份读出的形状，SHA-256 指原件文件本身；长期家缺口见 GG-1。记号：T＝成员恰为 `{type,text,format,index}` 且 text 非空；S＝成员恰为 `{type,signature,format,index}` 且 signature 非空。

| 原件 SHA-256 | 模型 · 用例 | 结束 | `reasoning_details` 序列 | SSE `provider` / `model` | O / reasoning |
|---|---|---|---|---|---|
| `ebacba7404f208cea871a80512d93148235b5fd5cca49ec9a298cf7baaa4b387` | 3.8 · F1 | `length`（`MAX_TOKENS`） | T → S | `Google AI Studio` / `google/gemini-3.8-flash` | 29 / 29 |
| `a9c89d0587338a90949d3d402d38d003ecc9e731162fb1e200764c5b0583d049` | 3.8 · F2 | 同上 | T → S | 同上 | 29 / 29 |
| `2bfcec0276a462f186cef479a33a73e62bac137b81e9e7f5d281208c6c640a63` | 3.8 · H1 | 同上 | T → S | 同上 | 29 / 29 |
| `1c32fd0ff600def484cdf2c9b803fc1a63a616651c6b22b262a405eabcf6334a` | 3.8 · H2 | 同上 | T → S | 同上 | 29 / 29 |
| `bed835bc84b898276f636af345e33765592f130129e4d5369acdde1dbfa51062` | 3.7 · F1 | 同上 | 可见文本 `Blue` 之后只有 S | `Google AI Studio` / `google/gemini-3.7-flash` | 28 / 27 |
| `774a46fdd7537f6ec4a6d39248238669c7005b24b757b4dc9c98122e07a29ce8` | 3.7 · F2 | 同上 | T → S | 同上 | 29 / 29 |
| `5a66d00254e62e58542576d90460bded3a7e9469436338ad40d62375b999cb07` | 3.7 · H1 | 同上 | T → S | 同上 | 29 / 29 |
| `1c88b600e6b656c70d7e600d44f70f4f3753d031da03bd0a8a747d7dc2f07773` | 3.7 · H2 | 同上 | T → S | 同上 | 29 / 29 |
| `d2cda4fcb15fef0da08bf60f6e31d542fcad32d8f1d37400e1eaf2acfd714d6e`（领域结果；发送体 `4a9d46b3…`；**raw SSE 未捕获**） | 3.8 · 公开文本探针 | `complete`（`stop`） | 只有 T | reader 产出的 origin：`Google AI Studio` / `google/gemini-3.8-flash` | 313 / 312 |

- **已观测**：format 恒 `google-gemini-v1`，type 恒 `reasoning.text`，index 恒 0；无 `id`、无 `[REDACTED]`、无 `reasoning.summary`/`reasoning.encrypted`，没有一条同时带 text 与 signature；signature 长 304–372 字符；T 若出现总先于 S。
- **唯一真实完整形状是 T-only**：公开探针那一份，O 313、reasoning 312，可见部分只是一段摘要和一个词。它是本页的主承载，映射见 K2。
- **签名组是外推，真实完整签名组未观测。**八份带签名的原件全部在 `MAX_TOKENS` 截断，原因是试点的 32-token 输出设置（研究页 `research/model-request-adaptation/vendor-continuation/google/2026-09-28-gemma4-pilot.md` 第 9 行），不是 Gemini 的行为。按当前源码，reader 对 `length` 不发收束事件，details 又只在收束时附到 thinking 块上，所以这些回复在领域层不带 details，回放走可见 `reasoning`，从未构成签名组（GG-10）。下文 S 形的域与 K1 都从这些截断 raw 帧外推；签名组的本机夹具是截断形状加合成的结尾。
- **待证伪假设 H-S：S 只伴随截断帧出现，完整回复不带 S。**依据只有 n=1：唯一完整回复没有 S，而按当日 reader 源码，签名条目若到达会作为独立条目保留。它与「签名只伴随被截断的 thought」「签名只出现在工具路径」都相容；若在非工具路径成立，K1 在该路径上就是空集。H-S 由 GS-V7 的最小观测证伪或维持。
- **工具调用回复：未观测**（九份原件都没有 `tool_calls`）。
- **身份**：9/9 的 SSE `provider` 为 `Google AI Studio`、`model` 为精确模型 ID；reader 取帧上这两个成员（经凭据文本政策）作 servingProvider/upstreamModel。3.8 有 reader 产出的完整回复 origin；3.7 只有研究脚本读到的截断帧。研究区 09-30 端点快照（`research/model-request-adaptation/vendor-continuation/media-carriage/audio-video-carriage-2026-09-30/openrouter-endpoints/google__gemini-3.8-flash.json` 与 `…3.7-flash.json`）两款 AI Studio 端点 `provider_name` 同为 `Google AI Studio`；端点名带日期后缀，SSE `model` 未带。
- **O ⊇ reasoning**：9/9 `reasoning_tokens ≤ completion_tokens`；同一快照 `internal_reasoning` 单价等于 `completion`。这是观察，不是上游计数契约。

## 有限适用表

每行同时要求精确模型 ID、固定路由 `google-ai-studio` 与下列坐标整体命中；不按版本范围、mp4 前缀或模型名相似匹配。V4 的 definition、implementation、algorithm 三个坐标在 GS-V7 前不钉定；采用后 V4 为唯一当前可执行 factory，V3 只解释 3/mp4-17 已保存的事实，不保留旧 factory、旧执行入口或兼容分支。

| 行 | 模型 ID | definition / implementation | meter algorithm | tokenizer | replay | transform / projection |
|---|---|---|---|---|---|---|
| G38-V3 | `google/gemini-3.8-flash` | `3` / `pi-ai:google` `mp4-17` | `gemma4-visible-text-tools-effort-offset6-2` | `tokenizer-basis/gemma4-visible-text-tools-effort-offset6-2` | `unsupported-marginal/1` | `openrouter-wire/2` / `openrouter-input-projection/3` |
| G37-V3 | `google/gemini-3.7-flash` | 同 G38-V3 | 同上 | 同上 | 同上 | 同上 |
| G38-V4 | `google/gemini-3.8-flash` | `4`（候选）/ `pi-ai:google` `mp4-N`（N 由主线发布协调分配，本页不猜） | `gemma4-visible-offset6-complete-output-group-estimated/1`（候选） | 同 V3，**显式设定**，不随算法名默认派生 | `unsupported-marginal/1`（同 V3，不升；K5） | 同 V3 |
| G37-V4 | `google/gemini-3.7-flash` | 同 G38-V4 | 同上 | 同上 | 同上 | 同上 |

| 行 | `reasoning_details` format | 允许的 detail | 身份：有值时须逐字命中 |
|---|---|---|---|
| G38-* | `google-gemini-v1` | 只收 T、S 两形（下节） | servingProvider `Google AI Studio`；upstreamModel `google/gemini-3.8-flash` |
| G37-* | `google-gemini-v1` | 同上 | servingProvider `Google AI Studio`；upstreamModel `google/gemini-3.7-flash` |

- **路由与参数**：origin.provider、原/今 basis.provider 精确为 `google-ai-studio`；当前 envelope.provider 恰为 `{order:['google-ai-studio'],allow_fallbacks:false,require_parameters:true}`。原 `origin.parameters.reasoningEffort` 与当前 wire `reasoning.effort` 分别限于缺席或 `low`/`medium`/`high`，**不要求相等**；原 `parameters.extra` 缺席或为空。max_tokens 改变不影响原 O。
- **不入表的原坐标**：definition 1/`mp4-2`、2/`mp4-3`，以及 3/`mp4-17` 在 `openrouter-input-projection/2` 下的事实。研究运行的原件用于选择估算，**不升格为 outputHistory 的原 basis**；这些组 unavailable，不 malformed。若主线确认有须解释的已存事实，另登记后继行，不按前缀放行。
- **身份**：origin 与 `observedInput.provenance` 上的 servingProvider/upstreamModel 缺席即放行、不被填补；有值须逐字命中本行。不宽匹配：slug `google-ai-studio`、Vertex 显示名 `Google`、带日期的端点名、`contains('Gemini')` 一概不命中。provenance.adapterRevision 须为 `openrouter-usage-reader/2`。origin 与 provenance 同名值互相冲突，由共享 `groupFactsValid` 判非法（planner 给 malformed，独立 full 给 unavailable，沿 v13）；其余不命中为 unavailable。
- **映射够不够**：09-28 原件支撑两款字面映射的**快照**：3.8 有 reader 产出的完整回复原件；3.7 只有研究脚本读到的四份截断帧——reader 取的是同一帧成员，字段级一致，但 3.7 的 reader 产出原件属**待核对**（GG-5）。显示名是否稳定未知；漂移时这两款的签名组失败闭合为 unavailable，靠新原件与新修订重开，不以宽匹配续命。
- **发布核表**：实施提交须从当前构建导出 V3、从实施构建导出 V4 的全部工厂坐标，逐字段核上表；任一不符先纠正本页或采用决定，不编造历史坐标。

## 推理详情的有限域与单元分类

| detail 形状 | 判定 | 要求 | 依据 |
|---|---|---|---|
| T：`reasoning.text` 文本条目 | 域内 | 成员恰为 `{type,text,format,index}`；text 为非空字符串且不等于 `[REDACTED]`；format `google-gemini-v1`；index 为非负 JSON 整数 | 9 份原件，其中唯一完整回复即 T-only 探针 |
| TS：`reasoning.text` 文本＋签名条目 | 域内 | 成员恰为 `{type,text,signature,format,index}`；text 与 signature 均为非空字符串且不等于 `[REDACTED]`；format `google-gemini-v1`；index 为非负 JSON 整数。这是共享 reader 按 R-L 把「文本片段＋紧随其后同 index 的仅签名片段」合并后的形状，即本页的签名组主形 | Gemini raw 帧的片段序列（8 份截断原件）与 Anthropic 同形真实观测（entry cecc12c9）；完整回复中的 TS 未观测（H-S） |
| S：`reasoning.text` 仅签名条目 | 域内 | 成员恰为 `{type,signature,format,index}`；signature 为非空字符串且不等于 `[REDACTED]`；其余同 T。只在仅签名片段前面没有可并入的同 index 文本片段时才独立成条 | 8 份截断原件的 raw 帧；领域层从未出现，属外推（H-S） |
| signature 为 null 或空串、text 为空串、带 `id`、其他任何成员 | 域外 | — | 未观测 |
| `reasoning.summary` | 域外 | 将来开放须有真实原件与新修订，要求非空 summary、排除 `[REDACTED]` | 未观测 |
| `reasoning.encrypted` | 域外 | 同上，要求非空 data、排除 `[REDACTED]` | 未观测 |
| 其他 format、同一数组内混合 format | 域外 | — | — |

单元分类（`OutputHistoryPolicy.classifyUnit`）：

- 单元没有 `reasoning_details` → `visible`，沿现 Gemma4 路径（含纯文本 `reasoning` 字符串）。
- `role` 为 `assistant`、没有 `reasoning` 成员、`reasoning_details` 为非空数组、逐条域内且**至少含一条 S** → `wholeGroup`。**T、S 的数量、次序与配对不作要求**：meter 不推断哪条签名属于哪段文本（这条安全线由 reader 的分组规则守），只要求整份数组与原组的唯一投影逐值相等（共享 `completeGroup`）。
- 同样条件但只含 T、不含 S → `uninterpretable`：K2 的映射待 GS-V7 决定，观测前 full unavailable → `input_size_unavailable`，与现行 V3 的收场相同。
- 其余 → `uninterpretable`。不以 false 落回 Gemma4 分词，不删块凑可见输入。

## 计量映射

`full(P) = G4(P ∖ W) + Σ_{g∈W} O(g)`，precision `estimated`。W 是被完整组认领的 assistant 单元；G4 是现 Gemma4 替身（全部剩余 messages/tools 的标量与键名 token 和，加本模型拟合 offset 6，每请求一次）；tokenMargin 仍只在最终门应用一次。

- O(g) 为原上游 `usage.output_tokens`，已含 reasoning（共享核拒绝 reasoning > O），不另加 reasoning_tokens，也不再计同组 content、tool_calls 与 details。净组 framing 取 0 是**明确的估算假设**：移出单元的角色与键名 token、OR 到 Gemini 的转换开销都不单列。
- 不是精确占用，不是上界，**误差方向未知**（K1）。W 目前只收带签名的组，而它的形状是外推的；K1 是否非空、误差多大都等 GS-V7。T-only 组不进入 W（K2）。
- 签名与 details 里的文本**从不进入 Gemma4**：整单元在计数之前移出消息序列；其余可见单元仍由现行 counter 计数。没有完整组的请求，结果与现行 meter 逐值相同。
- 部分、未知或不可解释的组 → 本次 full unavailable → `input_size_unavailable`，零 HTTP；可判伪造仍先由共享来源门给 `invalidInput{malformed}`（[RT12 S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)），不降级为 full。

## 与共享机制的接缝

- **共享、不改**：`src/input-meters/output-history.ts` 的 `fullOutputHistory`／`contributions`／`completeGroup`（owned copy、投影与来源核、完整组核、去重、精确加总、`addOutput`），`src/meter-transform.ts` 的 `relateMeterBases`，`src/assistant-projection.ts` 的唯一 assistant 投影。
- **Google 只提供两样**：一份 `OutputHistoryPolicy`——`classifyUnit`（上节）、`sourceApplies`（有限表、路由、参数、身份，以及组内每个带 opaque 的 thinking 块都满足 `routeName` 等于本行模型、成员恰为 `{routeName,reasoning_details}`、details 非空且逐条域内，且至少有一个这样的块）、`originalBasisApplies`（只认 V3/V4 行）、`requiresSignedPrefix` 恒 false、`projectionRevisionApplies` 只认 `openrouter-input-projection/3`；一个 `countBody`——把现 `measureFull` 内的守门、特征与 offset 原样搬入，行为逐字节不变。写法照 `src/input-meters/xai-family-policy.ts` 的有限表与身份守卫。
- `measureFull`：消息非空时委托 `fullOutputHistory`，否则 unavailable；`measureNew`/`measureReplay` **不提供**，沿 `defineInputMeter` 默认 unavailable（full-only）。
- **删除**：现 `google.ts` 里 body-only 的内联 `measureFull`（并入 `countBody`）与 3/`mp4-17` 的 factory 接受条件；不留旧 factory、不留兼容重载。直接以 body-only 调用的既有测试迁到完整 `FullMeterInput`（测试侧已有构造 helper）。
- **不需要共享改动**：policy 接口已覆盖本页全部谓词，停止条件未触发。`requiresSignedPrefix` 取 false 不是声称 Google 签名与前缀无关，而是本页没有这方面的研究（GG-3）：真实回放若出现与前缀相关的拒绝，那是上游拒绝层，按实际终结记录，不由计量兜底，并触发本页复议。

## 契约责任到兑现点

| 契约责任 | 兑现点（插件／服务／操作） | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③⑤：全部实际输入有有据计量，否则明确拒绝 | 公开 `planRequest` 与 transport service 的 plan；官方模型贡献固定的 Google meter 的 `measureFull` | `countBody`＋共享 `fullOutputHistory`；V4 候选 | 有前提地能：签名组的前提是 O-once 适用，而形状是外推（K1、H-S）；T-only 在 K2 判定前明确拒绝。GS-V2/V3；依据薄弱处见 GG-2、GG-3 |
| [RT12 S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)：真实性先于复用；basis 身份 | 共享来源门在前；policy 的 `sourceApplies`/`originalBasisApplies` 只认有限行与字面身份 | 共享核不改；Google policy 候选 | GS-V4/V5；3.7 身份映射待核对（GG-5） |
| [RT12 S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)：只证整组 aggregate；O 与 reasoning 不双加；margin 一次 | 共享 `completeGroup` 要求全部原块、同一消息、单一单元；`addOutput` 只加 O | 共享核不改 | GS-V3/V4 |
| [RT12 S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量) ⑥⑧：公开函数失败与缺席默认；有明确模型依据才 estimated，否则不可判 | 独立 `measureFull` 返回 unavailable 不产计量；φ/δ 为默认 unavailable；T-only 无 Google 依据，归「不可判」 | 沿 `defineInputMeter`；full-only 为共同约定 | GS-V4/V6；φ/δ 本轮不开（GG-6）；T-only 的依据待 GS-V7（K2） |
| [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)：只有 complete 组；不无条件把 O 当后继输入 | 本页只消费 `completeness=complete` 且带 opaque 的组，另要求 `source=reply`、O 已知且来自 upstream、有限表与身份 | 共享核＋Google policy | GS-V4；complete 标记本身的正确性归 GG-10 owner |

## 反例义务

| 反例 | 分组或投影后的样子 | 结果 | 判定者 |
|---|---|---|---|
| signature 或 text 为 `[REDACTED]`，或为空串 | 条目域外 | 单元 `uninterpretable` → `input_size_unavailable` | Google `classifyUnit` |
| 只含 T 的完整组（唯一真实完整形状） | details 逐条域内但没有 S | K2 判定前 `uninterpretable` → `input_size_unavailable`，与现行 V3 相同 | Google `classifyUnit` |
| 跨模型组 | 当前规划投影时 opaque 的 `routeName` 与本次路由不等 | 规划投影先以 `unavailable` 拒绝（非计量层）；即便投影通过，binding 模型不命中也 unavailable | 共享投影；`sourceApplies` |
| 跨路由组（Vertex 或其他供应商） | origin.provider 不是 `google-ai-studio`，或 servingProvider 为 `Google` 等 | unavailable | `sourceApplies` |
| 部分选择：只回放 text、跳过某块、删掉 details | 原块未全选、跨消息，或当前单元与原组投影不等 | unavailable；摘要可判不符时 planner 先给 malformed | 共享 `completeGroup`／来源门 |
| 截断回复（`length`） | 当前 reader 不给领域块附 details，单元只有可见 `reasoning` | 走现 Gemma4 可见路径，不进入本页；签名在 reader 一层已不保留（GG-10） | reader；`classifyUnit` |
| 签名冲突 | 无 id 时，仅签名片段只并入前一同 index 且尚无签名的文本片段；签名已存在再来不同签名即分离为独立条目（reader 规则），不构成冲突，整组 O 计一次；同 id 异签名只可能出现在带 id 的形状，id 在域外 | 前者可估；后者 unavailable | reader；`classifyUnit` |
| 篡改签名 | 未同步摘要 → 与原块摘要不符；连摘要一起自洽伪造 → 不可判 | 前者 malformed；后者计量不背书真伪，签名真伪归上游核验 | 共享来源门 |
| 身份有值但不命中 | 例如 slug、`Google`、带日期的模型名 | unavailable；origin 与 provenance 互相矛盾则 malformed | `sourceApplies`；共享 `groupFactsValid` |
| 原 basis 变化 | 原 V3、今 V4 → changedEffective；原 V4 → sameEffective；原坐标不在表 → unavailable；当前 basis 不是 V4 → unavailable | 前两者 full 独立应用 O；不借此复用 I | 共享 `relateMeterBases`＋`originalBasisApplies` |
| 无 id 片段 | 连续的无签名 T 片段合成一条；紧随其后同 index 的仅签名片段并入成 TS；签名后再来的无签名片段为新条目；交错的 T、S、T、S 保序合成 TS、TS 两条（R-L） | 整组 O 计一次，不按条数分摊 | reader；共享核 |
| reader 分组规则日后改变 | 原块摘要与当前投影不再相等 | unavailable 或 malformed，不静默重计 | 共享核 |
| 调用者自造、不属于任何历史组的带 details 单元 | 被分类为 `wholeGroup` 却无组认领 | unavailable | 共享 `contributions` |
| 同一单元同时带 `reasoning` 与 `reasoning_details` | 投影从不产出此形 | `uninterpretable` | `classifyUnit` |
| 全部消息都被完整组认领 | 剩余 messages 为空 | counter 拒空消息 → unavailable，不补假消息 | `countBody` |
| reasoning > O，或 O 未知 | — | unavailable | 共享核 |

## 关键选择

| 选择 | 本方 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|---|
| K1 签名组怎么计 | 完整组的原 O 计一次 | 可见文本经 Gemma4、签名计 0：替身在 H2 覆盖过「先前 thinking」的可见文本；若 Gemini 不回读隐藏推理，可见计数更接近。继续拒绝：零新主张，最诚实。删 details 再计：现有 counter 直接可用 | 签名组的形状从截断帧外推，真实完整签名组未观测，K1 可能是空集（H-S）；Google thought signature 的回送语义与计费未研究（GG-3），依据只有先例与「O ⊇ reasoning」的观察，误差方向未知；删 details 违背原样回放、可能破坏续接 | 中低 |
| K2 只含 T 的完整组（**主承载**：唯一真实完整形状） | 映射待 GS-V7 观测决定；观测前 unavailable（主调度 2026-09-30 裁决）。三个候选映射见下节 | 现在就钉 O-once：唯一真实形状立即可估，O 已含全部推理，方向保守。裁掉：本页题目原是签名组 | 唯一真实形状在观测前继续被拒，Google 多轮会话第二轮仍 `input_size_unavailable`，与现状同 | 高（「观测前不钉」）；映射方向本身尚无依据 |
| K3 detail 域 | 只收已观测的 T、S 两形（无 id；index 为任意非负整数） | 按 OpenRouter 归一 schema 收 text/summary/encrypted、id 可选（与 xAI、Anthropic 同形）：schema 跨厂商共享，形状稍变不会再被拒 | 上游一变形状就回到 `input_size_unavailable`，要新原件与新修订才能重开 | 高 |
| K4 身份 | 有值须逐字命中字面映射，缺席放行 | 有值一律 unavailable（xAI 源码在映射取得前的做法）：3.7 没有 reader 产出的完整回复原件 | 显示名漂移即失效；3.7 映射只由截断帧支撑 | 中高 |
| K5 修订 | definition、implementation、algorithm 一起升；tokenizer 与 replay 不伪升，replay 保留 `unsupported-marginal/1`（`src/input-meter.ts` 给无 φ 家族的共享默认名）。definition 升是有限表行键的需要：factory 与 `originalBasisApplies` 都按 definition＋implementation 查行，与 xAI V5、Anthropic 4/`mp4-18` 同构 | 新 replay 名写明 full-only：一眼可见 φ 未开，V3/V4 在 replay 上也分得开。只升 algorithm：definition 内容没变，升它是噪声 | 多一处发布协调；replay 名不区分 V3/V4，行只靠另外三个坐标区分；三个坐标在 GS-V7 前不钉 | 高 |
| K6（共同约定，非本页选择） | full-only，不把 φ/δ 接到共享 new/replay | 与 xAI 同时接线：共享函数现成 | 接线还需要共享 `calibration.ts` 认 `Google AI Studio` 显示名，否则 φ 永远落 `basis_changed`，属共享改动，不在本页 | — |

### K2 的三个候选映射

T-only 是本页在当前证据下唯一能命中的真实形状，所以 K2 是主承载，不是附加。三个候选都没有 Google 专属差分作依据，由 GS-V7 的最小观测判定，主线在采用决定里选定；选定之前 a 生效。

| 候选 | T-only 组怎么计 | 代价 | GS-V7 上什么读数选它 |
|---|---|---|---|
| a unavailable（观测前生效） | `classifyUnit` 给 `uninterpretable` | 唯一真实完整形状继续被拒，第二轮 `input_size_unavailable`，与现状同；不新增主张 | 上游拒绝原样回放无签名的 T，或实际 input usage 与 b、c 都对不上 |
| b O-once | 与签名组相同，归入 W，原 O 计一次 | 可能显著高估：唯一样本 O 313 中 312 是 reasoning，若上游不回读无签名的 thought，每轮约多计 300，N 轮累计约 N×300，窗口远未满时估算门就拒绝；方向保守，但不是上界。家族先例里没有一家把只含明文推理文本、没有签名的组按 O 计：[priority r5](priority-family-output-cache-candidate.md) 的 Anthropic 域要求 signed reasoning.text 带非空 signature、encrypted 带非空 data，`src/input-meters/xai-family-policy.ts` 只对非空 summary／encrypted 给 `wholeGroup` | 第二轮实际 input usage 与「O＋其余可见计数」吻合 |
| c 可见替身 | T 的 text 当可见文本经 Gemma4 计数，不加 O | 可能低估（若上游回读的不只是可见文本）；拟合证据只有研究 H2 的「先前 thinking」，那是 `reasoning` 字符串成员，不是 `reasoning_details` 里的 T，OR 对两者的转换是否相同未知；要改 `classifyUnit` 与 `countBody`，并放弃「details 文本从不进入 Gemma4」这一条 | 第二轮实际 input usage 与可见计数吻合 |

## Cordis、装卸与存储

没有新的 plugin、service、fiber、inject、事件或 effect。官方模型贡献插件照旧登记完整定义与 meter，lease 固定整份实现；换代只影响新借用。配置错误沿既有政策：定义与官方不符时 factory 缺席，tokenizer 资源摘要不符时 factory 抛错——官方插件因此启动失败，公开注册具名拒绝，不发布半份。重跑与失败语义只继承已登记的 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)。

| 取得什么、何时可用 | 谁拥有，部分失败怎么收口 | 撤除时释放、交接什么，什么仍为真 |
|---|---|---|
| V4 meter（Gemma4 tokenizer、Google policy、countBody）在坐标钉定、采用之后随定义校验一起发布 | 官方模型贡献 owner；任一构件失败则整份不发布 | retire 停止新借用，旧 lease 固定原整份；不能单独热换 policy 或有限表 |
| 本次调用的 owned 历史组与覆盖分配 | 本次 planner；校验失败丢弃派生值，无写入、无外部资源 | 调用结束即释放；原响应、原 O 与原 basis 不变，不回写 |
| 已接纳的在途 plan/invoke | 原 invocation owner | 内核不取消在途调用：跑完，按各自那一次的计划与提交收场 |

新增存储要求 **0**，没有跨 owner 的同一提交，没有新装配节点。归装配的事项没有新增：tokenMargin、凭据与诊断沿既有宿主。

## 验证义务与逐叶采用矩阵

无新状态机、并发或持久关系，不新增 TLA/Alloy；`UsageCalibration.tla` 不覆盖组映射（沿 v13 H13-G4），不绑。**新增 bindings 0**，证据形式为下列参数化正反测试与真实差分。

| 义务 | 必须新增的可失败验收 | 不能冒用 |
|---|---|---|
| GS-V1 有限表与发布 | 两叶 V3（当前构建）、V4（实施构建）工厂逐字段导出核表；未知 definition/implementation/algorithm/projection、跨模型、身份不命中的反控；tokenizer 与 replay 坐标不变；旧 factory 已删 | 不以手抄坐标代替导出 |
| GS-V2 详情域 | TS（合并单条）、TS＋TS、独立 S、TS 与 T 混排为 `wholeGroup` 正例；只有 T 的完整组单列，K2 判定前须得 `uninterpretable` 并以 `input_size_unavailable` 收场；`[REDACTED]`（两种）、空 text、空或 null signature、带 id、summary、encrypted、异 format、混合 format、非 assistant、同时带 `reasoning` 逐一为负例；夹具须经真实 reader 从片段序列合成，不手写合并后的条目 | 负例须各自单独失败，不能只测一个 |
| GS-V3 唯一贡献 | full＝G4(剩余)＋ΣO；两组各计一次；reasoning 不另加；margin 一次；spy 证明签名与 details 字符串对 tokenizer 的调用为零；无完整组的请求与现行 meter 逐值一致，有完整组时剩余部分等于现 counter 对同一剩余 body 的结果。变异反控：去掉 O 加项、或让 counter 接收 details 单元，用例必须失败 | 不以估算单调递增代替数值核对 |
| GS-V4 完整性与真实性 | 部分选择、乱序、跨消息、缺块、重复认领、未认领的 details 单元、摘要篡改（malformed）与自洽伪造（只走 unavailable 分支）；截断回复不产生 `wholeGroup`；独立 `measureFull` 对非法输入返回 unavailable 且不产计量 | 不只测 planner，须直调 factory 返回的方法 |
| GS-V5 失效 | 原 V3→今 V4 可 full；原坐标不在表 unavailable；当前 effort 或 max_tokens 改变仍可 full；身份不命中 unavailable；origin 与 provenance 冲突 malformed | — |
| GS-V6 本机两入口 | 现 `tests/google-three-round-invoke.spec.ts` 的签名用例由「第二轮 `input_size_unavailable`」翻转为「第二、三轮 full estimated 并发送，wire 原样带 details」：public 与 Cordis 两入口、有无工具、三档 effort；φ/δ 调用仍为 unavailable；首轮 SSE `provider` 用真实显示名；另加 SSE `provider` 为 slug 时签名组 unavailable 的负控；另加只含 T 的完整首轮回复，第二轮仍 `input_size_unavailable`、零 HTTP；`replayRevision` 断言保持 `unsupported-marginal/1`。签名用例的首轮流是截断 raw 帧的形状加合成结尾，只证机制，不证形状 | 受控输入删掉 details 后通过不算成功 |
| GS-V7 真实认证（付费，归主调度） | **最小观测，钉坐标之前先做**：放大 max_tokens 重跑 09-28 的固定 body，捕获 raw SSE；再把所得完整回复原样回放一轮，比较实际 input usage 与 O、与可见替身计数。前一步回答 K1 是否非空（完整回复里有没有 S，证伪或维持 H-S），后一步回答 K2 取 a、b 还是 c。raw 落盘依赖认证工具 R6 的开关：现公开调用边界不暴露 raw SSE 正文，开关未就绪时的运行只有领域结果，不满足本项。之后每叶真实 public 与 service 三轮，其中一轮工具续接，同样捕获 raw SSE；记录完整 wire、source、basis、O、实际 input usage、cost 与估计误差；观察上游是否接受原样回放、工具回复里签名的位置。上游拒绝或出现前缀绑定 → 本页复议，不以删签名规避 | 本机合成流、研究截断原件都不是完整签名组的认证 |
| GS-V8 旧证据复用 | fit/holdout 与公开探针的字节级结论只复用于可见 counter（这些输入无完整组，剩余计数不变），须在 V4 构建上重跑核对 | 不能充当签名组的真实认证；旧的第二轮拒绝用例保留为回归负控 |

| 叶 | 当前 → 候选坐标 | 身份映射依据 | 完整签名组真实原件 | 工具续接真实形状 | GS-V1–V6（本机） | GS-V7（真实） | 采用后可声称 |
|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | 3/`mp4-17` → 4/`mp4-N`（候选，GS-V7 前不钉） | reader 产出的完整回复 1 份＋截断 raw 4 份 | 无（截断帧外推） | 无 | 待实施 | 待付费，先做最小观测 | 本机：签名组多轮 full 可估（estimated，无误差界，形状外推）；T-only 组仍 `input_size_unavailable`；真实回放接受与误差未知 |
| `google/gemini-3.7-flash` | 同上 | 只有截断 raw 4 份（待核对） | 无（截断帧外推） | 无 | 待实施 | 待付费，先做最小观测 | 同上；首个 reader 产出的真实原件核对之前，身份映射属待核对 |

## 缺口与受阻消费者

| 编号 | 缺口 | 条款坐标 | owner | 受阻消费者 |
|---|---|---|---|---|
| GG-1 | 逐份 raw 的推理详情形状与公开探针领域结果没有 research 家，本页读数不替代研究 | — | research（Google 研究页） | 采用决定的依据引用 |
| GG-2 | 真实完整签名组未观测，签名组形状由截断帧外推，H-S 未证伪；工具回复形状未观测；此前付费运行未捕获完整回复的 raw SSE，raw 落盘依赖认证工具 R6 的开关 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③、[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准) | 主调度（GS-V7 最小观测） | 两叶多轮真实认证；K1 是否非空；三个坐标的钉定 |
| GG-3 | Google thought signature 语义（是否必须原样回送、是否与前缀绑定、回送后计入多少输入）没有研究：**假设，须按来源核对取证** | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③ | research | K1 置信度；`requiresSignedPrefix` 取 false 的依据 |
| GG-4 | 上游是否接受原样回放未观测 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③ | 主调度（付费） | 两叶多轮认证 |
| GG-5 | 3.7 身份映射只有截断帧；显示名稳定性未知 | [RT12 S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效) | 主调度（GS-V7 补 reader 产出原件） | 3.7 带身份的签名组 |
| GG-6 | φ/δ 不开；将来开放需共享 `calibration.ts` 认 `Google AI Studio` 显示名 | [RT12 S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量) ⑧ | 主线（共享 owner） | 无：本轮不是交付门 |
| GG-7 | 图片计量仍 unavailable（本页不涉）；音视频本期范围外 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ④ | 各自既有 owner | 不由本页解除 |
| GG-8 | definition `4` 与 mp4 编号由主线发布协调，GS-V7 之前不钉 | — | 主线 | 实施提交与 GS-V1 |
| GG-9 | 已闭合：共同约定三项的 record 家为 [D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md)（R-A、R-F＋R-L、R-I） | — | — | — |
| GG-10 | 截断回复（`length`）的 details 在 reader 一层不保留，runtime 却把该输出组记为 complete：`packages/model/pi-ai-transport/src/stream.ts:438` 只在 finish 不是 `length` 时发带 opaque 的收束事件 → `packages/core/stream-assembly/src/blocks.ts:66` 的 `settleBlock` 对未收束块只以文本结算、不带 opaque → `packages/model/model-request-runtime/src/invoke.ts:644` 按 `'ended' in end` 记 `complete`（行号于 `31a14838`）。它与 [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)「completeness=complete 表示实际收到且保留」是否相符、怎样收口，**已单独转 reader/runtime owner**。本页只消费 completeness=complete 且带 opaque 的组；complete 标记本身的正确性归 GG-10 owner。共享行为，不限于 Google，不阻本页 | [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放) | 共享 reader 与 runtime owner（已转） | 截断后续接的签名或密文回放；各家截断回复的 opaque 保全 |
| GG-11 | K2 的映射方向（a／b／c）待 GS-V7 判定，选定前 a 生效 | [RT12 S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量) ⑧ | 主线（采用决定），依据由主调度 GS-V7 提供 | Google 多轮会话：唯一真实完整形状第二轮仍被拒 |

本页自身没有兑现不了的条款；GG-10 记录的共享层 complete 标记与 MR11 S-43 的不一致不在本页兑现范围，已转 owner。机制接线按主调度 2026-09-30 裁决可先行实施与正反验证；三个坐标的钉定与官方发布等 GS-V7 与主线采用决定。

## 修订记录

- revision 3（2026-09-30）：共享 reader 采用 R-L（[D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md)）后同步领域表：文本片段与紧随的仅签名片段合并成 TS 条目并作为签名组主形，S 仅在无可并入文本时独立；反例表与 GS-V2 随之改写；GG-9 指向 D-111。
- revision 2（2026-09-30）：据 2026-09-30 架构评审修订。要点：证据关系改正（T-only 为唯一真实完整形状，签名组为截断帧外推，H-S 挂 GS-V7）；K2 改为映射待 GS-V7 判定、观测前 unavailable，列 a／b／c；replay 保留 `unsupported-marginal/1`；MR11 S-43 兑现行改写；GS-V7 加最小观测；GG-9 改为指针；GG-10 转 reader/runtime owner；新增 GG-11。
