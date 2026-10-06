# ZAI 五叶可见推理历史的参考计量

2026-09-30，revision 1，candidate；独立架构评审 2026-09-30「可采用」，Z-N1～Z-N5 已按评审闭合；同日[主线技术采用](../../../../record/decisions/model-input-usage-calibration-adoption/zai-visible-reasoning-decision.md)；实施与释放状态以本页「实施附注」与 [verification.md](verification.md) 的 ZV 段为准（五叶均已释放为 `pi-ai:zai@mp4-18`；ZV4 真实回放待主线付费执行）。

## 基准、性质与证据

基准为已接受 [RT12](../../../../spec/capabilities/model-request-runtime/v12/contract.md)／[MR11](../../../../spec/data/model-response/v11/contract.md) 的计量语义（接受依据沿 [D107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)）与当前 ZAI 实现：五叶 definition `2`（Prime `3`）、`pi-ai:zai@mp4-17`，五个 meter 均 full-only，任何历史 assistant 带 `reasoning` 或 `reasoning_details` 一律 unavailable，经规划器以 `input_size_unavailable` 发前拒绝（[本机 110 例](verification.md#2026-09-30-zai-五叶本机-tls-有限覆盖)）。主调度 2026-09-30 裁定四家含 ZAI 以 full-only 交付（R-A，[D-111](../../../../record/decisions/model-request-runtime-rulings-2026-09-30/README.md)）；另裁定本机「回复无推理」与「调用方隐藏 thinking」两形已收口、可见推理历史即 GG-12 本页（R-O，已裁未入档，见 ZG8）。本页不新增公开操作、输出组语义、对象或存储；相关对象仍为 ModelDefinition、ModelProfile、ModelInvocationInput、PendingModelResponse，未经尚不存在的装配反查索引核实。

沿用已封存性质，不声明新的双盲封存：全部实际输入有据计量或发前拒绝，估算须有适用依据、不以私有模板为普遍前置（[S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③⑤）；来源真实性先于计量，可判矛盾不得借 full 绕过（[S-77](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-77-计量依据身份与两类失效)）；reasoning 不双加、不无条件用 I+O、margin 只应用一次（[S-78](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-78-递推关系精度与重新校准)）；独立公开计量无隐藏读取、来源不可核即 unavailable（[S-79](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-79-现有公开函数的九项增量)④⑥⑧）；下一请求的输入贡献由实际回放的 role/template/内容决定，原响应、实际 wire 与上游 usage 保留（[MR11 S-43](../../../../spec/data/model-response/v11/contract.md#s-43-outputgroup-与回放)）。

### 真实原件核实

两批原件。起草者只读复算，未发请求；复算是独立 Python 读数，不是执行 TS reader。

**2026-09-27**：[probe 证据 run](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md) 归档 `openrouter-research.tar.gz` 中 23 个 `z-ai/*` 成员，SHA-256 与[成员清单](../../../../record/evidence/2026-09-27-probe-model-request-runtime/input-and-output-hashes-v2.json)逐项一致。全部固定路由（`provider.order` 单值、`allow_fallbacks:false`、`require_parameters:true`）、`stream:true`、单轮 system+user+user、无 tools、`max_tokens:1024`，HTTP 200、`finish_reason:"stop"`，服务方展示名 `Z.AI`（Prime 为 `Alibaba`）、上游 model 等于路由模型。其中 13 个带推理：

| 叶 | 成员（`openrouter-research/…`） | SHA-256 | 请求 effort | 带 details 的帧 |
|---|---|---|---|---:|
| 5.2 | `automatic-01/017af21b-c8cc-4a46-8a2a-99ce4352b8bf.json` | `17b563f476e4f82f3a5bc2e8e4125f81627f48121856652bbb31077b33aeee9b` | 缺席 | 91 |
| 5.2 | `automatic-01/5e40f074-7cb6-468b-837c-8a9aa6e7705a.json` | `5c83c9c45a71f645e84f1df7b76575c74b1b39176784bdb1a4adc34dea23beee` | 缺席 | 70 |
| 5.2 | `remaining-03/35629393-0896-45d6-b93a-667a7fba6b3e.json` | `bcfd667e78dd757170b56be64ae3372e4827b39204ebf2999d3020c08f334ef6` | 缺席 | 67 |
| 5.2 | `remaining-03/c96abd47-17db-498f-8324-897300019e78.json` | `1d57c59ba504144108163d174b9c3b834f389d932071c532c83187cefc7972f8` | 缺席 | 64 |
| 5.2 | `remaining-03/d547dad2-5f33-4d42-a39d-86b16bb622c4.json` | `e89f9ff75a0668fb4918b8c1639edd0b4a7dad6b24a8c026878831d10ed816f6` | 缺席 | 311 |
| Flash | `remaining-03/09cbdbcf-a3be-4b46-98a5-ada2824393e6.json` | `a68dc8d97e8de70a90951311fd95e21b95be340b54f981615addc33cd2db4f9d` | `low` | 8 |
| Flash | `remaining-03/2be1f829-8040-4902-8da6-9cdc7d52d517.json` | `895dcce388c3ef6d589cd1b23e1c514cf2b331c4af371b6bdd4ee74c8a4d3c07` | `low` | 1 |
| Flash | `remaining-03/5b805eb1-bda8-40ea-b98b-d864db18c863.json` | `fefc43fbf5c9ced22a90226cfce2c909a9a42ecf073e7e5ed2f9ebaa5b44bf2e` | `low` | 13 |
| FlashX | `automatic-01/7f4d4bf1-17f9-4732-9529-cdbb92587d83.json` | `1ac4953e0f245ac98323bc71aa691e9ccae649fad9e6db49fc42eeccc23a1794` | `low` | 2 |
| FlashX | `automatic-01/a22fc49d-4610-41ad-ab06-e25ac7706634.json` | `bfb44aef0846f464cbfde33117adc27aedde8fe17f00a142b49e6e1d497e7b7a` | `low` | 1 |
| FlashX | `remaining-03/53fab9fb-d496-4f27-816e-e2ee6cf87fcc.json` | `1cf975d8ca78f232a455bcc7a178733c896e4cd734b0ba90e9a8fb1c4c771710` | `low` | 2 |
| FlashX | `remaining-03/ec5fe6bf-7ef8-4b5b-8bda-464c09a45f2d.json` | `6e079dd65fe51337a8bed1b78dc6123f00e1b34f6bb6453a757c7ddd3469edcf` | `low` | 2 |
| FlashX | `remaining-03/eecb1509-4b78-4d26-8d27-0c034ba85912.json` | `864e36e0bd3b68e4de9dc707ea4f98f50e8e9fc93afdfa253073d6768d15040d` | `low` | 2 |

其余 10 个无推理 delta、usage `reasoning_tokens:0`：GLM-5.3 五个（`automatic-01/b371cec1`、`automatic-01/f1d7fa95`、`families-02/0678e1db`、`families-02/489803f5`、`families-02/c55bf2cf`，均 `low`）、Flash 两个（`automatic-01/1b9b1a44`、`automatic-01/c3b49310`，`low`）、Prime 三个（`remaining-03/16c4acf1`、`remaining-03/61e2aca3`、`remaining-03/6e1f49cc`，`low`）。

**2026-09-28**：root 付费观测的完整 `stop` 流，登记于 [五请求观察](../../../../../research/model-request-adaptation/vendor-continuation/zai/2026-09-28-five-request-observation.md)与[商业 holdout](../../../../../research/model-request-adaptation/vendor-continuation/zai/2026-09-28-commercial-holdout-result.md)（原件哈希）；[历史回放研究](../../../../../research/model-request-adaptation/vendor-continuation/zai/2026-09-28-history-replay-and-candidate.md)把五份原 SSE 逐字保存进执行仓库夹具 `packages/model/pi-ai-transport/tests/fixtures/zai/history-complete-streams.json`（SHA-256 `827812a4c5897e55998370691cabff981131dd0e30bcfff2d3d688e5173c39c0`），每项带原件 SHA 与未改动 SSE 的 SHA，起草者逐项复核 SSE 哈希一致。请求均无 effort、`max_tokens:64`、带 tools 与一段完整 assistant tool-call／tool-result 历史，回复是纯文字（无 tool_calls）：

| 叶 | 夹具项 | 原件 SHA-256 | SSE SHA-256 | 带 details 的帧 |
|---|---|---|---|---:|
| Prime | `prime-control` | `0c6a95778d14d265a9a46c1e8e89b8d3084e48bcf27897b69b4756160a1b12ad` | `1102b73a43690987c0c175a29aa2dbf6b6c6daec876da1d397ed7cc0fb2d989f` | 14 |
| Prime | `prime-long` | `dcc3fb2b5d56f5157f9d7d5f9bff13dd220057fc01926dc747a4d6c9fb922b54` | `78ff24f9058332181af5fc2663032ded83a58e535a6d5f9889fad15204e7a911` | 21 |
| Prime | `prime-base` | `9d23f29f2dbbb608e9c3180728874171fa64d05df4d48479fa36b471cfe18366` | `6f4369aae32c4d0b9999f40ba11b28fefd825024c09ad3907f977926ce5db1de` | 27 |
| FlashX | `flashx-long` | `897c8c1e99929765af10dffc265127973dade8144bf4dbf5a5c60cdcdccc6806` | `eec9a2585f77baf42f2eb9eb1012c258b1251c61a89020c9a002f10f665fe6ad` | 34 |
| FlashX | `flashx-mixed` | `9abbfd3bd7ab7049154c332dae763299595e5ffc6052f3d5b087182ad1e6266b` | `1c449f72bdec65c351bdc5c12453c0a06e87754b09c1470e5328efcc58e962b6` | 30 |

同日 GLM-5.3 seed（`z-ai/fp8`、`effort:"high"`，原件 `ded2c9fa…`）回复只有 content、`reasoning_tokens:0`；Prime mixed、FlashX control／base 带推理但以 `length` 截断，不作完整历史种子。

**两批合计 760 个带 details 的帧**：`delta.reasoning_details` 恰一项，own keys 恰为 `type,text,format,index`，`type` 为 `reasoning.text`，`format` 为字面 `unknown`，`index` 原字面为 `0`；无 `id`、无 `signature`。每一帧同时带 `delta.reasoning`，与该项 `text` 逐字相同；没有只带其一的帧，没有 `reasoning_content` delta。每份响应的推理帧恰一段连续、中间无 content 帧，按共享 R-F＋R-L 相邻拼接规则合为恰一项 detail，`text` 与整条 `reasoning` 串逐字相同。

**逐叶覆盖限制**：GLM-5.3 六次观察（五次 `low`、一次 `high`）均未产出推理，**没有任何带推理的原件**。Flash 带推理的三份全在 `low`，而当前绑定丢弃 Flash 的 effort，实际发送域只有缺省，**当前发送域形状未观察**。GLM-5.2 五份在缺省 effort（当前域为缺省与 `high`），`high` 未观察。Prime 在缺省下三份带推理，`low` 三份未产出推理，`high`/`max` 未观察。FlashX 在缺省下两份带推理（`low` 的五份在发送域外）。五叶都没有回复带 tool_calls 的 details、没有任何带推理的历史被真实发送。

**Prime 与 Qwen 同在 `alibaba`，从原件核对而不假设**：09-27 归档里 Qwen 八叶 24 份流全部是同一四键形状、每帧并行 `reasoning` 逐字同文，与 Prime 09-28 流形状相同。缓存档不同：Prime 绑定声明显式 5m、断点 `last_message`（09-28 原件把标记放在末条 user 上），Qwen 六叶为显式 5m `system`、两叶 automatic；09-27 Prime 探针曾把 5m 标记放在 system 上并取得暖读，但那不是当前绑定。同一供应商不等于同一缓存档；本页不改缓存声明。

### 上游与固定模板

[OpenRouter Reasoning Tokens 官方快照](../../../../../research/model-request-adaptation/vendor-continuation/xai/closeout-2026-09-30/openrouter-reasoning-tokens.txt)（2026-09-30 取得，SHA-256 `a80ca4bcee4915cc1d1697fd620743bfbbc97f45f5a25213fcc149bad5681bc7`）的「Preserving Reasoning」写明可用 `message.reasoning` 字符串或 `message.reasoning_details` 数组把推理传回、`reasoning_content` 是 `reasoning` 的别名。它没说同一消息兼带两者时取哪一个，没说 OpenRouter 如何把二者转成 Z.AI／Alibaba 原生字段，也没说所选路由是否清除历史推理——这些是**待核对主张**（`design/basis/` 无对应条目，须按来源核对或真实差分取证）。

固定公开模板（执行仓库 `resources/tokenizers/zai-glm5/`，GLM-5.3 `zai-org/GLM-5.3`@`aca966e4e02791568aa6a4ced368624b3d897f42` 文件 SHA-256 `3740abce…`，Flash `zai-org/GLM-5.3-Flash`@`eb9eb208eb0d988989d07a6a12d0fdeb5f52574a` `0c4099f3…`，GLM-5.2 `zai-org/GLM-5.2`@`cf457fa734ab149ffef225f80893eb38c6ff5cdc` `172dc74a…`）对 assistant 取字符串 `reasoning_content`，不 trim，渲进 `<think>…</think>`；缺席时渲 `<think></think>`。渲染条件两代不同：GLM-5.3／Flash 在 `clear_thinking` 缺省（即 false）时对**全部**历史 assistant 渲染；GLM-5.2 在 `clear_thinking` 缺省时**只**对末条 user 之后的 assistant 渲染、之前的一律 `<think></think>`，显式 `clear_thinking=false` 才全部渲染。当前 TS 投影 `zai-glm53.ts`、`zai-glm52.ts` 的渲染器对 `reasoning`／`reasoning_details` 一律拒绝；离线候选 `renderGlm53HistoryCandidatePrompt` 把纯文本 `reasoning` 放进 `reasoning_content` 槽位，其输出与独立 Jinja 预言在五份 09-28 历史上的 prompt 哈希一致（`history-template-goldens.json`，仅 GLM-5.3 模板、`clear_thinking=false`）。Prime／FlashX 未找到公开模板或 checkpoint（[来源核对](../../../../../research/model-request-adaptation/vendor-continuation/zai/2026-09-28-reasoning-and-commercial-meter.md)记为来源缺口，不是不存在的证明）；已采用算法以 GLM-5.3 公开模板作诊断投影、再减 1（路由 fit 与独立 holdout 四点零误差，只覆盖文本／工具，[研究](../../../../../research/model-request-adaptation/vendor-continuation/zai/2026-09-28-commercial-holdout-result.md)）。

**与 Moonshot／Qwen 的一处实质差别**：那两家的 meter 在各自页面之前已接受纯 `reasoning` 字符串进模板槽位，details 映射只是把新表示接到已有路径上；ZAI 五个 meter 连纯字符串都拒绝。本页因此同时引入两件事——纯 `reasoning` 字符串与可见 details 都投到模板推理槽位，隐含「所选路由把历史推理计入 prompt、不清除」这一新假设。主要未知是路由是否清除历史推理：清除则本页高估（方向保守）；不清除而另有私有包装，本页漏计包装本身。私有 tokenizer 差异（Prime／FlashX）另属 estimated。本页因此是**有来源的估算候选**：把可见文字放进固定模板既有推理槽位，不是上游等值事实。

## 最小承载与范围

落点为三个既有 ZAI factory 与其渲染器内的纯数据投影（#1），不是新服务，也不是新的消息或组 walker。固定范围只为五叶经各自精确路由（四叶 `z-ai/fp8`，Prime `alibaba`）的官方贡献及其后继唯一修订；不外推到其他 GLM 型号或家族。逐叶是否释放见[逐叶采用矩阵](#逐叶采用矩阵)：GLM-5.2、Prime、FlashX 可随本页采用；GLM-5.3、Flash 以 ZV0 为前置。

### 有限适用表

| 维度 | 适用值（同时满足才投影） | 其余 |
|---|---|---|
| 定义与实现 | 已释放叶的后继唯一 definition 与 `pi-ai:zai` 修订（数值由主线接口账本分配） | 当前 `2`/`3`/`mp4-17` 与未释放叶保持现拒绝；未知修订沿既有 factory 构造期抛错，贡献不发布 |
| 路由 | 请求体 `model` 等于定义 modelId，贡献绑定该叶精确 provider；Prime／FlashX 另沿既有商业投影核 `provider.order` 恰为绑定路由、`allow_fallbacks:false`、`require_parameters:true` | 其他：沿既有 unavailable |
| effort | 沿既有：GLM-5.3／Prime 缺省或 `low`/`high`/`max`；GLM-5.2 缺省或 `high`；Flash／FlashX 缺省 | 沿既有 unavailable |
| 消息角色 | `assistant` | 其他角色带 `reasoning_details`：unavailable |
| details 数组 | 恰一项 | 空数组、`null`、非数组、多项：unavailable |
| detail 形状 | own keys 恰为 `type,text,format,index`；`type` 为 `reasoning.text`；`text` 为字符串且不等于字面 `[REDACTED]`；`format` 为原字面 `unknown`；`index` 为 JSON 数且精确十进制值为 0 | `reasoning.summary`、`reasoning.encrypted`、任何附加键（含 `id:null`、`signature:null`）、非 `unknown` format、非 0 或字符串 index、`[REDACTED]`：unavailable |
| 与推理字符串的等同 | 同一消息的 `reasoning` 缺席，或是与该 `text` 逐字相同的字符串（不 trim） | `reasoning` 在场却非字符串或不逐字相同：unavailable；`reasoning_content` 不在既有 assistant 键集内，照旧 unavailable，本页不放宽 |
| 只带 `reasoning`、不带 details 的 assistant | 字符串原样进槽位（空串是可见的空文字） | 非字符串（含 `null`）：unavailable |
| 其余字段 | 沿当前 meter 既有允许集：content 含 `</think>` 拒绝、媒体沿既有拒绝、Prime 只许末条可缓存消息上一个 5m 标记 | 沿既有 unavailable |

`text` 直接取实际发送体。多条 assistant 各带一项合格 detail 或各带字符串时逐条投影，各计一次。

## 计量映射与 full/φ/δ 同源

full 先按原件核：原 body 的 `model` 等于定义、原 body 与原 serialized 一致；再只对仅供计量的派生副本渲染。派生副本经共享 `projectVisibleReasoningBody(body, ['reasoning'])`：对每条命中上表的 assistant 删去 `reasoning_details`，无 `reasoning` 键时补 `reasoning = text`，已在场且已证等同的保持原值。Prime／FlashX 再经既有商业投影去掉 `stream_options` 与末条缓存标记；两次投影只动各自字段，先后不影响结果。渲染时每条历史 assistant 的 `reasoning` 字符串原样进 `<think>…</think>`：GLM-5.3 渲染器（Flash 与商业两叶共用）启用它已有的纯字符串分支，GLM-5.2 渲染器新增同一槽位，两者都按模板的 `clear_thinking=false` 口径对全部历史渲染（GLM-5.2 的选择见[关键选择](#关键选择)）。原 body、serialized、units、原块与摘要均不变，实际发出的 wire 仍原样带 `reasoning_details`。候选私有函数名由实现者选择，不增加公开 DTO 或 runtime 参数。

派生副本与既有无推理路径走同一渲染、同一固定 GLM-5 tokenizer（`tokenizer.json` SHA-256 `19e773648cb4e65de8660ea6365e10acca112d42a854923df93db4a6f333a82d`）；Prime／FlashX 的减 1 沿既有算法、不另拟合。不经 details 的 JSON 长度、元数据键或密文字节猜 token；不另加 O、`reasoning_tokens` 或未经验证的修正常数；宿主可配置 margin 只在规划器最终门应用一次。两条可检查的预言：**模板预言**——纯字符串路径的渲染结果等于对应固定 Jinja 模板在 `reasoning_content = text`、`clear_thinking=false` 下的渲染（独立 Python／Jinja 黄金值，三套模板各一组，含末条 user 前后两种位置）；**等价预言**——任一命中消息的派生计数，等于把该消息的 `reasoning_details` 换成 `reasoning: text` 的同一 wire 在新 meter 上的计数。两者合起来说明本映射在本地参考层与固定模板一致；与 OpenRouter／托管路由私有转换的差异仍是 estimated，没有证据承诺误差上界。

φ/δ 按 R-A 保持 `defineInputMeter` 默认 `unsupported-marginal/1`，调用即 unavailable；本页不开增量。日后若由提供者页开放，φ/δ 必须经同一投影函数，禁止另写一条推理解释路径。full-only 下每轮整份分词是既有 full 语义，不是稳定 P 复用。服务方展示名 `Z.AI`／`Alibaba` 与 basis 路由 tag 不等，共享校准会判 `basis_changed`（Prime 先因断点移位 `prefix_changed`）；这只在将来开增量时相关。

产品路径上纯字符串一侧也有实际来源：没有 opaque 的 thinking 块按共享投影发 `reasoning` 字符串，典型是以 `length` 截断、reader 未封 opaque 的回复（GG-10 所述）。已释放叶对这类历史由拒绝改为估算；GG-10 的「截断是否算 complete」裁决不因此改变。 本页是 ZAI 第一次放行该串，前提是外来思考块（他模型的明文思考、本家族截断回复）由上下文组装处置（GG-11），本页不判来源（评审 Z-N4）。

修订：已释放叶的 `algorithmRevision` 各升新唯一值（现 GLM-5.2 `glm-5.2-public-template-1`、Prime `prime-public-glm53-declared-effort-route-fit-2`、FlashX `flashx-public-glm53-route-fit-1`；ZV0 后 GLM-5.3 `glm-5.3-public-template-1`、Flash `glm-5.3-flash-public-template-1`）；`tokenizerRevision` 显式设为各自当前派生值 `tokenizer-basis/<现算法修订>`，不随 algorithm 默认派生——tokenizer 与模板文件都没变，变的只是投影域，那由 algorithm 修订表达（与 Google r2、Anthropic、xAI、Moonshot、Qwen 一致）；`transformRevision` 保持 `openrouter-wire/2`；`evidence` 追加「可见推理（纯字符串与单项 `reasoning.text` details）按 `clear_thinking=false` 投到模板推理槽位、OpenRouter 转换与路由清除策略未知、无 holdout」同义表述，Prime 保留 R-B「无 effort holdout、无误差界」原文。`createGlm53InputMeter`、`createGlm52InputMeter` 的绑定核验改为对照当前导出定义，不再写死 `'2'`／`'mp4-17'`（商业 factory 已如此）。

## 与共享 walker／分组的接缝

| 共享件 | 本页依赖 | 不改什么 |
|---|---|---|
| `stream.ts` `continueReasoningText`（R-F＋R-L） | 真实流 1–311 个无 id 无签名的相邻片段合成恰一项；本页的「恰一项」就是这条规则的产物 | 不改合并规则。无 id 的迟到签名并进同一项而多出 `signature` 键，按上表附加键拒绝；片段带显式 `signature: null` 时合成项多出该键，整家族回放回到拒绝；一次回复若出现两段不相邻推理（推理 A→content→推理 B），真实 reader 在 `stream.ts` 约 316–343 行只开一个 thinking 块、跨 content 帧继续合并，合成**恰一项**拼接文字的四键 detail；发出的就是这一项，计量按该项文字估算一次，不多计（ZV2 实测，主线 2026-09-30 修订：原「合成多项而拒绝」的预期与共享 reader 实际行为相反，reader 是分组规则的唯一 owner，本页不改它）|
| `assistant-projection.ts` `projectAssistant` | 带同路由 opaque 的 thinking 块只发 `reasoning_details`；无 opaque 的发 `reasoning` 字符串；异路由 opaque 规划拒绝（R-K）；同一 assistant 兼有同路由 opaque 与独立非空明文块时规划拒绝（执行仓库 `zai-history-replay.spec.ts` 已固定） | 不改发送协议，不把 details 改写成字符串，不放行混合形 |
| `input-meter.ts` 共同包装 `measureFull`／`measureReplay`／`measureNew`；接线函数 `guardInputMeter`（`input-meters/shared.ts`） | 来源、basis、history 校验的唯一所在 | 不复制；见下「直接入口守门」 |
| 形状识别与投影 `visibleReasoningDetailText`／`projectVisibleReasoningBody` | 直接复用，同文键集合传 `['reasoning']`（与 Qwen 相同）；`[REDACTED]` 排除在共享函数内 | 不改共享函数。并行键政策四家：DeepSeek 任何并行键即拒，Moonshot 两键同文只计一次，Qwen 与本家族 `reasoning` 同文只计一次、`reasoning_content` 拒。沿主调度 2026-09-30 裁决 P1 同法登记为已知差异（P1 原只点名前三家）：产品路径永不同时发两键，差异只对直接调用者可见 |
| `zai-candidate.ts` 无绑定历史候选 | 其纯字符串渲染被本页的生产路径取代 | 随实施删除，不留第二条同义路径；冻结探针若仍需候选计数，改用生产 meter（ZV5） |

直接入口守门：三个 ZAI factory 现以 `Object.freeze` 返回 `defineInputMeter` 的对象，直接 `measureFull` 不经共同包装；规划器路径经 `plan.ts`／`input-limits.ts` 调共同包装。本页让带推理的历史首次可计量，不接线则直接调用 factory 方法可携非法显式 history 得到估算——[DeepSeek 评审](../../../../record/proposals/model-input-usage-calibration/deepseek-visible-reasoning-review.md) N1 的同构。三个 factory 的公开 full／φ／δ 方法经唯一的通用接线函数 `guardInputMeter` 接到共同包装，五叶一并（含尚未释放的 GLM-5.3、Flash）：共同包装只加来源与表示校验，不改任何一叶的数值。这是 S-77、S-79⑥ 与 [H13](verification.md#h13-多个历史输出组候选) 的落实，不新增契约承诺。

## 失败层、版本与装卸

形态不在表内：沿既有 unavailable，经 PlanFailure `invalidInput{reason: input_size_unavailable}` 发前拒绝，零 HTTP、零新响应或账，原消息不删不改。显式非法组：由共同包装拒绝，不能借可见文字分支绕过。上游接受后又带内或以 HTTP 拒绝：保留真实请求与用量事实，不自动删历史、降参数或重试。三层不混。

发布时每个已释放叶的 definition、`pi-ai:zai` implementation 与 algorithm 提升到新的唯一修订，未释放叶保持原修订；固定旧 lease 不热替换，已借出的旧 meter 跑完各自规划；不保留旧 factory 或兼容重载，旧到新 basis 未证兼容即 full。历史事实保留原坐标。配置错误沿同一政策：未知或滞后的 definition／implementation 修订在 factory 构造期抛错，贡献不发布半份。 分两批释放时，同一 GLM-5.3 渲染器同时承载已释放叶（放行）与未释放叶（维持拒绝），分流键是各叶的 definition／implementation 修订，不是布尔开关或参数切换（评审 Z-N5）。

Cordis 继续由原官方模型贡献插件与 transport service 固定整份 meter，采用版本沿 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)；不新增 service、fiber、inject、effect 或事件，不新增上游内核主张。装载时 meter 取得既有 tokenizer（摘要不符即构造期抛错）与模板常量；一次调用的派生副本随规划结束释放；插件卸载、lease 引用与实停责任不变。meter 是纯函数，没有在途调用可取消；跨进程无新状态可继承；已发请求与上游费用不因纯函数结束而改变。新增 Storage 要求 0、装配节点 0、bindings 0；无跨 owner 提交。

## 对账

| 对账 | 结果及承担 |
|---|---|
| A 性质承载 | 原 wire 保真与费用沿现共同层；来源校验复用共同包装，并在三个 factory 的直接公开入口补齐接线。家族只提供可见文字参考估算，本地一致性由模板预言与等价预言核实；上游误差不承诺为零 |
| B 内核负面清单 | 无新增持久、跨 fiber 事务、可靠投递、权限或时序保证；精确实际 usage 仍以上游事实为准，内核不替估算背书 |
| C 原边界复查 | 不新增来源真值、O 转换、公开操作或消费方身份，不扩大 Session/Run 责任；R-A 的 full-only、Prime 的 R-B effort 扩展与其「未知 opaque／加密历史即 unavailable」守门不变——可见四键 `reasoning.text` 不属「未知 opaque」，与 P4 对 Qwen 的读法相同。纯字符串映射对本家族是新假设，落在 S-74③「有来源估算」之内；若实现发现须改变语言无关性质，停该分支回 spec |
| D 代价 | 五叶分两批修订、GLM-5.3 渲染器启用纯字符串分支与 GLM-5.2 渲染器加槽位、三个 factory 接线，外加两叶 ZV0 与已释放叶 ZV4 付费观测。继续全拒绝会让已产出推理的四叶真实多轮停在第二轮；JSON 替身会与三叶已固定的公开模板冲突；在家族 meter 里再读输出组会造第二个 walker。置信度只到 estimated |

## 关键选择

| 选择 | 本方 | 落选方及其最强论据 | 本方弱点 | 置信度 |
|---|---|---|---|---|
| 怎样计入推理 | 纯字符串与单项可见 details 都投到固定模板推理槽位 | 维持全拒：[研究页](../../../../../research/model-request-adaptation/vendor-continuation/zai/2026-09-28-reasoning-and-commercial-meter.md)明写接受历史推理前需要来源级映射或更强的受控反例；JSON 替身（Qwen 商业六叶先例）：不依赖模板槽位假设；原 O：有真实上游来源 | 本家族没有已接受的纯字符串路径可依托，「路由计入且不清除」是新假设 | 中 |
| 采用门 | 形状已在当前发送域观察到的叶：机制接线先行、ZV4 真实回放作门（R-P 同法）；其余叶 ZV0 前置。理由：两类未知分开看——「路由是否清除历史推理」未知只会高估；「details 与 `reasoning` 串是否同一槽位」方向未知，与 Moonshot／Qwen 在 R-P 下承担的风险同类（两家 P2 已证同槽位），由 ZV4 必做对照闭合（评审 Z-N1）。把对照前移不改本页设计，由主线在采用时定 | 把 ZV4 的同路由对照挪到采用之前：每叶三请求、Prime／FlashX 已有冻结的 control／plain／details 探针包，成本低，且正对研究页的前置要求 | 若对照证伪「同一槽位」，已发布修订要由后继撤回；比 Moonshot／Qwen 多承担一个新假设 | 中 |
| GLM-5.2 模板口径 | 按模板显式 `clear_thinking=false` 对全部历史渲染 | 按 GLM-5.2 模板缺省只渲染末条 user 之后的推理：忠于该模板默认，路由若照默认清除则不高估 | 路由若照默认清除，高估随跨轮推理累积；三轮工具循环内两口径相同，只有跨轮历史能区分 | 中 |
| 并行键政策 | `reasoning` 逐字相同则只计一次；`reasoning_content` 沿既有键集拒绝（Qwen 同形） | DeepSeek 一律拒：最简单，产品路径本就不同时发两键；Moonshot 两键都收：官方快照说二者同义 | 与 DeepSeek、Moonshot 不同，按 P1 登记为已知差异 | 中高 |
| Prime／FlashX 托管历史 | 沿既有 GLM-5.3 公开模板诊断投影与减 1，推理进同一槽位 | 在托管模板可得前维持拒绝：两款未找到公开模板或 checkpoint，减 1 只在无历史的文本／工具上拟合 | 以公开模板代理托管模板；减 1 迁移到带历史输入未经检验 | 中 |
| 混合 opaque／明文 | 保持共享投影的规划拒绝，本页不处理 | 放行：发两字段、并入 details 或降为明文，避免多轮停在第二轮 | 真出现时多轮不可续；ZAI 原件从未出现（每份恰一段连续推理） | 中高 |
| 形状确认前置 | GLM-5.3、Flash 各先取一条当前绑定真实形状 | 以同路由 `z-ai/fp8` 兄弟叶（5.2、FlashX、Flash `low`）的一致形状为代表直接释放 | 推迟两叶；GLM-5.3 可能再次不产出推理 | 中高 |
| 直接入口守门 | 三个 factory 五叶一并接共同包装 | 只接已释放叶：改动面小 | 未释放两叶的直接入口也随之收紧 | 高 |

## 反例义务

每条都要构造成测试，期望均已定：

1. 两条 assistant 各带一项合格 detail：各计一次；同一条再加逐字相同的 `reasoning`：计数不变。
2. 并行 `reasoning` 与 text 差一字符（含只差首尾空白）、`reasoning:""` 对非空 text、`reasoning:null`、非字符串 `reasoning`、并行 `reasoning_content`（即使同文）：unavailable。
3. `id:null`、`signature:null`、附加未知键、`index:1`、`index:"0"`、`format:"anthropic-claude-v1"`、`reasoning.summary`、`reasoning.encrypted`、两项、空数组、`null`、`text:"[REDACTED]"`：unavailable。
4. user、tool、system 消息带 details：unavailable；只带 `reasoning:null` 的 assistant：unavailable；effort 越出各叶既有允许集：仍 unavailable。
5. 带 `id` 的 `reasoning.text` 片段、无 id 而末片迟到 `signature` 的片段流、带显式 `signature: null` 的片段流，回放时多出键：unavailable；无 id 无签名片段（含被 content 帧隔开的两段推理，reader 合并为一项拼接文字）合成一项：可计，按该项文字估算一次。
6. 模板预言：以两批原件文字构造历史，纯字符串路径的渲染等于三套固定 Jinja 模板在 `reasoning_content = text`、`clear_thinking=false` 下的输出；推理 assistant 分别位于末条 user 之前与之后；GLM-5.2 另记录模板缺省口径的黄金值供 ZV4 对照，不进 meter。
7. 等价预言：同上历史的 details 版与 `reasoning` 字符串版 full 计数逐值相等；覆盖各叶当前 effort 发送域、有／无 tools，Prime 含末条 5m 标记。Prime／FlashX 的估算等于公开模板计数减 1，不多出第二个常数。
8. 原件不可变：计量前后原 body/serialized 逐字节不变；实际 HTTP 体等于计划 serialized 且仍含 `reasoning_details`；Prime 的缓存标记只在派生副本里去掉。
9. 直接入口：对三个 factory 为五叶返回的 full 方法直接传入非法显式 history（重复目标、部分组、来源矛盾）被共同包装拒绝；body-only 合法 full 得 estimated 且数值与接线前相同（未释放两叶按无推理输入比较）；包装不递归。
10. 带合格推理的历史，replay／new 仍 unavailable，measurement 为 full。
11. 只发 details 的流：`delta` 只有 `reasoning_details`、没有 `reasoning`，thinking 块文字为空而 detail 非空：按本页 wire 规则回放可计（estimated）。这沿 R-N 对 Moonshot／Qwen 的同形裁决（同文只在 wire 层强制、不另开共享层），R-N 是否及于本家族由主线在采用时确认。
12. 混合 opaque A＋明文 B、异路由 opaque（FlashX 历史发往 Prime）：规划拒绝、零 HTTP，meter 不被调用（既有用例保持）。
13. 未释放叶（ZV0 前的 GLM-5.3、Flash）：details 与纯字符串历史仍 unavailable，数值不变。

## 逐叶采用矩阵

| 叶 | 路由 | 当前绑定 | 算法修订 | 缓存档 | 当前 effort 发送域 | 真实形状 | 当前发送域覆盖 | 未观察 | 本页建议 |
|---|---|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.2` | `z-ai/fp8` | `2` / `pi-ai:zai@mp4-17` | `glm-5.2-public-template-1` → 新唯一值 | automatic | 缺省、`high` | 09-27 流 ×5（缺省），603 帧 | 缺省已覆盖，`high` 未观察 | `high`、tools、回放被上游接受与 usage、路由清除口径 | 机制接线先行、ZV4 真实回放作门；ZV4 对照须判清除口径 |
| `z-ai/glm-5.3-prime` | `alibaba` | `3` / `pi-ai:zai@mp4-17` | `prime-public-glm53-declared-effort-route-fit-2` → 新唯一值 | 显式 5m，`last_message` | 缺省、`low`/`high`/`max` | 09-28 流 ×3（缺省，带 tools 历史），62 帧；09-27 `low` ×3 未产出推理 | 缺省已覆盖；`low` 未见推理；`high`/`max` 未观察 | 同上，另托管模板 | 机制接线先行、ZV4 作门 |
| `z-ai/glm-5.3-flashx` | `z-ai/fp8` | `2` / `pi-ai:zai@mp4-17` | `flashx-public-glm53-route-fit-1` → 新唯一值 | automatic | 缺省 | 09-28 流 ×2（缺省，带 tools 历史），64 帧；09-27 `low` ×5（域外），9 帧 | 唯一发送形已覆盖 | tools 回复、回放被上游接受与 usage、托管模板 | 机制接线先行、ZV4 作门 |
| `z-ai/glm-5.3` | `z-ai/fp8` | `2` / `pi-ai:zai@mp4-17` | `glm-5.3-public-template-1` → 新唯一值 | automatic | 缺省、`low`/`high`/`max` | 无：09-27 `low` ×5、09-28 `high` ×1 均未产出推理 | 无 | 任何带推理回复的形状 | ZV0 取得带推理的当前绑定回复且形状相同后释放；ZV0 仍无推理则维持现拒绝 |
| `z-ai/glm-5.3-flash` | `z-ai/fp8` | `2` / `pi-ai:zai@mp4-17` | `glm-5.3-flash-public-template-1` → 新唯一值 | automatic | 缺省（effort 丢弃） | 09-27 `low` ×3 带推理（域外），22 帧 | 缺省未观察 | 当前域形状、tools、回放 | ZV0 后释放 |

## 实施与验收义务

ZV0（GLM-5.3、Flash 的释放前置）：root 沿唯一预算账本，每叶一次当前绑定的单轮真实流（GLM-5.3 取缺省或 `max`，Flash 取缺省），用能激发可见推理的多步题面、输出上限足以 `stop`，最好带 tools。只读核对 details 形状与有限表逐项相同（含没有显式 `signature: null`）、每帧并行 `reasoning` 同文、推理恰一段连续。相同即交主线释放该叶；不同则按实际形状修订本页，不据旧观察放行；仍无推理则该叶维持现拒绝并记录。取得带推理的种子后，可在同批对该种子做 ZV4 的三变体对照。

ZV1：已释放叶经真实公开 plan/invoke 与 Cordis transport service，用原件形状的受控 SSE（每帧 `reasoning` 与等同单项 details）各做有/无 tools、当前 effort 发送域三轮：第 2、3 轮 full estimated，每轮 HTTP 恰一次且等于计划，实际 wire 保留 details，资源实停；Prime 带显式 5m `last_message` 标记。执行仓库 `zai-three-round-invoke.spec.ts` 中已释放叶「原样回放推理历史」由 `input_size_unavailable` 改为估算，未释放叶保持拒绝；`zai-reasoning-history.spec.ts`、`zai-history-replay.spec.ts` 的同路由回放期望随之改变，混合形与异路由拒绝保留；`zai-glm52-meter`、`zai-glm53-meter`、`zai-commercial-meter`、`official-reader-bindings` 跟随新发布；演示装配 `zai-prime-effort-service.spec.ts` 按导出定义取修订。

ZV2：反例 1–8、10–13；模板预言把现有 GLM-5.3 黄金值扩到 Flash 与 GLM-5.2 模板，夹具由两批原件的有序片段经真实 reader 合成，不手写合并后的条目；逐负控与正例同文件。

ZV3：反例 9；必须直接调用三个 factory 为五叶返回的方法，不以规划器或独立包装函数的测试充作直接入口证据。

ZV4：真实路线由 root 沿唯一预算账本执行：每个已释放叶有、无 tools 各至少一组当前绑定三轮真实流，第 2 轮起回放 details；记录上游是否接受、`prompt_tokens` 与本地估算残差、cache 与 cost，并逐帧核对 details 形状（含是否出现显式 `signature: null`）。**必做**同路由对照（P2 同法）：同一第 2 轮历史（推理 assistant 位于末条 user 之前）分别以 (A) details、(B) `reasoning` 字符串、(C) 不带推理发送，其余字节相同；Prime／FlashX 可复用研究冻结的 control／plain／details 探针包，按当前绑定重定输出上限并重算请求哈希。另记 B−C 与本地两口径（保留／清除）预测差。判读：A＝B＞C，「同一槽位且不清除」成立，闭合该叶 ZG1；A＝B＝C，路由清除历史推理，本页在该叶高估，记录残差，由后继修订改用清除口径（GLM-5.2 即模板缺省口径），不引入修正常数；A≠B，details 与字符串不是同一槽位，该叶的 details 映射被证伪，认证前由后继撤回。Prime 的 service 路径须以显式 5m `last_message` 配置档执行。残差只作记录，受控 usage 不当精度。 判读补充（评审 Z-N2）：A/B/C 只测「推理 assistant 在末条 user 之前」这一几何，A＝B＝C 分不开「按模板缺省只清末条 user 之前」与「清全部历史」；ZV4 三轮真实流的逐轮残差覆盖另一几何（assistant 在末条 user 之后），补救口径由两组读数共同决定。

ZV5：已释放叶 definition／implementation／algorithm 唯一修订与显式 tokenizerRevision、`evidence` 字串、包 README／README_ZH 双语段与制品消费；删除 `zai-candidate.ts` 并迁移其消费者；未知与失败原件保留。无新代数或并发性质，不扩 TLA 范围，以既有共享形式边界和上述正反例承接。候选须经独立 architecture-reviewer 与主线技术采用后才释放实现。

## 缺口与受阻消费者

- ZG1 上游转换与路由清除口径：OpenRouter 如何把 `reasoning` 字符串与 `reasoning.text` details 转成 Z.AI／Alibaba 原生字段、所选路由是否清除历史推理——待核对主张；本页只到 [S-74](../../../../spec/capabilities/model-request-runtime/v12/contract.md#s-74-每次发送之前的完整输入限制与固定计划)③ 允许的有据 estimated，不承诺误差界。由 ZV4 的必做同路由对照闭合。
- ZG2 当前绑定形状：已由 ZV0（2026-09-30 17:15Z）闭合——GLM-5.3（max）139 帧、Flash 78 帧均为四键 `reasoning.text`，与三叶同形；原「GLM-5.3 从未产出推理，Flash 只在 `low` 观察到」为起草时状态。受阻：两叶释放。
- ZG3 真实回放：带推理的历史从未真实发送，上游接受、usage、cache 均未知。归主调度付费认证（ZV4）。受阻消费者：五叶 D7 逐模型真实多轮认证（现第 2 轮本地拒绝）。
- ZG4 GLM-5.2 模板口径：本页取 `clear_thinking=false`，与该模板缺省相反；由 ZV4 对照裁定，证伪则后继改口径。
- ZG5 托管两叶：Prime／FlashX 未找到公开模板，减 1 只在无历史的文本／工具上 fit 与 holdout；带历史输入的误差未知。归 ZV4 残差记录。
- ZG6 观察覆盖：GLM-5.2 `high`、Prime `high`/`max`、回复带 tool_calls 时的 details 形状未观察，列为 ZV4 的前提假设。
- ZG7 证据归档：本页 09-27 形状表是起草者对归档原件的复算，长期家应在 research；09-28 原件在 HUB 私有目录，工作区只有研究页的哈希与执行仓库夹具里的原样 SSE。归主线。
- ZG8 裁决与缺口入档：R-O 已裁未入档；GG-12 只在 [verification 逐叶表](verification.md#2026-09-30-真实认证逐叶证据r6r7-认证工具唯一预算账本)提及，未进 D-111 的共享缺口清单。随采用决定入档。
- ZG9 认证工具缓存档：Prime 路由要求显式 5m `last_message`；若认证工具 service 配置档仍固定 automatic，Prime 的 service 路径会与 Qwen 开源两叶同样在 prepare 被拒（**已被观测**：冻结 SHA 重跑中 Qwen 开源两叶 service 已因同一原因在 prepare 被拒，见 verification.md；owner：root 认证工具 R8，作为 ZV4 service 路径的前置；未试）。归 root 工具 owner。

## 实施附注（2026-09-30，主线）

ZV0 通过后第二批两叶释放（执行仓库 `fc5b5384`，`officialCatalogRevision` 2）：GLM-5.3 与 Flash 由 2／`pi-ai:zai@mp4-17` 升为 definition 3／`pi-ai:zai@mp4-18`，algorithm `glm-5.3-public-template-2`／`glm-5.3-flash-public-template-2`，tokenizer 显式钉在未变的 `tokenizer-basis/glm-5.3-public-template-1`／`tokenizer-basis/glm-5.3-flash-public-template-1`；逐叶采用矩阵与 ZG2 记录的是起草时状态，ZV0 读数与本机验证见 [verification.md](verification.md#zai-五叶可见推理历史候选义务)。
