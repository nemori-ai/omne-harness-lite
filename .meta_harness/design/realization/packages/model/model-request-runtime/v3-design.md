# model-request-runtime v3 增量实现设计

本稿为 candidate，未接受；`packages/model/model-request-runtime` 尚未建包。下文插件、服务键、构件、存储列和配置名均为候选，契约已有操作名除外。原已接受 [design.md](design.md) 保留原 v2 坐标；本稿明确取代其函数结果、求值读取、绑定及退避投影，不把旧实现义务的运行结果重标成 v3。

## 输入、范围与实现路径

输入为 [capability.model-request-runtime/v3](../../../../spec/capabilities/model-request-runtime/v3/contract.md) S-1～S-67，候选输入 SHA-256 `9d73735d3c22033dd583f10f8c7ea61b5b6865769e25de652399a59e2949747a`；本摘要仅用于核对本稿输入，不表示冻结。采用依据为[适配提案 revision 2](../../../../record/proposals/model-request-adaptation/design.md)、[当前求值输入补充裁定](../../../../record/proposals/model-request-adaptation/read-projection.md#2026-09-27-实时输入补充裁定)，产品 rev 沿契约的 PF-013 rev 13、PF-009 rev 8、PF-012 rev 15。当前提供者与整条交付仍待独立评审及接受。

交付前已核 [catalog](../../../../registry/catalog.json)：model-profile3、messages4、model-response4、model-profile-directory3 已由 [D-070](../../../../record/decisions/model-adaptation-binding-acceptance/decision.md) 接受；agent-definition1 由 [D-072](../../../../record/decisions/agent-definition-read-adoption/decision.md) 接受；asset-evaluation4、assembly-manifest3、asset-registry3、loop-extension4 由 [D-073](../../../../record/decisions/model-current-input-contracts-adoption/decision.md) 接受。runtime3与runner3仍为candidate。runtime3已显式消费LC4与session-tenancy2，不再以assembly-manifest3为当前设置依赖。R3-G1保留候选接受与实施接续义务；已接受依赖不接受本节点，不回退LC3，也不以删掉adaptation迁就旧输入。

保留两个插件：P-2 提供 `modelRuntime` 十三个操作；P-5 向 runner 登记系统默认重试实现。一次调用仍是显式宿主拥有的资源，不是一条重载即重发的 fiber。公共函数、纯判定及状态归约公开可单取；P-2 消费同一 `invokeModel`，没有第二套网络发出循环。传输由 [pi-ai-transport v3 候选](../pi-ai-transport/v3-design.md)提供，沿 D-019 的 pi 0.86.1 定向 fork 比较门；本节点不再复制家族/模型映射、SSE、缓存或费用解析。

Cordis 采用 **4.0.4**（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）。存储消费独立协议，不在本节点选数据库；会话日志由 [session-log-jsonl](../../session/session-log-jsonl/design.md)实现确认即持久的追加，缓存消费 [core/storage](../../core/storage/design.md)。系统计时戳来自 [infra/clock](../../infra/clock/README.md)，等待/截止调度另显式注入可替换构件，不把 `clock.now` 当成已有 timer API。

## 契约到 Cordis 的投影

下表是责任落点，不复述各操作的九件事；“兑现点”均为待实现方案。

| 行／契约责任 | 插件、服务或公开操作 | 实现及精确采用 | 符合性依据或缺口 |
|---|---|---|---|
| R3-P1：S-5～S-8、S-28、S-53 | P-2 `openCall`；调用资源容器 | profile3/messages4；新调用读真实目录、解析工具、取得精确 lease 后准入；续接读已出门绑定 | 无 latest 回退，配置完整无损复制；R3-V1、V2；注册/宿主真实机制 R3-G3 |
| R3-P2：S-9～S-14、S-24～S-27、S-66 | P-2 选择面；公开 `effectiveModel`/`legalTargets`/`displayList` 纯判定；AE4 `evaluate` | session-tenancy2 → 真实输入provider（OG2参与核当前资格/权限，捕获standing作配方）→ AE4；目录3及模态投影2；selectModel 写真实切换记录 | 当前核权与来源一致性归输入provider，runtime缺依赖零发出；历史manifest不作当前值；R3-V3、V4；R3-G2 |
| R3-P3：S-15、S-21、S-29/S-30、S-54/S-57 | P-2 发出协调器 → `invokeModel` → 同一规划的 send | 每次读取新时限/凭据，规划先定，messages4 已出门确认后才能 send | 发送与锚点规划一致、零发出分支不伪造历史；R3-V5、V6 |
| R3-P4：S-15/S-16、S-51、S-55/S-56 | `invokeModel` 的内容门、stream-assembly3、`snapshot`/`abort`；P-2锚点结果隔离 | 门前内容私有；门确认后才可见。opened结果未知或取消等待但append未停时，调用进入私有恢复隔离，函数投影不直接结算 | 内容持续为零；durable timing依权威opened，不能由函数firstTokenAt缺席反推；R3-V7、V8；R3-G8 |
| R3-P5：S-15～S-17、S-29、S-31～S-34、S-49/S-51 | P-2 单一结算构件、`interrupt`/`releaseCall`/`reconcile`/`settleReply`/`readAttempts` | messages4/response4/call-accounts2；未知锚点隔离所有普通结算，实际旧写者静止和有效fence后读真实日志，按S-33恢复 | ResponseId判重不能修复先写错的timing；R3-V7、V9～V12；共同对象L-1～L-7；R3-G8 |
| R3-P6：S-18～S-20、S-54/S-58/S-59 | 公开 `classifyCause`/`redact`；函数未结算结果投影 | response4 唯一成因/时序/用量/费用类型；传输交来源事实；凭据每次新取 | queued/已触达/未知三分，缓存零/未知分开；R3-V13、V14；状态码表来源门 R3-G5 |
| R3-P7：S-22、S-30、S-35、S-50/S-60/S-67 | 公开 `dispatchGuard`、`decideRetry`、`retryDelay`；P-5 贡献 | 本契约owner定义的 `{ category: loop_extension, name: "omne-official:default-retry" }`；runner3按该标识消费LC4完整失败主体，位于after_model_call且ending=failure | 同一守卫判只读/实际再发；仅retry或observed且受实际power约束；S-60显式sample/previousDelay；R3-V15；R3-G1 |
| R3-P8：S-36/S-39、S-53/S-61/S-64 | P-2 单个收口 effect；宿主显式登记；传输精确引用 | required 依赖替换触发停止；贡献版本登记不替换服务；实际停止/结算后释放 lease | Cordis 不负责取消、耐久或排空；R3-V16、V17；R3-G3/G4 |
| R3-P9：S-37/S-51/S-62 | 显式观察端口与有界投递队列 | 会话/目标先校验；实际字节和事件双限；只交已接受增量/位置 | 拒收不改业务收场、不无限等；R3-V18；端口提供者归验收装配 |
| R3-P10：S-20/S-63/S-66⑨ | 公共诊断采集构件；装配拥有 sink/query/metrics | 结构化阶段事实、脱敏与独立退化状态，sink 不随 P-2 fiber 生灭 | 不是恢复真相源；OS 权限及显式 tenant 过滤归装配；R3-V19、V20；R3-G6 |
| R3-P11：S-13/S-38 | P-2 增量模态投影缓存 | 当前日志尾＋持久派生水位，cache 不作权威 | 缓存失败重算，日志失败 unavailable；R3-V21；存储要求 R-1～R-3 |

## 公开函数面

候选包根入口导出 S-54～S-60 的 `invokeModel`、句柄类型、TransportAdapter、纯判定及可替换构件；`./plugin` 才依赖 Cordis。函数不读环境、目录、租户、会话或存储，不要求 LLM 基类。显式输入的静态传输资源归调用者；来自动态注册的实现由外包装先 acquire，至实际停止才 release。目标标记只用于本次装配，不铸本系统领域身份。

`invokeModel` 只返回 S-54 未结算 `ModelInvocationResult` 或发送前的具名外层结果；不造完整 ModelResponse/AssistantMessage，不带 call/ResponseId/profile/credentialScope/selectedBy/replyDisposition。P-2 在自己的结算路径补齐这些事实。发送前取消是 `{ cancelledBeforeSend: true }`，不是第五个 ResponseOutcome；已经写过耐久已出门的服务调用仍按自身锚点收口。

规划与锚点的交接由 P-2 私有、可测试的适配组合实现：先调用取得引用内的真实 `plan` 一次；保留不可变规划及对应输入；为本次 `invokeModel` 交一个同接口的 `plan` 构件，只对这份输入交回已定规划，send/read 仍为该引用的原构件。这个局部构件无网络、无目录读取、不重算策略；输入不符即明确失败。这样公共函数仍按自身契约 plan→send→read，而服务面不会在已出门之后重新计划。不是新的业务 API，R3-V5 必须核对真实 HTTP 字节与锚点还原参数。

重试纯算术直接实现 S-60 的有限关系，所有政策和 uniformSample 显式输入；P-5 的随机取样构件显式配置并可替换，纯函数不偷取 Math.random。候选 P-5 启动配置须完整提供策略；不从旧 v2 的 1000/2000/4000 ms 表继承缺省。P-5 不计时、不发送，等待责任归调用它的 runner 消费者；本批由真实验收应用承担这一消费，不宣称交付完整 Agent Loop。

### 默认重试贡献与 runner 消费

P-5 的能力身份由runtime3 S-67唯一拥有：`{ category: loop_extension, name: "omne-official:default-retry" }`。实现声明、登记及runner识别均使用这个值；声明name、CapabilityId.name和指认记录按LC4 S-7逐码点相等。runner消费owner定义，不从插件名、类名或链位置推导系统默认身份。声明固定 `position = after_model_call`、`dimension = { ending: failure }`，走 [runner3候选](../../agent-loop/loop-extension-runner/v3-design.md) 的真实失败链、完整失败主体、声明求值和结论记录路径；不得因识别为系统默认件而旁路runner。

`power`与`onError`仍由LC4 S-4～S-6声明/求值得到，本节点不补出厂值；`retry`是结论，`record`是报错策略，均不能填入Power。P-5只产生LC4 S-27的 `retry { plan }` 或 `observed`，runner仍按本次求得的power及LC4 S-20核结论是否合法。runner消费结论后由其调用者执行等待，再调用P-2 `dispatchAgain`；默认件和替换件都必须重新经过S-30真实守卫和S-66当前输入读取。身份相同不授予权限、不放宽守卫，缺必需声明/配置按既有配置政策收口。

## 依赖、版本与缺席政策

| 依赖／精确版本 | 解析与真实提供者 | 变化与失败责任 |
|---|---|---|
| 目录3、profile3 | required `modelCatalogRead`；目录 P-1 `singleProcessCatalog` 同存储读面 | 换代重跑 P-2；本次返回失败不偷换目录或按名字猜档案 |
| 目录3 S-20、credential-custodian2 | required `credentialLookup`；P-1r `localCredentialOnly`，真实本地保管方副本或显式 factory 取值 | 每次发出新取；缺凭据与端口 unavailable 分开，租户副本缺失不越级取factory。中心解值/复制协议不由此关闭 |
| session-log2 S-6～S-19 | required `sessionLog`；真实 session-log-jsonl；锚点用宿主交入的 fenced append，结算/对账用 unfenced | 读写失败按原失败集合；不答空、不假确认。既有事务/已开始追加按自身结果收场 |
| storage 协议、offer-expiry1 时间 | required `storage`、`clock`；实际存储和clock提供者 | 缓存写失败可重算；clock不可用不能补造时间戳；换代按S-36收口 |
| runtime3 S-53/S-57～S-59 | required `modelTransport`；pi-ai-transport候选 | 注册表内版本变化不重跑runtime；整个服务替换仍会；缺版本unavailable，绝不自动换版 |
| session-tenancy2 S-8 | 调用时 `resolveOptional` 取 `sessionTenancy.holdingTenant`；session-tenancy-table | 无记录或不可用即依赖操作unavailable；不接受调用方提供tenant作替代；换代不重跑全部调用 |
| runtime3 S-66 → AE4 → agent-definition1/asset-model3；OG2 S-26/S-63由输入provider消费 | 调用时取 `currentEvaluationInputs`；[evaluation-input-store](../../assets/evaluation-input-store/design.md) 的读取投影已由[D-074](../../../../record/decisions/model-read-provider-adoption/decision.md)采用，通过真实memberships参与面与配方/源同原子单元读；取得input后公开evaluate | 服务未装、当前核权失败/未知、当前源无效或evaluate失败均不可发；不接恒真授权回调或fixture兜底。采用不代替R3-G2真实组合 |
| asset-registry3 S-11/S-25 | 调用时取 `assetRegistry`；`packages/tools/asset-registry` | report三身份先核；有run取report快照，无run取session当前；不存在unknownTool，不可读取unavailable；不代算report |
| modality-projection2、stream-assembly3 | 公开纯函数import；传输转换登记按对应节点 | 单条流一个装配状态，拒收后trim与晚到诊断按S-51；不把CB/工具参数解析再实现一次 |
| messages4、response4、profile3、content-blocks3、tool-definition3、call-accounts2、arrival-events2、identity-values1、offer-expiry1 | core公开入口和精确保留Schema端口；构建锁图 | 不随默认导出自动升级未采用消费者；LC4已接受，runner3候选仍须独立接受，数据接受不代表运行组合通过 |
| P-5 → runner3 的实现登记面；runtime3 S-67 → LC4 S-7 | required `loopExtensionImplementations`；runner节点按owner定义识别默认件 | P-5重跑只重新登记自己；声明/标识/记录逐码点一致。P-2不inject runner；只读守卫不绕开实际再发复核 |
| 诊断输出、宿主、观察端口、调度构件 | 显式参数/配置，装配持有；无全局事件总线 | sink运行故障只降低覆盖；观察端口故障与业务结果分开；资源与配置缺席不补默认 |

不再取 `assemblyManifest.readEvaluation` 算当前模型锁或时限。manifest3仅历史读面，不是当前输入源。S-66来源端口以会话创建捕获standing及本机当前持有/配值/真实不可变根正文构造一致输入；runtime核返回tenant及纯求值结果，不自己拼接持有、资产版本或修补source。函数面允许调用者独立供应传输输入，不为P-2的耐久服务面提供任何假输入fallback。

当前授权与捕获配方是两个事实：输入provider每次用真实本机OG权威/已明确采用副本核成员当前有效性和内部调用权限；捕获effective不能替代此门。实际reader只交给可信装配，tenant参数本身不授权。当前角色变化不改写 `input.standing` 的创建时捕获值，也不逐请求向中心刷新角色。按输入节点已声明的D-042投影，`memberships.participate(unit).standing(tenant)` 与配方、当前持有/配值及资产版本在同一个真实AtomicStorage单元读，实际assertStorage拒绝另一实例；runtime不访问OG私有表、不重复实现资格判定。参与面异常传播到共同单元唯一终结边界，等实际回滚/排空后才在外层按已声明分类返回unavailable；不能在unit内吞异常再正常返回。该源相干性与授权责任归输入provider，R3-G2保留真实组合门。

## 当前输入、打开与再次发出

新调用先经真实 holdingTenant → currentEvaluationInputs.read → AE4 evaluate 得到 model 锁及 basis；合法集合仍按S-11，model不是额外过滤器。求值成功但无model是无锁；没有任何初选记录仍沿G-20不可用。验收装配用 `selectModel` 写真实初选，不直接插一条假日志、不取目录第一行。

`openCall` 消费刚才的basis及拓展件选择，不再次执行层级求值，也不发明 stale-basis 失败；当前目录仍按S-28取目标所在行。严格核run/attempt/report及工具lookup，在返回可发出状态前固定profile、完整adaptation、合并参数，并取得lease及宿主资源登记。任何异步准备返回后重核停止状态；未完成登记不得发布调用。部分失败只释放本次取得的资源，不撤销已经存在的别人调用。

每次 `dispatch`/`dispatchAgain` 先按同一S-66端口新取两个时限，缺失/非法/不一致/evaluate失败均保持原调用状态、零HTTP、零新锚点。该次求值中的model不改旧调用绑定。再取本次凭据、规划、写已出门、send；精确lease贯穿 awaiting_decision/resumable/reply_pending，不每发出重新acquire。

同进程每调用一个顺序协调器保护在途状态，不作为跨实例正确性依据。异步准备进入私有 reservation 以阻止同实例两个send；准备失败恢复原阶段，不能提前写durable dispatched。提交前、send前分别核停止/取消；跨实例通过日志fence及判重共同对象排序。写已出门成功后取消而零send也不抹锚点，按S-17/S-36结算。

续接使用新messages/tools/report重新规划，保留日志中的原profile、adaptation和参数。以已确认历史dispatched数量分支：零次模态拒绝才允许undispatched；已有发出的三种规划拒绝均为invalidInput，保留resumable/awaiting_decision，不写新response或ended；调用者可修正或release。无法读取历史数量是unavailable，不能猜零。凭据缺失仍按S-29已发出与否区分undispatched和released，不与规划拒绝混用。

## 首内容、结算与恢复

只有一条内容可见序列。read交到达事实后，首内容先进入取消可打断的门等待；snapshot、观察回调、最终blocks均不得读取门内尚未许可的数据。`beforeFirstContent` 用真实fenced append写opened，确认后再次核取消/停止，才推进stream-assembly可见位置。门失败或取消后的迟到成功不复活输出。独立函数仍按S-55返回本地unrecognized、before_first_content且无firstTokenAt，或取消时的interrupted投影；这只说明函数没有接受/交出首内容，**不证明opened未提交**。P-2不能把该投影直接变成耐久响应体。

### opened 提交结果未知的隔离与恢复

P-2在调用容器中持有真实opened追加任务及其生命周期，另外维护私有恢复隔离标记（候选内部字段，不增加S-6状态、操作或失败枚举）。追加返回unavailable、回执丢失，或者取消先结束门等待而真实append仍未结束，均先标隔离再处理函数结果。`Promise.race`胜出、AbortSignal发出或函数outcome结束，不等于旧append已停；即使函数可见内容永远为零，opened仍可能随后耐久。

| 控制点 | 实际责任及允许行为 | 不可据此推断 |
|---|---|---|
| Q-1：关闭普通结算和再发 | P-2单一结算入口及所有普通收尾调用者检查隔离标记，不把函数结果写成failed/interrupted响应，不交可供consumer持久化的完整响应体，也不交失败主体给runner/P-5。dispatch/dispatchAgain/canDispatchAgain在需要该事实的既有判定处保持unavailable；参数/身份判定顺序不变。interrupt按S-31保留真实意图先落规则，但不能绕开隔离结算 | 不能把无firstTokenAt解释成已知未开口；不能以retryRefused、wrongPhase或新枚举替代未知 |
| Q-2：实际停止旧工作 | runtime持有真实网络读取、门回调及原append任务；停止请求后等各自实际收束。宿主负责关闭旧会话推进，并确认可能写本次opened/response的旧参与者已静止或完成受保护交接。带run时还要在共同会话日志里确认新attempt fence已生效；无run时必须完成旧属主静止/独占所有权交接 | 请求取消、超时、fiber撤除开始、单个旧Promise完成均不足。attempt fence只拦fenced锚点，不拦unfenced结算，不能代替旧结算写者静止 |
| Q-3：恢复权威读范围 | 日志owner在需要时关闭准入、排空旧实例并重开恢复持久内容；宿主在既有新尝试/会话重新承载入口完成该交接，再让P-2经真实SessionLog读全本次call/dispatch事实及尾。若provider处于写入不可信状态，只读旧confirmed tail的空结果不能证明未提交 | 不靠runtime内存、诊断JSONL、缓存或假回执。未确认旧写者停止/所有权、恢复尾或读完整性时，保持unavailable与未结算，不自动再发 |
| Q-4：按已有恢复规则收口 | 已满足S-33调用前提后，读取中断意图优先，再按opened有无走既有表。opened存在时durable timing.firstTokenAt取其时刻，调用终结且不重发，已交付内容可为空；确知无opened才可能进入S-33允许的无首token分支。响应体/账/late均按S-33与原dispatched构造 | 不把函数失败投影复制成无token耐久response；不因读得无opened便在旧调用上自动重试，也不补一次opened来制造确定性 |

Q-2/Q-3由runtime、日志owner和宿主共同兑现，不新增公开“恢复”操作；本批验收应用负责显式S-33调用时机及真实日志重开。任何恢复前提无法核实，相关操作保持unavailable、调用未结算、零可见内容；隔离标记只阻止本实例误写，重启后的保护仍来自日志owner交接、有效fence及S-33先对账。仅已确知opened从未提交且旧写者不可能迟到的普通门失败，才沿S-15/S-16立即写首token前unrecognized；SessionLog的unavailable本身不提供这种证明。该机制仍待独立复审和R3-G8真实验证。

S-36的普通系统停止在锚点结果已确知时仍结算 `interrupted{run_cancelled}`；未知结果适用上述隔离，系统停止本身不另写S-31中断意图。恢复时无耐久中断意图且无response，确无opened则按S-33写 `interrupted{runtime_lost}` 并成为resumable；有opened则写 `interrupted{runtime_lost}`、取锚点时刻并成为interrupted终态。有真实耐久意图才走意图优先。内存停止原因不跨失联保存，不为保留它新增记录，也不据它禁止原表允许的后续显式续接。

`invokeModel` 的outcome只在它所拥有的读取、回调和取消处置实际收束后可被当成函数工作停止的证据，不能代替外部日志任务停止。业务终态、durable结算、用户观察及资源释放各有独立事实。普通路径由P-2把未结算投影与ID/归属/绑定组成response；隔离路径按Q-1～Q-4，timing另以权威锚点确定。参数调整与丢项仍取同一次规划，缓存沿usage唯一字段，缺失保持未知，实际provider不能由请求provider补齐。

锚点结果已确定的普通失败或无内容中断由P-2写response；未知结果不走这条通道。带回复结果先交调用者进入reply_pending，引用仍保留。调用者持久化回复时把AssistantMessage和response一次append，ResponseId键参与整批判重；vetoed/consumed由settleReply写response。宿主停止/对账与调用者竞争只认共同日志先提交者；本地标记只减重复工作，无法覆盖重启后的写入。

`reconcile` 在Q-2/Q-3及S-33原调用前提成立后只读历史、按原表顺序追补，不调用plan/send、缓存探针或旧版本加载。未知ack路径必须在普通结算之前隔离，否则错写response会使对账跳过，ResponseId幂等不能修正这种错误。无旧实现仍能恢复resumable事实；随后显式openCall续接时acquire不到原版才unavailable。日志读取/追补部分失败不返回部分成功，不允许consumer继续推进；已写下部分由ResponseId判重留存，下一次对账认回。已开口后的失联不重发，即使当时实际交付内容为零；未发出且没有意图的内存调用不凭空造恢复记录。

## 存储要求与共同提交对象

全部持久调用事实仍在同一本会话日志；SQL缓存与日志之间没有原子事务承诺。日志提供者原[消费者要求互指](../../session/session-log-jsonl/design.md#消费者要求的承接互指)继续承担下列要求；v4载荷采用需该节点显式更新，R3-G4记录尚未完成的组合。

| 要求 | 存储对象／owner及要求 | 对应runtime3条款 |
|---|---|---|
| L-1 | 日志确认尾及整批记录：成功append后持久，半行/未确认尾恢复可辨；失败不能返回成功 | S-8/S-15/S-17 |
| L-2 | 同一会话日志内response的ResponseId唯一判重键；所有结算写入者共同触碰；alreadyRecorded与unavailable可辨 | S-17/S-33/S-49 |
| L-3 | 同一本日志的一批AssistantMessage＋response及其判重约束全成全不成；调用者与runtime并发结算共享L-2 | S-17/S-38 |
| L-4 | 同一日志提交序列里的run/attempt壳：新attempt开始与旧fenced锚点在判定/写入同一边界排序；结算unfenced并如实late | S-8/S-17/S-22/S-38 |
| L-5 | call/dispatch锚点及intent/ended的具名前缀唯一键；首次durable事实护callId，禁止两个旧/新实例发送同序号 | S-5/S-15/S-31/S-33 |
| L-6 | 严格无损读取、读尾的一致上界、日志身份/位置可比及tenant壳不混；未知/不可读不是空 | S-7/S-13/S-14/S-34/S-53 |
| L-7 | opened未知ack恢复仍以同一会话日志为共同对象：旧追加/结算写者实际静止、日志owner必要时排空重开后读权威尾；带run的attempt fence在该日志提交点生效。隔离标记非持久真相，旧confirmed tail不能替代恢复结果；提供者与宿主互指/真实组合尚待R3-G8 | S-15/S-16/S-17/S-29/S-33/S-51/S-55；session-log2 S-14/S-17/S-19/S-22/S-23 |
| R-1 | 候选model_projection_cache行：tenant/session、日志身份、水位及派生模态；同一storage事务锁定并仅推进水位 | S-13 |
| R-2 | 日志身份或所需投影格式不符时作废重算；缓存不带会话正文，不能作为授权或唯一事实 | S-13/S-38 |
| R-3 | 缓存不可用可识别并从日志重算；日志不可用直接unavailable；缓存与日志无共同提交要求 | S-13/S-14 |
| E-1 | 输入provider的recipe/head/版本与OG实际成员事实在同一原子读取约束域；复用OG公开participate并核同存储，资格撤销写者与输入读取在实际共同事务域排序。沿输入节点EIS-R1，不由runtime另建资格表或选数据库 | S-66；AE4 PRE-1/PRE-3；OG2 S-26/S-63 |

必须用真实并发反证三条交错：X1 调用者append回复＋R与runtime停止结算R竞争，后者若输不再写，前者若输整批不落；X2 新attempt记录与旧attempt dispatched竞争，新者先提交则旧者fence拒绝且零send，旧者先则reconcile读得到；X3 无run场景旧实例与新实例同时生成下一dispatch，L-5唯一键只允许一方发送。时钟先后、进程锁、未落盘“已结算”均不是这些保证的替身。跨进程扩展必须保留同一判重/栅栏排序协议，单机演练不代证它。

另验X4：opened已提交→ack丢→函数failed无token→普通结算入口，必须被Q-1截住，恢复读得opened后response带相同时刻且终态不重发；X5：门等待被取消→函数interrupted零内容→旧append迟到提交，Q-2/Q-3不许先读旧尾宣称未开口，等权威恢复后保留中断意图优先级及opened timing。去掉隔离或旧写者静止条件，验收必须观察到response/anchor不一致或错误再发并失败。

## 生命周期与装卸配对

上游机制仅引用有probe的basis：[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)。calltime取用不是optional inject，也不是授权。内核不取消调用、不保证跨effect完成次序，disposer异常不能靠外层dispose返回发现。

| 装载贡献／资源 | 取得者、可见时点 | 部分失败 | 撤除、静止与保留 |
|---|---|---|---|
| P-2服务与调用集合 | 必需依赖就绪、静态配置完整后provide；对外受理还受应用开闸控制 | 先关闭本实例准入；未登记调用不发布，已取得引用自己收口 | 单个组合effect设stopping→取消/abandon→结算或保留可恢复锚点→等待实际停止→释放；durable日志不删除 |
| 宿主对一次call的收口登记 | 显式S-61同寿命句柄；登记与stop观察在一个无await判定段中排序 | 宿主已停或登记失效即runtimeStopped/unavailable；已取得lease及时退出，无漏登记窗口 | 正常终态解除登记恰一次；停宿主按S-36，不依赖Cordis取消方法Promise |
| 精确适配lease | openCall取得；贯穿重试待决/续接/回复交接 | 未进入可发出状态时release；不丢历史绑定 | 只有执行实际停且本节点结算/交接收口后release；写失败不伪称已结算；贡献退役由传输owner负责 |
| 每次发出的读取、timer、门等待与监听 | 每dispatch资源容器；引用已取得、配置有效才启动 | 关闭已取得监听/等待并保留真实外部阶段 | 取消请求与实际停止各记录；迟到门/网络回调只可收尾不能输出或再发送 |
| opened实际append任务与恢复隔离 | P-2在启动append前取得任务所有权；普通结算共用隔离判定 | 结果未知立即关闭普通结算及再发，取消不丢任务；诊断保留可见状态与耐久状态区别 | 旧append/流及可能的结算写者实际收束后才交接；宿主负责日志owner恢复和S-33。未结算日志事实可保留，不能依赖dispose顺序或提前释放尚在用lease伪造完成 |
| 观察端口队列 | 校验session/target及双限后可用 | 不明归属不发布；错误不借全局emit传播 | 关端口清本端缓冲/监听，迟到拒收；费用和response继续结算 |
| P-5默认重试贡献 | S-67精确CapabilityId、after_model_call/failure声明及完整配置通过runner登记后可被选择 | 名字/声明不符或登记失败无假贡献；不覆盖已有贡献，配置错误启动失败 | 仅撤除本次登记；在途判定按原输入完成/明确失败，不撤销已落结论，不因名称授予额外power |

宿主适配的 `ctx.effect` 提前解除及无漏取消登记是**待核对主张**，目前没有对应basis条目。已有[有限Cordis原型及连续调用反例](../../../../record/evidence/2026-09-27-probe-model-request-runtime/README.md#连续调用补验)只支持已运行路径，产品宿主/真实IO组合仍需R3-V16。同步寿命容器必须在stop先置位再遍历登记；登记不能跨await漏进已停宿主。框架登记失败也要收回已取得资源。

策略正常退役不能触发旧call宿主停止；只停止新acquire，等待当前真实引用。排空Promise在retiring之后按当前引用建立，不复用active期间首次归零已resolve的Promise。强制退役显式取消所有runtime/direct持有者，真实停止并结算前不能销毁实现。整个modelTransport服务替换仍会按required边重跑P-2，并按S-36处置；不把贡献热更新夸成整个服务无中断。超时只能报告未停/未结算范围及诊断，不可以释放尚在用资源后报告成功。

Node的实际socket停止、AbortSignal对门等待/调度的影响，以及采用计时器的精度/大Duration边界是**假设，须按source-check取证**。不用隐式整数溢出或固定上限修补合法Duration；具体调度构件及对不可承载值的拒绝需在R3-G7闭合后实施。`clock`只给本系统时刻，不给这些上游承诺。

## 诊断、观察与应用接线

所有业务动作走直接调用，不用Cordis emit作控制、租户观察或诊断隔离。观察端口以实际tenant归属、session、call、dispatch校验，S-62两种容量显式给出。缓冲满为buffer_full、接收失败为consumer_failed；不成为ModelResponse成因、不影响正常结算。accepted只说明接纳；故障不承诺可靠重放，持久事实从日志读。

采集构件覆盖S-63每个边界，字段带适用身份和profile/implementation/definition/configuration修订，不录配置原文。默认排除prompt、工具输入输出和推理原文；凭据原值/片段/头/形态按S-20在写入前统一脱敏。业务payload耐久保留完整声明式绑定，诊断只保留关联事实；schema不能识别任意秘密，配置禁秘仍由目录写入者及实现配置校验承担。

主线指定 `apps/model-request-acceptance` 拥有本机诊断JSONL、query/export、bounded metrics和独立退化状态：文件/目录按本机运维OS权限建立，query要求显式tenant过滤；tenant参数不是授权凭证，不向普通租户开放文件或网络读面。sink寿命长于runtime fiber，卸载后可查；sink失败/满缓冲保留可见drop/error计数和有界stderr摘要，默认摘要无正文/秘密。所有出口都坏则明确覆盖缺口，不改业务成功为失败，也不把诊断成功当作opened耐久。实现与实际权限演练仍属R3-G6。

装配以真实storage/clock、目录、加密凭据副本、sessionTenancy、sessionLog、OG成员资格、当前输入store、assetRegistry、runner及传输贡献构成闭包；经真实治理公开操作建立租户与资格、发布根资产/层配值、提交会话归属，再由输入provider实际捕获standing，调用selectModel初始化并按真实尝试生成report。OG与输入store使用同一实际AtomicStorage；会话映射种子面采用范围另由其owner确认，两步创建不冒充跨owner原子事务。用故障注入传输做错误演练可以，但不得以临时tenant字符串、effective常量、固定设置或恒真授权函数代替真实提供者及最终OpenRouter路径验收。

应用必须持有真实storage-sql `createUpgradeGuard()` 返回的guard：等待全部必需及本批操作必需的调用时提供者ACTIVE，再对附着该实例的guard.confirm确认、核对返回及pending，最后开放外部受理。确认失败或PENDING/FAILED不允许模型请求；清理后核pending暴露恢复失败。runtime插件不自行confirm，也不在已provide时假定应用已开闸。[应用节点](../../../apps/model-request-acceptance/README.md)目前为候选起草，R3-G6/R3-G8保留真实装配及恢复交接义务；指定owner不等于已装配。

配置政策一致：必需静态配置形状非法、缺诊断界限/脱敏政策/调度构件等使启动失败，不provide半套服务；业务中某会话缺时限、版本不可用、凭据未配置则按精确契约的运行期具名失败。factory凭据本来可缺席，不改成强制启动条件。所有数字由显式配置/声明提供，不写默认TTL、队列长度或等待期限。

## 关键选择与反向核对

| 选择 | 落选方最强理由 | 本方弱点／重审条件 | 置信度 |
|---|---|---|---|
| 独立invokeModel＋P-2耐久编排 | 单一runtime循环更易直接控制锚点次序；含重试函数更开箱即用 | 需精确规划交接和内容门，必须用真字节/提交交错验证；若接口不能保持同一规划须退回主线契约 | 中高 |
| 未知opened结果先隔离、恢复权威日志再结算 | 直接沿函数失败写response实现简单、能立即反馈且无需宿主恢复 | 降低故障期间可用性，依赖真实日志排空/恢复与旧写者静止；必须测X4/X5，缺读范围或fence证据即保持未结算 | 中高；RT-AR1机制修订待独立复审 |
| 两个插件、call用宿主资源，不每call fiber | 每call fiber生命周期可视化直观 | 自行维护宿主stop/登记排序；避免required重载把一次外部发出当插件体重做，真实注册竞态不通过即阻断 | 高 |
| 当前输入/tenancy/registry调用时取用 | required依赖能在启动时更早发现漏装 | 每个操作需要显式缺席分支；应用必须额外核这些提供者ACTIVE。其换代不应打断所有已打开call | 中高 |
| JSONL共同提交＋可重建SQL投影缓存 | 全部放一个数据库更易统一事务和索引 | 两种存储管理复杂，缓存重建须测量；现有日志契约与provider已明确同批、fence和持久，不能假装SQL交易覆盖日志 | 中高 |
| 新call fresh model；每dispatch fresh时限、固定旧binding | 每次发出全重选模型能立即响应治理变化；历史manifest读取更便宜 | 两套时点易混淆且读取成本更高；保持S-7和S-66各自承诺，改时点需语义owner演进 | 高 |
| S-60纯算术＋显式sample，调度另构件 | 成熟重试执行器可直接提供退避与等待 | 算术端点自行验，调度仍待选定；执行器自带循环不可绕过durable守卫/每次凭据/锚点 | 中高 |
| 装配持有诊断sink，runtime只采集 | 每插件自带文件最容易安装 | 需显式接线、独立退化状态与权限验收；换代后证据仍存且诊断不成恢复权威 | 中 |

四项反向检查：dispose时所有外部发出归durable对账而非回滚；required依赖撤除范围明确，贡献版本更新不产生该边；观察及诊断各在真实输出边界核身份/内容；跨进程后lease、宿主stop通知、输入快照与共同日志排序均需显式协议，单机不宣称具备。完整验收与阻断owner见 [verification](verification.md#v3-增量证据义务)。
