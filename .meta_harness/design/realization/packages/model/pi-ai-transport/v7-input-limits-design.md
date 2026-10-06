# pi-ai-transport：完整输入声明与最终固定计划候选

2026-09-28，rev 2，**candidate，未接受、未实施、未验证**。这是现有 `packages/model/pi-ai-transport` 节点增量；沿节点四件套，不新建插件、服务、存储或附件平台。新增实现名字均为候选；现有同名函数的下述扩展尚不是可调用 API。rev 2 按主线明确的分段交付裁定增加纯 MP4 子入口与执行代际隔离，等待独立定点复核；不以 rev 1 的评审结论代替该新增选择的核对。

## 基线与四层状态

产品输入为 PF-013 rev 14 / D-096。技术基线继承 D-082 完整定义采用的 [v4 投影](v4-definition-design.md)、D-095采用的 [v6 来源与头交接](v6-credential-path-design.md)；这些冻结文件不改。本页只替代新代际里“未知输入上限一律阻断完整声明”的旧前提，未关闭模态、缓存或计量的实际验证义务。

| 层 | 本增量状态 |
| --- | --- |
| 语义接受 | 无。baseline `omne-harness-lite-design-2026-09-15` 的 `data.model-profile/v4`（MP4）与 `capability.model-request-runtime/v6`（RT6）在 catalog 均为 candidate；D-096 只接受产品规则 |
| 可实施 | 分段 A 的纯 MP4 声明子入口与旧执行隔离、分段 B 的 RT6 固定计划及计量已有候选路径，须先按范围独立核对和采用。A 不等待 token 规则，B 不因 A 交付而自动可实施 |
| 绑定证据 | 新增 0 条；已有 bindings 仅支持原版本范围。本页 IL-V 为待执行义务 |
| 实际验证 | 新增实现验证尚无。源码观察基线 `be026d6c`：八家路线模块存在，ModelCapabilities 尚为五项，planner 尚未执行 RT6 S-74 |

## 契约到 Cordis 与公开构件的投影

| 契约责任 | 本节点兑现点（扩展均候选） | 实现与采用版本 | 依据或缺口 |
| --- | --- | --- | --- |
| MP4 S-8/S-9/S-32/S-33：有限供给与上游事实分开 | `definitions.ts` 的 ModelCapabilities、definitionValid、ownDefinitions；core MP4 类型与判定为唯一值定义 | 更新现有公开完整定义实现；不在模型叶子重复 Schema | IL-V1；IL-G1 |
| MP4 S-27/S-28/S-29：完整读取、建档与精确修订 | readModelDefinition、createOfficialProfileContent、registry 全值等价及固定 lease | 延续 D-082 四个纯面及现有贡献插件 | IL-V2/V3；目录写入和快照写入仍各归其 owner |
| RT6 S-53/S-57/S-74：最后一次转换后的计量 | planRequest 先自有输入，完成角色/工具/参数/缓存映射，再检查最终 body 与 serialized，成功才签发 plan | 现有 plan/send 通道；无旁路规划器或计量服务 | IL-V4/V5/V6；IL-G2 |
| RT6 S-58/S-64/S-74：同一计划与在途保持 | plan 来源标记、owner 及定义绑定扩展固定本次计量实现；send 只发送原 serialized | 现有 WeakSet/WeakMap 与引用寿命；这是进程内协议，不是跨进程证明 | IL-V7；跨进程消费者须另兑现 RT6 S-74 协议 |
| RT6 S-74：拒绝不产生锚点/HTTP/终结 | transport 返回同一具名规划拒绝；runtime 只为成功计划写“已出门” | 纯面无持久写权；runtime 是锚点 owner | IL-V4/V8；IL-G3 |
| RT6 S-20/S-54/S-63：无秘密的失败可解释性 | 原 diagnostic / 调用结果仅交指标、具名原因、合法数值与精确绑定；错误处理沿 D-095 | 无请求内容、图片字节或工具参数进入诊断 | IL-V8；保留来源政策、同次 H 和真实停止义务 |

## 公共完整声明与八家模块

### 分段公开面与执行代际隔离

**分段 A 先交纯声明，分段 B 才切执行代际。**这是本候选的明确施工边界，不是按形状猜版本的兼容层；下文注册、lease、计量及发送的新代际扩展均属于 B，不能在 A 顺手接入旧 planner。

| 段 / 公开入口（候选） | 明确消费与允许的公开面 | 不可混接边界 |
| --- | --- | --- |
| A：既有包根 `.` 与 `./plugin` | 现有定义、执行与注册面继续显式消费 MP3；保留当前已验证 demo 的原调用路径 | 现有 Pro 声明仍为 MP3，不标作 MP4，不把新六项声明送入旧 register/plan |
| A：新增 `./definitions/v4` | 只公开 MP4 `ModelDefinition`、`readModelDefinition`、`readAdaptationConfigurationSchema`、`createOfficialProfileContent` 与八家共 37 个完整定义数据；上述函数名在明确子入口内复用，配置读取沿既有 configurationSchema 的同源规则实现 | 不导出 plan/send/read-stream、factory、register、service 或贡献插件；无网络、连接池、全局注册、凭据读取。主根不自动重导出这些 MP4 值 |
| B：后续根入口显式切代 | RT6 与 MP4 消费链、S-74 全部计量前提及固定计划/发送门实际就绪后，才按明确采用切换执行；消费者显式迁移 | A 的读取、建档成功不是 B 的执行准入，不能通过删除 upstreamInputLimits 或改写修订把 MP4 定义送回旧执行 |

MP4 类型与判定由本批明确升级的 core 根入口提供，旧执行显式改用 core `/v3`，不能让旧执行随默认导出悄然升级。两条定义路径共用现有 route/configuration/parameter 的纯解释构件；只有能力版本判定与相应公开包装分别固定，不复制八套 Schema，也不在共同实现里按缺字段猜旧版。复用旧纯 route/config 处理前必须已经通过 core MP4 全量形状及跨字段判定，不能以删除 upstreamInputLimits 后旧 parser 的成功替代新判定。模型叶子按同样的公共 route map 加模型窄能力数据构造 MP4 声明，所有 cap 明确给值，无推导默认。

分段 A 的候选类型/import 约定：消费者从 `@omne-harness-lite/pi-ai-transport/definitions/v4` 取得本代 `ModelDefinition`；本代 `ModelCapabilities` 是 `@omne-harness-lite/model-profile` 根入口 MP4 `ModelProfileContent` 的六项 `Pick`，route 成员复用现有 `ModelRoute`。旧执行及其类型/判定明确 import `@omne-harness-lite/model-profile/v3`；本轮不增设 core `/v4` 别名。八家统一导出 `<family>Definitions` 与 `<family>ModelRoutes`，family 为 openai、anthropic、google、deepseek、xai、qwen、moonshot、zai；这些数据只在纯 v4 子入口统一导出。旧根 Pro 的原精确导出保持 MP3。模型供给值由本批已明确的来源输入填写，声明工厂不重新推导默认 cap。

MP4 声明绑定使用明确的新 `implementation.revision`，精确值由该批采用与源码发布记录确定；A 中不意味着该执行已登记。具体防混接须同时覆盖：六项 MP4 原值进入旧 read/register/factory/plan 的形状校验时沿各边界既有非法输入/配置收场；**只装载旧贡献的宿主**不能以新 binding 取得执行，plan/acquire 返回 unavailable。实现和调用方不得建设剥字段桥接、按形状 fallback 或自动降级，不因 JSON 校验成功宣称 MP4 被旧执行支持。既有 declared implementation 允许可信调用者自定义名称/修订，不增加修订字符串黑名单或保留前缀。

若可信调用者手工构造另一份合法 MP3 声明，那是明确的旧版本供给，不是本节点能从字符串或字段推断来源被篡改的 MP4 值；本节点不声称防止同进程可信代码重新定义数据。旧注册的同键不同内容仍沿已有全值等价规则拒绝。版本隔离验收必须说明装载集合与输入原值，不能以“伪降级也必拒”的无前提声明代替这些可验证边界。

新纯入口读到旧五项定义按 MP4 拒绝；旧根读到新六项定义按 MP3 拒绝。两入口不自动迁移值、不在 fallback 中重新尝试另一版。共享同一个 npm 包与同一个家族 route 数据不改变这个边界。A 的 README/README_ZH 例子必须显式 import 子入口，说明 37 份完整声明的可读/可建档范围；当前 demo 的旧 import 与旧 binding 保持原样且实际回归，不宣称已满足 RT6 S-74。

候选 `ModelCapabilities` 精确复用 MP4 `ModelProfileContent` 的六项：`inputModalities`、`outputModalities`、`maxInputTokens`、`maxOutputTokens`、`inputConstraints`、`upstreamInputLimits`。没有第七份本地限额 DTO，不给 ModelAdaptationBinding 加字段。所有适用性、三态对象、正有限数及同口径比较都消费 core MP4；definitionValid 的闭合成员检查和投影判定一起更新，不能只改 TS 类型。

八家文件采用同一组织：公共家族 route 数据 → 精确模型差异 → 六项完整 capabilities、精确 implementation/definition 修订 → 显式 configuration。公共读取、解释、复制/冻结与校验仍集中在共享模块；不要求每个叶子重复调用校验函数或复制同一工厂。任何公共集合只包含通过同一个完整判定的定义；37 个目标 ID 不自动转为 37 份合法值。

每个模型的项目 cap 是明确给定的供给选择；上游事实 lack-of-evidence 使用显式 unknown。既有确认的模态与合法 route 保留；不能用编造的 token/输出窗口、虚构 provider、unbounded 或默认为 text 填平缺口。多 provider 定义的 capabilities 必须是所声明全部路由都成立的供给；某一路由的更宽事实不能冒充交集，已知更窄事实仍约束发送。事实来源与窗口换算依据归正式模型证据，不能以“同一家族”免除模型差异核对。

`file` 这类上游元数据不增加第五种领域模态，也不产生本节点必须建设 PDF 平台的要求；保留已确认的 text/image/audio/video。声明读取/发布、实际表示可承载、缓存命中/到期、完整模型认证分别交付；发布合法声明不隐含这些运行保证。

| 公开边界 | 候选扩展与不变量 |
| --- | --- |
| ownDefinitions / readModelDefinition | 拒绝缺 upstreamInputLimits 的新代际定义，完整自有并保留三态与全部 cap；读取仍不创建资源或 lease，未知精确坐标仍 unavailable |
| createOfficialProfileContent | 六项能力完整投影，经 core MP4 表示及跨字段判定；不产生 registration/updatedAt，不发请求，不为了通过构造而补 cap 或未知事实 |
| configurationSchema / interpretConfiguration | 仍只从精确 route 的配置声明同源生成/解释；输入 cap 和上游事实属于 capabilities，不塞到 configuration.values。TTL、断点显式，不增加默认值；定义不完整同样拒绝。configuration 修订只随实际配置值的语义变化升级 |
| registerAdaptation / 静态构造 / 贡献插件 | 全值等价比较包含六项能力；同坐标而 unknown→limited、cap 变化或规则变化均不能重定义。新语义升级 implementation 与受影响 definition 修订；每个叶子不自己维护另一套等价 |
| runtime 所用 snapshot | 本次限制取固定 snapshot；definition 提供精确适配实现及可读取声明，不用“最新官方值”覆盖自建或历史快照。S-74 校验及计量不从目录回填 |

## 最终规划与计量构件

规划保持纯计算。候选内部 `measureFinalInput` 消费已经自有的最终 body、其唯一 serialized、所选精确 model/provider、snapshot 和本次已取得的计量实现。不得接收调用方 `verified: true`、自报 token 数或未校验的回调结果作为放行凭证。

**实现扩展点属于可信代码装配，不属于模型声明数据。**候选 `InputMeter` 是无资源纯函数构件，随明确的公共 implementation 修订交付；可单独取用，其内建工厂固定算法/表/词表修订和支持的 model/provider/表示前提。直接调用者在规划前显式传入已装配的构件，动态 service 在 acquire 时把同一实现闭包固定到 lease；不按模型字符串前缀、latest、配置里的模块路径选择代码。有限输入材料不满足前提时返回不可计量，不能外推。缺所需构件为 unavailable，已取得构件不能证明本次输入为 input_size_unavailable。

计量结果候选形状按每个指标区分准确值、可靠上界或不可计量，不携带文本；公开语义仍仅是 RT6 规划结果。提供者在采用前必须交出可审核的算法来源、适用域和准确性/上界论证及反例测试。一个实现自称 exact/upperBound 或提交通过的样本不是论证；主线不可把任意替换 callback 的“承诺正确”当已完成计量。装配信任的代码与独立证据才承担该前提，运行时标记只防止误用，不证明算法。

| 指标 | 本节点可实施的计算与前提 |
| --- | --- |
| 完整请求字节 | 在全部角色/工具/参数/缓存映射完成后，对将交 send 的同一个 serialized 计算 UTF-8 字节长度。使用成熟运行时编码，独立抓线复核；不计 headers、压缩/分帧，不用图片字节和代替 |
| 每图解码字节 | 对最终真正发送的 image 项按 content-blocks 采用的严格 base64 语法验证后解码计数；不能依赖容错解码器默认忽略非法字符。图片即使重复也分别检查，边界相等通过；工具结果中最终投影为 user 的图片同样计入 |
| 最终图数 | 枚举最终发送图片项计数，不按来源 hash 去重；未发送原件不计。可选项目 cap 缺席不消除 upstream limited |
| 输入 token | **尚无可在本页宣称成立的通用算法。**可采用绑定供应商明确的准确规则，或对全部支持表示有可靠上界的算法。须包含 system/developer/user、工具定义及调用/结果、协议包装、特殊 token、保留的推理内容、实际多模态成本；共享窗口换算消费 MP4 S-8。仅词表编码文本、UTF-8 长度、经验倍率或几次 usage 对比均不证明完整输入上界 |

token 算法的精确证据缺项是：所用 tokenizer/词表/特殊 token 版本，OpenRouter 到指定 provider 的实际输入投影与计数覆盖，工具与消息边界开销，相关模态的可复现成本公式/保守界，以及规则适用域。若供应商直接给完整输入的可复现计数/上界，可以据其明确前提采用，无需强求私有模板公开；本次不虚构这种接口已存在。联网准备即使未来可用也在 plan 之前，并需单独的取得/失败/授权证据；不在同步 plan 内偷发计数请求。

所有计量均先完整执行可判断项再汇总：准确值超过任一有效上限为 input_limit_exceeded；没有已证明超限、但某指标不明或仅有超 cap 的保守界为 input_size_unavailable；全部适用指标准确值/可靠上界都在界内才签发计划。即使 token 不可判，已测得请求体超限仍报告实际超限。所有数值比较使用精确数，禁止大整数转 Number 舍入。

## 准入次序、固定与外部材料

1. `ownPlanInput` 需从当前单个布尔校验改为有阶段的内部判定，保留基本表示和既有 tool_internal/orphan_tool_call/modality_not_carried 的既定次序。对缺限额成员的结构仅作内部暂存，不把它签成合法 snapshot；随后完整检查所有适用 cap 与必需 upstream 项，专门交 input_limit_missing。存在但非法/越过已知上游值走原 malformed，不能被缺项分支吞掉。
2. 对合法输入确定完整最终表示，计量后深度自有并固定 snapshot、定义、配置、消息、工具、serialized 和计量实现关联；成功后才加入现有 plan 来源集合。plan 的 body 与 serialized 必須一致，send 不再次生成 JSON，不加未计量输入。
3. 外部引用不在这里解引用，也不以 AttachmentRef.bytes、MIME 或像素证明发送字节。材料 owner 在合法授权下先取得并固定允许的表示，规划只消费该结果；无实际材料按 RT6 S-74 的适用分支拒绝。若表示本身不在当前编码器支持范围，保留既有 modality_not_carried 优先级，不把所有引用失败都改名为限额失败。不得借此静默丢历史图或新增附件服务。
4. runtime 在成功 plan 后才追加对应“已出门”，公开 invoke 在成功 plan 后才 send；两者不能在已有锚点下重新修改 body。任何消息/工具/缓存/参数变化都重新规划。取消及 D-095 来源/响应头路径保持原归属。

## 依赖、存储及装卸

Cordis 采用 D-025 的 4.0.4。本次数据与纯函数没有独立生命周期，继续复用稳定 modelTransport 及可信贡献插件，必需注入边不变。依据为 basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)，这些条目已有 probe；本稿未重跑，不增加上游语义主张。

| 装载所得 | owner / 对外可用时点 | 部分失败 | 撤除与保留 |
| --- | --- | --- | --- |
| 六项完整定义和 route/config 声明 | 原贡献实例；完整校验后 register，纯读面不取得执行权 | factory 同步 TypeError / 插件启动失败；直接注册 invalidInput，沿 D-082，不发布半份 | 停止该代际新 acquire，已有 lease 保持自有值及旧算法，不用新声明替换旧计划 |
| 无资源计量代码与常量 | 公共实现与静态调用者，动态路径由原 lease 固定 | 缺构件 unavailable，不装一个默认通过函数 | 无额外 disposer；含在原实现引用寿命中，在途任务完成/按既有停止收束后才释放原 owner |
| 原网络资源和在途任务 | 原 transport owner；配置全部合法后创建 | D-095 原配置错误收场，零 HTTP，释放已取得资源 | 内核不取消调用；沿既有关闭准入、真实停止/排空、回调及结算交接，不用无序 effect 清理推出安全 |

对存储提供者的**新增要求为无**：本节点既不读目录也不追加会话日志，不产生跨 owner 的同提交承诺。RT6 S-74“检查在锚点之前”是 runtime 调用顺序加固定 plan 的协议，不能冒充 transport 与日志共事务；SL3 提交与恢复仍在 runtime 节点。目录原子更新/updatedAt 与 MS5/MR6 快照写入由各自 provider 承担，本节点不选数据库。

两条必须演练的交错：A acquire 旧定义/计量实现 → 登记 B 的新 cap/算法 → A 规划和发送仍用 A，B 仅影响新 acquire；A 规划成功 → 调用者篡改输入且旧贡献撤回 → 原 plan 字节不变，A 在途按旧 owner 收口，旧清理不能删除 B。重启后旧进程 plan 来源标记丢失，不能反序列化伪造后继续 send。

## 取舍与迁移

| 候选选择 | 落选方最强理由 | 本方弱点 / 置信度 |
| --- | --- | --- |
| 共享完整声明解释器，八家仅数据与真实窄差异 | 每家独立类能自由处理厂商变化 | 公共解释器变更影响所有叶子，需全族回归；高 |
| 保留现有贡献插件/lease，不增加计量服务 | 独立服务便于单独换算法 | 算法修订随实现发布，不能在旧调用中热换；换来固定前提，较高 |
| 声明发布独立于实际发送与认证 | 一个 ready 状态更易向调用者呈现 | 消费者须区分合法声明与可运行范围，README 必须明确；高 |
| A 用显式 `./definitions/v4` 纯入口，B 就绪后切根执行 | 立即升级根入口避免同时解释两版 API | 有限过渡期维护两个明确版本入口及隔离测试；可保留现有 demo 且不会让旧 planner 绕过新限额，较高。A 不承诺永久双版本执行支持 |
| 未获可靠 token 规则的请求明确不可计量 | 经验系数可立即让更多请求发送 | 暂时限制这些请求的新版发送；满足 RT6，而不能用“可插拔”掩盖缺证据；高 |

新代际所有定义必须显式给六项能力，旧五项定义不自动补 unknown/cap；旧绑定在新宿主未登记则 unavailable，不能用同 modelId 取最新版本。已记录旧请求按原 codec 读取/结算，不补写限制；旧 snapshot 的新发送沿 RT6 S-74/G-34。迁移在途宿主沿 D-082：旧 owner 排空后退出，不能让 Cordis 重载自动接管旧对象。本增量不承诺兼容导出或新增迁移管理服务。

归装配：可信实现及正式模型声明/供给值来源、计量规则的明确采用与资源准备、凭据和诊断配置、入口身份、运行/日志 owner、单一费用账本、生产认证。原 acceptance app 已退出当前应用清单，不能默认为此责任的承接者；开发示例只承接其实际公开函数路径，完整产品装配仍由主线指定（IL-G3）。

## 实施清单与缺口

按独立依赖推进：① 分段 A 在 core MP4 已采用实现就绪后，交 `./definitions/v4` 的定义/读取/建档、八家声明、根执行隔离与对应包双语 README，执行 IL-V9 及 IL-V1～3 的纯声明部分；② 并行准备确定性字节计量、阶段化拒绝、固定计划与 public/Cordis 负控；③ 逐精确模型/供应商补计量算法证据，RT6 消费链就绪且全部新执行义务通过后按分段 B 显式切根代际，补 IL-V1～3 的新注册/lease 部分及 IL-V4～8。① 不等③，①完成不得把③标为完成。详细 oracle 与缺口见 [验证入口](verification.md#v7-完整输入限制候选验证)。

| 缺口 | 条款 / 受阻消费者 / 闭合 owner |
| --- | --- |
| IL-G1 | MP4 candidate 与 core 实现未采用，阻塞正式升级源码；主线/数据 owner 完成采用及 core。缺数值/事实只阻塞对应定义，unknown 本身不阻塞合法声明 |
| IL-G2 | RT6 S-74/G-33 尚缺逐模型/供应商全输入 token 规则；模型/计量实现 owner 交上述证据并独立验收。阻塞相应新版成功发送，不阻塞八家结构、完整声明或可靠字节计量 |
| IL-G3 | RT6 S-74/G-34：runtime 拒绝类型、锚点顺序与历史 codec/正式装配须配套实施；runtime/codec/装配 owner 承接，transport 局部通过不关闭十三操作或历史恢复 |
| IL-G4 | 已有 ND-G2/ND-G3 的缓存附着、TTL 到期与实际多模态材料仍保持；各对应实现/认证 owner 闭合。file 元数据不自动扩大为 PDF 交付，confirmed image/audio/video 不删 |
