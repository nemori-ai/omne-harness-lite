# Google 两叶 `google-gemini-v1` 推理历史的完整输出组计量

2026-09-30，revision 4，**candidate：工具路径的真实完整形状已观测，独立架构评审 2026-09-30「修后可采用」，G-R1／G-R2 已按评审闭合，待主线采用；未采用、未实施、未实际验证；新增 bindings 0**。接续已采用的 [v13 多输出组交接](v13-output-history-design.md)、[共享家族机制 revision 5](priority-family-output-cache-candidate.md)（priority-family 决定）、[xAI 有限适用 revision 2](xai-complete-output-applicability-candidate.md)（xAI 决定）与[原 basis 适用接缝](image-preparation-basis-applicability-candidate.md)，不改它们的受审字节。采用形式比照 xAI 决定与 Qwen 采用：形状观测之后采用，机制接线先行，真实三轮回放（GS-V7）作实施完成门，同路由对照（GS-V9）必做；本页另建议 GS-V9 的回放接受读数先于坐标钉定（K7）。主调度 2026-09-30 的裁决「机制接线（policy、countBody、共享核委托、K3 域、K4 身份、K5 修订规则；replay 保留 `unsupported-marginal/1`）可先行实施与正反验证」继续有效，K3 域以本修订为准。

本页只回答一件事：**full 估算怎样对待同模型、完整的 `google-gemini-v1` 推理历史组**，目标是让带回首轮推理详情的续轮请求不再在发送前被官方 meter 拒绝。证据关系：**主承载是工具路径的密文组（E-only）**——2026-09-30 两叶各一份当前绑定的真实完整工具调用回复，raw SSE 已捕获，推理详情恰为一条 `reasoning.encrypted`；它按共享机制以原 O 计一次（K1）。只含文本条目的组（T-only，09-28 唯一的非工具完整回复）仍 unavailable（K2）；带签名的 `reasoning.text`（TS、S）只见于截断帧，移出域（K3）。不开 φ/δ，不涉图片与音视频，不新增公共契约、服务、插件、状态、存储或第二个 walker。持续消费者是两款 Google 官方定义及其 InputMeter、公开 `planRequest`/`invokeModel`、transport service 的 lease 消费者；上游推理流形状、身份字面值或计费口径变化，或共享输出组核、reader 分组规则、工具调用 id 的投影换方案时，复核本页。

## 基准、坐标与共同约定

| 项 | 内容 | 认知状态 |
|---|---|---|
| 装配基准 | 目标态＝已采用的共享完整输出组机制＋两叶当前 definition `3` / `pi-ai:google` `mp4-17`（源码 `packages/model/pi-ai-transport/src/input-meters/google.ts`，起草基线 `f8e55130`）。该 meter 的逐消息成员白名单不含 `reasoning_details`（同文件 `supported()`），带回首轮详情的续轮 full 为 unavailable，规划以 `input_size_unavailable` 拒绝、零 HTTP。09-30 真实运行的执行提交 `104ce616` 与起草基线之间，`stream.ts`、`assistant-projection.ts`、`input-meters/google.ts`、`input-meters/output-history.ts` 无差异 | 已知：源码、git 比对、09-30 第 2 轮计划拒绝收据 |
| 三个坐标 | definition `4`、implementation `pi-ai:google` `mp4-N`、algorithm `gemma4-visible-offset6-complete-output-group-estimated/1`。rev3 不钉的理由是真实完整形状未观测，09-30 原件已解除它：**证据上可钉**。钉定时机与 N 归主线采用决定与发布协调，本页不猜 N，建议在 GS-V9 的 A 变体读出上游接受之后钉（K7）。坐标一经官方发布就进入已保存的 basis | 推导；采用与编号归主线 |
| 契约 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)、[S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)、[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)、[S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)；[MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)；本页消费、不改 [content-blocks v3 S-9](../../../../spec/data/content-blocks/v3/contract.md#s-9-思考块与不透明数据)（opaque 原样带回，思考文本可为空串）与 [S-14](../../../../spec/data/content-blocks/v3/contract.md#s-14-callid)（CallId 由登记方保证唯一，怎么做归 realization）。catalog 均 accepted；计量义务沿 RT10/MR9（D-107） | 契约承诺 |
| 共同约定 | ① Google 本轮 **full-only**：φ/δ 保持 `defineInputMeter` 默认 unavailable（R-A）；② 共享 reader 对 `reasoning.text` 片段按 R-F＋R-L 合并，`reasoning.encrypted` 不合并；③ 本期只交付 text 与 image（R-I）；④ 换路由的 opaque 思考块由 transport 规划拒绝 `unavailable`、不剥离不降级（R-K）；⑤ `reasoning.encrypted` 的 data 为 `[REDACTED]` 判不可解释（R-M）。均由 D-111 登记 | 共同约定裁定 |
| Cordis | 沿 D-025 采用 4.0.4；本页不新增上游语义主张 | 采用决定 |

## 真实原件与形状读数

逐帧读数的长期家是研究页 `research/model-request-adaptation/vendor-continuation/google/2026-09-30-complete-reply-originals.md`：09-30 两份完整回复的逐帧形状、用量与领域结果，以及 09-28 八份截断原件的签名形状与 SHA-256。本页只取承重结论。记号：

- **E**＝成员恰为 `{type,data,format,id,index}`：type `reasoning.encrypted`；data 为非空字符串且不等于 `[REDACTED]`；format `google-gemini-v1`；id 为非空字符串；index 为非负 JSON 整数。
- **T**＝成员恰为 `{type,text,format,index}`：type `reasoning.text`；text 为非空字符串且不等于 `[REDACTED]`；format、index 同上。
- **S**＝成员恰为 `{type,signature,format,index}`；**TS**＝成员恰为 `{type,text,signature,format,index}`，是共享 reader 按 R-L 把文本片段与紧随的同 index 仅签名片段合成的形状。

| 原件 SHA-256 | 叶 · 路径 | 结束 | 推理详情 | 身份 | O / reasoning |
|---|---|---|---|---|---|
| `390408a160e9a1d205bf5d223d8dfc5ae789b642894d90a2dc176796d865cf22`（09-30 raw SSE） | 3.8 · 带一个工具，首轮 | `tool_calls`（`STOP`），complete | 恰一条 E：id `call_476730` 等于同回复工具调用的上游 id；data 748 字节，一帧到齐 | 5/5 帧 `Google AI Studio` / `google/gemini-3.8-flash`，reader 产出同值 | 110 / 93 |
| `a213dbb82bbe03b36b1fcbc1d06e4e08202fd1f1c2f10c79aa775ca7f10dbe58`（09-30 raw SSE） | 3.7 · 同上 | 同上 | 恰一条 E：id `call_449710` 等于同回复工具调用 id；data 560 字节 | 5/5 帧 `Google AI Studio` / `google/gemini-3.7-flash`，reader 产出同值 | 81 / 64 |
| `d2cda4fcb15fef0da08bf60f6e31d542fcad32d8f1d37400e1eaf2acfd714d6e`（09-28 领域结果；**raw 未捕获**） | 3.8 · 无工具，公开文本探针 | `stop`，complete | 只有 T | reader 产出 `Google AI Studio` / `google/gemini-3.8-flash` | 313 / 312 |
| 09-28 fit／holdout 八份（SHA-256 见研究页） | 两叶 · 无工具 | `length`（`MAX_TOKENS`，试点 32-token 上限） | T → S，或只有 S；领域层不带 details（GG-10） | 帧内 `Google AI Studio` / 精确模型 ID | 28–29 / 27–29 |

- **主承载是 E-only**：两叶首轮都是 `thinking`＋`tool_call` 两块，思考块可见文本为空串（帧内 `reasoning` 为 null；[S-9](../../../../spec/data/content-blocks/v3/contract.md#s-9-思考块与不透明数据) 允许），opaque 恰一条 E；输出组 complete、O 来自上游。同批第 2 轮把这一组带回，现行 meter 在计划期以 `input_size_unavailable` 拒绝、零 HTTP——这正是本页要释放的缺口。首轮 full 的可见替身预测 948／950，实际 949／951。
- **H-S 的处置**：rev3 的待证伪假设「S 只伴随截断帧出现，完整回复不带 S」按字面既未证伪也未证实——迄今三份完整回复都不带 S。但它的推论「完整回复不带签名类材料，签名组可能是空集」在工具路径上被推翻：完整工具调用回复带 E。E 的 data 与 09-28 S 的 signature 解码首字节都是 `0x12`（10/10），只是编码前缀相同的观察，是否同一种上游载荷未知。
- **E 的 id 绑定上游工具调用 id**（2/2）。reader 原样保留 E（含 id），但领域 CallId 由 reader 另行生成（[S-14](../../../../spec/data/content-blocks/v3/contract.md#s-14-callid)，`src/stream.ts` 的 `generatedCallId`），投影以它写回 `tool_calls[].id`；所以回放时 E 的 id 与回放出去的工具调用 id **不相等**。上游是否凭 id 把 E 重新关联到工具调用，没有依据（GG-14）。 修复空间可能触及契约：S-9 禁止出网时改写 opaque（E.id）、S-14 把 CallId 唯一性交给登记方、S-12 工具调用块无承载上游 id 的成员——GG-14 的 owner 行注明「可能需 content-blocks 规格演进」，不当作 reader 局部缺陷搁置（评审 O-2）。
- **未观测**：非工具路径在当前绑定下的完整形状（唯一的非工具完整回复是 09-28 的领域结果，raw 未捕获，不能代表当前绑定）；一次回复多个工具调用；E 分片流出；E 与 T 混排；其他 effort；上游是否接受原样回放；回放的 E 计入多少输入。
- **身份**：两叶都有 reader 产出的完整回复原件与逐帧 raw，字面映射 `Google AI Studio`／精确模型 ID 不再依赖截断帧（GG-5 闭合）。研究区 09-30 端点快照（`research/model-request-adaptation/vendor-continuation/media-carriage/audio-video-carriage-2026-09-30/openrouter-endpoints/` 下两款文件）的 AI Studio 端点 `provider_name` 同为 `Google AI Studio`；端点名带日期后缀，SSE `model` 不带。
- **O ⊇ reasoning**：11/11 `reasoning_tokens ≤ completion_tokens`；同一端点快照 `internal_reasoning` 单价等于 `completion`。这是观察，不是上游计数契约。

## 有限适用表

每行同时要求精确模型 ID、固定路由 `google-ai-studio` 与下列坐标整体命中；不按版本范围、mp4 前缀或模型名相似匹配。采用后 V4 为唯一当前可执行 factory，V3 只解释 3/`mp4-17` 已保存的事实，不保留旧 factory、旧执行入口或兼容分支。

| 行 | 模型 ID | definition / implementation | meter algorithm | tokenizer | replay | transform / projection |
|---|---|---|---|---|---|---|
| G38-V3 | `google/gemini-3.8-flash` | `3` / `pi-ai:google` `mp4-17` | `gemma4-visible-text-tools-effort-offset6-2` | `tokenizer-basis/gemma4-visible-text-tools-effort-offset6-2` | `unsupported-marginal/1` | `openrouter-wire/2` / `openrouter-input-projection/3` |
| G37-V3 | `google/gemini-3.7-flash` | 同 G38-V3 | 同上 | 同上 | 同上 | 同上 |
| G38-V4 | `google/gemini-3.8-flash` | `4` / `pi-ai:google` `mp4-N`（N 由主线发布协调分配） | `gemma4-visible-offset6-complete-output-group-estimated/1` | 同 V3，**显式设定**，不随算法名默认派生 | `unsupported-marginal/1`（同 V3，不升；K5） | 同 V3 |
| G37-V4 | `google/gemini-3.7-flash` | 同 G38-V4 | 同上 | 同上 | 同上 | 同上 |

| 行 | `reasoning_details` format | 允许的 detail | 身份：有值时须整对逐字命中 |
|---|---|---|---|
| G38-* | `google-gemini-v1` | 只收 E（下节）；T-only 单元按 K2 | servingProvider `Google AI Studio`；upstreamModel `google/gemini-3.8-flash` |
| G37-* | `google-gemini-v1` | 同上 | servingProvider `Google AI Studio`；upstreamModel `google/gemini-3.7-flash` |

- **路由与参数**：origin.provider、原/今 basis.provider 精确为 `google-ai-studio`；当前 envelope.provider 恰为 `{order:['google-ai-studio'],allow_fallbacks:false,require_parameters:true}`。原 `origin.parameters.reasoningEffort` 与当前 wire `reasoning.effort` 分别限于缺席或 `low`/`medium`/`high`，**不要求相等**；原 `parameters.extra` 缺席或为空。max_tokens 改变不影响原 O。
- **不入表的原坐标**：definition 1/`mp4-2`、2/`mp4-3`，以及 3/`mp4-17` 在 `openrouter-input-projection/2` 下的事实。研究运行与认证运行的原件用于选择估算，**不升格为 outputHistory 的原 basis**；这些组 unavailable，不 malformed。若主线确认有须解释的已存事实，另登记后继行，不按前缀放行。
- **身份按对判定**（照 xAI 决定守卫 4）：origin 与 `observedInput.provenance` 上的 servingProvider/upstreamModel 两字段都缺席即放行、不被填补；只有一个字段有值 → unavailable；有值须整对逐字命中本行。origin 与 provenance 须报告同一对（含同缺）：同名值两边都有且不等，由共享 `groupFactsValid` 判非法（planner 给 malformed，独立 full 给 unavailable，沿 v13）；一边有一边缺 → unavailable。provenance.adapterRevision 须为 `openrouter-usage-reader/2`。不宽匹配：slug `google-ai-studio`、Vertex 显示名 `Google`、带日期的端点名、大小写或空白变体、`contains('Gemini')` 一概不命中。（复核本页的触发条件含 reader 修订号因 R-L 等分组规则变化而提升：届时 V4 对新 reader 产出的 E 组整体 unavailable，须修订有限表——失败方向为关闭）
- **映射够不够**：09-30 原件支撑两款字面映射的**快照**。显示名是否稳定未知；漂移时这两款的 E 组失败闭合为 unavailable，靠新原件与新修订重开，不以宽匹配续命。
- **发布核表**：实施提交须从当前构建导出 V3、从实施构建导出 V4 的全部工厂坐标，逐字段核上表；任一不符先纠正本页或采用决定，不编造历史坐标。meter 的 evidence 串写明 09-30 两条 generation id（`gen-1790765022-soWzJ2kSKKIdOhKsWM7Z`、`gen-1790765039-T89IaeRcxSpJm8DIEXzO`）与「O 计一次、无误差界」。

## 推理详情的有限域与单元分类

| detail 形状或单元组成 | 判定 | 依据 |
|---|---|---|
| E | 域内 | 09-30 两份原件：工具路径完整回复，恰一条，id 等于同回复工具调用的上游 id |
| 单元内多条 E | 域内，条数不限，逐条核形 | 未观测（并行工具调用或密文分片都可能产生）；O 只计一次，与条数无关 |
| 只含 T 的单元（T-only） | `uninterpretable`，K2 候选 a 生效（GG-13） | 09-28 公开探针的领域结果；非工具路径 |
| E 与 T 混排 | 域外 | 未观测；两种形状的组合要有真实原件 |
| TS、S，及它们与 T、E 的任何混排 | 域外 | 只见于 8 份 `MAX_TOKENS` 截断帧；截断回复在 reader 一层不带 details（GG-10），从未构成领域组 |
| E 缺 id，或 id 为 null、空串、非字符串 | 域外 | 未观测 |
| E 的 data 为 `[REDACTED]`、空串或非字符串 | 域外 | R-M 与 xAI 先例：占位不是可回放的密文 |
| E 另带 signature、text、summary 或任何其他成员 | 域外 | 未观测 |
| `reasoning.summary` | 域外 | 未观测；将来开放须有真实原件与新修订 |
| 其他 format、同一数组混合 format | 域外 | — |
| routeName 与本次路由不等的 opaque（跨模型） | 不进计量：规划投影先以 `unavailable` 拒绝 | R-K；transport [design.md 助手消息思考块行](design.md#线上请求怎样组) |
| 跨供应商路由（Vertex 等）的原组 | `sourceApplies` 不命中 → unavailable | 有限表 |

单元分类（`OutputHistoryPolicy.classifyUnit`）：

- 单元没有 `reasoning_details` → `visible`，沿现 Gemma4 路径（含纯文本 `reasoning` 字符串）。
- `role` 为 `assistant`、没有 `reasoning` 成员、`reasoning_details` 为非空数组且逐条是 E → `wholeGroup`。meter **不核** E 的 id 与单元内工具调用的对应，也不核条目次序或配对：回放出去的工具调用 id 是投影生成值，从不等于 E 的 id（GG-14）；完整性由共享 `completeGroup` 核「整份单元与原组的唯一投影逐值相等」。
- 同样条件但逐条是 T → `uninterpretable`（K2 候选 a；GG-13 判定前与现行 V3 收场相同）。
- 其余 → `uninterpretable`。不以 false 落回 Gemma4 分词，不删块凑可见输入。

## 计量映射

`full(P) = G4(P ∖ W) + Σ_{g∈W} O(g)`，precision `estimated`。W 是被完整 E 组认领的 assistant 单元；G4 是现 Gemma4 替身（全部剩余 messages/tools 的标量与键名 token 和，加本模型拟合 offset 6，每请求一次）；tokenMargin 仍只在最终门应用一次。

- **O(g) 是原上游 `usage.output_tokens`**，已含 reasoning（共享核拒绝 reasoning > O），不另加 reasoning_tokens，也不再计同组 content、tool_calls 与 details；净组 framing 取 0 是**明确的估算假设**：移出单元的角色与键名 token、OpenRouter 到 Gemini 的转换开销都不单列。这是 xAI 决定所称「workload 相关 estimated」，不是精确占用，也不是上界。
- **依据**（三条都不构成误差界）：① 家族先例——共享机制已采用，xAI 决定对 encrypted 组、priority r5 对 Anthropic 非空 encrypted data 都以完整原组的 O 计一次；② O ⊇ reasoning 的 11/11 观察；③ 09-30 首轮的可见替身残差 −1／−1（预测减实际，带工具、`effort: high`、约 950 token，无 holdout），这只关乎 P ∖ W 的那一项。
- **误差方向未知**：09-30 两组的 O 为 110／81，其中 reasoning 93／64，其余 17／17 是工具调用。若上游把回放的 E 计为约 0 个输入 token，O 一次每组约多计 reasoning 那么多（此例 93／64，随 effort 与任务增长，在多轮工具会话里累加，估算门可能在窗口远未满时拒绝）；若上游把 E 展开成多于 O 的上下文，则少计。两者都未观测；GS-V9 量 E 的实际计入量 Δ_E。残差只作记录，不引入修正常数（沿 Moonshot、Qwen 采用的做法）；是否复议 K1 由主线据 GS-V9 在后继决定里裁，本页不预设阈值。
- **密文与 id 从不进入 Gemma4**：整单元在计数之前移出消息序列；其余可见单元仍由现行 counter 计数。没有完整组的请求，结果与现行 meter 逐值相同。
- 部分、未知或不可解释的组 → 本次 full unavailable → `input_size_unavailable`，零 HTTP；可判伪造仍先由共享来源门给 `invalidInput{malformed}`（[RT12 S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)），不降级为 full。

## 与共享机制的接缝

- **共享、不改**：`src/input-meters/output-history.ts` 的 `fullOutputHistory`／`contributions`／`completeGroup`（owned copy、投影与来源核、完整组核、去重、精确加总、`addOutput`），`src/meter-transform.ts` 的 `relateMeterBases`，`src/assistant-projection.ts` 的唯一 assistant 投影。
- **Google 只提供两样**：一份 `OutputHistoryPolicy`——`classifyUnit`（上节）、`sourceApplies`（有限表、路由、参数、身份对，以及组内每个带 opaque 的 thinking 块都满足 `routeName` 等于本行模型、成员恰为 `{routeName,reasoning_details}`、details 非空且逐条是 E，且至少有一个这样的块）、`originalBasisApplies`（只认 V3/V4 行）、`requiresSignedPrefix` 恒 false、`projectionRevisionApplies` 只认 `openrouter-input-projection/3`；一个 `countBody`——把现 `measureFull` 内的守门、特征与 offset 原样搬入，行为逐字节不变。写法照 `src/input-meters/xai-family-policy.ts` 的有限表与身份守卫。
- `measureFull`：消息非空时委托 `fullOutputHistory`，否则 unavailable；`measureNew`/`measureReplay` **不提供**，沿 `defineInputMeter` 默认 unavailable（full-only）。
- **删除**：现 `google.ts` 里 body-only 的内联 `measureFull`（并入 `countBody`）与 3/`mp4-17` 的 factory 接受条件；不留旧 factory、不留兼容重载。直接以 body-only 调用的既有测试迁到完整 `FullMeterInput`（测试侧已有构造 helper）。
- **R-F＋R-L 与 E 无交集**：合并规则只作用于 `reasoning.text`（`stream.ts` 另合并 `reasoning.summary`）；`reasoning.encrypted` 条目逐条原样压入思考块，id 与 data 不被改写。若上游把一条 E 拆成多片，每片各成一条，须各自是完整的 E 形才域内（缺 id 或 data 的片段落域外 → unavailable）。T 的合并规则不变，T-only 的分类不受影响。
- **R-K**：跨模型的 opaque 思考块在规划投影处拒绝，本页不增不减；同会话切模型后怎样处置外来 opaque 块，是 D-111 登记给运行时上下文组装的 GG-11，不归本页。
- **R-M**：data 为 `[REDACTED]` 的 E 域外（上节）。
- **工具调用 id**：reader 与投影都不改 E 的 id，投影写回的工具调用 id 是 reader 生成的 CallId。本页**不改写** opaque，也不改工具调用 id 的投影；GS-V7、GS-V9 若显示上游因此拒绝或静默丢弃 E，转 reader／投影 owner（GG-14），不在计量里兜底，也不以删签名规避。
- **不需要共享改动**：policy 接口已覆盖本页全部谓词。`requiresSignedPrefix` 取 false 不是声称 Google 签名与前缀无关，而是本页没有这方面的研究（GG-3）：真实回放若出现与前缀相关的拒绝，那是上游拒绝层，按实际终结记录，不由计量兜底，并触发本页复议。 **显式范围（评审 G-R2）**：GS-V7／GS-V9 的历史都只在签名轮之后追加，不改签名轮之前的前缀；E 组之前的前缀发生变化（上下文压缩、system／tools 改动）后再回放 E **不在本页覆盖范围**，采用后不得据此声称；该场景的受阻消费者归 GG-3（与 GG-11 同 owner），是否加一个改前缀的 GS-V9 变体归主调度。

## 契约责任到兑现点

| 契约责任 | 兑现点（插件／服务／操作） | 实现与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③⑤：全部实际输入有有据计量，否则明确拒绝 | 公开 `planRequest` 与 transport service 的 plan；官方模型贡献固定的 Google meter 的 `measureFull` | `countBody`＋共享 `fullOutputHistory`；V4 候选 | 有前提地能：E 组的前提是 O 一次适用（K1，误差方向未知，GS-V9 量 Δ_E）且上游接受原样回放（GG-4、GG-14）；T-only 在 GG-13 判定前明确拒绝。GS-V2/V3；依据薄弱处见 GG-3 |
| [RT12 S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)：真实性先于复用；basis 身份 | 共享来源门在前；policy 的 `sourceApplies`/`originalBasisApplies` 只认有限行与字面身份对 | 共享核不改；Google policy 候选 | GS-V4/V5；身份对取自 09-30 原件（GG-5 闭合） |
| [RT12 S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)：只证整组 aggregate；O 与 reasoning 不双加；margin 一次 | 共享 `completeGroup` 要求全部原块、同一消息、单一单元；`addOutput` 只加 O | 共享核不改 | GS-V3/V4 |
| [RT12 S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量) ⑥⑧：公开函数失败与缺席默认；有明确模型依据才 estimated，否则不可判，无映射不填零 | 独立 `measureFull` 返回 unavailable 不产计量；φ/δ 为默认 unavailable；E 组以家族先例为依据计 O；「E 计 0」没有映射依据，不采用；T-only 无 Google 依据，归不可判 | 沿 `defineInputMeter`；full-only 为共同约定 | GS-V4/V6；φ/δ 本轮不开（GG-6）；T-only 的依据待 GS-V10（GG-13） |
| [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)：只有 complete 组；不无条件把 O 当后继输入 | 本页只消费 `completeness=complete` 且带 opaque 的组，另要求 `source=reply`、O 已知且来自 upstream、有限表与身份对 | 共享核＋Google policy | GS-V4；E 组来自 `tool_calls` 结束，reader 带 opaque 收束，不经 GG-10 的截断路径；complete 标记本身的正确性归 GG-10 owner |
| [content-blocks v3 S-9](../../../../spec/data/content-blocks/v3/contract.md#s-9-思考块与不透明数据)（本页消费）：opaque 原样带回 | reader 写入、投影原样回放；meter 只读不写 | 共享 reader 与投影不改 | GS-V6 断言线上 E 逐字节等于原件；上游对 E 的实际使用见 GG-14 |

## 反例义务

| 反例 | 分组或投影后的样子 | 结果 | 判定者 |
|---|---|---|---|
| E 的 data 为 `[REDACTED]` 或空串；E 缺 id 或 id 非法；E 带多余成员 | 条目域外 | 单元 `uninterpretable` → `input_size_unavailable` | Google `classifyUnit` |
| 只含 T 的完整组 | details 逐条是 T | GG-13 判定前 `uninterpretable` → `input_size_unavailable`，与现行 V3 相同 | Google `classifyUnit` |
| TS、S，或 E 与 T、TS、S 混排 | 至少一条不是 E，且不是纯 T | `uninterpretable` | Google `classifyUnit` |
| 多条 E（并行工具调用或密文分片） | 每条都是完整的 E 形 | 可估，整组 O 计一次，不按条数分摊；有一片不是完整 E 形即 unavailable | `classifyUnit`；共享核 |
| 跨模型组 | 当前规划投影时 opaque 的 `routeName` 与本次路由不等 | 规划投影先以 `unavailable` 拒绝（非计量层）；即便投影通过，binding 模型不命中也 unavailable | 共享投影（R-K）；`sourceApplies` |
| 跨路由组（Vertex 或其他供应商） | origin.provider 不是 `google-ai-studio`，或 servingProvider 为 `Google` 等 | unavailable | `sourceApplies` |
| 部分选择：只回放工具调用、跳过思考块、删掉 details | 原块未全选、跨消息，或当前单元与原组投影不等 | unavailable；摘要可判不符时 planner 先给 malformed | 共享 `completeGroup`／来源门 |
| 截断回复（`length`） | 当前 reader 不给领域块附 details，单元只有可见 `reasoning` | 走现 Gemma4 可见路径，不进入本页（GG-10） | reader；`classifyUnit` |
| 篡改密文或 id | 未同步摘要 → 与原块摘要不符；连摘要一起自洽伪造 → 不可判 | 前者 malformed；后者计量不背书真伪，密文真伪归上游核验 | 共享来源门 |
| E 的 id 与回放出去的工具调用 id 不等 | 每一次真实回放都如此（GG-14；多条 E 时逐条失配，随并行工具调用按条数放大） | **不是计量反例**：meter 照常估算；上游若拒绝，按上游终结记录并转 GG-14 | 上游；reader／投影 owner |
| 身份有值但不命中，或只有一个字段 | 例如 slug、`Google`、带日期的模型名、大小写变体 | unavailable；origin 与 provenance 同名值互相矛盾则 malformed | `sourceApplies`；共享 `groupFactsValid` |
| 原 basis 变化 | 原 V3、今 V4 → changedEffective；原 V4 → sameEffective；原坐标不在表 → unavailable；当前 basis 不是 V4 → unavailable | 前两者 full 独立应用 O；不借此复用 I | 共享 `relateMeterBases`＋`originalBasisApplies` |
| reader 合并规则日后改变 | 原块摘要与当前投影不再相等 | unavailable 或 malformed，不静默重计 | 共享核 |
| 调用者自造、不属于任何历史组的带 details 单元 | 被分类为 `wholeGroup` 却无组认领 | unavailable | 共享 `contributions` |
| 同一单元同时带 `reasoning` 与 `reasoning_details` | 投影从不产出此形 | `uninterpretable` | `classifyUnit` |
| 全部消息都被完整组认领 | 剩余 messages 为空 | counter 拒空消息 → unavailable，不补假消息 | `countBody` |
| reasoning > O，或 O 未知 | — | unavailable | 共享核 |

## 关键选择

| 选择 | 本方 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|---|
| K1 E 组怎么计（**主承载**） | 完整原组的 O 计一次，workload 相关 estimated | **E 计 0、工具调用经 Gemma4**：若 Gemini 的签名只是校验令牌、回放不展开成上下文，可见计数更接近，且避免每组约多计 reasoning。**继续拒绝**：零新主张。**分词密文**：现有 counter 直接可用 | 可能每组多计约 reasoning 并在工具会话中累加；无误差界；依据是先例与 O ⊇ reasoning 的观察。「E 计 0」是无映射填零，[S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)⑧ 不许，GS-V9 读数才能给它依据；继续拒绝让 Google 的每次工具续接在第 2 轮失败；分词密文是 H13-V6 列明的反例 | 中 |
| K2 只含 T 的完整组 | 候选 a（unavailable）继续生效，映射待 GS-V10（GG-13） | 现在就钉 O 一次：唯一的非工具完整形状立即可估，方向保守 | 非工具路径出现可见思考摘要的回复之后，下一轮仍 `input_size_unavailable`；这是纯文本多轮会话的阻断 | 高（「对照前不钉」）；映射方向本身尚无依据 |
| K3 detail 域 | 只收已观测的 E：条目形状有限、单元内条数不限；不同形状的组合须有真实原件；TS、S 移出域 | **保留 rev3 的 TS、S**：若非工具完整回复带 S，立即可估，现有夹具可用。**按 OpenRouter 归一 schema 放开** text/summary/encrypted、id 可选：形状稍变不会再被拒 | 任何未观测形状都回到 `input_size_unavailable`，要新原件与新修订才能重开；多条 E 只靠「条数不限」的读法放行，本身未观测 | 中高 |
| K4 身份 | 按对判定：同缺放行、单字段 unavailable、有值整对逐字命中、origin 与 provenance 同对（照 xAI 守卫 4） | rev3 的逐字段规则：少一条拒绝路径，两字段各自核 | 显示名漂移即失效 | 高 |
| K5 修订 | definition、implementation、algorithm 一起升；tokenizer 与 replay 不伪升，replay 保留 `unsupported-marginal/1`（`src/input-meter.ts` 给无 φ 家族的共享默认名）。definition 升是有限表行键的需要：factory 与 `originalBasisApplies` 都按 definition＋implementation 查行，与 xAI V5、Anthropic 4/`mp4-18` 同构 | 新 replay 名写明 full-only，V3/V4 在 replay 上也分得开。只升 algorithm：definition 内容没变，升它是噪声 | 多一处发布协调；replay 名不区分 V3/V4 | 高 |
| K6（共同约定，非本页选择） | full-only，不把 φ/δ 接到共享 new/replay | 与 xAI 同时接线：共享函数现成 | 接线还需要共享 `calibration.ts` 认 `Google AI Studio` 显示名，属共享改动，不在本页 | — |
| K7 采用形式 | 机制接线先行（已获准）；GS-V9 的 A 变体（每叶一次研究请求）读出上游接受之后，主线钉定三个坐标并采用；GS-V9 其余变体可同批；GS-V7 三轮作实施完成门。理由是 Google 独有的 GG-14：若上游拒绝 id 失配的回放，先发布的 V4 会把今天零 HTTP 的计划期拒绝换成出网后的上游拒绝；Δ_E 也能在任何坐标进入已保存 basis 之前告诉主线 K1 要不要换 | **采用即钉定**（xAI、Qwen 同构）：少一个串行付费步骤；回放若被拒，后继修订只多一行有限表 | 钉定晚一步；研究请求的线上体须与产品投影逐字节一致，否则读数不作数；主线可能判断 GG-14 的风险不足以偏离先例 | 中 |

### K2 的三个候选映射

T-only 是非工具路径上唯一见过的完整形状。三个候选都没有 Google 专属差分作依据，由 GS-V10 判定，主线在采用决定里选定；选定之前 a 生效。

| 候选 | T-only 组怎么计 | 代价 | GS-V10 上什么读数选它 |
|---|---|---|---|
| a unavailable（当前生效） | `classifyUnit` 给 `uninterpretable` | 非工具路径出现 T 的回复之后，下一轮 `input_size_unavailable`，与现状同；不新增主张 | 上游拒绝原样回放无签名的 T，或实际 input usage 与 b、c 都对不上 |
| b O 一次 | 与 E 组相同，归入 W，原 O 计一次 | 可能显著高估：唯一样本 O 313 中 312 是 reasoning，若上游不回读无签名的 thought，每轮约多计 300，N 轮累计约 N×300，窗口远未满时估算门就拒绝；方向保守，但不是上界。家族先例里没有一家把只含明文推理文本、没有签名或密文的组按 O 计 | 带 T 回放比不带推理多出的 `prompt_tokens` 接近 reasoning_tokens |
| c 可见替身 | T 的 text 当可见文本经 Gemma4 计数，不加 O | 可能低估（若上游回读的不只是可见文本）；要改 `classifyUnit` 与 `countBody`，并放弃「details 文本从不进入 Gemma4」这一条 | 带 T 与带同文 `reasoning` 字符串的 `prompt_tokens` 相等，且比不带推理多出的量接近 Gemma4 对该文本的计数（Moonshot、Qwen 的同一槽位读法） |

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
| GS-V1 有限表与发布 | 两叶 V3（当前构建）、V4（实施构建）工厂逐字段导出核表；未知 definition/implementation/algorithm/projection、跨模型、身份不命中的反控；tokenizer 与 replay 坐标不变；evidence 串带两条 generation id；旧 factory 已删 | 不以手抄坐标代替导出 |
| GS-V2 详情域 | 单条 E、多条 E 为 `wholeGroup` 正例；只含 T 的完整组须得 `uninterpretable` 并以 `input_size_unavailable` 收场；E 缺 id、id 为 null／空串／数字、data 为 `[REDACTED]`／空串、E 带 signature／text／未知成员、TS、S、E＋T、E＋TS、summary、异 format、混合 format、非 assistant、同时带 `reasoning` 逐一为负例。E 夹具按 09-30 原件的帧序与成员重建（密文用等长合成 base64，id 等于同流工具调用 id），T、TS、S 夹具按 09-28 片段序列重建，全部经真实 reader 合成，不手写合并后的条目 | 负例须各自单独失败，不能只测一个 |
| GS-V3 唯一贡献 | full＝G4(剩余)＋ΣO；两个 E 组（第 3 轮）各计一次；reasoning 不另加；margin 一次；spy 证明密文与 id 字符串对 tokenizer 的调用为零；无完整组的请求与现行 meter 逐值一致，有完整组时剩余部分等于现 counter 对同一剩余 body 的结果。变异反控：去掉 O 加项、或让 counter 接收 details 单元，用例必须失败 | 不以估算单调递增代替数值核对 |
| GS-V4 完整性与真实性 | 部分选择、乱序、跨消息、缺块、重复认领、未认领的 details 单元、摘要篡改（malformed）与自洽伪造（只走 unavailable 分支）；截断回复不产生 `wholeGroup`；独立 `measureFull` 对非法输入返回 unavailable 且不产计量 | 不只测 planner，须直调 factory 返回的方法 |
| GS-V5 失效 | 原 V3→今 V4 可 full；原坐标不在表 unavailable；当前 effort 或 max_tokens 改变仍可 full；身份不命中、只有一个字段、origin 有而 provenance 缺均 unavailable；origin 与 provenance 同名值冲突 malformed | — |
| GS-V6 本机两入口 | `tests/google-three-round-invoke.spec.ts` 新增工具路径 E 用例：首轮流按 09-30 帧序重建（帧 0 为 E，其后工具调用片段，`tool_calls`／`STOP`，末帧 usage），第 2、3 轮 full estimated 并发送；wire 带回的 E 逐字节等于原件（id 不变），`tool_calls[].id` 与工具消息 `tool_call_id` 为投影生成值——两者不等，照实断言，不在本机伪造一致；public 与 Cordis 两入口、三档 effort；φ/δ 调用仍为 unavailable；首轮 SSE `provider` 用真实显示名，另加 slug 负控；只含 T 的首轮回复第二轮仍 `input_size_unavailable`、零 HTTP；现有 R-L 合成的 TS 用例**保留为负控**（第 2 轮仍 `input_size_unavailable`）；`[REDACTED]` E 负控；`replayRevision` 断言保持 `unsupported-marginal/1` | 受控输入删掉 details 后通过不算成功；本机流只证机制，不证上游接受；工具调用 id 与 E 的 id 不等的断言是 **GG-14 的观察断言**而非语义保证，reader／投影修复 GG-14 后应随之反转 |
| GS-V7 真实认证（付费，归主调度） | **最小观测已完成（工具路径，09-30，研究页）**。余下：实施后每叶 public 与 service 各一组工具路径三轮（同 09-30 场景），第 2、3 轮 full estimated 并发送，捕获 raw SSE；记录完整 wire、source、basis、O、实际 input usage、逐轮残差、cache 与 cost；逐帧记录第 2 轮回复的 E 与其 id、第 3 轮文本回复的推理详情形状（供 K3、GS-V10）。上游拒绝、出现前缀绑定或 E 被静默丢弃（GS-V9）→ 本页复议，不以删签名或改 opaque 规避 | 本机合成流、研究截断原件都不是 E 组的认证；未经投影的手写体不算 |
| GS-V8 旧证据复用 | fit/holdout、公开探针与 09-30 首轮的字节级结论只复用于可见 counter（这些输入无完整组，剩余计数不变），须在 V4 构建上重跑核对 | 不能充当 E 组的真实认证；旧的第二轮拒绝用例保留为回归负控 |
| GS-V9 同路由对照（P2，**必做**；付费研究请求，归主调度） | 见下节。每叶 A、C 两个变体，条件满足时加 D；A 的接受读数先于坐标钉定（K7）；读出 Δ_E、残差与 GG-14 的后果 | 本机或合成流；与产品投影不逐字节一致的线上体 |
| GS-V10 K2 对照（非本页采用门；付费，归主调度） | 每叶非工具路径当前绑定首轮 raw（`effort: high` 与缺省各一），记录推理详情形状。若为 T-only：同路由对照 A（带 T 原样）、B（同文 `reasoning` 字符串、不带 details）、C（都不带），比较 `prompt_tokens`，按 K2 候选表判读；若出现 S、TS、E 或混排：作新原件交后继修订 | 09-28 领域结果不能代替当前绑定的 raw |

### GS-V9 同路由对照的设计

目的：量出回放的 E 在上游被计入多少输入（Δ_E），检验 K1 的「O 一次」与落选的「E 计 0」；同时读出上游是否接受原样回放（GG-4）与 E 的 id 失配的后果（GG-14）。Google 没有 `reasoning` 字符串等价形——E 没有文本，无法像 Moonshot、Qwen 那样以「details 对同文 `reasoning` 串」检验同一槽位；所以对照改为「带 E 对不带推理」，必要时加一个只改工具调用 id 的变体。

- **设定**：每叶同一固定路由（provider 块恰为 `order:['google-ai-studio']`、`allow_fallbacks:false`、`require_parameters:true`）、同一 effort `high`、同一 tools 与 `max_tokens`，不开响应缓存（09-28 源码跟进页记其零计费混淆）。历史是一份当前绑定的工具路径首轮真实回复（可复用 09-30 原件，或新取一份并落 raw），加工具结果与第 2 轮 user。变体之间只差下述字节，按 A、C、D 顺序发送，记研究账本条目。
- **A**：产品投影产出的第 2 轮线上体——助手消息 `content: ""`、`tool_calls`（id 为投影生成值）、`reasoning_details: [E]`（逐字节原样，含 id）；工具消息的 `tool_call_id` 为同一生成值。线上体须由当前投影产出（例如以合成 meter 规划得到固定请求后原样发送），不手写。
- **C**：A 去掉该助手消息的 `reasoning_details` 成员，其余字节不变；不补 `reasoning` 字符串（E 无文本可补）。
- **D**（A、C 都被接受即发，不论 Δ_E 为何——评审 G-R1：只有 D 才能区分「E 被计入且按 id 关联到工具调用」与「E 被计入但因 id 失配未被关联」，后者是续接语义退化而非计量问题）：A 中助手 `tool_calls[].id` 与工具消息 `tool_call_id` 一起换成 E 的 id 所载的上游 id，opaque 字节不变。
- **读数**：各变体的 HTTP 状态与上游错误体、`prompt_tokens`（含缓存读，缓存分项另记）、`completion_tokens`、`reasoning_tokens`、cost；同一 A 体的本地预测 G4(P ∖ W)＋O（由 V4 候选 meter 或同一 counter 算出）。Δ_E = I_A − I_C。

| 读数 | 结论 | 去向 |
|---|---|---|
| A 被拒 | 原样回放不被接受，GS-V7 无法通过 | 不钉坐标；K1 搁置；GG-4、GG-14 转 owner；不以删签名或改 opaque 规避 |
| A 接受、C 被拒 | E 是续接所必需，A 的接受说明上游用了 E；Δ_E 不可测 | 残差只由 A 读出；GG-3 得一条实证 |
| A、C 都接受，Δ_E > 0 | 回放的 E 被计入输入 | 与 reasoning、O 比较并记录残差，不引入修正常数 |
| A、C 都接受，Δ_E = 0，D 的 `prompt_tokens` 大于 C | id 失配使 E 在产品路径上被静默丢弃：接受不等于 E 被使用 | GG-14 升为 GS-V7 阻断，转 reader／投影 owner |
| A、C 都接受，Δ_E > 0，D 的 `prompt_tokens` ≠ A | E 被计入，但按 id 关联与否影响上游处理：D 与 A 之差即 id 失配的续接代价 | GG-14 读为「影响续接语义」，转 reader／投影 owner 并注明可能需规格演进（S-9／S-12／S-14） |
| A、C 都接受，Δ_E > 0，D 的 `prompt_tokens` = A | E 被计入且 id 失配对计入无影响；是否被「使用」仍不可由本对照读出 | 「使用」归 reader／投影 owner 另设读数；GS-V9 只读「计入」 |
| A、C、D 三者相等 | 上游不把回放的 E 计为输入（或不论 id 都丢弃） | O 一次每组约多计 reasoning；主线在后继决定里复议 K1（「E 计 0」以本读数为模型依据） |

每叶 2–3 次请求；残差只作记录。

| 叶 | 当前 → 候选坐标 | 身份映射依据 | 完整 E 组真实原件 | 回放的真实观察 | GS-V1–V6（本机） | GS-V7（真实） | GS-V9（P2） | 采用后可声称 |
|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | 3/`mp4-17` → 4/`mp4-N`（证据上可钉；建议 GS-V9 A 之后钉） | 09-30 raw 5/5 帧＋reader 完整回复；09-28 探针 | 1 份（09-30） | 无：第 2 轮在计划期拒绝、零 HTTP | 已实施（增量树 `f667d8b7`，GS-V1～V6 本机全过，坐标未钉，见 verification.md GS 段） | 最小观测已完成；三轮待实施后执行 | 待执行 | 本机：工具续接多轮 full 可估（estimated，无误差界）；T-only 组仍 `input_size_unavailable`；真实回放接受与误差由 GS-V9、GS-V7 读出 |
| `google/gemini-3.7-flash` | 同上 | 09-30 raw 5/5 帧＋reader 完整回复 | 1 份（09-30） | 同上 | 已实施（增量树 `f667d8b7`，GS-V1～V6 本机全过，坐标未钉，见 verification.md GS 段） | 同上 | 待执行 | 同上 |

## 缺口与受阻消费者

| 编号 | 缺口 | 条款坐标 | owner | 受阻消费者 |
|---|---|---|---|---|
| GG-1 | 09-30 原件与 09-28 八份截断原件的逐份形状已有研究家（研究页，见「真实原件与形状读数」）；09-28 公开文本探针的领域结果仍只在本页登记 | — | research（Google 研究页） | 采用决定引用 T-only 依据时 |
| GG-2 | 非工具路径当前绑定的完整形状（raw）未观测；多条 E、E 分片、E 与 T 混排未观测 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③、[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准) | 主调度（GS-V7 第 3 轮读数、GS-V10） | K3 的后继修订；文本回复之后的多轮会话 |
| GG-3 | Google thought signature 的语义（E 的 data 是否即其载荷、是否必须原样回送、是否与前缀或工具调用 id 绑定、回送后计入多少输入）没有研究：**假设，须按来源核对取证** | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③ | research | K1 置信度；`requiresSignedPrefix` 取 false 的依据；GG-14 的判读 |
| GG-4 | 上游是否接受原样回放未观测（第 2 轮从未出网） | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③ | 主调度（GS-V9 A、GS-V7） | 坐标钉定（K7）；两叶多轮认证 |
| GG-5 | 已闭合：两叶身份映射取自 09-30 reader 产出的完整回复与逐帧 raw | — | — | — |
| GG-6 | φ/δ 不开；将来开放需共享 `calibration.ts` 认 `Google AI Studio` 显示名 | [RT12 S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量) ⑧ | 主线（共享 owner） | 无：本轮不是交付门 |
| GG-7 | 图片计量仍 unavailable（本页不涉）；音视频本期范围外 | [RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ④ | 各自既有 owner | 不由本页解除 |
| GG-8 | 三个坐标证据上可钉；钉定时机（本页建议 GS-V9 A 之后）与 mp4 编号由主线决定与分配 | — | 主线 | 实施提交与 GS-V1 |
| GG-9 | 已闭合：共同约定的 record 家为 D-111 | — | — | — |
| GG-10 | 截断回复（`length`）的 details 在 reader 一层不保留，runtime 却把该输出组记为 complete：`packages/model/pi-ai-transport/src/stream.ts` 只在 finish 不是 `length` 时发带 opaque 的收束事件 → `packages/core/stream-assembly/src/blocks.ts` 的 `settleBlock` 对未收束块只以文本结算、不带 opaque → `packages/model/model-request-runtime/src/invoke.ts` 按 `'ended' in end` 记 `complete`。与 [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)「completeness=complete 表示实际收到且保留」是否相符、怎样收口，**已转 reader/runtime owner**。E 组来自 `tool_calls` 结束，不经此路径；共享行为，不限于 Google，不阻本页 | [MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放) | 共享 reader 与 runtime owner（已转） | 截断后续接的签名或密文回放；各家截断回复的 opaque 保全 |
| GG-11 | 不是本页缺口：D-111 以此号登记「同会话切模型后外来 opaque 思考块由运行时上下文组装处置」，本页只在 R-K 接缝处引用。rev3 本页曾以同号记 K2 映射，撞号，rev4 改记 GG-13；GG-12 在同节点 verification 另指 ZAI 可见推理历史，本页不用 | — | runtime／上下文组装 owner | — |
| GG-13 | K2 的映射方向（a／b／c）待 GS-V10 判定，选定前 a 生效 | [RT12 S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量) ⑧ | 主线（采用决定），依据由主调度 GS-V10 提供 | Google 非工具路径出现可见思考摘要之后的下一轮 |
| GG-14 | E 的 id 等于首轮工具调用的上游 id，但 reader 登记的 CallId 由自身生成，投影以它写回 `tool_calls[].id` 与 `tool_call_id`，回放时两者不等；OpenRouter／Gemini 是否凭 id 关联签名未知。可能后果：上游拒绝、静默丢弃 E（接受不等于 E 被使用）、或无影响。本页不改写 opaque 与工具调用 id | [content-blocks v3 S-9](../../../../spec/data/content-blocks/v3/contract.md#s-9-思考块与不透明数据)、[S-14](../../../../spec/data/content-blocks/v3/contract.md#s-14-callid)；[RT12 S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划) ③ | transport reader／投影 owner；读数由主调度 GS-V9（含 D）、GS-V7 提供 | GS-V7 通过；工具续接的实际语义；坐标钉定（K7） |

本页自身没有兑现不了的条款，也没有发现与 RT12 S-74/S-77/S-78/S-79、MR11 S-43 冲突的观测。GG-10 与 GG-14 是共享 reader／投影层的事项，不在本页兑现范围，已点名 owner。机制接线按主调度 2026-09-30 裁决可先行实施与正反验证；三个坐标的钉定与官方发布等主线采用决定（本页建议以 GS-V9 A 为前置）。

## 实施附注（2026-09-30，主线）

机制接线交付于增量集成分支（`12b56c83`…`7084bffb` → 增量树 `f667d8b7`）：V4 工厂 `createGoogleHistoryInputMeter(definition, release)` 委托共享核，坐标按 O-1 未钉（官方目录仍 V3），replay 保持 `unsupported-marginal/1`。登记偏离：部分选择取 unavailable；跨路由仅 origin 变时由共享层判 malformed；补强 basis provider 检查与「退役坐标不得复用」。GS-V7／V9／V10 待主调度付费执行后钉坐标。

## GS-V9 读数（2026-09-30 17:15Z，主线付费观测，HUB `712ae76e`）

两叶各一组同路由对照（`google-ai-studio`，第 1 轮 E-only 工具回复为种子，第 2 轮 A＝按产品路径原样回放 E（工具调用 id 为 reader 生成的 CallId）、C＝无推理、D＝把 E 的 `id` 改为上游 tool-call id 回放）：

| 叶 | A `prompt_tokens` | C | D | Δ_E＝A−C | 读数 |
|---|---|---|---|---|---|
| gemini-3.8-flash | 963 | 963 | 1069 | 0 | D＞C，且 D−C＝106 |
| gemini-3.7-flash | 964 | 964 | 1189 | 0 | D＞C，且 D−C＝225 |

三个变体上游均 200 接受。按本页读数表：**Δ_E＝0 而 D＞C** ——上游在 id 失配时静默丢弃 E、id 匹配时计入 E。结论：GG-14（回放工具调用 id 为登记方生成的 CallId、永不等于上游 id）在产品路径上直接决定 E 是否被计入，本页的 O 一次映射（A 预测 1091／1211）在今日产品路径上高估（实测等于 C），而在 id 修复后才成立。**主线裁决（R-Z）**：首版 Google 两叶保持 V3 坐标（E 历史回放 unavailable，早暴露不静默丢）；V4 机制保留、坐标不钉；GG-14 升级为设计项（content-blocks S-12／S-14 与 reader 投影：回放须携带上游 tool-call id），归后继 T35；GS-V7 随 T35 之后执行。费用：四次 seed＋六次对照合计约 0.011 美元。

## 修订记录

- revision 4（2026-09-30）：纳入 09-30 两叶真实完整工具调用回复（研究页）。主承载改为 E-only 组（`reasoning.encrypted`，id 等于同回复工具调用 id），以原 O 计一次；TS、S 移出域，现有 TS 本机用例改作负控；T-only 维持 unavailable，映射缺口由 GG-11 改记 GG-13（与 D-111 撞号）；身份改为按对判定，GG-5 闭合；三个坐标证据上可钉，新增 K7（建议 GS-V9 A 先于钉定）；新增 GG-14（E 的 id 与投影生成的工具调用 id 不等）；GS-V7 最小观测标记完成，新增 GS-V9（P2 同路由对照，必做）与 GS-V10（K2 对照）。
- revision 3（2026-09-30）：共享 reader 采用 R-L（D-111）后同步领域表：文本片段与紧随的仅签名片段合并成 TS 条目并作为签名组主形，S 仅在无可并入文本时独立；反例表与 GS-V2 随之改写；GG-9 指向 D-111。
- revision 2（2026-09-30）：据 2026-09-30 架构评审修订。要点：证据关系改正（T-only 为唯一真实完整形状，签名组为截断帧外推，H-S 挂 GS-V7）；K2 改为映射待 GS-V7 判定、观测前 unavailable，列 a／b／c；replay 保留 `unsupported-marginal/1`；MR11 S-43 兑现行改写；GS-V7 加最小观测；GG-9 改为指针；GG-10 转 reader/runtime owner；新增 GG-11。
