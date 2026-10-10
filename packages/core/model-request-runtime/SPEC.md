# 模型请求运行时：公共行为契约

形状归 [公开根](src/index.ts)，集成绑定归 [./cordis](src/cordis.ts)。本页接续完整十五操作及独立构件的类型外行为，不新增业务政策。

## 边界

本包拥有模型请求的公共服务协议、共享端口和后端无关计算。公开根不加载 Cordis；正式服务、服务键和类型化集成由 `./cordis` 拥有。公开形状以源码为准，本规格只补充身份、授权、次序、生命周期、错误、重复调用和副作用的行为承诺。

`ModelRuntimeOperations` 的十五个操作是同一能力的公共协议。公开算法可独立取用；独立 `invokeModel` 和具体 runtime 是协议的消费者。公共协议不要求完整 Agent Loop，也不把提供者工厂、私有队列、存储后端或具体实现策略搬成本包的业务定义。

纯计算只消费显式输入，不读环境凭据、当前 Context 或持久服务，不发送、不调度、不结算。`readSettlementPrefix` 通过显式端口读取日志并登记真实任务，具有读取副作用；它不因位于公开根而变为无 IO 计算。

数据身份、快照、响应、账和日志记录沿其公开拥有者；本包不复制这些形状，不改变 Schema ID，不建立旧格式兼容、回填、改写或清空旧记录的通路。不能确定当前格式与完整原批时明确失败。

通用图片 codec 的公共类型归 `util/image-codec`。本包只作类型重导出，保留模型消费者的公开入口。具体 codec 的选择和原生库加载归消费者装配，模型准备政策与缓存不转移给通用模块。

## 既有消费者的会话请求准备

[`session-request-preparation.ts`](src/session-request-preparation.ts) 定义现有混合消费者向Session提供者借用的准备接口。它不是`ModelPoolConstruction`的一部分，也不是可序列化的执行请求。

其中readCall由Session侧读取并解释原调用历史，只向消费者返回CallHistoryResult。读取使用调用者保有的原registration及原解释器，必须保留来源校验、ACK和失败语义。调用者传递解释器时须保留其原所属对象，不能因回调转交改变接收者。它不登记第二份读取，不提交记录，也不取得发送权。该方法用于现有消费者迁移，不能作为执行池普通请求的一部分。

Session准备器从实际会话来源求值本次超时、解析工具描述、选择历史校准并读取原凭据，返回PreparedModelExecution及该次调用的政策。执行请求固定完整租户／会话／调用／发出序号、原创建键、独立调用或Run／attempt来源，以及PlanInput。原顺序保持为超时、凭据、工具、校准。缺失或不可用的输入必须显式失败，不补默认值。原拥有者提供read执行登记，准备器不得自行释放登记或关闭来源。

返回值中的凭据仅供可信进程内发送使用，不得放入日志、诊断、配置或对外回复。超时读取登记到当前会话求值拥有者，凭据和校准读取登记到原调用拥有者；这些原任务均须真正结束后才能归还资源。完整会话来源和准备回调不得进入执行池的普通请求。既有混合消费者的迁移不意味着窄执行池接口已完成实现。

## 执行池消费边界

[`execution-pool.ts`](src/execution-pool.ts) 定义准备好的请求、执行池构造、原执行记录和捕获接口。公开根只导出这些类型。提供者须按本节迁移；类型存在不表示既有工厂已完成迁移。

Session 从实际 SessionLog、Context 和当前装配准备请求，Agent 决定下一步。模型执行池接收准备好的请求，管理原调用、并发、取消、结果和资源。池不选择会话模型，不投影会话消息，不恢复 Session 队列、Run 或 attempt。`invokeModel` 继续是可独立使用的执行能力。

`ModelPoolCallOpen` 显式携带租户，保留 Run、attempt、report 全有或全无的关联。创建不发送 HTTP。首次发出不接受 RetryPlan，重试必须提供原重试计划。池核对原创建语义、完整 PlanInput、逻辑发出序号和既有守卫，不因物理世代变化重发。请求中的身份、模型档案及归因均不授予执行权。

Session 当前栅栏与原唯一发起须在同一实际 StorageUnit 中参与。`ModelExecutionRecords` 只读写模型能力自己的原记录。readOriginalIn 按租户、Session 和 call 读取，允许调用尚无 dispatch。stageOriginalIn 和 stageConsumeIn 只暂存，不独立提交或发 IO。只有原池发行、关联到同一实际数据集的活体 job 和 claim 有效；复制对象、旧 owner 或异存储单元不能参加。提交不明保留完整原 ref、creationKey、原输入和责任，不授予 launch、不重发、不生成后继身份。

`ModelPoolConstruction` 借入原 transport、凭据来源、host、策略及生命周期依赖。池只取得 transport 的 acquire 和 clearReuseScope，不取得注册、退役或共享运输关闭权。凭据来源按原执行与真实数据集核关联，再沿原模型来源取值。ref 本身不是凭据读取授权。请求、日志及提交不明回复不携带原文秘密。

`ModelCallerAccess` 每次按实际调用动作核当前调用者。读取、控制和 ACK 资格不形成新的模型执行许可。维护原执行义务与业务内容读取分开，撤权不得丢弃原保管、费用或收场责任。

`ModelRecoveryAccess` 沿原恢复准入，先停止旧效果写者，再借入原模型记录及原 invocation，不返回完整 Session binding 或任意日志 owner。`ModelExecutionSource` 仅供可信实例拥有者捕获原物理执行，不返回 SessionRuntimeBinding 或 SettlementOwner。捕获的 invocation 不暴露 borrowControl。释放 source 前须关闭实际池并释放全部 capture；空索引、复制 metadata 或历史终态不证明物理停止。

普通 operations 不包含 closeAdmission。实例 closeAdmission 只停新准入；close 沿原 RuntimeCloseResult，失败保留原实例及资源。Session 或调用者退出不关闭共享模型池。完整结果和必要引用可靠保管后才能 ACK；旧 attempt 的费用与迟到结果责任保持。

### 原执行义务的借用读取

withObligations 只遍历绑定数据集内本租户的模型调用。每个 ModelExecutionCallRef 包括尚未发出的调用；读取原调用时必须覆盖其全部原 dispatch，不伪造发出序号。ref 是数据，不授予 launch、控制或 ACK。

limit 必须是正整数且满足提供者容量策略。原维护来源不能核实时，在发布 reader 前返回 denied 或 unavailable。提供者先完成一次真实读取，固定原一致视图，再发布 reader；空集也不能跳过这次读取。游标由提供者持有，按实际原 Session 和记录坐标稳定排序。坏版本、异归属或不完整来源返回 unavailable，不冒称空集。

next 返回非空 page、明确 end 或 unavailable。同一 reader 只允许一次 next 在途；重叠调用返回 unavailable，并使本次借用不能返回 used。任何 next 返回 unavailable 均影响整个借用结果，即使 callback 忽略该值。used 只表示 callback 值与借用收场成功，不表示完整遍历或全部义务已处理。

callback 在原存储只读作用域外执行，可通过原公开接口独立写入。callback 结束后使 reader 失效，等待已开始的读取及实际存储借用收场，才返回。callback、读取或释放抛出的异常优先于普通 unavailable；单个异常保留原对象，多异常以 AggregateError 保留原对象，按 callback、读取、释放排列。

遍历不能预先排除终态或已 ACK 调用。原 unknown claim、writer、response、ACK 清理和持有资源仍可能有义务。一致视图不替代活体执行与资源检查。完整义务覆盖、处理或可靠保留均成立后，提供者才开放新工作；来源不可核不能冒称 ready。池关闭仍要求原义务和实际资源收场，不以读到 end 代替。

## 调用身份、绑定与状态

调用按同一会话中的 CallKey 识别；callId 在会话内唯一且不复用。发出序号从 1 开始，在同一次调用跨尝试连续递增。创建时固定租户及原 Session/Run/attempt 关联；无 Run 的调用不补 Run/attempt，其账归该会话。创建尝试、原发出尝试与恢复时实际归账尝试不能互相代填。

每次调用固定有效模型的来源、完整档案快照、精确适配绑定及请求参数。后续目录改版、同名配置值或其他调用不能改变原绑定；恢复与再次发出只取得原精确版本，缺失即 unavailable，不改用最新实现。凭据每次发出现取，两个时限每次发出前现求；这两类当前输入不重选原模型。

终态吸收，不重新发出。ready 确认 complete/interrupted 及待处分结果；它不是回复消息，不预填最终处置或提交时的 late。未确认写入形成的本地 reply_pending 责任不等于耐久 ready/final。回执未知时不得凭本地旧状态授予再发许可。ACK 后按显式小视图回答，不把内容已释放当 callNotFound、损坏或可重新创建。

## 真实授权和失败次序

模型的产品可用性只有三项：模型是否已注册、当前上下文装配的数据模态是否支持该模型、账户额度是否充足。本期不约束账户额度。不新增独立模型执行许可或模型调用主体的额外资格。范围链、选中模型与有效模型仍沿PF-013的既有设置求值；该求值不等于另一份模型执行许可，也不因本条而取消。凭据缺失或运输失败按调用失败处理，不扩成模型可用性的业务门槛。调用记录访问、取消、结果处分和ACK各自的归属与责任检查保持，不从这些检查推出新的模型使用许可。

先校验请求表示，再按当前调用动作核验会话、创建租户及当前资格，之后才向已授权主体区分调用是否存在、终态与阶段。拒绝和不可判对外均为 unavailable，诊断仍区分实际原因。CallKey、持有引用、generation、隔离标签、Context 或旧 captured standing 均不授予权限。

读取、等待、处分、取消和 ACK 分别核验；授权与撤权在实际准入及交付点有顺序，已持有的 consumer 不能持续使用旧许可。停新工作不取消现有事实的读取、对账、处分或 ACK 责任，各操作保留自己的失败集合和判定次序。

发出守卫共同适用于 dispatchAgain 与 canDispatchAgain：终态先返回 alreadyEnded；曾开口先于 wrongPhase；随后在 awaiting_decision 检查事实类成因及原快照的供应商/回退约束。只读 allowed 只说明该观察点的事实，不预约未来发出。未知或未结算发出不成为 failureSubject 或重发许可。

### 逐操作失败判定

下表从左到右判定；S-87/S-92 接续的当前资格核验位于表示校验之后、存在性及状态之前，拒绝或不可核均为 unavailable。需要读取才能判定的条件在其输入不可得时立即 unavailable，不能跳过它去判后项。重复的 unavailable 表示不同作用点；不是统一提前屏蔽业务操作。所有操作不发新增业务事件，诊断不能替代提交事实。

| 操作             | 表示校验及当前资格之后的次序                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| legalTargets     | invalidInput → unavailable（当前资格及完整来源）                                                                                                                                                                                  |
| displayList      | invalidInput → unavailable → profileNotFound                                                                                                                                                                                      |
| effectiveModel   | invalidInput → profileNotFound → unavailable；当前资格仍先于目录存在性，读不到所需来源立即 unavailable                                                                                                                            |
| selectModel      | invalidInput → unavailable → profileNotFound → notLegalTarget；合法之后才判断重复                                                                                                                                                 |
| openCall         | invalidInput → unavailable（当前资格）→ creationConflict → callNotFound → runtimeStopped → wrongPhase → unavailable（必要来源）→ profileNotFound                                                                                  |
| dispatch         | invalidInput → unavailable（当前资格）→ callNotFound → alreadyEnded → retryRefused{already_spoke} → wrongPhase → runtimeStopped → unavailable                                                                                     |
| dispatchAgain    | invalidInput → unavailable（当前资格）→ callNotFound → alreadyEnded → retryRefused{already_spoke} → wrongPhase → retryRefused{fact_class \| provider_not_allowed} → runtimeStopped → unavailable                                  |
| interrupt        | invalidInput → unavailable（当前 cancel 资格）→ callNotFound → alreadyEnded → unavailable（意图提交）；已有 ready 是 alreadyEnded                                                                                                 |
| releaseCall      | invalidInput → unavailable（当前放弃资格）→ callNotFound → alreadyEnded → wrongPhase → unavailable（终结提交）                                                                                                                    |
| reconcile        | invalidInput → unavailable；先 final、ready、终结、live、created 认回，只有实际追补才要求恢复来源与停止资格                                                                                                                       |
| readAttempts     | invalidInput → unavailable（当前 read 资格）→ callNotFound → unavailable（完整历史来源）                                                                                                                                          |
| settleReply      | invalidInput（含非法 disposition）→ unavailable（当前 settle 资格）→ callNotFound → alreadyEnded → wrongPhase → unavailable；相同合法处分认回原成功，不同合法处分 alreadyEnded                                                    |
| canDispatchAgain | invalidInput → unavailable（当前资格）→ callNotFound → alreadyEnded → wrongPhase → unavailable；already_spoke 先于 wrongPhase 返回 refused，fact_class/provider_not_allowed 只在 awaiting_decision 判定；没有 runtimeStopped 失败 |
| acquireCall      | invalidInput → unavailable（read 及附加 wait 资格/当前性）→ callNotFound（完整权威来源证不存在）→ runtimeStopped（停止且无法提供请求资源）→ unavailable（来源/内容/代际不可判）                                                   |
| acknowledgeCall  | invalidInput → unavailable（当前 ACK 资格/来源）→ callNotFound → wrongPhase（非终态/目标不符）→ invalidInput{malformed}（可判值矛盾）→ unavailable（写入/回执/必要装配）；确认后清理失败返回 acknowledged+pending                 |

## 模型选择与当前输入

选中路由由权威日志获得，无初值时不猜。层锁锁定路由名；同名解析先排除已撤回和范围不允许的行，再取最具体的一行。模态不兼容、缺凭据不触发落回其他行，也不改写选中模型。每个展示路由只一条，被覆盖行保留各自来源与注记；合法集合仅按原三条件判定，不增加凭据或 model 配值第四条件。

legalTargets、displayList、effectiveModel 必须使用覆盖同一权威日志尾的投影及相应合法来源；无法获得完整事实即整体失败，不交部分或假空集合。selectModel 先判断合法、后判断重复，切换记录耐久后才成功；确定零写只说明本次未产生切换，未知回执不承诺回滚、恰一次或自动重放。

effectiveModel 到 openCall 保留既有选择窗口，openCall 使用显式 basis/target，不重算或静默换模型。真实 holdingTenant 固定租户；当前求值输入来自同租户的真实会话配方、捕获 standing、当前本机权威或明确采用副本、真实不可变资产正文与有效版本。捕获 standing 只作配方，每次读取另核当前成员有效性和内部调用权限。缺源、租户错配、源版本不符、正文不可读或无法确认跨源一致性均 unavailable；不回退历史 manifest、fixture、空定义或固定宿主值。求值失败零 HTTP、零新发出/响应/终结并保持原责任。

## 创建与发出

openCall 按 creationKey 固定创建输入；对象成员次序不影响语义相等，数组次序及精确数值有意义。非值输入由稳定 sourceVersions 关联，不用对象地址或凭据值。相同 key 的相同输入认回原 CallKey；不同输入返回 creationConflict 且不泄漏原内容，不重新选模型或生成 ID。

完整创建内容先持久、created marker 后发布；初次创建拒绝按既有整批发布输入和终结。内容存储提交与 Session Log 的 created marker 追加是两次拥有者提交，不冒称同一事务。创建回执或内容写入未知，保留原稳定身份、完整输入及旧写任务责任；须实际停旧写方并权威认回，不能仅凭缺席或取消信号重交。

每次发出依次：读当前求值输入取得正时限、现取凭据、按精确实现规划并计量、固定最终请求及调整/丢项、耐久写 dispatched、至多一次请求出网。发出的就是该锚点可还原的参数；出网后不再改。完整 Run/report 取同一已授权快照；无 Run 时才用实际当前工具来源，缺事实不冒称 unknownTool。

首次模态/凭据拒绝按未发出终结；已有发出的规划拒绝保持原 resumable/awaiting_decision，供调用者修正输入或放手。已有发出再缺凭据为 released{credential_unavailable}，不称 undispatched。时限、实现或必要来源不可用不出门、不改既有响应。

首次真实内容包括非文本内容和非空封口块，不包括头、空开块或空增量。耐久 opened 成功先于任何快照、增量及结果可见内容。确定零写收为本地 unrecognized，无首 token、无 delivered；回执未知则强门隔离，不把函数无内容投影结算成未开口响应，也不交失败主体或重发。

## 计量与校准

planned 表示同次固定的实际线上输入已满足全部适用限制，不能以布尔标记认证来源。缺有限 cap、计量不可用、超限按原优先级及子值拒绝；等于 cap 允许。严格解码图片字节、完整序列化 UTF-8 与所有输入贡献，引用声明 bytes 不充当核实值。

exact、upperBound 和 estimated 保持真实含义；tokenMargin 恰含显式 multiplier 与 reserveTokens，无默认。multiplier 是有限且 ≥1 的十进制数，reserveTokens 是 ≥0 的整数。完整 cap/上游事实校验之后、实际计量之前校验政策；缺席或非法为 invalidInput{malformed}。estimatedTokens 是非负整数，admissionTokens = ceil(estimatedTokens × multiplier) + reserveTokens，按精确十进制向上取整，对最终预测只施加一次。估算分支用 admissionTokens 对每个适用有限 token 限制判断；exact/upperBound 不追加估算余量，但公开计量输入仍须显式提供 tokenMargin。上界超限而实际不知不能称准确超限，估计不成为实际 usage。规划输入、计量依据、工具配对或禁止内部消息不合承诺均零新锚点、HTTP、响应或终结。

增量校准只复用当前真实请求与已授权同日志完整前缀中的真实因果祖先或同调用重试观察，选择本次实际因果链上最新已确认且适用的观察；不用物理到达顺序、ResponseId 排序、旧预测或旧缓存结论冒充依据。核对完整选择、原始 witness、计量版本、前缀与输出归属；可判矛盾为 malformed，来源/派生/实际选择真实性不可核为 unavailable，不能 full 掩盖；已证合法而贡献映射不足才可全量，仍不足 input_size_unavailable。来源原因按 source_unavailable、no_observation、prefix_changed、basis_changed 排首个适用者；CompactionMessage 是核查触发，实际最终非新增输入相等才是守卫。

复用已确认 P，只计新增 φ/δ，不 tokenize 已验证全前缀，不重复计 O/reasoning，完整 byte/图数检查仍覆盖全请求。计量兼容需固定版本提供者给出范围、相等语义与实际适用证据，caller布尔不充分；非法或不可得贡献转全量而非零。两项 exact 合成 exact；只含 exact/upperBound 且至少一个 upperBound 合成 upperBound；任一 estimated 合成 estimated。部分输出组无逐块准确依据不得分配成精确值。新准确观察替代派生预测，不追改历史；缺新观察可用仍合法的更早因果祖先，但未覆盖全部输入纳入新增。缓存配置不证明上游命中，零、未知与正数分开。显式 mode、回退原因、basis/precision/贡献等是规划语义，不另造线上DTO；重锚及终止只在合法来源、实际处理与稳定后继等已声明前提下承诺，不成为无条件进展或estimated不越窗保证。

## 响应、费用与整批结算

每次已锚定发出有唯一稳定 ResponseId，费用按该身份唯一结算，失败历史各保留自己的账。实际供应商、请求供应商、用量与金额、原始头、实际发送时刻、首内容事实与参数三项各沿真实来源；未知不是零，sentAt:null 只供锚点恢复投影，不证明零发送、零费用或可重试。分类先看首内容，再看来源和显式状态表；不以本地错误猜上游状态。取消不是故障，不进失败拓展维度。

有回复先耐久 ready，再交完整 PendingModelResponse 给合法处分者；failed 或无回复 interrupted 必须完整响应已提交或合法认回后才成功返回。persisted 的消息与最终响应同一完整批；vetoed/consumed 由 settleReply 写最终响应，不写消息。同一处置认回原结果，不同合法处置 alreadyEnded；首个合法完整批获胜，不能换 ID、补残批或覆盖原值。首次合法消息派生须有真实转换/权限来源，不借放宽语义比较修改原回复。

Run 结算由同一份合法完整稠密前缀共同给事实和尾：原 attempt 已被替代或原 Run 已终结才 late。Run 终结必须由真实 owner 解释，model_call_ended 不代表 Run 终结。整批 unfenced/tailEquals 对全日志不可插入地检查键、尾并提交；批内不加入改变该 late 判据的新边界。无 Run 沿原 unfenced/unconditional，仍守身份、完整批和未知义务。其他记录显式采用其原 fence/condition；opened/ready 也必须以真实同前缀、当前原执行资格核验后提交。

alreadyRecorded 只表明本次零写与键碰撞；认回需确认完整原批的身份、所有成员、关联与原值。tailChanged 只证明本次零写；重构只更新尚未提交批的 late，保留 ID、参数、绑定、处置、收场和已知账，不重发或重跑模型规划。原追加未知时，即使新返回零写/拒绝也不能关闭旧责任；旧网络、门回调和全部可能迟到的 unfenced 写方须实际停止，再权威读取。

条件争用由具名可替换的显式策略管理读取、重构、重交和有限预算；不借模型重试策略填默认。耗尽、取消或源不可用返回原未完成结果，保留锚点、稳定批和原恢复责任，不虚构已结算或可重发。进展依赖真实提交机会、有效源、工作处理及预算，公平调度不保证无界成功。

## 中断、停止与恢复

interrupt 只作用于指定调用，先耐久意图再通知实际执行方，意图已写即可返回当前阶段，不等结算；意图写不进不发 abort。重复意图不另写；既定收场先到者保留。user/run_cancelled 在本操作只表达用户叫停；系统归档/宿主停止由原执行 owner 停止，在途装配 abandon，无回复，以 run_cancelled 收场，不冒称用户回复。

releaseCall 只从 awaiting_decision/resumable 放手，上交不是失败重试、ACK 或引用释放。真实宿主独立于等待/观察消费者持有网络、内容门、写任务及实现引用；登记与停止有共同寿命，不漏刚登记调用。请求停止、实际停止、结算及物理资源释放分开；消费者退出、Map 清空、函数 outcome、取消确认或 fence 均不证明旧效果不能迟到。

每次 reconcile 在原输入校验与停止检查之后，先由本次固定主体的 RuntimeRecoveryAccess.authorize 核当前读取/恢复准入。拒绝或不可判返回 unavailable，不读取、清理或触碰原 entry/scope；等待授权期间关闭后，也不登记新工作。许可不缓存为长期资格，也不证明旧写者停止或唯一恢复范围。即使认回原 entry，新调用也不能借其 entered/scope 跳过当前资格。原工作和解释来源继续归原拥有者。

reconcile 只读依次认回 final、ready、调用终结及 live 原状态；live 不取消、不要求先停止、不阻塞新 attempt 的只读对账。仅需实际追补的分支要求旧效果全停及唯一恢复资格，使用同日志完整前缀和稳定原批，不发请求、不加载旧适配替代事实、不返回部分成功。中断意图优先；无意图且已 dispatched 未 opened 的 runtime_lost 可 resumable，同家续接；已 opened 的 runtime_lost 终结且不再发出。恢复保留旧绑定、参数、真实时刻、头及账；无法取得必要事实即 unavailable，原已提交批不回滚。

## 引用、ACK 与释放

每次 acquireCall 都须当前 action=read；取得等待或观察资源另须 action=wait。read 不创建等待消费者；wait 创建独立可释放消费者。它只等已确认 ready/final，并复制合法可见值；待机句柄不持有大内容读取 pin。consumer.release 幂等地结束该消费者及其监听、缓冲；单次 wait 的 abort 只终止该次等待，consumer 仍可再次等待。两者不取消模型、不处分回复、不自动 ACK。引用数零不关闭原执行、不抹已发生费用。normal keyed lookup 不扫描全部历史；索引仅是同来源、generation、progress 校验的派生物，重建未追尾时 unavailable，不能用索引替代完整前缀结算。readAttempts 的成本允许随所返回历史增长。

acknowledgeCall 只针对实际终态及精确最终 ResponseId 或 ended 目标，由当前 ACK 权限的消费者表示已处理或自行保存。读、等待、旧引用或取消权限不授予 ACK；不是每次失败发出的 ACK。准备不可变原批并在同一持久 retention 控制对象停止新的模型侧大内容读取，Session Log 中的 ACK 事实耐久后才确认。cleanup 失败是已确认 ACK 的 pending，不抹 ACK。重复相同目标重验权限，返回原确认时刻及当前清理进展；不同目标 wrongPhase。

ACK 后所有公共读取返回小视图：原创建关联、真实终态、原发出账壳、完整小账序列及当前处分。完整档案/参数、输入/回复/delivered、原始响应与校准大对象不能经缓存或 consumer 重泄露；已进入的实际授权复制可完成。成功释放须在同一 Storage 提交内确认 ACK、真实 writer/read 已排空、外部持有已释放，并删除精确内容及记录 released；ACK 日志追加与内容保留/清理分别提交，即使共用同一 SQL 存储也不构成同一提交。当前障碍列真实非空无重复 pendingReasons，未知控制需认回；清缓存/监听/队列与物理释放不是靠 GC 时间推断。公平机会、存储恢复和真实引用排空后自动推进，不要求调用者回来、Run 终结或第二次 ACK。

ACK 后未 final 的 settleReply 必须取得调用者保留的完整原 PendingModelResponse；当前 settle 资格及来源先核验；已 ACK、无 final 且缺 retainedResult 返回 wrongPhase。已给值的表示、身份或摘要可判矛盾返回 invalidInput{malformed}，资格或来源不可核返回 unavailable。已有 final 先沿原相同处分认回/不同合法处分 alreadyEnded，不要求 retainedResult。验证原身份、ResponseId、dispatch、来源、完整语义摘要及小账 witness，不重新读取已删除输入/适配。首次可能写入前持久 stage 完整整批及稳定键；未知保留 stage/写责任。只有 final 确认且全部旧写方实际停止，或已证明零写且显式策略终止，才删除 stage。不得复活 ready 或改 cleanup 阶段，不要求第二次 ACK；已有 final 按原重复规则，不要求大内容。persisted 外部写方承担相同义务。

## 独立执行、传输与装配端口

invokeModel 单次独立发出，无隐藏 Session、目录、存储、租户授权或业务结算依赖。基本输入先校验；send 前的取消返回 cancelledBeforeSend、零 send，无 invocation result/timing；send 已开始后的取消属于原四值终局。每句柄仅一最终结果，取消/拒绝先到的终局不被迟到工作改写。abort 是请求，实际停止仍需观察真实执行任务。

snapshot 与增量共享同一接受序列和位置，首内容门成功至多一次且先于所有可见读面。门失败本地 unrecognized，无未许可内容；门等待时取消，迟到成功不能重新交出。函数首内容时刻不等于日志 opened，服务面须以自己耐久事实决定结算。

plan 不联网、取凭据或读持久源，固定输入、精确实现与计量依据给同一结果。send 消费同一已认证固定 planned 值，至多一上游请求，禁止隐藏重试、fallback、重定向和环境凭据回退。read 只读同次响应，不二次发送或竞争读取，不逆转写模型工具名，工具参数只在流装配解析。显式 read 最终事实交接实际执行方、usage/cost 和 observedInput；分项不完整但总量已知时保留 upstream_total，不从不透明响应、诊断或附件另拼事实。

send 是 rawHeaders 唯一交接权威，自有不可变原值在后续读失败、取消或门失败中保留；不排序、拼接、取首、去重、去空白或补空对象。不向 snapshot/增量/诊断 detail 交头。未知实报供应商不能以请求值代填，缓存零与未知分开。凭据写入/留存/错误诊断前脱敏：适用完整值、片段阈值、头名和模式规则，附件不得绕过；凭据原值只交真实发送适配，不绑定到调用或外传内部身份。

一次会话/目标/dispatch 一份串行装配状态，收场后迟到事件不进入下一次发出。拒收增量紧接报告 rejected trim，先截短再拒收只计拒收一次；自身 trim/finish 失败及收场后事件不再写回响应，只留可关联工程诊断。正常/用户停止/lost/系统 abandon 分支、零 trims 缺席、模型工具名原样进出、快照/增量位置和首内容门沿既有装配契约。

观察端口在交付前核对同会话目标，按实际表示字节和显式正事件/字节界限缓冲；缺限不默认无限。满缓冲或接收故障独立拒收，业务结算继续；accepted 不表示人已读或日志耐久，不承诺恰一次或可靠重放。端口关闭清监听和本端缓冲，迟到拒收不复活调用。

诊断不能成为耐久事实、恢复真相或费用来源；必须区分准入、规划、版本、排队/触达、门、取消请求/实际停止、结算/恢复、观察拒收及诊断出口缺口。只采显式关联，不造租户/Session；敏感正文和凭据默认不采，高基数原文不作指标标签。诊断失败不改变业务结果或抹已知事实，耐久记录失败仍阻止对应可见动作。

## 独立计算与辅助投影

八个原独立计算入口的语义分别是：classifyCause 的来源优先分类；redact 的显式凭据政策；legalTargets/displayList/effectiveModel 的同名胜者与来源；dispatchGuard 的唯一守卫；decideRetry 的完整失败主体重试决定；retryDelay 的精确等待值。它们不自行取得授权或发出，并保持原未知/非法输入拒绝。

默认重试能力身份为 omne-official:default-retry，不因类名或注册位置变更。重试主体中的完整 retryConclusions 沿同调用权威历史构造，保留未发出、自定义件及跨尝试关联，不由发出次数或内存隐藏计数猜。只对 upstream_unavailable/unrecognized 考虑重试；允许回退按原供应商序列取最近一次实际供应商的下一家、各家至多一次，无下一家 observed；不允许回退给第一家至多一次额外重试。第 n 次重试按本件既有结论数 h+1，runtime_lost 同家续接不经过本件、不占其名额。重试只选择原许可供应商，不换模型；默认件有限试尽，自定义策略终止性不由默认件代保证。缺默认件沿runner既有指定挂件处置，不自动再发；默认退避初值归配置，runtime不代loop计时。

retryDelay 不调度或随机采样。n 为严格正整数，factor 为有限且不小于 1 的数。base/max 为有限非负 TD3 Duration。
uniformSample 为有限数，满足 0 ≤ u < 1。未知 kind/jitter、缺项或额外字段均非法。
Duration 与 JsonNumber 使用公开精确值语义，不能先转成毫秒浮点数再计算。

令 D=min(max,B)，constant 的 B=base，linear 的 B=base×n，exponential 的 B=base×factor^(n−1)；none 为 D，full 为 uD，half 为 D/2+uD/2。decorrelated 另用 lo=min(base,max)、hi=min(max,max(lo,previousDelay×factor))，返回 lo+u(hi−lo)，首次 previousDelay 显式为 base。保持精确数值，不隐式离散化；非法/缺项按原 malformed 拒绝。

以下公共辅助入口不授予领域权限，也不提交其返回的事实：

| 入口                                                                                                                                                                          | 类型之外的行为                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| captureSelectionJson、copyPlanContentBlocks、copyPlanMessages、copyPlanOutputHistory                                                                                          | 按当前公开表示取得自有值，保持精确数值、序列及真实关联；不能把复制成功当来源/授权证明。outputHistory 的源/选择/块/见证关系不得被复制绕过。                                                                 |
| encodeModelLogKey、decodeModelLogKey、modelLogJsonEqual                                                                                                                       | 保持当前 codec 的稳定身份/读写键关系及语义相等；相同逻辑写方不能加 owner 前缀绕开共同判重，不能把 dedupeKey 自动当 readKey。                                                                               |
| captureModelLogValue、recognizeMessageValue、prepareModelLogEntry、inspectModelLogEntry、inspectSettlementMembers、inspectCurrentModelLogPrefix、reconstructAdaptedParameters | 只解释当前精确格式、原关联及完整成员，拒绝未知/不兼容值、部分碰撞、参数三项矛盾及非法原批；不读 IO、不认定实际提交、不创造旧格式兼容。                                                                     |
| readSettlementPrefix、isOwnedSettlementPrefix、settlementGenerationCurrent                                                                                                    | 读取必须登记真实任务并验证读取前后 generation、同租户稠密完整前缀及同尾，再铸造不可自行构造的 OwnedPrefix；brand/current 检查不是授权，持有 prefix 不证明之后仍可提交。                                    |
| interpretRunAtPrefix、interpretSettlementPrefix、interpretCallHistory                                                                                                         | 消费该 owned 完整前缀及显式真实 Run 来源，核对原 attempt/同日志关联和完整原批；不以诊断、局部索引或独立布尔代替 Run 终结事实。                                                                             |
| rejectAcknowledgedHistory、acknowledgedAsTerminal、projectCallState                                                                                                           | ACK 不能被假装成未 ACK 大视图；控制面可取其真实终态，缺小视图的投影须拒绝。耐久事实优先于本地未确认责任，本地 open/reply_pending 不授权重试。                                                              |
| constructAssistantReply、constructPendingModelResponse、constructModelResponse、constructAnchoredInterruption                                                                 | 只以真实原 dispatched/opened、实际结果、原参数三项及合法处分构造值；Pending 不预填处分/late，系统停止不造用户回复；锚点恢复用真实时刻或 null、已知账原样及未知缺项，不假造发送。构造成功不等于日志已提交。 |
| originOfEntry、attemptFromFinal、attemptFromWitness、acknowledgedAttempts、acknowledgedFactsFromHistory、acknowledgementSummary、completeAcknowledgedView                     | 从合法已验证原关联/最终响应/witness构造小账视图，冲突在来源优先之前拒绝，保持 failed 历史、原账壳、未知账及原 ACK 时间；不恢复被释放的大内容。                                                             |
| createCredentialRedactionPolicy、CredentialRedactionConfigurationError、policyKind、policyJitter                                                                              | 校验显式政策，不静默默认未知枚举；创建脱敏政策不授予内容权限。公开部署初值不替代必需当前输入或业务政策。                                                                                                   |

## 正式集成定义与停止边界

纯协议 `ModelRuntimeOperations` 与 `./cordis` 的 `ModelRuntimeService` 分面，键只从类的静态 provide 导出。dispatch、dispatchAgain、readAttempts 的普通调用与 consumeFailure 调用是不同完整重载，包装不丢失同一授权读取产生的 source。source 校验实际执行及当前资格，release 只交还其消费引用，不伪造耐久失败事实。

`ModelRuntimeHostInputOperations.capture()` 是同步、无业务输入的受信集成接缝。它保留本次调用 fiber 的真实主体、原宿主桥及各来源代际；capture 始终返回完整的端口组合；仅不可取得的对应来源端口返回失败，其他可用端口继续工作。未知主体不能取得需要其资格的来源，不抛业务异常、不改用 provider 特权或后继桥。停止新准入不统一拒绝原来源仍可支持的读取、处分或 ACK。每次具体操作仍在原使用点重新核验资格。桥租约 isCurrent 只约束新准入，旧结算/读取/ACK 仍保留原来源责任；release 幂等地交还借用，不取消执行、写 ACK 或证明底层停止。

执行支持的显式政策、调度、清理与诊断从各真实拥有者借用。policy.diagnostic 与 support 的顶层 diagnostic 保持各自既有回调承诺；可选 collector 只消费 emitter，不取得 journal/query/export 权。单一执行池与在途资源的实际实现、撤除和恢复沿提供者的未迁投影继续验证。定义类存在不表示提供者已正式集成，也不表示完整 Session/Run 恢复来源已交付。

## 验证与采用范围

公共操作、共享端口、独立计算及公开辅助投影的现行行为归本页与公开类型。各方法定位如下；公共类型拥有闭合结果，操作不统一为一种失败。

| 操作                                                   | 本页行为                                            |
| ------------------------------------------------------ | --------------------------------------------------- |
| legalTargets、displayList、effectiveModel、selectModel | 模型选择与当前输入、真实授权和失败次序              |
| openCall                                               | 调用身份/绑定、创建与发出、引用/ACK 后同键认回      |
| dispatch、dispatchAgain、canDispatchAgain              | 发出守卫、完整当前输入、失败主体与重试、停止准入    |
| interrupt、releaseCall                                 | 中断、停止与恢复；上交不等于 ACK 或引用释放         |
| reconcile、readAttempts                                | 原事实/完整前缀、真实恢复、历史/小账与失败消费      |
| acquireCall                                            | 当前读取权、read/wait 双寿命、引用与可见结果        |
| settleReply、acknowledgeCall                           | 响应处分/整批结算、ACK/释放及 retainedResult 的条件 |

[验证资源](verification/README.md)维护性质、模型规模/公平性、正负控与实际组合义务；运行结果留任务 tmp。现行公共定义不再由冻结 RT12 充当第二权威。
[精确保留范围](../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)仍约束未迁的具体提供者投影、跨拥有者兑现及综合模型，不因公共接口移动而关闭。

## 独立结算协议

本包拥有`SettlementCoordinator`、`SettlementHandle`、`SettlementRequest`、
`SettlementStagedBatch`和`SettlementStaging`。这些共享形状接续原整批结算行为。
它们不选择具体工厂、队列、存储或竞争政策，不授予模型发出、日志写权或ACK资格。
具体提供者的构造输入仍由该提供者维护，应用负责选择并绑定实际资源和显式政策。

`SettlementCoordinatorBinding`携带本次原日志binding、真实settlement owner及可选Run解释器。
`SettlementCoordinatorFactory.create`接该绑定，返回一个承担下述整批结算和关闭责任的coordinator。
应用选择实际工厂并绑定原contention、scheduler及diagnostic；Session消费者不选择具体邻包实现。
构造错误保持原异常，不返回成功占位；构造失败不向调用者转移未返回的coordinator责任。
构造不写业务日志、不发模型请求、不发ACK，也不能恢复已失效的日志或owner。
缺Run解释器阻止新的withRun结算，但不阻止原批次认回。

`./cordis`以`SettlementCoordinatorFactoryService`／`modelSettlementFactory`承载该构造协议，只供可信协调域。
原binding、owner、函数和策略端口不进入JSON配置或普通Session Agent Context。
依赖撤除停止新构造和驱动，已借coordinator仍保留原资源及策略依赖，直到真实close完成。
撤除不允许释放未明责任、换新工厂重发或关闭借入的物理模型池。
抽象工厂存在不表示实际桥、权限来源或撤除收场已实现。

物理ModelRuntime发布reply_ready后可经原finishReady关闭SDK invocation的结算入口。
消费者不得从captured invocation存在推断还能调用settleReply；此时沿独立coordinator协议结算原批。
工厂必须借入真实有效的原owner；捕获副本寿命不等于结算权限或CallPresence临界区。

settle在异步工作前捕获原target、current及完整response。
返回句柄分别提供completion、requestStop和stopped。公开结果、停止请求与实际停止不是同一事实。
staging存在时，hold须在原批可写入前可靠保存精确entries和append condition。
hold只在初次提交前或此前写入已证明为零后调用；旧收据不明时不能覆盖原批。
缺staging保持原模型侧的pre-ACK保管，不自动补一个成功保管端口。

未知append即使句柄已经停止，仍保有原registration和精确批次。
同target后继settle只经同source完整前缀认回原句柄，不自行再写。
确认完整原批则认回；证明未写则释放原责任并返回write_unknown，之后才可另行提交。
close先撤新准入、请求停止并主动核实保留的未知原件。
全部原任务实际停止且registration释放后才成功；失败保留原拥有者及资源，供后续原close接续。
消费者不得凭completion、缺记录或close请求清空责任、释放资源、替换原件或重发。

类型归位只改变定义拥有者，不改变原算法、操作身份、失败结果或已接受的生命周期义务。

## 物理拥有者的执行来源

`ModelRuntimeExecutionSource` 只交给物理运行时的受信装配拥有者。
业务 host、十五操作及其结果、普通调用方 Context 和 JSON 配置不得取得它。
原 `ModelCallHost.register(close)` 保持。readonly/freeze 不撤销能力权限。

metadata 固定原 key、Session binding、settlement owner、executionGeneration 和当次 registered/released/copyReleased。
它不携 container、invocation、request、pending、parameters 或 result。
共享 binding/owner 仍是内部能力，但不得保有每次调用的私有大副本。
`registered` 表示原 store 仍认该容器，`released` 表示实际停止并释放，`copyReleased` 表示 ACK 后模型侧私有副本已解除。
消费者另核 tenant/Session/log/owner、未知 writer 和逐使用点当前资格。
空观察、含糊来源、release 请求都不能证明停止。

生产者在实际容器接受的同步边界保有原引用，覆盖正常创建和恢复重建。
业务最终返回失败不能删除已经产生的执行责任。各物理代际不得相互覆盖。
非 ACK stop/remove 仍保有原执行能力；真实 ACK 确认后封闭该 key 的新原句柄捕获。
已借用 frame 是实际外持责任。原停止、原 binding 对照及全部旧借用释放后才解除大副本，留下原代际的小见证。
Storage cleanup=released 不能先于模型侧副本解除。耐久 released 认回仍须检查本进程的私有引用。

| 操作            | 输入与前提                                   | 成功                                                 | 状态/效应                        | 失败                                                                                           | 并发/取消                                               | 身份/授权                                                           | 生命周期                                              | 验证                                |
| --------------- | -------------------------------------------- | ---------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| lookup          | 原 CallKey、可选原代际；可信 source          | 唯一代 metadata                                      | 不读耐久源、不关闭句柄           | 缺失、代际碰撞、多 registered，或无 registered/无指定代且多 retired 为 unknown；原读取异常传播 | 同步，不保证未来状态                                    | 显式代选唯一；否则优先唯一 registered，再唯一记录；不授予业务访问权 | source release 后 unknown                             | 两代、碰撞、错误代、小见证          |
| snapshot        | 原 SessionRef；可信 source                   | 全部原代 metadata                                    | 不形成借用 pin                   | 原读取异常传播；空不是停止证据                                                                 | 同步；full record 一次原 view，小见证直接投影已确认事实 | Session 筛选；另核资格                                              | runtime close 不清；source release 后空               | 双 Session、大引用 GC               |
| capture         | 原 SessionRef；source 未释放                 | capture.executions 当次不可变数组，可含原 invocation | 完整分配后登记 frame/原记录 pin  | source 已释放为 unavailable；读取/分配异常传播且不留 pin                                       | 同步；ACK seal 后仅 metadata，不新 pin 私有副本         | 仅可信拥有者；非 ACK 移除后仍可借用原句柄                           | frame 不含之后新代际/晚附加，另借用认回               | 暖恢复、晚附加、ACK 同时借用        |
| capture.release | 拥有者已清自己逃逸的原数组/句柄/Map          | void，幂等                                           | 清 frame 自身数组/记录引用和 pin | 不新增业务错误                                                                                 | 同步，不等停止/GC；原政策负责后续 ACK 进展              | 不撤销外部原能力或已发生效果                                        | 之后 executions=[]                                    | idle frame GC、前置失败             |
| source.release  | 整体 close 已真实确认，所有 frame 已 release | released，清来源索引                                 | 不取消/写 ACK                    | 任一前提未满足为 unavailable，记录保持                                                         | 同步幂等                                                | 只有工厂拥有者；不是外部释放证明                                    | 之后 capture unavailable、lookup unknown、snapshot 空 | pending close、活动或空 frame、重试 |

capture 中的借用登记不要求物理 registered=true。ACK 封捕获但尚未擦除时，新 capture 只含 metadata，不取得原 invocation。
ACK 擦除后小见证仍是原 binding/owner/代际，registered=false、released=true、copyReleased=true。
释放 frame 不能撤销已逃逸值；受信消费者必须配对其自身所有引用。
验证须保持原 GC 门，并检查 request/pending/invocation 和 shared binding/owner 的真实 holder。
有限模型不替代 GC、真实 IO、授权或事务验收。

## 日志拥有者与原件

模型事实使用 Session Log 的显式 fact 封装：owner=model-request-runtime，version=mrr/3，value 为 category 与原 value。category 仅 record 或 response。Message 使用 messages 拥有者的 version=9 消息封装，不复制一个模型专用 Message 正文格式。

codec 接受合法的其他拥有者消息键；消息身份、日志 shell 和原回复关联仍须验证。任一 dedupeKey 或 readKey 声明 mrr 命名空间时，必须符合模型拥有的完整键约束，不能借通用消息形状绕过模型事实校验。旧匿名 model wrapper 不再作为当前有效封装读取。

attempt 开始由 Session 事实拥有者记录，不是模型消息。事件不得转换为 SystemReminderMessage。响应原件与持久回复按原完整关联校验；投影只能生成派生视图，不能改原 ModelResponse 或用可读子集冒充原完整回复。

`inspectModelMessageEntry` 只校验单条消息的正文、shell 与拥有者键，成本与该条目的大小成正比。它不读取或认证历史，不证明 tool return、compaction 或 assistant 的原关联成立。调用者必须另核完整历史关联；生产投影用其一次线性索引履行该义务。`inspectModelLogEntry` 与准备写入入口仍要求完整合法的 messagePrefix，不能用此窄入口放行写入。

完整结算前缀通过显式 `SettlementLogBinding.readPrefix` 取得，并核对其 SourceToken 的租户、会话、journal、generation 和尾。缺少该读取端口时返回 dependency unavailable，不降级到不含持久来源坐标的 `readSince`。品牌只表示通过完整前缀校验，不授予当前权限或恢复资格。

`createModelLogReadInspector` 是纯只读辅助函数。它拥有并校验一次完整固定前缀，返回不可变条目和同一快照上的结算检查闭包。调用者后来替换输入、追加日志或改变当前权限，不改变这份快照。闭包保持原响应、锚点、身份、正文和结算冲突检查；它不接收写入候选，不取得新日志尾部，不缓存授权或持有资源租约。原单次 `inspectSettlementMembers` 入口保持完整前缀检查。快照不证明物理提交、来源资格或当前可访问性，调用者仍在各使用点核验这些条件。

一次完整读取中检查多个模型结算，应复用这份校验结果。原响应关联使用唯一性索引；重复响应仍拒绝，不以最后一个值覆盖冲突。该辅助函数不提供跨回合缓存，也不替代 Session 拥有的模型消息投影缓存。构造、各结算关联和输出字节的成本分别计量，不能把复用一次前缀校验表述为全部路径已达到线性复杂度。

## 原发起窄协议

OriginalIssueOwner的共享prepareOriginal／participant／admission／consumeOriginal／close形状归本包。
具体拥有者的Storage／LogAuthority／limit构造与持久承载仍归实际提供者。
可信根选择原owner并给Session驱动借入；Session不能从具体Model提供者私有类型推断其消费协议。
prepareOriginal只固定原ticket，不授IO；Session桥必须使用原participant参加自己的同Unit，
不能改走owner.admitOriginal的独立提交来绕过Session栅栏。
close只撤原发起拥有者，released不证明物理ModelRuntime或远端请求已经停止；pending保原身份与责任。

OriginalIssueParticipant 暂存原 dispatched 事实和唯一执行 claim，必须参加调用者的同一 StorageUnit，不独立提交、不先发送模型请求。ticket 与 claim 仅由实际原拥有者签发；复制形状或取得 ticket 都不授予当前权限。

stageOriginalIn 核同存储实例、完整固定 source、原消费位置、call／dispatch 身份、Session shell、当前授权和栅栏。原 dispatched 与唯一 claim 全提交或全回滚。重复只认回原完整等值证明，不授予第二次发起权；异原位置或正文冲突明确拒绝。

原发起核验固定租户、调用归属和原执行资格，不另要求独立模型许可或新的登录／成员资格。模型登记与当前装配模态由ModelRuntime的原调用路径核验。当前授权接缝保护原调用身份及执行一致性，不定义额外模型使用政策。另一并发调用不得改写原归属。Session内已有Run不因登录自然到期停止，新Run仍须确认登录有效。

consumeOriginal 必须等待外层提交完成，并在同一存储范围重新核当前授权。只准原执行代际消费一次；并发消费不能启动两次。回滚、unknown、撤权或原批次未确认均不返回 launch。提交未知时保留原身份与完整批次，认回也不能将只读证明转成第二个启动权。

dispatched 表示原发起锚点，不表示收到模型内容。opened 继续由模型实际执行拥有者在首个内容到达后、发布 FirstContent 之前记录，并携 firstTokenAt。参加协议不得提前伪造 opened、首 token 或实际发送完成。

本协议不负责 Session 的完整 Run 调度，也不替代原模型恢复续发守卫、实际 HTTP drain、完整结果保管与 acknowledge。原 claim 的本地操作结束不证明外部模型执行或远端事务已经停止。

## 账来源与独立内容保留

同一 ResponseId 的所选原账按 final > ACK 原账 witness > ready 唯一选择；先核所有存在来源的身份、关联和原值一致性，再应用优先级。合法 ACK 后不强求已释放全文，仍核小锚点与原账；来源不可读或当前权／真实性无法核验为 unavailable。后到 final 只替代阶段，不新增费用，原失败 dispatch 仍各自结算。

内容释放只解除本调用自有清单或保留权，不删除其他调用、外部拥有者仍保留的内容，不改变 consumer 已自行保存的副本。共享同一外部内容不授予跨调用释放权限。

## 请求内图片字节

PlanExecutionContext.imageBytes 是可选的请求内执行依赖。调用者先完成原附件权限检查和有界读取，再提供原引用与固定字节的一一对应快照。它不授予 Session 或附件权限。plan 不通过此端口联网或读取持久源，原 IO 禁止不变。

适配器仅在 wire 投影中消费固定字节。PlannedSemantics.input 保留原经验证的 PlanInput，不能将展开后的消息作为新的原语义输入。不得伪造品牌计划绕过原输入相等检查。缺失、重复或取消的快照明确拒绝，不能以未知 locator 冒充已发送图片。未提供快照不承诺支持外部引用，原 inline 图片路径不变。

调用者拥有读取任务，必须等实际 IO 停止，不能只撤除等待。原附件的持久保有、原调用的访问句柄和逐使用点当前资格仍分别由各拥有者负责。快照只属于本次计划，不替代日志原件或模型内容保有证明。
