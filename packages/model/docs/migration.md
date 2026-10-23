# Model 封存件的迁移去向

本页由 Model 组维护，记录 [#448](https://github.com/nemori-ai/omne-harness-lite/issues/448) 的逐文件去向和能力交接。源码与资源固定在提交 [`901d7ff56cf0a3c8a9e84df140f3ebd57ba5607c`](https://github.com/nemori-ai/omne-harness-lite/tree/901d7ff56cf0a3c8a9e84df140f3ebd57ba5607c/packages.0.0.1.legacy/model)。能力报告另固定在 `02c0fc82dfc254fe598922daabf319b18e39b600`，见[基线报告 5/8][baseline]。两者是不同的取证基线。

目标责任以[组架构](architecture.md)和 [Model 契约](../model-contract/SPEC.md)为准。[#447 技术决定][decision]已接受成员划分、家族取得协议、Tokenizer 分工和迁移接受条件，并允许三项延期。厂商适配细化、官方支持矩阵和资源控制的候选状态仍以组架构为准。本清单分配后续工作，不表示文件已经迁入、能力已经实现或真实 route 已认证。

[#446 实现线][line]实现 OpenAI 与 Anthropic 两个家族，新增实现成员为 `pi-ai-transport`、`pi-ai-openai`、`pi-ai-anthropic` 与 `tokenizer-tiktoken`。Anthropic 是验证共享传输接口的第二个差异显著家族。其余六家族与 `tokenizer-huggingface` 留后续线。表中阶段 0～2 链接已建子卡，阶段 3～7 只定位父卡中的阶段，尚无子卡号。具名家族后续线指父卡后备范围，不表示本线建包。

## 源码清单

三包 `src` 下共有 98 个 `.ts` 文件，每个文件只列一行。表内短路径与表前的仓库路径拼接，得到唯一源路径。清单判据来自 [#448 补充决定][classification]。

| 标记 | 含义 |
| --- | --- |
| 迁 | 保留供应商协议、型号、计量依据等事实。旧类型、默认策略和领域边界不随事实迁入。 |
| 改 | 复用机制，按现行契约重写形状、顺序和资源责任。 |
| 弃 | 弃旧实现。理由列同时记录仍须保留的事实或反例，以及新能力的责任去向。 |

凡编码旧领域边界的实现均弃。执行池、Session 日志、loop-extension-runner、调用方私有历史大响应、静默丢参、未知 usage 默认值和任意 opaque 回放都不能原样保留。弃旧限额或流实现不等于放弃现行契约中的限制或流能力。

所有目标成员短名均属于 `packages/model/`，`common/*` 与 `execution/image` 除外。后续实现不得导入封存源码。pi 衍生传输还须保留原包 `LICENSE.pi`、`provenance.json` 及源码映射；这两项不属于下面的 98 个源码或 38 个 tokenizer 资源。

### pi-ai-transport/src

本表路径相对 `packages.0.0.1.legacy/model/pi-ai-transport/src/`，共 31 个文件。

| 源文件 | 目标成员或责任拥有者 | 标记 | 去向阶段或后续线 | 理由与保留边界 |
| --- | --- | --- | --- | --- |
| `accounts.ts` | pi-ai-openai；pi-ai-anthropic；model 与 call-account 消费结果 | 迁 | [2.5 #465][s25]；[6.3][line] | 保留 OpenRouter usage 字段、缓存分量扣除和非负精确费用事实；未知继续未知，按现行 CallAccount 产出，不迁旧 Usage/Cost 形状。Anthropic 的缓存读写扣除与余量为负时的诊断迁入 pi-ai-anthropic 的用量规则 `anthropic-usage/1`。 |
| `anthropic-cache.ts` | pi-ai-anthropic；pi-ai-transport 网关引擎 | 迁 | [2.5 #465][s25]；[2.3 #463][s23] | 缓存规则成为 pi-ai-anthropic 的记录数据 `wire.cache`（`last-message`，`ttl` 为 `1h`）。网关引擎放置标记：最后一条消息的最后一个非空文本部件；最后一条是只有图片的 user 消息时，放在最后一张图片上；没有位置时返回 `unsupported`，`field` 为 `no-cache-target`。不迁成通用缓存策略，不迁标记删除。混图空文本的处理见 L02。 |
| `assistant-projection.ts` | pi-ai-openai 与共享消息拥有者 | 弃 | [2.5 #465][s25]；[L01 后续线][line] | 弃旧 ContentBlock 到私有 reasoning_details 的直接回放与旧工具块形状；可提取 tool-call ID 编码及同路由历史约束，按合法共享消息重建投影。 |
| `calibration.ts` | model 的准备租约；model-contract 的校准契约 | 改 | [#466 revision 3][s26] 按 PanQiWei 2026-10-23 的决定采用 | 采用上游观测校准的机制，形状按现行契约重写：锚点与来源的数字取自 Model 自己的发出记录（`DispatchRecord` 的 `messages`、回执与账目），由准备租约按访问依据经 `dispatches` 读取，不由调用方携带原响应、observation 或 replaySelection；原依据相容与未知范围的反例成为契约的不命中与扣留原因。原来标为“弃”，依据 [#466 revision 3][s26]。 |
| `configuration.ts` | pi-ai-openai；model 档案与请求准备 | 弃 | [2.5 #465][s25]；[3.1～3.3][line]；[4.2][line] | 弃旧 ModelDefinition 配置 Schema 和旧 profile builder；参数支持事实归家族，新档案求值与请求准备沿现行契约实现。 |
| `connections.ts` | pi-ai-transport | 改 | [2.1 #461][s21]；[2.2 #462][s22] | 保留活动连接准入、取消等待与幂等归还机制；预约移到 materialize，交付后持有至 start 或 close，不能在 start 再入旧 waiting 队列。 |
| `cordis.ts` | model-host-local 装配；pi-ai-transport | 弃 | [3.5][line]；[7.1][line] | 弃旧 ModelTransportService 和 modelContribution 注册；按唯一 model-cordis-contract 服务定义及新家族取得协议装配，不复制旧服务键。 |
| `credential-policy.ts` | Model 凭据与诊断拥有者 | 弃 | [1.4 #455][s14]；[6.4][line] | 弃旧 runtime 凭据脱敏配置和 BoundCredentialRedaction 通道；发送用既定 CredentialPort，诊断按当前契约保留秘密隔离。 |
| `definitions.ts` | pi-ai-openai；model-contract | 弃 | [2.5 #465][s25]；[4.2][line] | 弃旧 ModelDefinition、drop/adjust 和统一配置模型；具体参数域与受保护字段事实提取到家族，现行 unsupported/invalid 不静默删参。 |
| `diagnostics.ts` | pi-ai-transport；model 诊断 | 改 | [2.1 #461][s21]；[6.4][line] | 保留有界 sink 失败统计和安全诊断转交；替换旧 runtime 事件类型及关联身份，不让 sink 故障改业务结果。 |
| `history-projection.ts` | 共享消息、Request Context 与 Model 计量拥有者 | 弃 | [后续历史计量线][line] | 弃私有 PlanOutputHistoryGroup、原响应 observation 与 selection span 验证；完整历史、来源与合法回放交共享表示，家族事实仅作后续输入。 |
| `http.ts` | pi-ai-transport | 改 | [2.1 #461][s21]；[2.2 #462][s22] | 保留 HTTPS 固定字节、真实取消、网络停止与安全错误读取；移除 send 内容量等待，start 同步发一次，禁隐式重试和重定向。 |
| `image-source.ts` | model 媒体边界；pi-ai-openai | 弃 | [2.5 #465][s25]；[4.4][line] | 弃旧 PlanExecutionContext.imageBytes 与消息内 inline 替换；使用有权 ContentReference 和物化媒体，家族 encode 只借用已固定字节。 |
| `index.ts` | 各新成员公开入口 | 弃 | [2.1～2.5 #461～#465][s21]；[7.1][line] | 弃同时导出全部家族、旧 planner、引擎和图像工厂的总入口；各实际成员按自身公开边界与安装闭包交付。 |
| `input-limits.ts` | model 计量；请求组装方；pi-ai-openai | 弃 | [4.2][line]；[4.3][line] | 弃旧 profile/inline-body 限额及发送前 token 准入门；保留 token、请求字节、单图字节和图数的精确边界反例，由请求前计量与当前约束覆盖兑现。 |
| `input-meter.ts` | Model 计量；pi-ai-openai；tokenizer-tiktoken | 弃 | [2.4 #464][s24]；[2.5 #465][s25]；[4.3][line] | 弃绑定旧 full/new/replay、outputHistory 的 InputMeter 包装与旧品牌；保留精确余量算术、采用失配及未知计量反例，新引擎仅实现 ModelTextTokenizer。 |
| `input.ts` | model 请求准备；请求组装方 | 弃 | [4.2][line] | 弃 ToolDefinition、旧 profile snapshot、calibration/outputHistory 的 PlanInput 接收及补造缺限额值；只接现行固定请求与工具声明，缺必要值明确失败。 |
| `json.ts` | common/json-text；pi-ai-transport 边界 | 弃 | [2.1 #461][s21]；[2.3 #463][s23] | 弃对旧 content-blocks JSON 类型和复制器的本地包装；复用现行 json-text 无损值、解析与复制，不建立第二个 JSON 拥有者。 |
| `meter-transform.ts` | Model 计量及派生表示拥有者 | 弃 | [4.1～4.3][line]；[后续校准线][line] | 弃旧 image-input revision 字符串与原响应计量版本关系；保留未知版本不猜测、转换采用须固定的事实，新组合按现行计量契约表达。 |
| `official-catalog.ts` | pi-ai-openai 发布官方档案；发行装配 | 弃 | [2.5 #465][s25]；[3.3][line]；[7.1][line] | 弃全家族表与 meter 工厂的静态总聚合及读表时初始化；每家发布自己的档案，发行显式组合，读取定义不取得引擎资源。 |
| `official.ts` | 各家族官方档案；发行装配 | 弃 | [2.5 #465][s25]；[7.1][line]；[其他家族后续线][line] | 弃导入八家生成全局 ID 表的实现；精确型号事实留各家，单家消费者不因此安装其他家族。 |
| `plan.ts` | pi-ai-transport 规划骨架；pi-ai-openai 规则 | 弃 | [2.3 #463][s23]；[2.5 #465][s25]；[4.2～4.4][line] | 弃旧 plan/send 所有权、工具实现依赖、静默丢参和规划内计量/压图；固定编码与角色映射事实按三阶段及家族 encode 重建，发送路径不计量。 |
| `prepare-plan.ts` | model 媒体与转换；execution/image | 弃 | [4.1][line]；[4.4][line] | 弃 planner 内有限压图、URL 重写与旧 ImagePreparer；固定派生表示归转换，媒体读取归合法租约，复用 execution/image。 |
| `projection.ts` | pi-ai-openai；其他家族后续线；请求组装方 | 弃 | [2.3 #463][s23]；[2.5 #465][s25]；[后续历史计量线][line] | 弃旧 InputProjection、输出回放摘要及内置跨家族分派；可提取固定 JSON 编码与家族模板事实，调用方历史不进传输私有对象。 |
| `read-facts.ts` | pi-ai-openai usage 解码；model 事实保存 | 弃 | [2.5 #465][s25]；[1.5 #456][s15]；[6.3][line] | 弃旧 ReadFacts 与 ObservedInput 校准累加器；提取原上游身份、缓存命中和 usage 不一致事实，用 TransportFact 与原 dispatch 记账。 |
| `registry.ts` | pi-ai-transport 家族绑定取得；model-host-local 装配 | 弃 | [2.2 #462][s22]；[4.2][line]；[7.3][line] | 弃旧 adaptation/definition/meter 注册表和 RawResponse 所有权协议；精确版取得、退休排空及晚释放反例保留，新资源租约按 acquire/release 实现。 |
| `scope-cleanup.ts` | model 准备资源；execution/image 生命周期 | 弃 | [4.4][line]；[7.3][line] | 弃 ImagePreparer.clearScope 的私有同步复用域协议；保留取消不等于原生结束、清理失败不等于已释放的反例，依新资源租约收尾。 |
| `sse.ts` | pi-ai-transport | 改 | [2.1 #461][s21] | 保留 pi 来源标记、UTF-8 跨块、CR/LF 与有界帧算法；对接新公共 framing，EOF、end-marker 和家族合法终局分别处理。 |
| `stream.ts` | pi-ai-transport framing；pi-ai-openai decoder | 改 | [2.3 #463][s23]；[2.5 #465][s25] | 拆开 SSE 读取和家族语义，保留拒绝、工具差量、公开推理及 usage 尾帧事实；输出 TransportFact，坏终局不造 completed，不携旧 PlannedRequest。 |
| `transport.ts` | pi-ai-transport | 改 | [2.1 #461][s21]、[2.2 #462][s22]、[2.3 #463][s23] | 保留连接、取消和真实网络收尾机制；替换旧 plan/send/read/projectOutput 为 prepare → materialize → start，家族与引擎由绑定取得，不内置全家。 |
| `usage-scope.ts` | pi-ai-openai | 弃 | [2.5 #465][s25] | 弃未命中型号就默认 inherited_context_total 的实现；只提取已知 OpenAI scope 记录及 reader 修订依据，未知 scope 始终未知。 |

### pi-ai-transport/src/input-meters

本表路径相对 `packages.0.0.1.legacy/model/pi-ai-transport/src/input-meters/`，共 28 个文件。

| 源文件 | 目标成员或责任拥有者 | 标记 | 去向阶段或后续线 | 理由与保留边界 |
| --- | --- | --- | --- | --- |
| `anthropic-replay.ts` | pi-ai-anthropic | 迁 | [2.5 #465][s25] | 整组规则成为推理规则 `anthropic-signed-group/1`，判据见 [pi-ai-anthropic SPEC“规则”](../pi-ai-anthropic/SPEC.md#规则)。签名前缀型号的降级不迁，见表后说明。冻结的原计量版本不迁。旧 OutputHistoryPolicy 外形和调用方原响应依赖不迁，仍受 L01 约束。 |
| `anthropic.ts` | pi-ai-anthropic；tokenizer-tiktoken 引擎 | 迁 | [2.4 #464][s24]；[2.5 #465][s25] | `claude.json` 估算（消息与工具的 NFKC JSON，图片以 `[image]` 占位）、28 像素块图片公式与四种图片媒体类型迁入 pi-ai-anthropic 的 `meter.ts` 与 `images.ts`，精度保持估算。文件读取与 SHA-256 核对在 `tokenizer.ts`，计数经 tokenizer-tiktoken。普通文本不激活特殊 token，不迁 encode(..., 'all')、data URL 解码、image-size 与 MIME 检查。带签名组的请求计量见“本线的请求计量”。 |
| `deepseek-boundary.ts` | pi-ai-deepseek | 迁 | [后续 DeepSeek 家族线][line] | 保留参考 prompt 终止帧、边界补偿及补充字段事实；新 meter 使用固定依据，不迁旧 replay 输入协议。 |
| `deepseek-prompt.ts` | pi-ai-deepseek | 迁 | [后续 DeepSeek 家族线][line] | 保留 message tool_calls 与工具 Schema 的 DeepSeek 参考模板提取规则；用现行声明及无损 JSON 表示重建。 |
| `deepseek-v4-pro.ts` | pi-ai-deepseek；tokenizer-huggingface 引擎 | 迁 | [后续 DeepSeek 家族线][line] | 保留 V4 Pro 模板、控制 token 和资源摘要；移出引擎加载，旧 toolArguments 的普通 JSON.parse 数值损失不能迁，适用精度保持估算。 |
| `deepseek-v41-flash.ts` | pi-ai-deepseek；tokenizer-huggingface 引擎 | 迁 | [后续 DeepSeek 家族线][line] | 保留 V4.1 工具排序、文本/图像模板和 1024 vision token 参考限制；移出引擎及图像读字节，参数解析保持无损，不认作私有 route 的精确计量。 |
| `google-candidate.ts` | Google 计量研究拥有者 | 迁 | [后续 Google 可选校准线][line] | 保存结构特征、固定样本偏移拟合与候选适用前提；不是正式 Gemini tokenizer 或已接受校准策略，本线不建立该包或运行拟合。 |
| `google-history-policy.ts` | pi-ai-google | 迁 | [后续 Google 家族线][line] | 保留明确 release、provider、可见/加密 reasoning 与估算适用范围；不迁旧原响应组协议，不把 Gemma comparator 当 Gemini 精确依据。 |
| `google.ts` | pi-ai-google；tokenizer-huggingface 引擎 | 迁 | [后续 Google 家族线][line] | 保留 Gemma4 comparator 摘要、受支持 text/tool 子集及估算事实；引擎加载移出，媒体或私有模板未知继续不可用。 |
| `marginal.ts` | pi-ai-transport 的校准算术 `calibratedAmount` | 改 | [#466 revision 3][s26] 按 PanQiWei 2026-10-23 的决定采用 | 采用完整包络差的机制：新增单元按 `count(包络+新增) − count(包络+[])` 计数，包络去掉工具，加在被延续调用的真实输入合计上；余量只按估算部分，结果不升 exact。旧 full/new/replay 边际包装与 `measureReplay`/`measureNew` 调用顺序不迁，调用方调用顺序不变。原来标为“弃”，依据 [#466 revision 3][s26]。 |
| `moonshot-tokenizer.ts` | pi-ai-moonshot 资源；tokenizer-tiktoken 引擎 | 迁 | [后续 Moonshot 家族线][line] | 保留共享词表、K3/K2.7 各自配置、预切分正则及显式控制段事实；文件加载、Tiktoken 构造和缓存归引擎，不能只按同词表合并采用。 |
| `moonshot.ts` | pi-ai-moonshot | 迁 | [后续 Moonshot 家族线][line] | 保留 K3 XTML、K2.7 Jinja 工具/多轮模板、图片缩放公式及估算范围；移除旧 inline 图像读取和 InputMeter 外形。 |
| `openai-family-policy.ts` | pi-ai-openai | 迁 | [2.5 #465][s25] | 保留精确型号、effort、图像规则与 Pro scope_unknown 事实；按不关闭推理的项目约定，推理强度 `none` 为 `unsupported`；旧 revision/replay 回放表只作研究，GPT6 o200k 代理不升级为 tokenizer identity。 |
| `openai-images.ts` | pi-ai-openai；execution/image 读头 | 迁 | [2.5 #465][s25]；[4.3][line]；[4.4][line] | 保留三类补丁规则、detail/尺寸拟合及单帧 GIF 限制；弃旧 data URL 解码和 image-size 依赖，尺寸来自合法元数据或 execution/image 有界读头。 |
| `openai.ts` | pi-ai-openai；tokenizer-tiktoken 引擎 | 迁 | [2.4 #464][s24]；[2.5 #465][s25]；[4.3][line] | 保留固定编码、可见 JSON/媒体估算和支持域；编码器初始化归独立引擎，完整输出组/原响应边际回放不迁，完整计量不能因本地分词精确升 exact。 |
| `output-history.ts` | pi-ai-transport 的校准算术；pi-ai-openai 与 pi-ai-anthropic 的计量器 | 改 | [#466 revision 3][s26] 按 PanQiWei 2026-10-23 的决定采用 | 采用完整输出组方法：带推理状态的单元整体不分词，改记来源调用上报的输出 token 数 O 一次，记为估算；O 未知、`reasoning` 大于 `output`、来源的供应商或表示采用不同时具名不可用。方法名沿用 `openai-complete-output-group-workload-estimated/1` 与 `anthropic-complete-signed-encrypted-output-zero-framing-estimated/1`。私有 observation、replaySelection 与调用方原响应不迁：数字来自发出记录。密文不可当普通文本的反例保留。原来标为“弃”，依据 [#466 revision 3][s26]。 |
| `output-input.ts` | model-contract 的 `PreparationLineage`；model 的准备租约 | 改 | [#466 revision 3][s26] 按 PanQiWei 2026-10-23 的决定采用 | 采用“调用方说明历史来自哪些调用”的输入，形状改为取得租约时的 `lineage`（`continues` 与以消息为键的 `sources`），由请求组装方填写。ownFull/New/ReplayOutputInput 对私有 outputHistory、原响应身份与 selection spans 的接收不迁，没有旁路 JSON。原来标为“弃”，依据 [#466 revision 3][s26]。 |
| `output-prefix.ts` | model-contract 的 `DispatchRecord.messages`；model 的内存 Commands | 改 | [#466 revision 3][s26] 按 PanQiWei 2026-10-23 的决定采用 | 采用“前缀事实随调用保存”的机制，形状改为发出记录上的消息身份序列：`prepareDispatch` 抄写固定请求的消息身份，与账目同寿命，清理请求材料时不删除；租约只核对它是本次消息的前缀，不比较内容。WeakMap 挂接旧 InputProjection 的隐式协议不迁，不充作 M11 共享历史缓存。原来标为“弃”，依据 [#466 revision 3][s26]。 |
| `qwen.ts` | pi-ai-qwen；tokenizer-huggingface 引擎 | 迁 | [后续 Qwen 家族线][line] | 保留两型号模板、商业子集、effort 差异和图像估算；词表可去重，配置/模板仍分别固定，移出引擎及媒体读取，私有商业模板保持估算。 |
| `shared.ts` | pi-ai-transport 可复用纯函数；各家族规则 | 改 | [2.3 #463][s23]；[2.5 #465][s25]；[其他家族后续线][line] | 保留 reasoning.text 只计一次、REDACTED 不当可见文本的机制；改用共享消息与固定家族规则，弃旧 guardInputMeter 的 full/new/replay 包装。 |
| `wire-validation.ts` | pi-ai-openai；pi-ai-anthropic；其他家族工具投影 | 迁 | [2.5 #465][s25]；[其他家族后续线][line] | 保留当前 OpenRouter 工具及调用字段子集的协议事实；改用现行 ToolDeclaration，超出子集明确 unsupported，不删除未知字段后发送。 |
| `xai-candidate.ts` | xAI 计量研究拥有者 | 迁 | [后续 xAI 可选校准线][line] | 保存 UTF-8 bytes/4 与 765/image 的候选来源、特征及拟合前提；不当 route 认证、可靠 tokenizer 或全模态承诺。 |
| `xai-family-policy.ts` | pi-ai-xai | 迁 | [后续 xAI 家族线][line] | 保留 Grok 精确 release、可见/完整组/不可解释 detail 分类及 scope 前提；不迁旧私有历史协议，也不补造缺失 tokenizer 资源。 |
| `xai.ts` | pi-ai-xai | 迁 | [后续 xAI 家族线][line] | 保留固定校准偏移、可见 body 支持域和估算证据；没有可靠 tokenizer 时保持有证据估算或不可用，旧历史 meter 形状不迁。 |
| `zai-commercial.ts` | pi-ai-zai | 迁 | [后续 Z.AI 家族线][line] | 保留商业 route、cache 文本子集及参考模板计量事实；商业私有构造保持估算，旧 InputMeter 与 inline body 接收外形不迁。 |
| `zai-glm52.ts` | pi-ai-zai；tokenizer-huggingface 引擎 | 迁 | [后续 Z.AI 家族线][line] | 保留 GLM-5.2 固定模板、工具 JSON、tokenizer/config 摘要；加载与缓存归引擎，实际 route 与参考模板等价性另证。 |
| `zai-glm53.ts` | pi-ai-zai | 迁 | [后续 Z.AI 家族线][line] | 保留 GLM-5.3/Flash 多工具分组、effort 和模板差异；各型号证据分开，旧完整历史组入口不迁。 |
| `zai-release.ts` | pi-ai-zai | 迁 | [后续 Z.AI 家族线][line] | 保留精确 release 匹配及 visible/refuse 历史处理的证据范围；不把未知 release 猜成最新，未验证的私有历史清除政策不迁成默认。 |

`anthropic-replay.ts` 的签名前缀降级：封存件要求 `claude-opus-5.5` 与 `claude-fable-5.1` 有签名前缀，否则关闭推理。按[不关闭推理的项目约定](architecture.md#厂商适配的内聚范围)，记录不关闭推理，所以这项降级不迁。依据：2026-10-22 经代理实测，网关在推理开启时接受外来工具轮次，而这两个型号拒绝关闭推理，记录在 [#465 的实测记录](https://github.com/nemori-ai/omne-harness-lite/issues/465#issuecomment-6341479528)。

### pi-ai-transport/src/official-models

本表路径相对 `packages.0.0.1.legacy/model/pi-ai-transport/src/official-models/`，共 8 个文件。

| 源文件 | 目标成员或责任拥有者 | 标记 | 去向阶段或后续线 | 理由与保留边界 |
| --- | --- | --- | --- | --- |
| `anthropic.ts` | pi-ai-anthropic | 迁 | [2.5 #465][s25] | 四个 Claude 型号成为 pi-ai-anthropic 的四条记录：模态、限额（上游值均为未知）、单图 4194304 字节、user 提醒角色、1h 末消息缓存与参数子集。drop 改为 `unsupported`；推理强度为 `low` 至 `max`，`none` 为 `unsupported`。旧定义存在不证明真实 route 认证。 |
| `deepseek.ts` | pi-ai-deepseek | 迁 | [后续 DeepSeek 家族线][line] | 保留两型号及 DeepInfra 等具名路由的参数/限额与 release 差异；不迁旧 drop/adjust 外形，不以原生采样事实认证代理条件行为。 |
| `google.ts` | pi-ai-google | 迁 | [后续 Google 家族线][line] | 保留 Gemini 3.7/3.8 Flash 的具名支持域、上游限制与窄参数子集；不迁静默 drop，不把 Gemma 资源等同于型号身份。 |
| `moonshot.ts` | pi-ai-moonshot | 迁 | [后续 Moonshot 家族线][line] | 保留 K3/K2.7-Code 型号、各自 effort 和 route 绑定事实；定义与模板分别固定，旧 drop 不能成为现行行为。 |
| `openai.ts` | pi-ai-openai | 迁 | [2.5 #465][s25] | 保留 OpenAI 精确型号、官方档案材料、参数子集和图像/usage 关联；按新家族绑定表达，旧 drop/adjust 不迁，逐 leaf/route 另证。 |
| `qwen.ts` | pi-ai-qwen | 迁 | [后续 Qwen 家族线][line] | 保留开源与商业型号、模板设置、各自 release/route 事实；不按同厂商合并能力，不迁静默 drop。 |
| `xai.ts` | pi-ai-xai | 迁 | [后续 xAI 家族线][line] | 保留 Grok 型号及实际路由窄子集，max 不冒充 xhigh；缺参数支持明确失败，不迁旧 drop 外形。 |
| `zai.ts` | pi-ai-zai | 迁 | [后续 Z.AI 家族线][line] | 保留各 GLM 精确 release、历史 treatment、路由与限额事实；不跨型号复用未证计量，旧 drop 外形不迁。 |

### pi-ai-transport/src/image-preparation

本表路径相对 `packages.0.0.1.legacy/model/pi-ai-transport/src/image-preparation/`，共 5 个文件。

| 源文件 | 目标成员或责任拥有者 | 标记 | 去向阶段或后续线 | 理由与保留边界 |
| --- | --- | --- | --- | --- |
| `index.ts` | execution/image；model 媒体边界 | 弃 | [4.4][line] | 弃旧 image-codec 工厂和 ImagePreparer 转导入口；由 execution/image 的现行公开能力承接，不建第二套解码。 |
| `preparer.ts` | execution/image；model 媒体与派生表示 | 弃 | [4.4][line] | 弃旧 codec 调用、有限候选搜索、私有缓存与 prepared 品牌；取消需等原生结束的反例留给现行资源寿命验证。 |
| `preset.ts` | execution/image 与发行限额拥有者 | 弃 | [4.4][line] | 弃 D109 balanced 默认值与算法 revision，不能把旧像素/并发/缓存数值当当前默认；实际限额由现行拥有者采用。 |
| `types.ts` | execution/image；model-contract 媒体与资源契约 | 弃 | [4.4][line] | 弃旧 ImagePreparePolicy/Input/Result 与 clearScope 接口；复用现行图像能力和 Model 租约，不复制第二份媒体契约。 |
| `validation.ts` | execution/image；model 媒体边界 | 弃 | [4.4][line] | 弃旧 image-codec Schema 转导及 prepare 私有校验；合法输入、资源限制和失败表达沿现行拥有者实施。 |

### model-request-runtime-local/src

本表路径相对 `packages.0.0.1.legacy/model/model-request-runtime-local/src/`，共 17 个文件。

| 源文件 | 目标成员或责任拥有者 | 标记 | 去向阶段或后续线 | 理由与保留边界 |
| --- | --- | --- | --- | --- |
| `calibration-diagnostic.ts` | Model 计量与诊断拥有者 | 弃 | [6.4][line]；[后续可选校准线][line] | 弃旧 calibrationSource、原响应诊断与 BoundCredentialRedaction 外形；可保留有界无秘密投影反例，可选校准不在本线。 |
| `cordis.ts` | model-host-local；model 重试策略 | 弃 | [5.1][line]；[7.1][line] | 弃 loop-extension-runner 注册和旧 retry sample 服务；新 ModelRetryPolicy 由明确依赖装配，不要求扩展运行器。 |
| `default-retry.ts` | model 重试策略 | 弃 | [5.1][line] | 弃 ExtensionInput/Output、旧 fallback 顺序和工具 Duration 依赖；保留有限尝试/退避反例，按新首内容围栏实现可替换策略，不自动换模型。 |
| `diagnostics-types.ts` | model-contract；model 诊断 | 弃 | [6.4][line] | 弃旧 tenant/session 作用域、journal、sink/export 与 collector 公开形状；诊断查询和当前资格沿现行接口，不再造诊断契约。 |
| `diagnostics.ts` | model 诊断；宿主观测设施 | 改 | [6.4][line]；[6.5][line] | 可用有界队列、容量、失败计数和 drain 机制；改为当前调用/dispatch 身份及诊断端口，移除旧 Session 日志格式与默认 stderr 通道。 |
| `execution-pool.ts` | model 执行；model-host-local 实例调度 | 弃 | [1.1 #452][s11]；[1.3 #454][s13]；[3.5][line]；[5.2][line] | 弃 tenant/session/call/dispatch 私有物理池及易失去重权威；实际停止和跨租户隔离反例保留，新执行与调度沿各自端口实现。 |
| `index.ts` | model；model-host-local 公开入口 | 弃 | [1.1 #452][s11]；[1.2 #453][s12]；[7.1][line] | 弃旧 invoke/pool/原件/内容/诊断/扩展的聚合导出；根入口与宿主职责各自发布，不能把旧十五操作责任再搬回第二个拥有者。 |
| `invocation-diagnostics.ts` | model 诊断与传输观测 | 弃 | [6.4][line]；[6.5][line] | 弃旧 InvocationInput、Session 关联与 transport 私有诊断桥；可提取安全字段/thenable 收场反例，沿现行诊断和 TTFT 观测重建。 |
| `invoke-policy.ts` | model 独立执行与错误映射 | 弃 | [1.1 #452][s11]；[2.3 #463][s23] | 弃旧 RawHeaders/UpstreamError 和凭据脱敏 failure 包装；保留安全失败信息与原错误分类事实，以现行 ModelFault 表达。 |
| `invoke.ts` | model executeModel 与托管推进 | 弃 | [1.1～1.6 #452～#457][s11]；[5.2][line] | 弃旧 plan/send/read、调用方策略及原响应大对象编排；保留真实停止、首内容、单次发出与 unknown 反例，新独立执行和托管推进分开兑现。 |
| `model-obligation-borrow.ts` | model 持久事实；存储适配 | 弃 | [5.4][line]；[6.2][line]；[7.2][line] | 弃 Storage.read 回调外借旧 snapshot reader 的协议；有界扫描、重入拒绝与关闭反例由当前 Commands 的恢复/清理实现承接。 |
| `model-obligations.ts` | model 恢复与清理 | 弃 | [5.4][line]；[6.2][line]；[7.2][line] | 弃 mr_original_issue/retention 与 Session ACK 的旧并集扫描；保留未发送/已ACK/released仍有义务及跨租户拒绝反例，扫当前持久事实。 |
| `original-issue-migrations.ts` | model 持久仓储 | 弃 | [0.2 #449][s02]；[7.2][line] | 弃 session/call/dispatch 原日志键及 mr_original_* 表格式；按聚合与当前 Commands 建耐久参加者，不承诺旧字节迁移。 |
| `original-issue.ts` | model 持久事实；应用层跨域协调 | 弃 | [0.2 #449][s02]；[1.3 #454][s13]、[1.4 #455][s14]；[7.2][line] | 弃 session-log participant、原日志位置和私有 job/claim；保留同数据集、未知提交不重发反例，当前原调用身份与提交沿 Commands，新跨域同提交另属应用。 |
| `reference-content.ts` | model 结果保管与清理；内容存储提供者 | 弃 | [1.7 #458][s17]；[6.1～6.2][line]；[7.2][line] | 弃 Pending/Final 大对象、SettlementLogBinding 和旧 retention 表；保留完整原字节保管、未知回执认回与ACK后清理反例，真实对象存储受 D-02 约束。 |
| `reference-types.ts` | model-contract 消费与保管契约 | 弃 | [1.7 #458][s17]；[6.1～6.2][line] | 弃旧 ModelCallContent* 与 CallFacts 转导，沿当前读保护、ResultVersion、ACK 与清理契约承接，不复制旧类型。 |
| `settlement-work-store.ts` | model 持久事实；应用层消费协调 | 弃 | [0.2 #449][s02]；[6.1][line]；[7.2][line] | 弃旧 Session settlement batch、工作表和 generation 私有提交协议；保留占位/未知认回反例，消费方同提交由具名应用协调者另接。 |

### model-profile-directory-local/src

本表路径相对 `packages.0.0.1.legacy/model/model-profile-directory-local/src/`，共 9 个文件。

| 源文件 | 目标成员或责任拥有者 | 标记 | 去向阶段或后续线 | 理由与保留边界 |
| --- | --- | --- | --- | --- |
| `cordis.ts` | model-host-local；model-cordis-contract | 弃 | [3.3][line]；[3.5][line]；[7.1][line] | 弃旧 catalog/read/credentialLookup 三门面和 developmentBaseFaces；按当前唯一服务定义装配，内存目录与凭据保管分工保持明确。 |
| `index.ts` | model-host-local 公开入口 | 弃 | [3.3][line]；[7.1][line] | 弃 createLocalModelDirectory 旧根导出与旧配置类型；目录装载沿新宿主入口，不把旧包保留为兼容层。 |
| `local-credentials.ts` | model 凭据判定；model-host-local 保管 | 弃 | [3.4][line] | 弃 CCL replica reader、P-1r 与旧绑定表配对通道；保留已有绑定失败不退 factory 的反例，复用已交付 CredentialPort 及本地保管。 |
| `local.ts` | model-host-local 目录装载 | 弃 | [3.3][line]；[7.2][line] | 弃强制旧 AtomicStorage/manifest/readiness 的目录工厂；内存装载先实现，耐久后以新仓储实现，不把借用资源关闭权一起迁入。 |
| `migrations.ts` | model 档案耐久仓储 | 弃 | [0.2 #449][s02]；[7.2][line] | 弃 model_profile/configuration/manifest/binding 旧表与 Kysely schema；仅借鉴耐久事实及未知认回反例，按当前存储契约和聚合重建。 |
| `records.ts` | model 档案仓储适配 | 弃 | [3.1～3.3][line]；[7.2][line] | 弃旧 MP5/JSON 行、scope/ref 键和 CredentialRef 编码；保留精确数、不可读旧行不得猜补等反例，当前值与磁盘编码分开。 |
| `runtime.ts` | model 档案维护/求值；model-host-local 装载 | 弃 | [3.1～3.3][line]；[7.2][line] | 弃旧 CatalogImplementation、manifest 处置与 OperationOwner；提取同名胜出、修订冲突、倒退时钟及 Q-M01 诊断双失败反例，新目录分内存和耐久实现。 |
| `tx-reads.ts` | model 凭据与持久参加者拥有者 | 弃 | [3.4][line]；[7.2][line] | 弃 CCL/P-1r 限定的 StorageUnit 锁行 closure；当前凭据边界已采用，不能反写旧同单元读取为新默认协议。 |
| `types.ts` | model-contract；model-host-local 配置 | 弃 | [3.3～3.5][line] | 弃旧 ReadBoundReplicaIn、FactoryCredential、memberships 与 faceMode 配置形状；只消费当前身份、凭据、档案和宿主契约。 |

## Tokenizer 资源清单

以下 38 个文件另计，不加入源码数量。八个资源目录属于六家族，DeepSeek、Qwen 各有两套；xAI 没有该目录资源，OpenAI 固定编码由 js-tiktoken 提供。`anthropic-legacy` 的三个文件由本线迁入 `pi-ai-anthropic`。其余资源在本线均不迁入，只分配给具名家族后续线。资源归家族，引擎执行归独立 tokenizer adapter。相同词表可在同一家族去重，完整配置、特殊 token、模板及采用仍分别固定。

本表路径相对 `packages.0.0.1.legacy/model/pi-ai-transport/resources/tokenizers/`。所有行标为“迁”，表示原资源、来源说明或许可证与所属家族一起保留。表中资源名是具体保留对象，不新增公开资源接口。摘要、来源修订和适用限制以同目录 provenance 或 PROVENANCE 为输入；它们不证明私有供应商的完整计量精确。

| 资源文件 | 目标家族与具体去向 | 标记 | 去向线 | 资源或来源边界 |
| --- | --- | --- | --- | --- |
| `anthropic-legacy/LICENSE` | `pi-ai-anthropic` 的 `resources/tokenizers/anthropic-legacy/LICENSE` | 迁 | [2.5 #465][s25] | 原样复制，随包发布。原许可证随对应资源保留，不改写许可结论。 |
| `anthropic-legacy/claude.json` | `pi-ai-anthropic` 的 `resources/tokenizers/anthropic-legacy/claude.json` | 迁 | [2.5 #465][s25] | 原样复制，随包发布。pi-ai-anthropic 读取时核对 SHA-256，经 tokenizer-tiktoken 的计数与参考值 150 相等。保留 legacy Claude BPE；仅作粗略估算，不是当前 Claude tokenizer。 |
| `anthropic-legacy/provenance.json` | `pi-ai-anthropic` 的 `resources/tokenizers/anthropic-legacy/provenance.json` | 迁 | [2.5 #465][s25] | 原样复制。保留原来源修订、摘要及估算适用范围。 原说明保留 LICENSE 为 MIT 条款而 package.json 声明 Apache-2.0 的差异，不代为裁定。 |
| `deepseek-v4/LICENSE` | `pi-ai-deepseek` 的 `deepseek-v4/LICENSE` | 迁 | [后续 DeepSeek 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `deepseek-v4/provenance.json` | `pi-ai-deepseek` 的 `deepseek-v4/provenance.json` | 迁 | [后续 DeepSeek 家族线][line] | 保留原来源修订、摘要及估算适用范围。 |
| `deepseek-v4/tokenizer.json` | `pi-ai-deepseek` 的 `deepseek-v4/tokenizer.json` | 迁 | [后续 DeepSeek 家族线][line] | 保留原词表与摘要；经固定资源初始化交给引擎，不在 count 时读取或下载。 |
| `deepseek-v4/tokenizer_config.json` | `pi-ai-deepseek` 的 `deepseek-v4/tokenizer_config.json` | 迁 | [后续 DeepSeek 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `deepseek-v41-flash/LICENSE` | `pi-ai-deepseek` 的 `deepseek-v41-flash/LICENSE` | 迁 | [后续 DeepSeek 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `deepseek-v41-flash/provenance.json` | `pi-ai-deepseek` 的 `deepseek-v41-flash/provenance.json` | 迁 | [后续 DeepSeek 家族线][line] | 保留原来源修订、摘要及估算适用范围。 |
| `deepseek-v41-flash/tokenizer.json` | `pi-ai-deepseek` 的 `deepseek-v41-flash/tokenizer.json` | 迁 | [后续 DeepSeek 家族线][line] | 保留原词表与摘要；经固定资源初始化交给引擎，不在 count 时读取或下载。 |
| `deepseek-v41-flash/tokenizer_config.json` | `pi-ai-deepseek` 的 `deepseek-v41-flash/tokenizer_config.json` | 迁 | [后续 DeepSeek 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `google-gemma4/LICENSE` | `pi-ai-google` 的 `google-gemma4/LICENSE` | 迁 | [后续 Google 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `google-gemma4/PROVENANCE.md` | `pi-ai-google` 的 `google-gemma4/PROVENANCE.md` | 迁 | [后续 Google 家族线][line] | 保留原来源修订、摘要及估算适用范围。 保留 comparator 身份，不认作 Gemini 3.7/3.8 tokenizer 等价证据。 |
| `google-gemma4/tokenizer.json` | `pi-ai-google` 的 `google-gemma4/tokenizer.json` | 迁 | [后续 Google 家族线][line] | 保留原词表与摘要；经固定资源初始化交给引擎，不在 count 时读取或下载。 |
| `google-gemma4/tokenizer_config.json` | `pi-ai-google` 的 `google-gemma4/tokenizer_config.json` | 迁 | [后续 Google 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `moonshot/LICENSE.K27` | `pi-ai-moonshot` 的 `moonshot/LICENSE.K27` | 迁 | [后续 Moonshot 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `moonshot/LICENSE.K3` | `pi-ai-moonshot` 的 `moonshot/LICENSE.K3` | 迁 | [后续 Moonshot 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `moonshot/k27-tokenizer_config.json` | `pi-ai-moonshot` 的 `moonshot/k27-tokenizer_config.json` | 迁 | [后续 Moonshot 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `moonshot/k3-tokenizer_config.json` | `pi-ai-moonshot` 的 `moonshot/k3-tokenizer_config.json` | 迁 | [后续 Moonshot 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `moonshot/provenance.json` | `pi-ai-moonshot` 的 `moonshot/provenance.json` | 迁 | [后续 Moonshot 家族线][line] | 保留原来源修订、摘要及估算适用范围。 K3/K2.7 共享词表，分别保留配置、模板来源和两份许可证。 |
| `moonshot/tiktoken.model` | `pi-ai-moonshot` 的 `moonshot/tiktoken.model` | 迁 | [后续 Moonshot 家族线][line] | 保留原词表与摘要；经固定资源初始化交给引擎，不在 count 时读取或下载。 |
| `qwen-38-24t/LICENSE` | `pi-ai-qwen` 的 `qwen-38-24t/LICENSE` | 迁 | [后续 Qwen 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `qwen-38-24t/PROVENANCE.md` | `pi-ai-qwen` 的 `qwen-38-24t/PROVENANCE.md` | 迁 | [后续 Qwen 家族线][line] | 保留原来源修订、摘要及估算适用范围。 |
| `qwen-38-24t/chat_template.jinja` | `pi-ai-qwen` 的 `qwen-38-24t/chat_template.jinja` | 迁 | [后续 Qwen 家族线][line] | 保留该型号的原聊天模板，与词表和配置共同固定。 |
| `qwen-38-24t/tokenizer.json` | `pi-ai-qwen` 的 `qwen-38-24t/tokenizer.json` | 迁 | [后续 Qwen 家族线][line] | 保留原词表与摘要；经固定资源初始化交给引擎，不在 count 时读取或下载。 |
| `qwen-38-24t/tokenizer_config.json` | `pi-ai-qwen` 的 `qwen-38-24t/tokenizer_config.json` | 迁 | [后续 Qwen 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `qwen-38-27b/LICENSE` | `pi-ai-qwen` 的 `qwen-38-27b/LICENSE` | 迁 | [后续 Qwen 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `qwen-38-27b/PROVENANCE.md` | `pi-ai-qwen` 的 `qwen-38-27b/PROVENANCE.md` | 迁 | [后续 Qwen 家族线][line] | 保留原来源修订、摘要及估算适用范围。 27B 词表复用 24T 的 tokenizer.json，配置和许可仍分开。 |
| `qwen-38-27b/chat_template.jinja` | `pi-ai-qwen` 的 `qwen-38-27b/chat_template.jinja` | 迁 | [后续 Qwen 家族线][line] | 保留该型号的原聊天模板，与词表和配置共同固定。 |
| `qwen-38-27b/tokenizer_config.json` | `pi-ai-qwen` 的 `qwen-38-27b/tokenizer_config.json` | 迁 | [后续 Qwen 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |
| `zai-glm5/LICENSE.GLM-5.2` | `pi-ai-zai` 的 `zai-glm5/LICENSE.GLM-5.2` | 迁 | [后续 Z.AI 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `zai-glm5/LICENSE.GLM-5.3` | `pi-ai-zai` 的 `zai-glm5/LICENSE.GLM-5.3` | 迁 | [后续 Z.AI 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `zai-glm5/LICENSE.GLM-5.3-Flash` | `pi-ai-zai` 的 `zai-glm5/LICENSE.GLM-5.3-Flash` | 迁 | [后续 Z.AI 家族线][line] | 原许可证随对应资源保留，不改写许可结论。 |
| `zai-glm5/glm-5.2-chat-template.jinja` | `pi-ai-zai` 的 `zai-glm5/glm-5.2-chat-template.jinja` | 迁 | [后续 Z.AI 家族线][line] | 保留该型号的原聊天模板，与词表和配置共同固定。 |
| `zai-glm5/glm-5.3-chat-template.jinja` | `pi-ai-zai` 的 `zai-glm5/glm-5.3-chat-template.jinja` | 迁 | [后续 Z.AI 家族线][line] | 保留该型号的原聊天模板，与词表和配置共同固定。 |
| `zai-glm5/glm-5.3-flash-chat-template.jinja` | `pi-ai-zai` 的 `zai-glm5/glm-5.3-flash-chat-template.jinja` | 迁 | [后续 Z.AI 家族线][line] | 保留该型号的原聊天模板，与词表和配置共同固定。 |
| `zai-glm5/tokenizer.json` | `pi-ai-zai` 的 `zai-glm5/tokenizer.json` | 迁 | [后续 Z.AI 家族线][line] | 保留原词表与摘要；经固定资源初始化交给引擎，不在 count 时读取或下载。 |
| `zai-glm5/tokenizer_config.json` | `pi-ai-zai` 的 `zai-glm5/tokenizer_config.json` | 迁 | [后续 Z.AI 家族线][line] | 保留该型号特殊 token 与编码配置，不因词表相同合并。 |

`zai-glm5` 的现存八个文件没有单独 provenance 文件。三份许可证与三份模板分别保留，来源线索继续从封存家族实现及其固定研究依据核对。本清单不补造来源文件、缺失许可或新的许可判断。Qwen 27B 不新增第二份同字节词表；Moonshot 共享词表也不合并两型号配置或许可证。

## 能力基线与交接

[报告 5/8][baseline]的 M01～M11 是旧能力事实的粒度，不是新成员或支持清单。该报告没有逐行审查全部源与测试，也没有认证 37 条真实商业 route。下表逐项保留其能力及前提，分开记录本线计划覆盖与明确不覆盖；阶段映射不表示实现已完成。旧公开 API、Schema、数据库格式及旧默认行为均不构成兼容承诺。

| 基线与原始依据 | 旧能力及前提 | 本线阶段与当前责任 | 不覆盖或禁止迁入的部分 |
| --- | --- | --- | --- |
| M01 [严格无损多模态内容][baseline] | 严格 JSON 读写、独立深冻结复制、七类旧内容、opaque 原值及固定资源的同步 Schema 编译器；保留大整数、小数、指数和负零原文，拒绝重键、循环、访问器和缺 visibility。原 Node 24 前提不能丢。 | 现行 [common/json-text](../../common/json-text/README.md)拥有 JSON 接收、值树判定和无损写出，[common/content-block](../../common/content-block/README.md)拥有闭合内容块，[common/message](../../common/message/README.md)拥有工具部分。[2.3 #463][s23]、[2.5 #465][s25]与[阶段 4.1、4.4][line]消费这些现行表示，保留媒体、数字与可见性反例。 | 本线不迁旧七类块或旧 Schema runtime，不交付通用 Schema 编译器。共享值成功不授附件读取、工具执行或外传权限；同消息块唯一由消息拥有者核对，不能从块判定推定。 |
| M02 [消息、工具配对与可读性][baseline] | 消息及技术记录判定、完整工具配对、每 ResponseId 唯一回复、后台占位收场、完整前缀压缩可读性及角色分域摘要；依赖完整前缀和外部卡片/请求事实。旧 v9 与保留 v2/v3/v6 资源不是新 codec。 | 现行 [common/message](../../common/message/README.md)是消息值拥有者；[Model 工具交接](../model-contract/SPEC.md#工具声明转换与内容引用加载)约束调用建议与工具结果关联。[1.5 #456][s15]、[2.5 #465][s25]承接流到合法消息部分的 Model 侧工作。原日志事实、配对准入、压缩可读性和摘要的使用责任交 Session、消息与 [Context](../../context/README.md)后续线。 | 本线不实现 Session 日志、后台占位规则、完整前缀可读性或旧 semantic-digest 算法；不把现行 message 的值判定称作上述业务协议已经兑现。system 是请求视图；未知外部事实不能变为空压缩名单，真实授权及日志同提交仍在外部。 |
| M03 [档案、参数与范围][baseline] | 完整 profile/content/snapshot/ref、参数及精确上限判定，unknown/unbounded/limited 上游事实，tenant→organization→factory 范围链、同名胜者、写资格及凭据槽位；纯算法不授发送权，旧 MP5 默认不因 MP6 资源存在而升级。 | [Model 契约](../model-contract/SPEC.md)拥有现行档案与采用，[阶段 3.1～3.4][line]实现档案求值、维护、内存装载和凭据可用性；[阶段 4.2][line]请求准备；[2.5 #465][s25]发布 OpenAI 官方档案材料。保留精确值、同名不回退和在途采用不变的反例。 | 不迁旧 profile Schema 版本、scope/ref 编码和适配快照形状；本线不以旧 pure helper 代替当前资格检查，不把官方型号记录当真实 route 支持认证。 |
| M04 [目录与凭据绑定][baseline] | SQLite 耐久登记、整项修订、撤回/恢复、一致快照列表、有序官方 manifest、配置 revision 判重、本人凭据绑定及同 StorageUnit 的原 replica 读取；关闭停准入、等原操作且不关闭借用依赖。旧授权观察与提交之间存在撤权窗口。 | [阶段 3.1～3.4][line]覆盖档案和凭据求值，3.3 仅内存目录装载；[阶段 7.2][line]另交耐久仓储/目录，运行等 [#280 存储提供者](https://github.com/nemori-ai/omne-harness-lite/issues/280)。凭据使用已交付的 [model 判定](../model/docs/public-api.md)和 [model-host-local 保管](../model-host-local/docs/public-api.md)。 | 不迁旧 Kysely 表、CCL/P-1r、manifest 持久布局或旧撤权窗口为新契约。PostgreSQL、中心/据点同步不在本线。保留绑定失败不退 factory、倒退时钟不写及诊断双失败导致 close 等待的 Q-M01 反例。 |
| M05 [选择、有限重试与恢复辅助][baseline] | 独立 legalTargets/displayList/effectiveModel、失败分类、脱敏、retryDelay/decideRetry 等计算；默认重试贡献只决定、不发请求。旧允许 fallback 时按 provider 顺序尝试，不允许时首家可加一次；完整十五操作、Run 恢复和 ACK 实际由旧 Session 实现。 | [阶段 3.1～3.4][line]覆盖求值协作，[阶段 5.1～5.5][line]覆盖策略、控制、驱动、恢复和排空；[1.3～1.7 #454～#458][s13]建立当前调用与消费主干。选择由调用方保存，Model 持有自己的调用及 dispatch 事实。 | 旧 fallback 顺序、loop-extension 接口和 Session 十五操作实现均弃。5.1 明确不自动换模型；首内容后不重发，input-over-limit 不重试。Run/Session 范围传播、账户额度准入和跨进程交接不在本线。 |
| M06 [固定字节请求规划与发送][baseline] | 精确版定义、配置 Schema、官方档案、适配 lease、最终 UTF-8 请求及图片/字节/token+margin 限制；八家 37 叶的离线 catalog，HTTPS 有界活动连接。旧 planner 还含参数 drop/adjust 和发送前计量。实际 text/image 支持有限，不含音视频或真实 37 路由认证。 | [2.1 #461][s21]、[2.2 #462][s22]、[2.3 #463][s23]重建三阶段传输；[2.4 #464][s24]引擎与[2.5 #465][s25] OpenAI 与 Anthropic 家族；[2.6 #466][s26]真实单家联调；[阶段 4.2～4.4][line]处理准备、完整请求计量及媒体。请求组装方在请求前消费 meter 并核输入约束。Model 不复做该预算准入；materialize 仍核实际字节、摘要、媒体类型及提供者资源容量，并完成最终物化一致性检查。 | 覆盖 OpenAI 与 Anthropic；Anthropic 验证共享传输接口。其他六家与 Hugging Face 留后续线。旧静默丢参、私有 PlanInput/ToolDefinition、planner 内 token 准入均弃。定义、离线计量或本地 TLS 样本不能替代逐型号/route 证据；真实录制回放还受父卡 D-04 约束。 |
| M07 [历史续接、缓存与图片准备][baseline] | 有限同路由 signed/encrypted reasoning_details、工具关联和边际估算；跨路由 opaque 明确不可用。Anthropic last_message 选末条非空文本，纯图可用顶层 cache_control；图片有 codec、有限候选、容量、reuse scope，取消等原生结束。 | OpenAI 与 Anthropic 的合法家族历史及图像事实交[2.5 #465][s25]，[阶段 4.1～4.4][line]兑现现行转换、准备、计量与媒体；同路由的输出组估算与边际估算按 [#466 revision 3][s26] 采用：来源与延续由请求组装方以 lineage 声明，数字取自发出记录，算术在 pi-ai-transport，方法名沿用封存件。图像处理复用 [execution/image](../../execution/image/README.md)，五个旧 image-preparation 源均弃。 | 普遍跨模型 opaque 转换交 L01。Anthropic 末消息缓存由本线的记录数据与网关引擎兑现；图+空文本反例的处理见 L02。调用方携带原响应的私有校准协议与私有图片 reuseScope 不迁。cache_control 不证明命中、TTL 或真实费用，也不能用删除空文本或回扫旧消息掩盖失败。 |
| M08 [SSE、原回复、工具、账与停止][baseline] | 有界 SSE、text/refusal/reasoning/tool 差量、未知 usage/cost、独立不可变装配与独立 invoke；旧物理池按 tenant/session/call/dispatch 去重并等 invocation.stopped。outcome 与 stopped 独立，关闭失败保持 stopUnconfirmed；活动去重不是持久去重。 | [2.1 #461][s21]、[2.3 #463][s23]、[2.5 #465][s25]拆分 framing、家族解码及 TransportFact；[1.1 #452][s11]独立执行；[1.5 #456][s15]与[1.6 #457][s16]用 [common/stream-arrival](../../common/stream-arrival/README.md)归约并收场；[阶段 5.2、6.3][line]控制与账事实。 | 旧执行池与带账的 stream-assembly 形状弃，当前账与流分别归拥有者。保留拒绝文字不决定成功、error/content_filter 失败、合法 finish 后有界收 usage 尾帧等事实。不能因 close 成功就声称物理停止或发布 released；不确认停止时保留相应未知，不关借入 transport。 |
| M09 [原响应终结、原件与内容保管][baseline] | Pending→Final 不改原时间/账/headers/reply/calibration；同数据集原 job/claim、原字节摘要、发布许可、retention 与有界义务扫描；未知提交不 launch。外部引用要真实保管完整字节，旧 Session 可靠接管后才 ACK。独立 invoke 不提供完整无 Session 持久消费/ACK。 | [1.3 #454][s13]至[1.7 #458][s17]建立当前受理、事实、终局和最小消费；[阶段 5.4、6.1～6.2][line]负责认回、第二 ACK 路径、未知回执与清理；[阶段 7.2][line]耐久参加者。真实字节保管受 D-02 对象/文件存储约束。当前持久事实与保管沿 [model 架构](../model/docs/architecture.md#持久状态与恢复责任)。 | 弃旧 SessionLogBinding、原位置身份、大响应对象与表格式。Model 不取得外部原字节删除权；消费者可靠保存与 ACK 同提交由应用层具名协调者承接，真实 Session/Agent 集成为父卡集成点，不由独立调用绿测代替。未知、ACK 和 released 不能混成一个 done。 |
| M10 [精确费用、未知用量与补账][baseline] | 旧 call-accounts 对完整 model/tool/correction 分组精确求和，排镜像重计、重复原账/孤补账/等时金额冲突，返回 knownSum 与 unknownCount；final/ACK witness/ready 来源由调用方完整选择，unknown 不当零。 | 现行 [common/call-account](../../common/call-account/README.md)拥有单调用快照、revision 接纳、source subtotal 和 payable amount；[2.5 #465][s25]解码上游事实，[阶段 6.3][line]保存逐 dispatch 费用、迟到补原工作及去重。持久记录和业务账投影由 Model、Session 与账目拥有者按现行责任协作。 | 本线不迁旧 correction 组 Schema、任意精度 USD 口径或完整 Session 账本分组算法；不提供费率换算、额度准入或完整组织/租户汇总。旧精确原文及未知反例保留，但不能越过现行 call-account 的单位/精度规则。本线费用事实不证明外部账本已完整。 |
| M11 [模型历史投影与有界前缀复用][baseline] | 固定完整合法日志→不可变 segments，过滤事实/隐藏块、核原回复与工具配对、按块压缩；cache 显式 entries/blocks/bytes 与外部键，generation/gap/来源变化重建，容量不半更新。每租户/Session 独占 owner，私有品牌不是权限。旧 SPEC 仍 F0 候选，独立接受未完成。 | 历史与请求组装归 [Context](../../context/README.md)、共享消息和 Session 历史消费后续线，本线不实现这套投影/cache。[阶段 3.1][line]只消费调用方给出的历史模态要求；[阶段 6.5][line]只承接当前约定的模态点查询与可重建观测，不能据此声称 M11 全覆盖。 | 本线明确不覆盖旧前缀缓存、原 journal 发布和八项外部键失效。源码存在不等于旧候选规范已接受；不能用传输私有 output-prefix 替代它。bytes 是规范化输入字节而非堆大小，materialize/serialization 仍随输出规模增长；同尾查询常数代价不代表端到端选择常数代价。 |

### 本线的请求计量

两个家族的计量器实现 [model-contract 的可选校准](../model-contract/SPEC.md#可选校准及不可解释的历史)，依据 PanQiWei 2026-10-23 的决定（[#466 revision 3][s26]）。请求组装方在取得准备租约时以 `lineage` 声明被延续的调用与各消息的来源调用；租约按访问依据读取这些调用的发出记录，把真实输入合计与输出 token 数交给家族计量器。带回放推理的单元按来源调用的 O 记一次估算，方法名沿用封存件；被延续的调用以真实输入合计为锚点，新增部分按完整包络差估算，余量只按估算部分。没有 lineage 时行为不变：带回放推理的请求返回 `unavailable`，OpenAI 的诊断为 `encrypted-reasoning-not-countable`，Anthropic 的诊断为 `signed-reasoning-not-countable`。密文与签名组任何时候都不分词，也不被去掉。来源缺失或被扣留时返回具名不可用，不按零计。完整请求计量归[阶段 4.3][line]。

M01、M02、M10、M11 的外部部分都有现行或后续责任拥有者，但不属于 #446 的交付。旧 API 下已支持的能力与新契约的不同边界须分别交接，不能通过搬回旧包补齐。可选校准、不可解释历史、全部商业 route 认证、音视频传输、跨进程交接与完整 Session/Agent 集成也不在本线。上述明确不覆盖项不因源码清点完备而完成。

## L01 与 L02 的处理

[#193][legacy-issues]关闭只退役旧追踪入口，不证明这两项已修复或方案已接受。

### L01 跨模型历史状态兼容

原项为 [#193 L01](https://github.com/nemori-ai/omne-harness-lite/issues/193#legacy-model-history)，来源 [#18](https://github.com/nemori-ai/omne-harness-lite/issues/18)。责任交 Model、消息、Request Context 与历史消费拥有者，定位 `packages/model/`、`packages/context/` 及后续实际成员。本线明确不覆盖普遍跨模型转换；OpenAI 与 Anthropic 的同模型续接证据不能回答其他模型的 opaque、签名、可读推理或工具关联如何转换。本线的两个家族按现行回放声明略去另一模型的推理状态，并给出 `replay-omitted` 诊断。最后一个工具轮次不能接续时，两家都保持请求的推理强度，因为按[项目约定](architecture.md#厂商适配的内聚范围)，本项目的实现与档案不关闭推理。这是现行契约规定的略去，不是转换，不回答 L01。

后续具名范围须分别核对同模型续接与跨模型转换，保留原历史及信息损失的可见性，并验证请求、计量和恢复。旧数据已经清理，旧源码和研究不是现行完整复现。现行 Model/共享消息契约不允许任意 opaque 回放或调用方私有历史旁路。本清单不选择过滤、降级、删除或转换策略，也不把旧同路由规则升级为通用兼容政策。

### L02 图片与空文本的缓存规划

原项为 [#193 L02](https://github.com/nemori-ai/omne-harness-lite/issues/193#legacy-anthropic-cache)，来源 [#86](https://github.com/nemori-ai/omne-harness-lite/issues/86)。责任交实际 Anthropic 家族、缓存策略及消息输入拥有者。本线的 Anthropic 家族兑现末消息缓存，但 L02 仍不纳入本线。下列原始输入及判断范围保留给其拥有者。

1. 末条消息为空文本后接图片。
2. 末条消息为图片后接空文本。
3. 末条纯图消息，作为对照。

两种混排在旧 selector 中都没有 cacheTarget/marker，纯图对照可获顶层标记。报告的内部 helper 实跑只证明选靶，没有 HTTP，也没有认证完整 public plan 或真实缓存。后续在当前合法块范围内确认选靶、失败表达、固定请求字节及计量一致性，再由实际适配器兑现。不把上游接受原始请求当成本地规划已修复，也不扩成所有 route 统一过滤空文本。

本线的网关引擎照原样写出空文本部件，不删除它们（[pi-ai-transport SPEC“投影”](../pi-ai-transport/SPEC.md#投影)）。引擎只去掉对模型不可见的块，以及所有块都对模型不可见的 user、提醒与压缩消息。缓存标记放在末条消息的最后一个非空文本部件上，空文本部件不是位置。只有图片的末条 user 消息，标记放在最后一张图片上。所以纯图对照有标记。两种混排的末条消息都有空文本部件，不是只有图片的消息，又没有非空文本，所以没有位置，引擎返回 `unsupported`，`field` 为 `no-cache-target`（pi-ai-anthropic 的 `tests/plan.spec.ts`）。封存件对两种混排不加标记，引擎改为明确失败，不发出请求，也不删除空文本来取得位置。这是引擎对缓存位置的通用规则，不是本线对 L02 的裁决。

[line]: https://github.com/nemori-ai/omne-harness-lite/issues/446
[baseline]: https://github.com/nemori-ai/omne-harness-lite/issues/199#issuecomment-6127022557
[legacy-issues]: https://github.com/nemori-ai/omne-harness-lite/issues/193
[decision]: https://github.com/nemori-ai/omne-harness-lite/issues/447#issuecomment-6272139544
[classification]: https://github.com/nemori-ai/omne-harness-lite/issues/448#issuecomment-6271661202
[s02]: https://github.com/nemori-ai/omne-harness-lite/issues/449
[s11]: https://github.com/nemori-ai/omne-harness-lite/issues/452
[s12]: https://github.com/nemori-ai/omne-harness-lite/issues/453
[s13]: https://github.com/nemori-ai/omne-harness-lite/issues/454
[s14]: https://github.com/nemori-ai/omne-harness-lite/issues/455
[s15]: https://github.com/nemori-ai/omne-harness-lite/issues/456
[s16]: https://github.com/nemori-ai/omne-harness-lite/issues/457
[s17]: https://github.com/nemori-ai/omne-harness-lite/issues/458
[s21]: https://github.com/nemori-ai/omne-harness-lite/issues/461
[s22]: https://github.com/nemori-ai/omne-harness-lite/issues/462
[s23]: https://github.com/nemori-ai/omne-harness-lite/issues/463
[s24]: https://github.com/nemori-ai/omne-harness-lite/issues/464
[s25]: https://github.com/nemori-ai/omne-harness-lite/issues/465
[s26]: https://github.com/nemori-ai/omne-harness-lite/issues/466
