# Moonshot 可见推理详情的参考计量

2026-09-30，revision 1，candidate；未技术采用、未实施、未实际验证，新增 bindings 0。本页按已采用的 [DeepSeek 可见推理计量](deepseek-visible-reasoning-estimate-design.md)（[采用决定](../../../../record/decisions/model-input-usage-calibration-adoption/deepseek-visible-reasoning-decision.md)）的结构，补充已采用的 [v10](v10-token-estimate-design.md)、[v12](v12-usage-calibration-design.md)，不改这些页及 DeepSeek 页的受审字节。持续消费者为两款 Moonshot 官方定义、`createMoonshotInputMeter` 与模型调用规划器；固定上游模板、OpenRouter 推理详情协议或共享分组规则变化时复核本页。

## 基准、性质与证据

基准为已接受 [RT12](../../../../spec/capabilities/model-request-runtime/v12/contract.md)／[MR11](../../../../spec/data/model-response/v11/contract.md) 的计量语义（接受依据沿 [D107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)）与当前 Moonshot 实现（两叶定义 `2`、`pi-ai:moonshot@mp4-17`）。主调度 2026-09-30 裁定本轮 Moonshot 以 full-only 交付、φ/δ 不作交付门（R-A，尚未入 `record/decisions/`）。本页不新增公开操作、输出组语义、对象或存储；相关对象仍为 ModelDefinition、ModelProfile、ModelInvocationInput、PendingModelResponse，未经尚不存在的装配反查索引核实。

沿用已封存性质，不声明新的双盲封存：全部实际输入有据计量或发前拒绝，估算须有适用依据、不以私有模板为普遍前置（[S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③⑤）；来源真实性先于计量，可判矛盾不得借 full 绕过（[S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)）；reasoning 不双加、不无条件用 I+O、margin 只应用一次（[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)）；独立公开计量无隐藏读取、来源不可核即 unavailable（[S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)④⑥⑧）；下一请求的输入贡献由实际回放的 role/template/内容决定，原响应、实际 wire 与上游 usage 保留（[MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)）。

### 真实原件核实

原件为 [2026-09-27 probe 证据 run](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md) 归档 `openrouter-research.tar.gz` 的成员，SHA-256 与该 run 的[成员清单](../../../../record/evidence/2026-09-27-probe-model-request-runtime/input-and-output-hashes-v2.json)逐项一致。十份都是固定路由（`provider.order` 单值、`allow_fallbacks:false`、`require_parameters:true`）、`stream:true`、单轮 system+user+user、无 tools，HTTP 200、`finish_reason:"stop"`，服务方展示名 `Moonshot AI`、上游 model 等于路由模型。起草者只读复算，未发请求；复算是独立 Python 读数，不是执行 TS reader。

| 叶 | 成员（`openrouter-research/…`） | SHA-256 | 请求 effort | 带 details 的帧 |
|---|---|---|---|---:|
| K3 | `families-02/b8dfeb22-8983-4652-858c-5f0916bf5438.json` | `4e09fc912dcb76d0131c1740b35bed29fb7a90e3ab99d0b9c72aebad2bb8f3b3` | `low` | 16 |
| K3 | `families-02/cbf24a7f-7668-4fa1-b206-e09d0380d7c1.json` | `0bbd6b083977e12dec1406ef0bf688e2ea2ed13d889bcb5da29ac7313a78ff73` | `low` | 14 |
| K3 | `families-02/e60210e3-566e-4d6d-bfa4-a7920ea2de93.json` | `74c06813689f9a2fe613ada7d56333589f1b3255840f3aec52aa7230d9c35814` | `low` | 18 |
| K3 | `automatic-01/3de20811-657b-44d8-aae9-78b8b4111c2e.json` | `f33c34ef3d2e866329b8c817b30b0f711711e8e86b58bd4e58ec2caf7c0aa045` | `low` | 16 |
| K3 | `automatic-01/f866f34a-e7f8-45ee-80c3-1559517d1035.json` | `01e635632325952d54435cae8d0134482e20f22405a73971e8b5f635047db686` | `low` | 18 |
| K2.7 Code | `automatic-01/1410f6bd-dfde-45f5-990b-eadd84dc6341.json` | `d56266a995478eb538936d2e89743c49235d7c253c74006dd0334ec1b8c08f94` | 缺席 | 440 |
| K2.7 Code | `automatic-01/37423a22-21d9-416c-9543-9c6bd0f151e8.json` | `24e6a22d7e269583705c6c12d13013371434ef875dcb31ca255ae9f7219cdefa` | 缺席 | 34 |
| K2.7 Code | `remaining-03/1a74153b-e61b-4585-a296-6bdc3bd3a708.json` | `bae240a876a2e4b5abff373c68f58b91ab937700accc3680ca3a0392bc64513c` | 缺席 | 72 |
| K2.7 Code | `remaining-03/6118478c-2905-41db-8fa5-354836e31d24.json` | `01fa5e57d48ecdb0f3533e09194823ef2aba6ae3bb9ce26859e3284d6696a9a9` | 缺席 | 140 |
| K2.7 Code | `remaining-03/969a8121-81ad-46d0-b64a-2d2dc0a55355.json` | `8b2924eabd0b8e5d4e72f7d54433d488748e1d0a9f1eff2866b17a0c95e64f45` | 缺席 | 48 |

全部 816 个带 details 的帧：`delta.reasoning_details` 恰一项，own keys 恰为 `type,text,format,index`，`type` 为 `reasoning.text`，`format` 为字面 `unknown`，`index` 的原字面为 `0`；无 `id`、无 `signature`。每一帧同时带 `delta.reasoning`，且与该项 `text` 逐字相同；没有只带其一的帧，没有 `reasoning_content`/`reasoning_text` delta。按共享 R-F 相邻拼接规则复算（R-L 修正只涉签名，对这些无签名片段结果相同），每份响应合为恰一项 detail，键同上，`text` 与整条 `reasoning` 串逐字相同。覆盖限制：K3 只见 `effort:low`，high/max 未观察；两叶都没有带 tools 的回复、没有多轮、没有任何带 details 的历史被真实发送。主线另持 2026-09-28 三条 K3 图片校准流（请求带 tools、`finish_reason:"length"`）同形，原件尚未入 research 或 record，本页不以其为依据。

### 上游与固定模板

[OpenRouter Reasoning Tokens 官方快照](../../../../../research/model-request-adaptation/vendor-continuation/xai/closeout-2026-09-30/openrouter-reasoning-tokens.txt)（2026-09-30 取得，SHA-256 `a80ca4bcee4915cc1d1697fd620743bfbbc97f45f5a25213fcc149bad5681bc7`）的「Preserving Reasoning」写明：可用 `message.reasoning` 字符串或 `message.reasoning_details` 数组把推理传回，`reasoning_content` 与 `reasoning` 同义；流式 details 按序拼接；encrypted 内容在流中可能为字面 `[REDACTED]`。它没说同一消息兼带两者时取哪一个，也没说 OpenRouter 如何把 details 转成 Moonshot 原生字段——后者是**待核对主张**（`design/basis/` 无对应条目，须按来源核对或真实差分取证）。

固定参考对历史 assistant 一律渲染推理段：K3 `encoding_k3.py`@`f831ab66814297da540d832a5235f8e904f29d06` 取 `reasoning_content or reasoning`（空串回落）；K2.7 Code `chat_template.jinja`@`74797c9c62378b951a1f6fcf5c4631024e9b8bef` 取 `reasoning`、缺则 `reasoning_content`，渲进 `<think>{{rc}}</think>`。当前 TS 投影 `moonshot.ts` 分别以 `reasoning_content ?? reasoning` 与 `reasoning ?? reasoning_content ?? ''` 移植，并在 `:215-216` 拒绝任何 `reasoning_details`。[Moonshot 研究](../../../../../research/model-request-adaptation/vendor-continuation/moonshot/2026-09-28-image-and-opaque-calibration.md)记录两份固定源都不解释 details 回放表示。本页因此是**有来源的估算候选**：把可见文字放进模板既有推理槽位，不是上游等值事实，原件也不证明当前绑定认证通过。

## 最小承载与范围

落点为现有 Moonshot InputMeter 内的纯数据投影（#1），不是新服务，也不是新的消息或组 walker。固定范围只为 `moonshotai/kimi-k3`@`moonshotai/mxfp4` 与 `moonshotai/kimi-k2.7-code`@`moonshotai/int4` 的官方贡献及其后继唯一修订；不按厂商名放行未知形态，不外推到其他家族。

### 有限适用表

| 维度 | 适用值（同时满足才投影） | 其余 |
|---|---|---|
| 定义与实现 | 两叶后继唯一 definition 与 `pi-ai:moonshot` implementation 修订（数值由主线接口账本分配） | 当前 `2`/`mp4-17` 保持现拒绝；未知修订沿既有 factory 构造期抛错，贡献不发布 |
| 路由 | 请求体 `model` 等于定义 modelId，贡献绑定上表精确 provider | 其他：沿既有 unavailable |
| 消息角色 | `assistant` | 其他角色带 `reasoning_details`：unavailable |
| details 数组 | 恰一项 | 空数组、`null`、非数组、多项：unavailable |
| detail 形状 | own keys 恰为 `type,text,format,index`；`type` 为 `reasoning.text`；`text` 为字符串且不等于字面 `[REDACTED]`；`format` 为原字面 `unknown`；`index` 为 JSON 数且精确十进制值为 0 | `reasoning.summary`、`reasoning.encrypted`、任何附加键（含 `id:null`、`signature:null`）、非 `unknown` format、非 0 或字符串 index、`[REDACTED]`：unavailable |
| 与推理字符串的等同 | 同一消息的 `reasoning`、`reasoning_content` 各自缺席，或是与该 `text` 逐字相同的字符串 | 任一在场却非字符串或不逐字相同（含 `""` 对非空 text、`null`）：unavailable |
| 其余字段 | 沿当前 meter 既有允许集：K3 effort 限 low/high/max，K2.7 Code 仍拒 body `reasoning`，图片沿既有 patch 估算 | 沿既有 unavailable |

`text` 直接取实际发送体；空串是可见的空文字。多条 assistant 各带一项合格 detail 时逐条投影，各计一次。

## 计量映射与 full/φ/δ 同源

full 先按原件核：原 body 的 `model` 等于定义、原 body 与原 serialized 一致；再只对仅供计量的派生副本渲染。对每条命中上表的 assistant 消息，派生副本删去 `reasoning_details`，该消息无 `reasoning` 键时补 `reasoning = text`，已在场且已证等同的 `reasoning`／`reasoning_content` 保持原值。于是 K3 XTML 的 think 段与 K2.7 Code Jinja 的 `rc` 槽位各恰好收到一份 `text`；等同要求同时消除了两种取值顺序（K3 以 `reasoning_content` 优先且空串回落，K2.7 以 `reasoning` 优先）在字符串不同时的分歧。原 body、serialized、units、原块与摘要均不变，实际发出的 wire 仍原样带 `reasoning_details`。候选私有函数名由实现者选择，不增加公开 DTO 或 runtime 参数。

派生副本与既有无 details 路径走同一渲染、同一 tiktoken 计数，图片 patch 沿既有。不经 details 的 JSON 长度、元数据键或密文字节猜 token；不另加 O、`reasoning_tokens` 或未经验证的修正常数；宿主可配置 margin 只在规划器最终门应用一次。可检查的等价预言：任一命中消息的派生计数，等于把该消息的 `reasoning_details` 换成 `reasoning: text` 的同一 wire 在当前 meter 上的计数——本映射不引入既有明文推理路径之外的本地误差源；与 OpenRouter 私有转换的差异仍是 estimated，没有证据承诺误差上界。

φ/δ 按 R-A 保持 `defineInputMeter` 默认 `unsupported-marginal/1`，调用即 unavailable；本页不开增量。日后若由提供者页开放，φ/δ 必须经同一投影函数，禁止另写一条 details 解释路径。full-only 下每轮整份分词是既有 full 语义，不是稳定 P 复用；「稳定 P 零分词」义务随增量开放再立。

修订：两叶 `algorithmRevision` 各升新唯一值（现 `moonshot-k3-xtml-image-4`、`moonshot-k27-jinja-image-3`）；`tokenizerRevision` 沿 `defineInputMeter` 默认从算法派生——模板投影域已变，派生新值不是伪升，tiktoken 与图片处理器摘要不变；`transformRevision` 保持 `openrouter-wire/2`；`evidence` 追加「可见 `reasoning.text` details 投到模板推理槽位、OpenRouter details 转换未知、无 holdout」同义表述。

## 与共享 walker／分组的接缝

| 共享件 | 本页依赖 | 不改什么 |
|---|---|---|
| `stream.ts` `continueReasoningText`（R-F：无 id、其余头逐值相等且相邻才拼接；R-L 修正为无 id 时签名可从缺席到一次非空值） | 真实流 14–440 个无 id 无签名片段在 R-F 与 R-L 下都合成恰一项；本页的「恰一项」就是这条规则的产物 | 不改合并规则。R-L 下无 id 的迟到签名会并进同一项而多出 `signature` 键，按上表附加键拒绝；若规则回退为「无 id 永不合并」，回放变多项而 unavailable。两种变化的失败方向都是拒绝而非多计 |
| `assistant-projection.ts` `projectAssistant` | 带 opaque 的 thinking 块只发 `reasoning_details`、不发 `reasoning`；本页据此不要求 wire 带并行字符串。换路由时带 opaque 的块由它拒绝（R-K），不会进入本页 | 不改发送协议，不把 details 改写成字符串（官方快照要求原样传回） |
| `input-meter.ts` 共同包装 `measureFull`／`measureReplay`／`measureNew` | 来源、basis、history 校验的唯一所在 | 不复制；见下「直接入口守门」 |
| 形状识别 | 四键形状与 DeepSeek 判定相同，宜收成一处家族中立的纯识别函数，由本家族与 Qwen 开源两叶复用；并行键政策、`[REDACTED]` 排除与目标槽位留在各家族 | DeepSeek 已采用判定不因本页改变；是否迁到同一识别函数归其 owner，迁移须保持 DeepSeek 既有负控逐项不变 |

直接入口守门：当前 `createMoonshotInputMeter` 返回 `defineInputMeter` 的冻结对象，其直接 `measureFull` 不经共同包装；规划器路径经 `plan.ts`／`input-limits.ts` 调共同包装。本页让带 details 的历史首次可计量，不接线则直接调用 factory 方法可携非法显式 history 得到估算——[DeepSeek 评审](../../../../record/proposals/model-input-usage-calibration/deepseek-visible-reasoning-review.md) N1 的同构。须把两叶 factory 的公开 full／φ／δ 方法接到共同包装，包装再调私有原始对象、避免递归；复用唯一的通用接线函数（现名 `guardDeepSeekMeter`，内容与家族无关），不复制第二份。这是 S-77、S-79⑥ 与 [H13](verification.md#h13-多个历史输出组候选) 的落实，不新增契约承诺。

## 失败层、版本与装卸

形态不在表内：沿既有 unavailable，经 PlanFailure `invalidInput{reason: input_size_unavailable}` 发前拒绝，零 HTTP、零新响应或账，原消息不删不改。显式非法组：由共同包装拒绝，不能借可见文字分支绕过。上游接受后又带内或以 HTTP 拒绝：保留真实请求与用量事实，不自动删历史、降参数或重试。三层不混。

发布时两叶 definition、`pi-ai:moonshot` implementation 与 algorithm 提升到新的唯一修订；固定旧 lease 不热替换，已借出的旧 meter 跑完各自规划；不保留旧 factory 或兼容重载，旧到新 basis 未证兼容即 full。factory 的绑定核验对照当前导出定义，不再写死 `'2'`／`'mp4-17'` 这类会滞后的修订字符串。历史事实保留原坐标。

Cordis 继续由原官方模型贡献插件与 transport service 固定整份 meter，采用版本沿 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)；不新增 service、fiber、inject、effect 或事件，不新增上游内核主张。装载时 meter 取得既有 tokenizer 与模板常量，初始化失败按既有 factory 抛错收场、不发布半份；一次调用的派生副本随规划结束释放；插件卸载、lease 引用与实停责任不变。meter 是纯函数，没有在途调用可取消；跨进程无新状态可继承；已发请求与上游费用不因纯函数结束而改变。新增 Storage 要求 0、装配节点 0、bindings 0；无跨 owner 提交。

## 对账

| 对账 | 结果及承担 |
|---|---|
| A 性质承载 | 原 wire 保真与费用沿现共同层；来源校验复用现有共同包装，并在两叶 factory 的直接公开入口补齐接线。家族只提供可见文字参考估算，其本地等价由等价预言核实；上游误差不承诺为零 |
| B 内核负面清单 | 无新增持久、跨 fiber 事务、可靠投递、权限或时序保证；精确实际 usage 仍以上游事实为准，内核不替估算背书 |
| C 原边界复查 | 不新增来源真值、O 转换、公开操作或消费方身份，不扩大 Session/Run 责任；R-A 的 full-only 不变。若实现发现须改变语言无关性质，停该分支回 spec |
| D 代价 | 两叶修订加一处共享识别函数与守门接线。继续全拒绝会阻断已选模型的真实多轮；把 details 按 JSON 数 token 没有模板依据；在家族 meter 里再读输出组会造第二个 walker。代价是需真实路线差分，置信度只到 estimated |

## 关键选择

| 选择 | 本方 | 落选方及其最强论据 | 本方弱点 | 置信度 |
|---|---|---|---|---|
| 怎样计入 details | 投到模板既有推理槽位 | 维持全拒：不作任何未证主张；JSON 替身（同批 Qwen 商业叶先例）：逐字节不漏；原 O：有真实上游来源；改发 `reasoning` 字符串：meter 已支持该形 | 上游私有转换未知，只到 estimated；等价只在本地参考层成立 | 中 |
| 等同检查放哪 | wire 上并行字符串逐字相同；流级「`reasoning` 与 details 同文」由归档原件支撑 | 显式输出组在场时再比原 thinking 块文字：每次请求都能检出路由漂移，贴合「两者不同即 unavailable」字面；在共享投影或 reader 统一强制：一处实现、原文字总可得 | body-only full 看不到原块文字；只发 details 的流（块文字为空、detail 非空）回放时本方会估算而非拒绝，见反例 10 | 中，待主线确认 |
| 并行键政策 | 逐字相同则只计一次，不同则拒 | DeepSeek 先例一律拒：更简单、与已采用页一致，产品路径本就不同时发两者 | 多一条只服务直接调用者的分支 | 中高 |
| 形状识别归属 | 一处家族中立识别函数 | 各家族各写：互不牵连，不碰已采用 DeepSeek 代码 | 过渡期与 DeepSeek 现判定并存两处，收敛需其 owner 另批 | 中 |
| 直接入口守门 | factory 公开方法接共同包装 | 只靠规划器路径校验：少一层接线，产品路径已覆盖 | 需改 factory 构造并补直接入口测试 | 高 |

## 反例义务

每条都要构造成测试；前九条的期望已定，第十条待裁：

1. 两条 assistant 各带一项合格 detail：各计一次；同一条再加逐字相同的 `reasoning` 或 `reasoning_content`：计数不变。
2. 并行 `reasoning` 与 text 差一字符、`reasoning_content:""` 对非空 text、`reasoning:null`：unavailable。
3. `id:null`、`signature:null`、附加未知键、`index:1`、`index:"0"`、`format:"anthropic-claude-v1"`、`reasoning.summary`、`reasoning.encrypted`、两项、空数组、`null`、`text:"[REDACTED]"`：unavailable。
4. user、tool、system 消息带 details：unavailable。
5. 带 `id` 的 `reasoning.text` 片段、或无 id 而末片迟到 `signature` 的片段流（R-L 下合成带 `signature` 的一项），回放时多出键：unavailable；无 id 无签名相邻片段合成一项：可计。
6. 等价预言：以十份归档原件合成的文字构造回放历史，details 版与 `reasoning` 字符串版 full 计数逐值相等；K3 覆盖 low/high/max，两叶覆盖有/无 tools。
7. 原件不可变：计量前后原 body/serialized 逐字节不变；实际 HTTP 体等于计划 serialized 且仍含 `reasoning_details`。
8. 直接入口：对两叶 factory 返回的 full 方法直接传入非法显式 history（重复目标、部分组、来源矛盾）被共同包装拒绝；body-only 合法 full 得 estimated；包装不递归。
9. 带合格 details 的历史，replay／new 仍 unavailable，measurement 为 full。
10. 只发 details 的流：`delta` 只有 `reasoning_details`、没有 `reasoning`（演示装配现有夹具即此形），thinking 块文字为空而 detail 非空。按本页 wire 规则回放可计，与「两者不同即 unavailable」字面相左；待主线在「接受 wire 规则」与「另开共享层同文强制候选」之间裁定，再按裁定固定测试。

## 逐叶采用矩阵

| 叶 | 路由 | 当前绑定 | 算法修订 | 真实形状 | 当前发送域覆盖 | 未观察 | 本页建议 |
|---|---|---|---|---|---|---|---|
| `moonshotai/kimi-k3` | `moonshotai/mxfp4` | `2` / `pi-ai:moonshot@mp4-17` | `moonshot-k3-xtml-image-4` → 新唯一值 | 09-27 流 ×5 | 发送域 low/high/max 中仅 low | high/max、tools、回放被上游接受与 usage | 可进入独立评审与采用；MV4 为认证门 |
| `moonshotai/kimi-k2.7-code` | `moonshotai/int4` | `2` / `pi-ai:moonshot@mp4-17` | `moonshot-k27-jinja-image-3` → 新唯一值 | 09-27 流 ×5 | 唯一发送形（effort 全丢、无 body `reasoning`）已覆盖 | tools、回放被上游接受与 usage | 同上 |

## 实施与验收义务

MV1：两叶经真实公开 plan/invoke 与 Cordis transport service，用归档形状的受控 SSE（每帧 `reasoning` 与等同单项 details）各做有/无 tools 三轮：第 2、3 轮 full estimated，每轮 HTTP 恰一次且等于计划，实际 wire 保留 details，资源实停；K3 覆盖 low/high/max。`moonshot-closeout-boundaries.spec.ts` 的「archived real-route reasoning.text details」由拒绝改为估算，encrypted 负控保留；演示装配 `moonshot-three-round-service.spec.ts` 的 details 用例改用真实形状，只发 details 的变体按反例 10 的裁定固定。

MV2：反例 1–7、9；等价预言以归档原件文字为夹具，逐负控与正例同文件。

MV3：反例 8；必须直接调用两叶 factory 返回的方法，不以规划器或独立包装函数的测试充作直接入口证据。

MV4：真实路线由 root 沿唯一预算账本执行：每叶有、无 tools 各至少一组当前绑定三轮真实流，第 2 轮起回放 details；记录上游是否接受、`prompt_tokens` 与本地估算残差、cache 与 cost。可选同路由对照：同一历史分别以 `reasoning` 字符串与 details 回放，比较 `prompt_tokens`，检验「同一槽位」假设。残差只作记录，不引入修正常数，受控 usage 不当精度。

MV5：两叶 definition／implementation／algorithm 唯一修订、`evidence` 字串、包 README／README_ZH 双语段与制品消费；`tokenizers/moonshot/provenance.json` 的实现坐标由其 owner 更新；未知与失败原件保留。无新代数或并发性质，不扩 TLA 范围，以既有共享形式边界和上述正反例承接。候选须经独立 architecture-reviewer 与主线技术采用后才释放实现。

## 缺口与受阻消费者

- G1 上游转换：OpenRouter 如何把 `reasoning.text` details 转成 Moonshot 原生推理字段并计入 prompt——待核对主张；本页只到 [S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③ 允许的有据 estimated，不承诺误差界。归 MV4 与研究。
- G2 真实回放：带 details 的历史从未真实发送，上游接受、usage、cache 均未知。归主调度付费认证。受阻消费者：两叶 D7 逐模型真实多轮认证（现第 2 轮本地拒绝）。
- G3 解释点（反例 10）：「`reasoning` 与 details 同文」的运行时强制点。家族 meter 在 body-only full 看不到原块文字，强制只能落在共享投影或 reader（一处、全家族），不在本页权限内。受阻：MV1 演示装配 details 用例的期望值。归主调度裁定。
- G4 观察覆盖：K3 high/max、带 tools 的 details 形状未观察，列为 MV4 的前提假设。
- G5 证据归档：本页真实形状表是起草者对归档原件的复算，长期家应在 research；09-28 三条 K3 同形流原件尚未入档。归主线。
- G6 裁决入档：R-A、R-F、R-K 与 R-L 尚未入 `record/decisions/`；本页据其内容，不据其出处。R-L 的共享 reader 改动尚未进入本 spoke 基线，MV1 须在含 R-L 的 reader 上复跑。归主线。
