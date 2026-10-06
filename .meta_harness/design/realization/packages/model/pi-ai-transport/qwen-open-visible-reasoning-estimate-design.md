# Qwen 开源两叶可见推理详情的参考计量

实施状态（2026-09-30，不改下文受审字节）：已按采用决定实施，两叶当前为 definition `4`／`pi-ai:qwen@mp4-19`、algorithm `qwen-38-public-template-effort-4`／`qwen-38-public-template-image-effort-5`；QV1–QV3 本机覆盖见 [verification](verification.md)，QV4 待 root。

2026-09-30，revision 2，candidate，**待当前绑定真实形状确认后采用**；独立架构评审无阻断，按主调度 2026-09-30 裁决（R-P）在 QV0 之后与 Moonshot 同法采用（机制接线先行、QV4 真实回放作门）；尚未技术采用、未实施、未实际验证，新增 bindings 0。本页按已采用的 [DeepSeek 可见推理计量](deepseek-visible-reasoning-estimate-design.md)（采用决定）的结构，补充已采用的 [v10](v10-token-estimate-design.md)、[v12](v12-usage-calibration-design.md)，与同日 [Moonshot 候选](moonshot-visible-reasoning-estimate-design.md)共用形状识别与守门接线，不改这些页的受审字节。持续消费者为 `qwen/qwen3.8-2.4t-a95b`、`qwen/qwen3.8-27b` 两款官方定义、`createQwenInputMeter` 的公开模板分支与模型调用规划器；固定公开模板、OpenRouter 推理详情协议或共享分组规则变化时复核本页。其余六款 Qwen（可见 JSON 替身分支）不在范围内。

## 基准、性质与证据

基准为已接受 [RT12](../../../../spec/capabilities/model-request-runtime/v12/contract.md)／[MR11](../../../../spec/data/model-response/v11/contract.md) 的计量语义（接受依据沿 D107）与当前实现（两叶定义 `3`、`pi-ai:qwen@mp4-18`）。主调度 2026-09-30 裁定本轮 Qwen 以 full-only 交付、φ/δ 不作交付门（R-A），并允许两叶对已接受的 `high`/`max` 做无 holdout 的 full 估算扩展、不放宽 opaque/加密历史守门（R-B）；两项已登记于 D-111，见 G6。本页不新增公开操作、输出组语义、对象或存储；相关对象仍为 ModelDefinition、ModelProfile、ModelInvocationInput、PendingModelResponse，未经尚不存在的装配反查索引核实。

沿用已封存性质，不声明新的双盲封存：全部实际输入有据计量或发前拒绝，估算须有适用依据、不以私有模板为普遍前置（[S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③⑤）；来源真实性先于计量，可判矛盾不得借 full 绕过（[S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)）；reasoning 不双加、不无条件用 I+O、margin 只应用一次（[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)）；独立公开计量无隐藏读取、来源不可核即 unavailable（[S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)④⑥⑧）；下一请求的输入贡献由实际回放的 role/template/内容决定，原响应、实际 wire 与上游 usage 保留（[MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)）。

### 真实原件核实

流式原件为 2026-09-27 probe 证据 run 归档 `openrouter-research.tar.gz` 的成员，SHA-256 与该 run 的成员清单逐项一致。六份都是固定路由（`provider.order:["alibaba"]`、`allow_fallbacks:false`、`require_parameters:true`）、`stream:true`、单轮 system+user+user、无 tools、`reasoning:{effort:"low"}`，HTTP 200、`finish_reason:"stop"`，服务方展示名 `Alibaba`、上游 model 等于路由模型。起草者只读复算，未发请求；复算是独立 Python 读数，不是执行 TS reader。

| 叶 | 成员（`openrouter-research/…`） | SHA-256 | 带 details 的帧 |
|---|---|---|---:|
| 2.4T | `remaining-03/1f39d829-e5bf-4c21-9a41-f7a5b27813d4.json` | `13d133ddc080462be7a24abe64b5d690c7edfdb01ebb9d8b7b201f69815b5813` | 17 |
| 2.4T | `remaining-03/440c6af2-813b-4831-8745-461e619efb8c.json` | `40f78d571cd9c415e6fed6edbe35474eb7fb1b30a5dd285b2b36401269196b5f` | 17 |
| 2.4T | `remaining-03/e19ca3cb-9a08-423c-bb6a-449dce494c7d.json` | `67e0375c7c8076ae7728fc50f2ba8972a791d8d98eff0e04917078bbcebe177a` | 17 |
| 27B | `remaining-03/7ff23f5e-5bbd-4f87-8195-b8530dc2bbc4.json` | `0ab279a515d0d95151f939ab66206574c2ebb917ae69a9917056c64e5bdb705b` | 18 |
| 27B | `remaining-03/a0dc4495-44b3-4e39-848a-77eb8127a60e.json` | `d161cc16a894f25da01243dfb46221e3d979803b61456c908b90a507793d1827` | 20 |
| 27B | `remaining-03/cf65f1e3-c968-461e-b871-8e609fc2725f.json` | `d9356de6859adb3553a2d7eb240e4d1477763993b02bb49d9e2e1cf7393a7444` | 15 |

全部 104 个带 details 的帧：`delta.reasoning_details` 恰一项，own keys 恰为 `type,text,format,index`，`type` 为 `reasoning.text`，`format` 为字面 `unknown`，`index` 原字面为 `0`；无 `id`、无 `signature`。每一帧同时带 `delta.reasoning`，且与该项 `text` 逐字相同；没有只带其一的帧，没有 `reasoning_content`/`reasoning_text` delta。按共享 R-F 相邻拼接规则复算（R-L 修正只涉签名，对这些无签名片段结果相同），每份响应合为恰一项 detail，`text` 与整条 `reasoning` 串逐字相同。

另有 27B 两次非流式观察：[Qwen 六例研究](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-fixed-route-six-observations.md)登记的收据 `38`（SHA-256 `1f3ec22b7677372b49257abbe5b8ee086e9832e2e459f216516de6f4cc1efef4`）与 `39`（`e1eeef0ca15b64c0db3ef167d5f79d1c6c9002789676a2f3eb408c2475f4501b`），请求为冻结体（`stream:false`、无 `reasoning` 参数、单条带图 user）。起草者按该页 SHA 核对同一收据后读出：`message` 同时带 `reasoning` 与恰一项 details，形状同上，文字逐字相同。这两份收据原件在 HUB 私有目录，未入 research 或 record，研究页也不复制原响应；上述字段读数在 QV0 之前不承重，只作旁证。

**覆盖限制，决定本页状态**：流式观察全在 `effort:"low"`，而当前绑定对两叶都丢弃 `low`——当前实际发送域是缺省（模板默认 xhigh）或 `high`/`max`，27B 另有 `none`。当前发送域的流式形状未观察；27B 的缺省 effort 只见非流。两叶都没有带 tools 的回复、没有多轮、没有任何带 details 的历史被真实发送。Qwen 线此前把「真实路由对开源叶是否发 `reasoning_details`」记为未知；上述归档原件表明至少在 `low` 下会发。

### 上游与固定模板

[OpenRouter Reasoning Tokens 官方快照](../../../../../research/model-request-adaptation/vendor-continuation/xai/closeout-2026-09-30/openrouter-reasoning-tokens.txt)（2026-09-30 取得，SHA-256 `a80ca4bcee4915cc1d1697fd620743bfbbc97f45f5a25213fcc149bad5681bc7`）的「Preserving Reasoning」写明：可用 `message.reasoning` 字符串或 `message.reasoning_details` 数组把推理传回，`reasoning_content` 与 `reasoning` 同义；流式 details 按序拼接；encrypted 内容在流中可能为字面 `[REDACTED]`。它没说同一消息兼带两者时取哪一个，也没说 OpenRouter 如何把 details 转成 Alibaba 原生字段——后者是**待核对主张**（`design/basis/` 无对应条目，须按来源核对或真实差分取证）。

固定公开 `chat_template.jinja`（2.4T `Qwen/Qwen3.8-2.4T-A95B`@`207bd685a7e3696cfaff12ded7c6a7ea0f88c996`，27B `Qwen/Qwen3.8-27B`@`1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`）对 assistant 取字符串 `reasoning_content`、`|trim` 后渲进 `<think>\n…\n</think>\n\n`；`preserve_thinking` 未定义时对全部历史 assistant 渲染。当前 TS 投影 `qwen.ts` 以 OpenRouter 名 `reasoning` 读入该槽位（`:131-176`），在 `:146` 拒绝 `reasoning_details` 与 `reasoning_content`，在 `:224-239` 只放行已剥离的 effort。[公开模板研究](../../../../../research/model-request-adaptation/vendor-continuation/qwen/2026-09-28-public-template-gaps.md)只核了模板投影，不采用 OpenRouter 到 Alibaba 的转换政策。本页因此是**有来源的估算候选**：把可见文字放进公开模板的 `reasoning_content` 槽位，不是上游等值事实。

## 最小承载与范围

落点为现有 Qwen InputMeter 公开模板分支内的纯数据投影（#1），不是新服务，也不是新的消息或组 walker。固定范围只为上述两叶经 OpenRouter `alibaba` 的官方贡献及其后继唯一修订；不外推到可见 JSON 替身的六款 Qwen，不外推到其他家族。

### 有限适用表

| 维度 | 适用值（同时满足才投影） | 其余 |
|---|---|---|
| 定义与实现 | 两叶后继唯一 definition 与 `pi-ai:qwen` 公开模板绑定修订（数值由主线接口账本分配） | 当前 `3`/`mp4-18` 保持现拒绝；未知修订沿既有 factory 构造期抛错，贡献不发布 |
| 路由 | 请求体 `model` 等于定义 modelId，`provider.order` 恰为 `["alibaba"]`、`allow_fallbacks:false`（既有检查） | 其他：沿既有 unavailable |
| effort | 缺席或 R-B 的 `high`/`max`（剥离后渲模板默认 xhigh） | 27B `none` 及其他形状：沿既有 unavailable |
| 消息角色 | `assistant` | 其他角色带 `reasoning_details`：unavailable |
| details 数组 | 恰一项 | 空数组、`null`、非数组、多项：unavailable |
| detail 形状 | own keys 恰为 `type,text,format,index`；`type` 为 `reasoning.text`；`text` 为字符串且不等于字面 `[REDACTED]`；`format` 为原字面 `unknown`；`index` 为 JSON 数且精确十进制值为 0 | `reasoning.summary`、`reasoning.encrypted`、任何附加键（含 `id:null`、`signature:null`）、非 `unknown` format、非 0 或字符串 index、`[REDACTED]`：unavailable |
| 与推理字符串的等同 | 同一消息的 `reasoning` 缺席，或是与该 `text` 逐字相同（比较在 trim 之前）的字符串 | `reasoning` 在场却非字符串或不逐字相同：unavailable；`reasoning_content` 在场沿 `:146` 既有拒绝，本页不放宽 |
| 其余字段 | 沿当前 meter 既有允许集；27B 图片沿既有未缩放内联 PNG 估算 | 沿既有 unavailable |

`text` 直接取实际发送体；空串是可见的空文字。多条 assistant 各带一项合格 detail 时逐条投影，各计一次。

## 计量映射与 full/φ/δ 同源

full 先按原件核：原 body 的 `model`、`provider` 与定义一致，原 body 与原 serialized 一致；再只对仅供计量的派生副本渲染。对每条命中上表的 assistant 消息，派生副本删去 `reasoning_details`，该消息无 `reasoning` 键时补 `reasoning = text`，已在场且已证等同的 `reasoning` 保持原值。于是公开模板的 `reasoning_content` 槽位恰好收到一份经 trim 的 `text`。effort 剥离与本投影只动各自字段，先后不影响结果。原 body、serialized、units、原块与摘要均不变，实际发出的 wire 仍原样带 `reasoning_details`。候选私有函数名由实现者选择，不增加公开 DTO 或 runtime 参数。

派生副本与既有纯 `reasoning` 字符串路径走同一模板渲染、同一固定 tokenizer（`tokenizer.json` SHA-256 `0997f410c57a1f4e53b09e4be8f4a172d90edd9564368fb0847030937229b9f3`），27B 图片 token 沿既有。不经 details 的 JSON 长度、元数据键或密文字节猜 token；不另加 O、`reasoning_tokens` 或未经验证的修正常数；宿主可配置 margin 只在规划器最终门应用一次。可检查的等价预言：任一命中消息的派生计数，等于把该消息的 `reasoning_details` 换成 `reasoning: text` 的同一 wire 在当前 meter 上的计数——本映射不引入既有明文推理路径之外的本地误差源；与 OpenRouter/Alibaba 私有转换的差异仍是 estimated，没有证据承诺误差上界。

φ/δ 按 R-A 保持 `defineInputMeter` 默认 `unsupported-marginal/1`，调用即 unavailable；本页不开增量。日后若由提供者页开放，φ/δ 必须经同一投影函数，禁止另写一条 details 解释路径。full-only 下每轮整份分词是既有 full 语义，不是稳定 P 复用；「稳定 P 零分词」义务随增量开放再立。服务方展示名 `Alibaba` 与 basis 路由 tag `alibaba` 不等，共享 `calibration.ts:195-203` 只对 Anthropic、OpenAI、DeepInfra 展示名设例外，故会判 `basis_changed`；这只在将来开增量时相关。

修订：两叶 `algorithmRevision` 各升新唯一值（现 `qwen-38-public-template-effort-3`、`qwen-38-public-template-image-effort-4`）；`tokenizerRevision` 显式设为当前值 `tokenizer-basis/qwen-38-public-template-effort-3`、`tokenizer-basis/qwen-38-public-template-image-effort-4`，不随 algorithm 默认派生（与 Google r2、Anthropic、xAI 的做法一致）——tokenizer 摘要没变，变的只是投影域，那由 algorithm 修订表达；`transformRevision` 保持 `openrouter-wire/2`；`evidence` 保留 R-B「无 holdout、无误差界」原文，把「opaque/encrypted history remain unavailable」收窄为除上表可见 `reasoning.text` 之外的 details 仍 unavailable，并追加「可见 details 投到公开模板 `reasoning_content` 槽位、OpenRouter details 转换未知、无 holdout」同义表述。可见 JSON 替身六款的绑定与算法不动。

## 与共享 walker／分组的接缝

| 共享件 | 本页依赖 | 不改什么 |
|---|---|---|
| `stream.ts` `continueReasoningText`（R-F：无 id、其余头逐值相等且相邻才拼接；R-L 修正为无 id 时签名可从缺席到一次非空值） | 真实流 15–20 个无 id 无签名片段在 R-F 与 R-L 下都合成恰一项；本页的「恰一项」就是这条规则的产物 | 不改合并规则。R-L 下无 id 的迟到签名会并进同一项而多出 `signature` 键，按上表附加键拒绝；若规则回退为「无 id 永不合并」，回放变多项而 unavailable。两种变化的失败方向都是拒绝而非多计。观察项：片段只要带显式 `signature: null`，合成项就多出该键（首片自带，或经 `stream.ts:116` 由缺席采用 `null`），整个家族的回放随之回到拒绝；归档原件无此键，QV0 与 QV4 首次真实回放须逐帧识别 |
| `assistant-projection.ts` `projectAssistant` | 带 opaque 的 thinking 块只发 `reasoning_details`、不发 `reasoning`；本页据此不要求 wire 带并行字符串。换路由时带 opaque 的块由它拒绝（R-K），不会进入本页 | 不改发送协议，不把 details 改写成字符串（官方快照要求原样传回） |
| `input-meter.ts` 共同包装 `measureFull`／`measureReplay`／`measureNew` | 来源、basis、history 校验的唯一所在 | 不复制；见下「直接入口守门」 |
| 形状识别 | 共享四键谓词从 `projectDeepSeekMeterBody`（`deepseek-boundary.ts:47-57`）抽出，语义逐项相同（assistant、恰一项、own keys 恰四个、`reasoning.text`、字符串 text、字面 `unknown`、精确数值 0），DeepSeek、Moonshot 与本家族开源两叶共用；`[REDACTED]` 排除、并行键政策与目标槽位留在本家族 | 可见 JSON 替身分支的 `visibleDetails` 判定不动；DeepSeek 已采用页不回溯修改，其行为不因抽出而变。并行键政策三家不同：DeepSeek 任何并行键即拒，Moonshot 两键同文只计一次，本家族 `reasoning` 同文只计一次、`reasoning_content` 拒。按主调度 2026-09-30 裁决（P1）登记为已知差异：产品路径只发二者之一、永不同时发两键，差异只对直接调用者可见，待有真实带并行键回放证据时统一再议 |

直接入口守门：当前 `createQwenInputMeter` 返回 `defineInputMeter` 的冻结对象，其直接 `measureFull` 不经共同包装；规划器路径经 `plan.ts`／`input-limits.ts` 调共同包装。本页让带 details 的历史首次可计量，不接线则直接调用 factory 方法可携非法显式 history 得到估算——DeepSeek 评审 N1 的同构。须把 Qwen factory 的公开 full／φ／δ 方法接到共同包装，包装再调私有原始对象、避免递归；复用唯一的通用接线函数（现名 `guardDeepSeekMeter`，内容与家族无关），不复制第二份。factory 同时产出八款 meter，接线对八款一并生效：共同包装只加来源与表示校验，不改六款可见替身的数值；六款的直接入口测试按主调度 2026-09-30 裁决（P3）不作本次验收门，随接线收口时补。这是 S-77、S-79⑥ 与 [H13](verification.md#h13-多个历史输出组候选) 的落实，不新增契约承诺。

## 失败层、版本与装卸

形态不在表内：沿既有 unavailable，经 PlanFailure `invalidInput{reason: input_size_unavailable}` 发前拒绝，零 HTTP、零新响应或账，原消息不删不改。显式非法组：由共同包装拒绝，不能借可见文字分支绕过。上游接受后又带内或以 HTTP 拒绝：保留真实请求与用量事实，不自动删历史、降参数或重试。三层不混。

发布时两叶 definition、`pi-ai:qwen` 公开模板绑定修订与 algorithm 提升到新的唯一值，经既有 `qwenPublicTemplateBindings` 表核验；固定旧 lease 不热替换，已借出的旧 meter 跑完各自规划；不保留旧 factory 或兼容重载，旧到新 basis 未证兼容即 full。历史事实保留原坐标。

Cordis 继续由原官方模型贡献插件与 transport service 固定整份 meter，采用版本沿 D-025；不新增 service、fiber、inject、effect 或事件，不新增上游内核主张。装载时 meter 取得既有 tokenizer（摘要不符即构造期抛错）与模板常量，初始化失败不发布半份；一次调用的派生副本随规划结束释放；插件卸载、lease 引用与实停责任不变。meter 是纯函数，没有在途调用可取消；跨进程无新状态可继承；已发请求与上游费用不因纯函数结束而改变。新增 Storage 要求 0、装配节点 0、bindings 0；无跨 owner 提交。

## 对账

| 对账 | 结果及承担 |
|---|---|
| A 性质承载 | 原 wire 保真与费用沿现共同层；来源校验复用现有共同包装，并在 factory 的直接公开入口补齐接线。家族只提供可见文字参考估算，其本地等价由等价预言核实；上游误差不承诺为零 |
| B 内核负面清单 | 无新增持久、跨 fiber 事务、可靠投递、权限或时序保证；精确实际 usage 仍以上游事实为准，内核不替估算背书 |
| C 原边界复查 | 不新增来源真值、O 转换、公开操作或消费方身份，不扩大 Session/Run 责任；R-A 的 full-only、R-B 的 effort 扩展与 27B `none` 拒绝不变。R-B「未知 opaque／加密历史即 unavailable」的守门只对有限表内的可见 `reasoning.text` 收窄——可见四键 `reasoning.text` 不属「未知 opaque」，这一读法经主调度 2026-09-30 裁决（P4）认可；summary、encrypted 与其余形状照旧拒绝。若实现发现须改变语言无关性质，停该分支回 spec |
| D 代价 | 两叶修订、一处共享识别函数与守门接线，外加一次当前绑定真实形状确认。继续全拒绝会阻断两叶真实多轮；套用 JSON 替身会与已固定的公开模板冲突；在家族 meter 里再读输出组会造第二个 walker。置信度只到 estimated |

## 关键选择

| 选择 | 本方 | 落选方及其最强论据 | 本方弱点 | 置信度 |
|---|---|---|---|---|
| 怎样计入 details | 投到公开模板 `reasoning_content` 槽位 | 维持全拒：不作任何未证主张；可见 JSON 替身：同家族六款的现行做法，家族内一致、逐字节不漏；原 O：有真实上游来源；改发 `reasoning` 字符串：meter 已支持该形 | 同家族两种口径并存（依据不同：六款无公开模板，两叶有）；上游私有转换未知，只到 estimated | 中 |
| 等同检查放哪 | wire 上并行字符串逐字相同；流级「`reasoning` 与 details 同文」由归档原件支撑 | 显式输出组在场时再比原 thinking 块文字：每次请求都能检出路由漂移，贴合「两者不同即 unavailable」字面；在共享投影或 reader 统一强制：一处实现、原文字总可得 | body-only full 看不到原块文字；只发 details 的流回放时本方会估算而非拒绝，见反例 10 | 中 |
| 并行键政策 | `reasoning` 逐字相同则只计一次；`reasoning_content` 沿既有拒绝 | DeepSeek 先例一律拒：更简单，产品路径本就不同时发两者；或把 `reasoning_content` 也按同义放行：官方快照说二者同义 | 与 Moonshot 候选的并行键集合不同（Moonshot 两键都收），源于两家 meter 既有允许集不同；三家分歧按 P1 登记为已知差异 | 中 |
| 采用前是否先确认形状 | 先按当前绑定补一次真实流形状再采用 | 以 `low` 流与 27B 非流为代表直接采用：形状跨 effort 与流/非流一致，detail 形状不太可能随 effort 变 | 多一次付费前置，推迟两叶多轮认证 | 中高 |
| 直接入口守门 | factory 公开方法接共同包装，八款一并 | 只接两叶：改动面小，不碰六款已交付的可见替身 | 六款直接入口行为收紧，超出两叶范围；主调度已认可随接线收口（R-N），其测试不作本次门（P3），见 G7 | 中高 |

## 反例义务

每条都要构造成测试，期望均已定：

1. 两条 assistant 各带一项合格 detail：各计一次；同一条再加逐字相同的 `reasoning`：计数不变。
2. 并行 `reasoning` 与 text 差一字符（含只差首尾空白）、`reasoning:""` 对非空 text、`reasoning:null`、并行 `reasoning_content`（即使同文）：unavailable。
3. `id:null`、`signature:null`、附加未知键、`index:1`、`index:"0"`、`format:"anthropic-claude-v1"`、`reasoning.summary`、`reasoning.encrypted`、两项、空数组、`null`、`text:"[REDACTED]"`：unavailable。
4. user、tool、system 消息带 details：unavailable；27B `effort:none` 带或不带 details：仍 unavailable。
5. 带 `id` 的 `reasoning.text` 片段、或无 id 而末片迟到 `signature` 的片段流（R-L 下合成带 `signature` 的一项），回放时多出键：unavailable；无 id 无签名相邻片段合成一项：可计。
6. 等价预言：以六份归档原件合成的文字构造回放历史，details 版与 `reasoning` 字符串版 full 计数逐值相等；覆盖缺省、`high`、`max`，有/无 tools，27B 另覆盖带图历史。
7. 原件不可变：计量前后原 body/serialized 逐字节不变；实际 HTTP 体等于计划 serialized 且仍含 `reasoning_details`。
8. 直接入口：对 factory 返回的 full 方法直接传入非法显式 history（重复目标、部分组、来源矛盾）被共同包装拒绝；body-only 合法 full 得 estimated；包装不递归。六款可见替身的合法 body-only 数值不变一项随接线收口时补，不作本次门（P3）。
9. 带合格 details 的历史，replay／new 仍 unavailable，measurement 为 full。
10. 只发 details 的流：`delta` 只有 `reasoning_details`、没有 `reasoning`，thinking 块文字为空而 detail 非空：按本页 wire 规则回放可计（estimated）。主调度 2026-09-30 裁决（R-N）接受 wire 层规则、不另开共享层同文强制，理由是估算本就只到 estimated、margin 在门上统一应用。

## 逐叶采用矩阵

| 叶 | 路由 | 当前绑定 | 算法修订 | 真实形状 | 当前发送域覆盖 | 未观察 | 本页建议 |
|---|---|---|---|---|---|---|---|
| `qwen/qwen3.8-2.4t-a95b` | `alibaba` | `3` / `pi-ai:qwen@mp4-18` | `qwen-38-public-template-effort-3` → 新唯一值 | 09-27 流 ×3（`effort:low`，发送域外） | 缺省、`high`、`max` 均未观察 | 当前域流形状、tools、回放被上游接受与 usage | QV0 后采用：机制接线先行、QV4 真实回放作门（R-P） |
| `qwen/qwen3.8-27b` | `alibaba` | `3` / `pi-ai:qwen@mp4-18` | `qwen-38-public-template-image-effort-4` → 新唯一值 | 09-27 流 ×3（`effort:low`）；09-28 非流 ×2（缺省、带图） | 缺省只见非流；流上缺省、`high`、`max` 未观察；`none` 不适用 | 同上 | 同上 |

## 实施与验收义务

QV0（采用前置）：root 沿唯一预算账本，每叶至少一条当前绑定的真实流（缺省或 `high`/`max` 至少一种；27B 最好含带图单轮），只读核对 details 形状与本页有限表逐项相同（含没有显式 `signature: null`）、`reasoning` 与 detail 逐帧同文。相同即交主线采用；不同则按实际形状修订本页，不据旧观察放行。

QV1：两叶经真实公开 plan/invoke 与 Cordis transport service，用归档形状的受控 SSE（每帧 `reasoning` 与等同单项 details）各做有/无 tools、缺省与 `high`/`max` 三轮：第 2、3 轮 full estimated，每轮 HTTP 恰一次且等于计划，实际 wire 保留 details，资源实停。`qwen-family-current.spec.ts` 开源两叶的 `text` 用例由拒绝改为估算，`summary`、`encrypted` 负控保留；`qwen-input-meter.spec.ts` 带附加键的 `reasoning.text` 负控保留。

QV2：反例 1–7、9；等价预言以归档原件文字为夹具，逐负控与正例同文件。

QV3：反例 8；必须直接调用 factory 返回的方法，不以规划器或独立包装函数的测试充作直接入口证据。本次门只含开源两叶，六款商业叶直接入口测试随接线收口时补（P3）。

QV4：真实路线由 root 沿唯一预算账本执行：每叶有、无 tools 各至少一组当前绑定三轮真实流，第 2 轮起回放 details；记录上游是否接受、`prompt_tokens` 与本地估算残差、cache 与 cost，并逐帧核对 details 形状（含是否出现显式 `signature: null`）。**必做**同路由对照（主调度 2026-09-30 裁决 P2）：同一历史分别以 `reasoning` 字符串与 details 回放，比较 `prompt_tokens`，检验「同一槽位」假设；这是闭合 G1 的唯一探针，归 root 付费账本。残差只作记录，不引入修正常数，受控 usage 不当精度。

QV5：两叶 definition／绑定／algorithm 唯一修订、`evidence` 字串、包 README／README_ZH 双语段与制品消费；未知与失败原件保留。无新代数或并发性质，不扩 TLA 范围，以既有共享形式边界和上述正反例承接。候选须经 QV0、独立 architecture-reviewer 与主线技术采用后才释放实现。

## 缺口与受阻消费者

- G1 上游转换：OpenRouter 如何把 `reasoning.text` details 转成 Alibaba 原生推理字段并计入 prompt——待核对主张；本页只到 [S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③ 允许的有据 estimated，不承诺误差界。由 QV4 的必做同路由对照闭合（P2）。
- G2 当前绑定形状：流式观察只在发送域外的 `low`。归主调度付费（QV0）。受阻：本页采用本身。
- G3 真实回放：带 details 的历史从未真实发送，上游接受、usage、cache 均未知。归主调度付费认证。受阻消费者：两叶 D7 逐模型真实多轮认证（现第 2 轮本地拒绝）。
- G4 解释点（反例 10）：按 R-N 闭合，与 Moonshot 候选同一裁决。同文只在 wire 层强制，流级同文性由归档原件支撑，不另开共享层候选；反例 10 固定为可计（estimated）。
- G5 证据归档：本页流式形状表是起草者对归档原件的复算，长期家应在 research。归主线。
- G6 裁决入档：R-A、R-B、R-F＋R-L、R-K、R-M 已登记于 D-111（D-111；HUB 已有，本 spoke 基线尚无该文件，合入后改为链接）。R-N 与 R-P（P1–P4）已裁未入档，随采用决定入档。R-L 的共享 reader 改动尚未进入本 spoke 基线，QV1 须在含 R-L 的 reader 上复跑。
- G7 六款可见替身的既有直接入口：它们已在 JSON 替身里放行可见 `reasoning.text`/`summary`，而同一 factory 的直接方法不经共同包装，与 DeepSeek 评审 N1 同构。这是本页之前就存在的缺口。主调度 2026-09-30 裁决（R-N）登记为 Qwen 家族既有缺口，随两叶接线一起收口，不阻本页采用；六款直接入口测试不作本次验收门（P3）。已裁未入档，随采用决定入档。
