# tool-execution-runtime 行为契约

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 设计并实施第二阶段。公开形状归 `src/index.ts`；本页只约束类型不能保证的行为。分阶段兑现范围由实际验证证据报告，不以本页存在宣称全部实现。

## 执行池消费边界

[`execution-pool.ts`](src/execution-pool.ts) 定义准备好的工具请求、窄执行记录端口和执行池构造。公开根只导出这些类型。提供者须按本节迁移；类型存在不表示既有工厂已完成迁移。

Session 固定原工具请求、当前 attempt 和结果采用关系，Agent 决定执行或等待。工具池接收完整请求，管理原执行、并发、取消、等待、结果与资源。池不枚举 Session，不读取完整 SessionLog，不恢复 Session 队列、Run 或 attempt。独立 invokeTool 与既有执行器继续复用，不新增通用任务运行时。

PreparedToolExecution 保留原 ExecutionRef、ExecutionOrigin、完整调用块和活体 RuntimeAccess。正常请求携带参数及真实 SelectedTool；已确定不可执行的请求携带原 adoption 和 notExecutable，后者只允许 unparseable 或 no_such_entry，不能同时携带 selected 或 args。AdmissionToken 沿原可选输入及实际准入核验。数据身份、复制 Access、选中定义或 token 均不授予执行。持久工具执行保持原 Session、Run、attempt 及 assistantMessage 关联，不新增无 Run 的持久工具分支。

请求生产者提供同一 Session 的实际 SourceToken，并固定 afterAction.pass 和 afterAction.selectedChain。池保存这些输入，不读取完整会话历史来重新选择定义或 after_action。正常请求的 args 必须与原调用块的 arguments 一致。不可执行结论由 Session 从已完成的原 before_action 批次取得，并在原发起的同一 Unit 核对；调用方不能仅凭自报结论跳过准入或伪造失败。普通 JSON 输入在首次等待前复制，Access 保留原活体对象；同一原调用的不同准备输入必须冲突，不得覆盖已保管的执行。

ToolRuntimeOriginalIssueFactory 返回 ToolPoolInstance，submit 只接受准备好的请求。正常请求的工具准入 token 仍由实际 ToolAdmissionOperations 核验，缺席或无效不能发行新执行；核验来源须与请求的 Scope 和固定末尾位置一致。重复认回原调用仍先核当前访问资格，不把 token 或 SourceToken 当作独立执行权。完整纯池构造还须满足下段的依赖边界，不以返回类型相符代替验证。

ToolPoolConstruction 借入原实现、Context、环境、结果、Runner、授权和策略依赖，消费 ToolExecutionRecords。它不借入会话枚举、完整日志管理或历史驱动的准入准备接口。工具定义与采用来源在请求准备端核实，池仍核对固定输入及真正实现借用。普通读取、停止和答复保持原动作资格。

ToolExecutionRecords 只读取或暂存工具能力自己的原记录，不独立提交或调用作者。实际共享 StorageUnit、原数据集及活体 job 或 claim 必须相符。复制对象、旧 owner 或异存储单元拒绝。暂存终局、原账及耐久交付义务仍由同 Unit 协调者提交；Session 从该提交的完整前缀计算跨域 late 与归因，池不解释完整会话历史。

ToolOriginalIssueSupport.classifyTerminalIn 由可信 Session 提供。在终局暂存的同一个实际 Unit 中，它核对原发起证明，并从当前完整前缀判定原 Run 是否已结束或原 attempt 是否已过时。该读操作只返回 late 判断，不发出新执行资格，也不要求重新登录。池把判断写入本次原账；判断不可用时不提交终局。原提交回执丢失后，认回已持久化的原终局及原账，不按较新的 Session 状态改写它们。

stageTransitionIn 不允许调用者替代 execution_intended、execution_started 或 delivery_confirmed 的专门协议。stageConfirmationIn 核实际已追加消息及原位置。保管凭证不等于送达确认。结果、附件及原文的存续独立于 job 或 observer，关闭池不删除仍由 Session 保管的引用。

相同原身份和语义返回 recognized，不重新发行 claim 或调用作者。开始写后不能确认提交则返回 unknownCommit，保留原完整输入、身份和执行责任，不授予 launch，不换 key 或重调作者。其他拒绝保持现行 SubmissionResult 集合。观察者 release 或等待 abort 只结束该观察责任，不结束原执行。

实例 ready 要求原执行义务已可靠处理或保留。idle 不等于环境实际停止。close 成功才允许释放借入依赖；失败或 pending 保留原实例，由既有 RetainedCloseControl 接续同一次收场。Session Context 或 CLI 客户端结束不关闭共享工具池。

### 原执行义务的借用读取

withObligations 只遍历绑定数据集内本租户的原工具 ExecutionRef。ref 是数据，不授予执行、停止或答复。limit 必须是正整数且满足容量策略；维护来源不能核实时，在发布 reader 前返回 denied 或 unavailable。

提供者先完成一次真实读取以固定原一致视图，再发布 reader；空集也执行该读取。游标由提供者持有，按原 Session 和记录坐标稳定排序。坏版本、异归属或来源不完整返回 unavailable，不冒称空集。next 返回非空 page、明确 end 或 unavailable。

同一 reader 只允许一次 next 在途，重叠调用使本次借用不可返回 used。任何 next 返回 unavailable 均影响整个借用，即使 callback 忽略该值。used 只表示 callback 值和借用收场成功，不表示完整遍历或义务处理完成。

callback 在原存储只读作用域外执行，可通过原公开接口独立写入。callback 结束后使 reader 失效，等待已开始的读取及实际存储借用收场。callback、读取或释放抛出的异常优先于普通 unavailable；单个异常保留原对象，多异常以 AggregateError 保留原对象，按 callback、读取、释放排列。

遍历不预先排除终态或已确认执行。queued、running、waiting、原 unknown claim、未交付结果、费用、附件及环境仍可能持有义务。一致视图不替代活体执行与资源检查。来源不可核时，池不能宣布 ready 或实际关闭。

## 执行保证

TE-1 执行身份为 tenant/session/callId。先核验租户再认回；同身份同实际输入不重复执行，不同实际输入拒绝。

TE-2 持久意图确认后才能启动。一个执行身份至多启动一次；重交、消费者重建、提供者恢复都不重做外部动作。

TE-3 观察句柄可以有多个或为零。release 只结束该观察者；原执行、Run 等待关系与环境资源不因此改变。stop 是另一次受权控制操作。

TE-4 终局首胜，后到结果不改写。中断先确认终局，再发送停止；逻辑中断、物理停止和外部作用分别记实。

TE-5 终局、账及耐久交付义务同一提交。late 从构造该提交的同一完整前缀计算。后置处理不能更改终局；确认消息追加后才算送达。

TE-6 waitIndex 只匹配当前等待。旧应答、重复应答、到点与停止竞争不能恢复另一等待；无期限的等待不擅自增加期限。

TE-7 首次调用固定资产版本、实际实现、参数和采用依据。贡献撤除关闭新采用；实际资源未失效的旧执行继续。失效后失败，不调用另一个实现续做。

TE-8 恢复覆盖原数据集内所有持有未完责任的工具执行，包括各会话的原执行。池不恢复 Session 队列、Run 或 attempt。已有终局只续交付；连续性丧失的非终局异常收场，包括未启动的 queued。恢复完成前拒绝新执行。

TE-9 前后台没有执行状态或执行模式。工具自身等待事实可供上层决定是否推进；切后台不能改变执行身份、重新获取环境或释放未收场执行的并发额度。

TE-10 裸 invokeTool 不承诺持久唯一性、租户隔离或恢复。runtime 必须在调用它前完成相应准入、身份和持久化责任。

TE-11 工具普通返回 `isError: true` 是业务失败，省略或 false 为普通成功；字符串始终按普通成功归一。该字段由 tool-definition 的类型、Schema、判定与规范化共同拥有，不从结果文本猜测。实现异常、形状拒绝、未启动失败分别分类。

TE-12 原始结果、帧和费用分别判定。工具帧只能指向本调用、符合既有 arrival-events 的工具约束，并通过单一串行装配通道；观察发送失败不把业务成功改成失败。费用报告接受后不得因进程崩溃丢失，同一项身份不同值拒绝。

TE-13 收场之后新到费用沿当前已接受规则只留诊断，不冒充有效补账或 manual 来源。若后续交付要支持自动晚报进入有效费用，须先接续 call-accounts 的来源集合；该能力不是本期账目卡的默认承诺。

TE-14 emit 只收本执行 open/fill/close 事件，同步返回接纳或丢弃且不抛出。宿主封装身份、计 trim、终结流。事件监听失败不改变执行；快照可查询，不承诺逐帧可靠送达。

TE-15 waitIndex 与进入等待同批确认；answer、截止与 stop 首胜。答复值不合法继续等待，判定器无法判定则按 schema_unsupported 解除并收失败。重复同值同来源 answer 可认回，旧 index 或异值不能解除当前等待；来源由受权入口证明。未知回执不能自行换 index 或恢复工具。

TE-16 工具恢复不重建调用栈；非终局等待按连续性丧失收场。观察者 release 使自己的未决读取明确 ownerStopped，不影响执行或其他观察者。原提供者退出使所有旧句柄不可继续使用，新 owner 就绪后凭持久 ref 重新 acquire。

TE-17 精确实现登记不得覆盖；撤除只关闭新采用，旧 lease 不重绑。实际资源失效须显式失败。每次 submit 一次执行，批次次序属于上层；runtime 仍负责逐会话同工具并发额度。

## Session原工具发起参加协议

ToolOriginalIssueSupport.log 只提供 sourceIn、readByKeyIn 和 appendIn。Session 的实际支持对象也只发布这三个成员，不借出完整前缀读取、会话枚举或独立事务接口。原工具拥有者核固定 owner 寿命、原 tail、当前资格和本调用记录后暂存原意图；完整会话准备和当前 attempt 栅栏由 Session 协调者核验。后来追加使原 tail 失效，不能跳过重判继续发行 claim。

B01的Session消费采用`original-issue.ts`中的工具专有原发起协议。
现有普通ToolRuntimeOperations／createToolRuntime不因这些类型存在而获得同Unit能力；
真实提供者须实现和验证下述构造、参加和消费责任后，才能作为B01的原工具实例。
本节不增加ExecutionSubmission字段，不改TE-1～TE-17，也不声明当前提供者已支持本节。

### 原身份与可信构造

ToolOriginalIssueIdentity指认原ref、origin、adoption、executionGeneration及工具原intended键。
唯一执行身份仍是tenant/session/callId；executionGeneration区别拥有者，不允许各代各执行一次。
原工具键与Session prepare位置不同，原完整意图／selected实现／输入／pass不能以身份或摘要替代。
身份和expected原前缀须由native owner快照并冻结；TypeScript readonly不能代替运行时捕获。
ToolOriginalIssueClaim只在原owner持有的活体映射及持久发起记录中认回，不从字段或序列化值造claim。

ToolRuntimeOriginalIssueFactory.create同步返回ToolPoolInstance，复用原执行器。
构造显式固定tenant与recoveryPageSize。它不接收backing、owner、history或runnerHost；
选中的工具、参数、原SourceToken及after_action链由PreparedToolExecution提供。
ready读取本租户的原生任务索引；包括排队、执行、等待和终局任务，不预先过滤。
恢复只收场原执行资源并记录原结果，不调用作者、不恢复Session状态、不发行新claim。
不能读取原任务或不能确认原资源收场时，ready失败；close保留原责任并允许重试。
此协议不承诺识别旧普通工厂未登记到原生索引的任务；迁移必须先处理该范围。
它必须采用ToolRuntimeOriginalIssueDependencies中全部originalIssue资源，不能忽略扩展字段。
函数类型可赋值或普通实例的方法存在不证明这项行为；B01根只能选择实际已验证的提供者。
资源包括同一AtomicStorage、实际SessionLogParticipant／LogAuthority、同Unit当前资格及Session admission。
Unit及Storage类型只依赖core/storage公开入口；本包不加载具体存储后端或实现事务调度。
它们只由可信构造取得，不能来自普通submit body、JSON配置或普通Agent Context。
提供者须核原日志、Session单元和工具实例的实际存储／归属配对；其他StorageUnit按缺陷拒绝。
构造失败仍由factory收场已分配的原资源；成功后按原ToolRuntime关闭协议收场，不关闭借入依赖。
选择及环境后端仍复用原native owner；不建立第二发送器。

### 原意图与唯一claim

native owner完成原权限、BeforeActions、路由互斥、完整输入和固定实现检查后，保留job及实现借用，
再产生ToolOriginalIssueParticipant。participant不是任意用户回调，绑定该真实原owner及原意图。
stageOriginalIn在传入的实际StorageUnit核原前缀／当前依据，暂存既有execution_intended及原工具发起记录。
发起记录保存完整固定意图、原执行代际及claim的未消费／已消费状态，归工具拥有者维护。
既有SessionLogParticipant.appendIn／readPrefixIn可作日志底座，但不能替代工具原job和claim。
participant不独立提交、不调用作者、不关闭实现借用，不使Unit逃逸。
participant.stopped只在该原job的实际任务／writer结束且本job借用已归还后完成，
不因admission返回、结果终局、observer.release或另一Session空闲而完成。
unknown、未确认终局或尚需交付时保持原责任；实际收场缺陷拒绝stopped并保留同一原owner。
它只证明本job拥有的工作收场，不证明外部效果可逆或共享物理池关闭。
回滚后产生的暂存claim不授启动权；已存在同输入只返回alreadyIssued，不分配新claim；异输入拒绝。

admission.admitOriginal只能来自可信Session构造，在同Unit核原prepare、最新permit、当前资格及原来源，
并调用该participant，统一提交Session证明、工具intended和唯一claim。
只有真实commit后才返回issued；alreadyIssued只认回完整原身份，不取得第二启动权。
失败全体回滚；事务开始后提交结果不明返回unknownCommit和完整原身份。
unknown须保同一个job、claim、意图、实现及输入借用；一次缺席读取不能证明原事务以后不会提交。
相同原身份查明提交，不换键、不换代际重发效果。

### 原claim消费与收场

consumeOriginal由原native owner请求；admission核该原claim并在实际Unit重新核最新permit及当前资格，
调用participant.consumeOriginalIn暂存唯一消费，真正commit后才能返回launch。
正常可执行请求的唯一消费与原工具的execution_started记录在同一个实际Unit暂存；任何一项失败，两项一起回滚。已由 Session 核实的不可执行请求只消费原处置凭证并形成失败结果，不写 execution_started，不借用或调用作者；其终局、原账、结果保管及 after_action 交付仍沿同一原身份。
该记录表示原执行已取得启动资格，不证明作者已进入或物理效果已发生。
ToolOriginalIssueAuthority只核同Unit当前资格，不替代native的权限、token、BeforeActions、原输入和实现守卫。
participant.consumeOriginalIn的新消费返回staged；admission.consumeOriginal仅在真实commit后返回launch。
已消费只返回alreadyConsumed，不再次grant launch。
消费未知不返回launch，保原claim并认回其实际状态；即使已确认消费也不能对新owner补签启动权。
若仍存续的原owner认回已消费，且证明本次没有交付launch、作者未进入、没有原调用／writer在途，
则关闭该job的作者进入门，沿既有native end登记`{outcome:'unavailable',reason:'original_consume_unconfirmed'}`，
同原终局批次登记实际账及交付责任，继续原结果交付并归还实现／输入借用。
这里没有实际调用作者，不生成执行成功，也不把数据消费确认记作物理效果或费用。
这是仍存续job的未启动收场，不冒充连续性丧失；原调用已经进入时只接续原执行／终局／交付。
认回消费、排空或终局写仍不可靠时继续保管同一job／claim／借用，不用超时、缺席或新身份假结清。
原工具作者只由持有真实原claim的native owner进入，所有首次及existing分支均执行该守卫。
再次进入原launch协调函数与再次调用作者不同；旧收场可继续，但不能因已存在intended再次调用工具。
unknown后仍存续的原owner仅可在证明持有原未消费claim时继续，不能从alreadyIssued造claim。
连续性丧失沿TE-8收场，不恢复作者调用栈。

issued后撤权、旧permit或owner停止可以阻止consume，已确认queued意图及交付责任仍由原native owner收场。
已提交事实不回滚；实现／资源／费用／结果／原交付沿原Tool责任保留。
不把工具结果cast为模型Pending或使用模型ACK，Session结果保管也不等于工具delivery_confirmed。

### 验证义务与当前差距

native Tool原参加／消费组件和Session同Unit准入桥已实现，分别有有限组合测试；完整原Tool工厂与Session组合尚未验证。
E1须组合原native owner、Session及真实租户SQLite验证：完整意图与原claim／Session栅栏同提交、
异租户／异Storage／旧permit拒绝、全批回滚、发起及消费commit返回丢失、原owner认回与新owner零launch、
重复／复制／跨代claim最多一次作者调用、existing路径同守卫、issued后拒绝consume收场、实际关闭保留。
额外验证消费实际提交但回执丢失的暖态：查明原消费后零作者调用，原unavailable终局／账／交付完整；
终局写未知保原job，认回后不重复交付或补发作者。原作者在途的重放不能错误走未启动收场。
原工具形式化唯一执行及恢复义务须增加本参加边界的反例与检查，不据类型通过视为已证明。
E2才验证真实工具往返；结果保管／引用／原交付接缝须另外闭合，不据本节完成整条工具链。

## 原工具结果存储

### Session保管的原结果来源

ToolResultCustodySource.verifyIn接实际Session Unit、原ToolOriginalIssueIdentity及精确ToolTerminalRecord。
它核完整原终局、账、DeliveryBasis与原发起归因，并核实际StoredToolResult及全部必要引用。
有作者返回时stored必须存在且与原返回一致；无作者返回的终局不伪造原文。
references包含原文、raw、内嵌附件及投影中的所有外置引用，不以摘要或最后一条记录代替完整内容。
verified只在所有引用的内容已耐久、完整且在Session保管责任期间持续可取时返回。
只读来源不得发行claim、调用作者或把缺席当作已经释放。

Session和Tool共享不可变Session Log，保管可以固定原terminal坐标与完整引用，毋须另建终局副本库。
verifyIn的名字不证明外部字节参加了Session事务。
若原结果库在另一个存储中，可信根须验证其不可变提交及独立于原job、observer和Run的存续责任。
Session责任尚存时不得删除已交付的原文、raw或附件；归档、Run终态、owner撤除都不授权删除。
不能仅凭“无默认过期”声称没有其他删除路径。
来源故障或引用不完整返回unavailable／invalidSource，不报告可靠保管。
Session同Unit登记保管后，后续读取不要求已关闭的job再核发资格；访问仍按各自读取授权。

本协议固定跨拥有者的核验输入与存续责任。Session保管写入者已实现并有受控来源组合验证；普通交付写入者已有有限实际SQLite／Runner解释器组合；文件结果来源及 native 持久原身份核验已有分别限定的 SQLite／文件验证；完整 native／Session 工厂组合仍待验证。
交付确认须指向同批中的实际消息事实；delivery_ready或Session保管凭证均不是delivery_confirmed。
工具没有模型AcknowledgeCallInput，不能借模型ACK释放原工具责任。

RS-1（core/tool-execution-runtime）结果引用只定位不授权。原文和附件字节先耐久再引用，未知写认回，同 itemKey 异内容拒绝。已存原文无默认过期，归档与 Run 结束不删除。

RS-2（core/tool-execution-runtime）readResult 只读已确认终局的原结果；after_action 仅改消息投影，不能改原文、终局或账。声明存储须能由装配中的读取工具读取，否则产出工具不可用。

TE-18（core/tool-execution-runtime；RC 同用）全局通知不得携带会话身份、调用引用、等待请求、结果、账或数量；这里只提供无参数唤醒。任何内容查询仍需当前受权绑定。低级日志／存储借用只交受信协调 owner，普通工具与用户不取得任意日志读写面。

RS-3（core/tool-execution-runtime）维护读取只接受独立 RecoveryAccess，并逐次验证当前维护 owner、显式 ref 及已确认终局的既有交付义务。readDeliveryBytes 只准读取该结果实际持有的原文／附件引用；不能从任意已知引用读取。它不授予普通查询或新写权，原用户撤权不阻断既有交付，输出不发给已撤权用户。

TE-19（core/tool-execution-runtime）after_action(each) 的 subject.result 仅在 completed 或 failed{business_failure,implementation_error,result_rejected} 时提供；其余终局及前台后台占位均缺席，不允许改写运行时产生的用法或中断说明。business_failure 是新增的正常作者返回失败，与其余作者结果同样可做消息投影。DeliveryBasis.result 必有只表示待交付投影存在，不表示该结果可交给 hook 改写。

TE-20（core/tool-execution-runtime）同一 tenant/session/callId 的执行接纳与拒绝处置互斥。Session 请求生产者须从完整前缀确认本批 before_action 已完成且本调用没有正式拒绝（包括官方件缺席的全拒），并在原发起同一 Unit 核实不可执行结论；执行池不为此读取完整 SessionLog。未准备请求的旧 submit 路径迁移前仍执行同样的历史守卫；未完成回 admissionMissing，正式拒绝回 callConflict。免 token 仅免 allow 凭据，不免这一守卫；仅最终仍为 notExecutable 的项可走该路径。还须确认无 action_denial_intended/action_denied 或其他路由的首次返回，免 token 提交同受约束；有拒绝路由返回 callConflict。仅同路由同实际输入可认回。守卫与 execution_intended 使用同代同尾提交；尾冲突重读并重判，未知回执不换路线。


TE-21 工具日志的公开 codec 拥有 `tool-runtime/1` 载荷、稳定键及 shell 对应关系。进入判定前复制严格 JSON，不运行调用者的 getter。未知所属版本、键、读键、租户或原 Run/attempt 冲突均拒绝。固定 Schema 在构建时生成，首次判定才加载并使用原生模块缓存；日志解码不编译作者的参数或应答 Schema。

TE-22 `projectToolJournal` 只解释工具领域的有序事实，不替代完整会话前缀判定。意图先于启动；真实执行结果须有启动事实；终局首胜。等待序号逐次增加，应答只能解除当次等待；许可须引用已计划资源且先于终局。交付 ready 须引用已存在终局，确认须对应 ready 的原调用与 outcome；消息审查可以继续修改待交付投影，不能倒写 ready 或终局；物理停止观察可以晚于终局。跨领域采用、准入、消息和 late 的一致性由完整前缀消费者共同核对。检查通过不证明各记录曾在同一次物理追加中发布，该责任仍归写入者及故障验证。

TE-23 runtime 提供给工具的每次成功 context 读取，都先确认 `execution_context_read`，再返回该次实际值。readIndex 从 1 连续增加；同次采用的 key 不重复。采用记录只追加，不替换先前读值；终局之后不能新增采用。回执未知或存储不可用时不把值交给工具。采用记录不改变执行阶段，也不以缓存值冒充当前读取。


TE-24 管理启动仅借用原 RecoveryAccess，不把权限或关闭控制放入 JSON、工具能力、runtime context 或模型输入。创建原实例后、等待其 ready 前，提供者须把原 ToolRuntimeCloseControl 经 retainClose 交给受信宿主。retainClose 正常返回表示宿主已经持有该原控制，并持有到原责任完成。同一控制重复交付可认回；不同控制与原控制冲突时须同步抛出，不覆盖原控制，也不假报成功。宿主无法持有时须同步抛出。交付抛出使管理 ready 拒绝，不能继续发布业务 runtime；原已登记的提供者仍负责实际实例及关闭，不表示可丢弃。控制不替代租户／会话授权。

TE-25 原实例管理关闭开始前，closeAttempt 与 retryClose 都固定等待第一次原关闭尝试，不主动停止实例，也不因第一次失败再自动启动第二次。关闭已经开始时，closeAttempt 固定观察调用当时最近已发起的尝试；以后重试不改变该次观察。retryClose 在有在途尝试时加入该次，在最近尝试失败且没有在途尝试时发起一次同实例重试；并发请求合并为同一在途尝试。closed 后两个操作均认回 closed，且不再调用根 close。closed 只表示原实例 close 成功。原 close 拒绝返回 retained，不能推断业务或物理工作已静止；管理 OwnedWork.close 保持 pending，下层仍须保有。原 close 真正 pending 时也继续 pending，不以超时假完成。控制指向原纯闭包，Service 撤除不改变应用已持有控制的责任或寿命；不能创建 successor、重新执行作者或开放业务准入。

ToolRuntimeCloseAttempt 和 ToolRuntimeCloseControl 直接引用 assembly-lifecycle 纯根的共享类型，行为见该包的保有协议。此依赖只复用关闭控制定义，不要求工具纯根加载 Cordis、注入协调器或取得整代关闭权。工具的私有恢复权限和业务准入仍归本页。


TE-26 有 targetEnvironment 声明的运行时调用必须从当前来源求值并获取环境。无声明时不获取环境。execution_environment_adopted 只保存普通数据，关联原执行 scope、CallId、SelectedTool、输入与原来源／实例代；开始之后、终局之前最多采用一次。codec 核对 scope／CallId；历史核对原工具身份及环境声明。环境工具等待或发布作者结果之前必须已有采用。作者结果为 completed、no_answer、failed{business_failure,implementation_error,result_rejected}；其他公共终局允许无采用。记录关系不能证明作者真实进入，也不恢复活体租约或执行权限。

TE-27 工具作者取得环境设施之前，原租约须被持有、实际设施须满足求值要求，采用记录须耐久确认。未知采用回执只沿原 key／内容重读认回，不重新获取实例或再次进入作者。尾冲突重读完整共同前缀，沿原租约重试；终局先到时不采用或进入作者。只注入所需端口，但设施描述保留原完整事实。注入前检查所需 facility 的可检查调用端口：command 必须有 start 函数，files 必须有 read／write 函数；缺这些端口时不进入作者。ProcessHandle 在 command.start 返回后才存在，其 output／outputPolicy／result／stop 的可检查形状在返回边界动态校验。kind:started 成功回执的句柄形状不符合要求时返回 effectUnknown，承认可能已有外部效果，不承诺作者零进入、自动撤销或补偿。合法 rejected 回执不包含 process。返回边界不证明未来输出块、result 完成值或 stop 物理效果；正常流、独立终局和停止行为仍受 execution-environments 的 EE-15～16 约束。

TE-28 第一次收场或 owner 关闭即永久禁止该执行的新环境作用；未知终局回执不重新开放。作者 abort 仍在确认终局之后发出。新资源许可须有启动、环境采用和无终局；plan／permit 沿原日志共同 prefix／CAS 提交。同 key 同资源可认回，异数据冲突；未知许可不授作用。physical_stop_observed 可以晚于终局或撤权，但只能引用原已计划资源。不承诺外部物理动作和日志事务原子提交。

TE-29 resource_adopted只引用原已planned/permitted、未移交且无stop观察的key。目的环境派生原execution_environment_adopted，不由native索引另签许可。adopt、permit和execution_ended沿同一SessionLog prefix提交；终局之后拒新移交。相同原事实可重读认回，非法关系拒绝。

TE-30 ExecutionSnapshot.resources保留原资源、许可、所有权和最新物理停止观察。冷恢复核原scope/backing与维护权限，再认回环境索引；当前代已移交资源不被call恢复误停。旧代回收观察只按原planned key写回，不造新key。观察evidence不自动成为模型消息，不改变late、首胜或delivery结算边界。
