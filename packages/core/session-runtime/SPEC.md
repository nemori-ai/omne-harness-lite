# Session Runtime 薄规格

状态：F0限定地基已集成，负责人已授权B01实施。公开形状、操作身份校验、Session事实及共同事务参加协议属于施工输入；事实与校验函数已有实现。完整Session服务、持久协调、调度与恢复装配仍须各自兑现，不能据本包定义推断已经实现。B01交付评审及真实产品验收尚未完成。

来源：PF-015生命周期／创建／恢复、PF-014受理／待处理、PF-012 Run／attempt／取消，以及SYS-TENANT／COMPOSITION。本包操作形状用于F0共同边界及后续提供者施工；它们尚非已发布产品API。

## 公开形状

沿既有TenantId、SessionRef、RunId、AttemptId、Message及合法AgentDefinition引用。`Access`由可信登录／系统／agent主体端口签发，显式含tenant、principal、权限观测代际；调用body自称主体不合法。
`OperationKey`是提交者稳定身份，不规定字符串生成格式；同key不同semanticDigest拒绝。
`OperationRef`闭合字段为tenant、可信principal、operation、operationKey、session。operation只取createSession／submitInput／cancelRun／setArchived；创建的session显式为null，其余必须为SessionRef。OperationKey是此ref内的键值，不暗含操作名。回执与未知公共提交均携带完整OperationRef；创建回执另携已分配SessionRef。查询按完整ref定位，不凭同键值猜操作。
`SourceToken`引用[Session Log定义](../session-log/SPEC.md#固定日志坐标)，不另定义。progress输出额外携带projectionRuleVersion；它是派生规则版本，不属于日志坐标。
`AttemptPermit`不是裸ID，绑定tenant/session/run/attempt、执行者代际及已验证准入事实，只由协调者签发。
`Receipt`包括OperationRef、受理／创建事实位置及SourceToken。全操作结果为下表成功联合或限定失败；未知公共提交按OperationRef查。内部step使用稳定stepKey／原消费位置认回，未知后重读该Session原事实，不另起新step；原调用仍按原call/result身份认回。
内部StepReceipt含tenant/session、Run/attempt或显式null、stepKey、step变体、事实位置及SourceToken，不冒充公共OperationRef。ResultReceipt含tenant/session、原call/resultKey、事实位置及SourceToken。三个receipt各按其原身份认回；公共readReceipt不查询内部step或原结果。

### 限定操作面

本包拥有`SessionIngressOperations`和`SessionLifecycleStep`／`SessionLifecycle`。
前者从完整SessionRuntime取createSession、readSession、submitInput、readReceipt、readProgress。
后者取startRun、startAttempt、adoptInput、prepareCall、adoptResult、finish。
它们沿用原操作的身份、授权、失败和提交承诺，不成为另一套业务语义。

B01采用这些操作集合，完整SessionRuntime的取消／归档和SessionCoordination的取消步骤仍保留原义务。
窄操作面不能宣称实现完整接口或完整Cordis服务，也不能用成功／unavailable占位替代缺失行为。
提供者须声明实际采用范围。子集类型存在不表示所有原因、终态或组合已经实现；例如当前本机startAttempt只支持首次first。
`./cordis`分别以`SessionIngressService`／`sessionIngress`和`SessionLifecycleService`／`sessionLifecycle`承载这两个操作面。
抽象服务只声明签名，不提供缺失行为。完整`sessionRuntime`和`sessionCoordination`仍承担各自完整义务。
若同时装配完整面和子集面，它们必须指向同一Session真相和协调拥有者，不能因服务键不同生成第二推进者。
可信lifecycle只进入宿主的可信协调装配域，不因Context类型增补向普通Session Agent插件授予资格。
操作仍在使用点校验原`Access`或`CoordinationAuthority`；服务可见性不能替代该校验。
实际提供者、依赖撤除与作用域隔离另须验证，不能从分面定义推断已经装配。

`session-runtime/facts-changed`使用`emit`，载荷为提交后的`SourceToken`。
它只提示重读，不承载完整消息、待处理队列或执行权；丢失提示不能丢失持久工作。
监听者按实际Session Scope过滤并在使用点核当前资格。
通知失败只记录诊断，不改变已提交的结果。

### 协调与消费者责任

本包拥有Session操作、协调步骤及跨提供者共享的行为承诺。
Session提供者负责持久工作、Run／attempt的协调及原结果交还。
它消费Agent Loop的纯判断和分段执行协议，不把持久Session真相交给纯Loop。
可复用工作扫描、调度、责任保留及原模型／工具消费由Session运行能力承载。
这些责任的公开消费接口与实际提供者须分别兑现，职责明确不表示已实现或已装配。

应用选择具体提供者、构造可信资源及执行来源，负责OS宿主、通道、配置和用户入口。
Session提供者通过公开协议借入模型／工具能力，不选择具体邻包工厂。
模型与工具的物理执行、费用和原ACK仍由各自拥有者履行；结果保管不等于采用或ACK。
迁移消费者时须保持原停止、unknown保管和关闭责任，不以新包装层消除这些义务。

### 可信工作读取与原Run日志

本包拥有`SessionWorkReading`、`OriginalRunJournal`和`BorrowedRunJournal`。
`./cordis`以`SessionWorkReadingService`／`sessionWorkReading`及`SessionRunJournalService`／`sessionRunJournal`承载前两个协议。
这些服务只在可信协调域借用；普通客户端和Session Agent插件不能取得协调权限或原Run日志。
提供者绑定原权限、持久事实和关闭责任。共享定义不证明具体绑定已经实现。

readWork是可信宿主的只读协调面，要求原coordinationAuthority及固定租户Scope。复制权限、跨租户、非法批量上限和关闭后的新读取均拒绝。它在同一实际StorageUnit读取已发布Session状态、按原顺序限定数量的pending位置和日志SourceToken，不消费资格、不建Run、不签发permit。活动原Run沿其持久grant读取，不因新登录准入关闭而停止；没有活动原Run时仍核当前成员。前置内部状态观察只用于选择授权路径，返回的三项数据必须来自最后同一个单元。未发布初始化返回unavailable，缺Session返回notFound，损坏原记录保留StorageDefect。借入者不得把完整协调快照通过普通用户协议输出。

可信根以原coordinationAuthority调用scanWork，按Session身份键集分页读取本租户active且仍有pending或活动Run的已发布Session。上界须为正整数且不超过构造时明确的扫描容量；复制authority、非法游标或关闭后调用不能读取。实际同StorageUnit校验状态和原创建发布身份；坏记录不伪装为空页。满页返回最后身份作为next，非满页next为null，调用者据此回到起点。

扫描不消耗pending、不核发新permit、不补登录资格，也不授模型／工具IO。登录资格、原grant及最新栅栏仍在后续原协调操作中核验。分页扫描及其关闭排空归原Ingress生命周期，普通用户传输不暴露该端口。

runJournal.borrow是可信运行根的内部入口，接原coordinationAuthority、固定Scope及原Run身份。它先在实际Unit核完整持久Run grant及原ticket使用，再返回BorrowedRunJournal。不签发新执行资格，不发送模型或工具请求。普通客户端和可序列化配方不能得到借用或其中的函数。复制权限、其他租户、缺失Run拒绝；损坏grant按StorageDefect报告。

借用提供原Session的SessionLog及完整readPrefix，供原模型准备、结算和ACK按各自公开协议使用。每次读写都在实际租户Unit重新核原grant，再授权同Unit日志参加者；不借普通成员读取资格，不嵌套日志独立事务。完整前缀包含本Unit取得的真实SourceToken；按key或位置读取保留实际尾部。写入复制／校验输入并拒绝其他Session、租户和Run；attempt fence、tail condition和去重沿原日志拥有者判断。拒绝使单元回滚。原Run日志权限不替代最新permit、模型的登记与当前装配模态或唯一claim。模型可用性沿模型协议的登记／模态／额度三项；本期不约束额度，不另设独立模型许可。

withReadUnit只供可信宿主读取本Run的求值输入。每次调用在原租户单元重新核原持久grant及ticket使用，随后调用一次读回调，并返回该回调的原结果。回调不得发外部IO、写入数据或使Unit逃逸。它不重新查询登录或成员，不签发新Run、模型或工具执行资格。已有Run的输入读取因而不使用新会话的成员准入端口；最新attempt仍在原发起点另核；模型登记与当前装配模态沿ModelRuntime的原调用路径核验。该读面与日志借用共用在途上界和关闭排空；close后不调用新回调，存储暂不可用返回unavailable，原程序缺陷保持异常。

借用generation是进程内生命周期对象，不是持久journalGeneration，不授予权限。currentGeneration在该借用可用时返回原对象，close同步将它变为null。借用和在途操作容量须在异步核验前预留，真实归还后才释放；具体容量由提供者显式配置。没有自动超时释放、替换或驱逐旧借用。

Ingress close拒新借用和公共操作，但已经接受的借用继续允许原Run结算；Ingress必须等借用者明确close并排空实际单元后才报告关闭。可信根须先完成原模型／工具责任，再归还借用，最后释放Ingress及共享依赖。BorrowedRunJournal.close拒新操作，等待本借用的真实工作，保持原关闭结果；失败保留原异常及拥有者责任，不关闭借入Storage或日志。未知存储提交按SessionLog原协议返回unavailable；原模型拥有者仍按原批次认回，不能视为未发或换键重发。

### 驱动撤除与原责任

`SessionDriverControl`只包含requestStop和close，归本包拥有。
`./cordis`以`SessionDriverControlService`／`sessionDriverControl`承载它。
控制面只进入可信协调域；它不是Session用户操作，也不接收调用者自称的执行权限。
抽象服务不启动驱动，不证明已有提供者绑定。

requestStop同步停止新的扫描准入、新Run／attempt推进及新执行发起，并停止本驱动的本地等待。
它不取消已发出的原模型／工具执行，不终结原Run，不归档Session，也不关闭借入物理池。
已分配的原身份、未知提交、原结果与尚需使用的输入继续由同一驱动持有。
原结果保管、结算、ACK及归还仍按各自使用点权限完成；停止新工作不能撤掉这些原责任必需的来源。

close包含requestStop，等待本地段停止或将原工作移交给仍存续的可信拥有者。
它不把公开completion当实际stopped，也不为等待外部执行无限阻塞本地撤除。
只有全部原责任可靠结束或可靠移交、且所拥有借用已实际归还时，才返回`{closed:true}`。
未完成时返回`{pending:true,held}`；held是正整数的原责任保管条目数，不是线程数或物理调用数。
pending仍保留同一控制对象、原操作面及未释放依赖；调用者不能关闭仍被借用的根资源。
后续显式close只能认回并继续同一次收场，不重新开放准入、换调用身份或自动重发执行。
并发close共享同一进行中的收场；pending不能永久缓存为最终结果。
实际收场缺陷拒绝Promise并保留原责任，不改写为pending或closed来隐藏错误。

以上是类型之外的施工承诺。当前仅定义控制面，实际驱动、撤除和归还行为尚未实现。
实现验证须覆盖：正常关闭、外部工作仍在途的pending、pending后显式完成、重复／并发close、
停止本地等待后原结算／ACK仍可用、归还失败保留、双Session不互撤及借入物理池未被关闭。

### 可信驱动启动与Cordis接入

SessionDriverStartup.start接完整SessionDriverPolicy和插件拥有的AbortSignal，返回实际SessionDriverControl。
这只是可信根选择提供者及资源的构造接缝；实际Run、HostInputs、Loop、调用和结果责任归Session提供者。
root不以start回调实现这些业务，不从插件配置生成活体权限。
pure提供者的完整构造形状留其公开根入口，CoreSession不导入Model／Tool／Agent Loop的反向依赖。
Cordis插件inject sessionDriverStartup，以纯数据policy调用start；返回实际控制后才发布sessionDriverControl。
这些抽象定义不构成实际plugin、根工厂或生产装配已经交付的证据。

policy六项必须为1～2147483647的整数，完整传入，不补隐式资格或未声明工程默认值。
scanLimit限制一次工作页，intervalMs限制扫描间隔，maxTasks限制实际并行段，maxHeld限制原责任登记，
maxFailures限制错误保留，maxStepsPerPass限制一轮本地推进；达到上界不驱逐旧责任或重发未知调用。
非法配置须在插件加载时失败，纯函数构造同样拒绝，不因字段名称自动拥有实际限界。
checkSessionDriverPolicy是唯一共享形状／界值核验和不可变捕获；缺字段、多字段、非整数或越界拒绝。
Cordis的Standard Schema适配复用它，不能另补默认或另一套界值。

启动前root登记原实例和所借资源的收场拥有者，先于任何可产生工作或等待的操作。
start部分成功后拒绝时，root仍保留原已分配资源与责任，并履行原收场；没有返回control不等于无责任。
signal只撤启动和新工作的本地准入，不取消物理Model／Tool、不终结Run、不归档Session。
插件先登记撤除处理再等待start。等待期间依赖撤除或signal终止，晚到的原control须立即requestStop，
接续其同一close，不发布为新服务。root始终保管它；不能使晚到实例无人收场。
原控制对应原资源。重注入、配置变化或后继启动不代旧实例完成close，不重用其claim或借用。

撤除后pending或close缺陷仍保原可信root及真实可用资源，不能仅保存已被Cordis撤除的服务对象引用。
只有实际closed后才释放最后依赖；普通Session Agent Context、tree JSON和客户端请求不持有startup。
E1须检验真实函数／Cordis路径的配置拒绝、晚到启动、部分启动失败、依赖换代、原pending续关、
双实例不互撤及Model caller trace隔离。当前仅固定构造与撤除承诺，完整提供者构造仍待闭合。

### Session日志事实

SessionFact及其运行时校验由本包拥有。事实使用Session Log的fact分类，owner为session-runtime，version为1；不得封装成模型消息或SystemReminderMessage。闭合变体为session_created、input_accepted、run_started、attempt_started、input_adopted、call_prepared、result_custodied及run_finished。创建事实保存已发布的定义引用和执行选项；它不是初始化准备成功的替代。受理事实保存完整OperationRef、原业务语义摘要和原消息位置；消息全文另归messages子类型。call_prepared保存原Run／attempt、call、协调者的稳定原准备位置和stepKey；它不授予模型或工具IO权。执行能力自己的原输入位置由其拥有者另核，不把两种位置混为同一字段。result_custodied保存原Run／attempt、call、resultKey、完整结果的语义摘要和时刻；它只指认持久保管事实，不代表消息采用、replyDisposition或ACK。完整结果、必要引用及原调用证明须与该事实按原结果承接边界保存。

Session Log的顶层run／attempt必须同时存在。尚无attempt的run_started因此不设置这两个顶层字段；其body的run指认原Run。attempt_started、input_adopted、call_prepared、result_custodied和run_finished必须与条目顶层run／attempt精确相符。创建及受理事实不得借顶层Run归因。受理／承接位置指向此前的原日志位置，不能引用自身或未来。readSessionFact核对应字段、原租户及Session关系，未知版本或坏的自称事实拒绝；它不证明引用的全文已存在，完整前缀及协调者另核来源。

模型消息投影验证本包所有现行事实变体后跳过其非消息内容。验证通过不产生消息，也不改变已有消息的可见性或工具配对规则。

| 操作 | 输入 | 成功／明确失败 | 可观察效果／并发点 |
|---|---|---|---|
| `createSession` | Access、operationKey、AgentDefinition引用、显式executionType／mode、合法可选workspace | created(SessionRef,receipt)；unknownCommit(OperationRef)；invalidInput／denied／definitionUnavailable／unavailable／conflict | 同key异业务语义为conflict；幂等创建，初始化阶段可恢复，最后发布；不启动Run／模型 |
| `readSession` | Access、SessionRef | session(归属、定义、模式、生命周期、sourceToken)；notFound／denied／unavailable | 不写；归属不是由ctx推导 |
| `submitInput` | Access、SessionRef、operationKey、已校验来源与消息／命令 | accepted(receipt)；unknownCommit；invalidInput／denied／notFound／notAccepting／identityConflict／unavailable | 普通消息受理事实与资格／work索引同提交；具体命令只走其已定义产品时机 |
| `readReceipt` | Access、完整OperationRef | present(receipt)或absent；invalidInput／denied／unavailable | ref中的tenant／principal必须与可信调用者一致；创建可在尚未知SessionRef时查。absent只证明该提交快照尚无原操作，不保证在途事务未来不提交 |
| `readProgress` | Access、SessionRef | progress(Run/attempt/段/等待/终态、sourceToken、projectionRuleVersion、reconciliation)；denied／notFound／unavailable | 版本化投影，reconciliation为verified或needed；读取不推进 |
| `cancelRun` | Access、SessionRef、RunId、operationKey、graceful或force、明确reason | recorded(取消阶段,receipt)；alreadyTerminal；unknownCommit；denied／notFound／invalidInput／identityConflict／unavailable | 撤准入和取消意图同提交；实际完成与请求分开；同key异graceful/force、目标或reason为identityConflict |
| `setArchived` | Access、SessionRef、operationKey、archived布尔值 | recorded(生命周期,receipt)；unknownCommit；denied／notFound／invalidInput／invalidTransition／identityConflict／unavailable | 同key异archived值为identityConflict；同语义重放认回原receipt。归档取消未承接资格；撤销不恢复任务／执行 |

内部`SessionCoordination`端口只给受信协调／执行者，不向普通工具或用户暴露：

| 操作 | 输入 | 成功／明确失败 | 效果与重复 |
|---|---|---|---|
| `evaluateWork` | trusted协调资格、Session、固定facts＋完整currentInputs | 无工作／等待原义务／原attempt继续／新Run或attempt候选／原调用接续／收尾候选；invalidInput／unavailable | 纯判断返回预期head；非法表示invalidInput，必需来源未取得unavailable；不写，不认为signal即充分条件 |
| `commitStep` | CoordinationAuthority、Session、expectedSource、下表闭合step及其适用permit | committed(StepReceipt、新source、适用新permit)；invalidInput／retryFromFacts／staleAttempt／terminal／denied／unknownCommit／unavailable | 启动与治理不凭尚不存在的attempt授权；按变体校验，单Session锁内读当前相关事实并重求值后同提交；无关日志追加不使进展步骤永久重试 |
| `admitInvocation` | trusted实际执行者资格、Session、callId、原prepare位置、permit、当前授权／装配证据、可信OriginalIssueParticipant | issued(仅原唯一执行owner启动权)或alreadyIssued(只读原证明，不授权IO)；staleAttempt／terminal／closed／denied／invalidInput／unknownCommit／unavailable | 栅栏与实际发起承诺同一原子端口；发出锚点对齐模型原已出门／工具原queued意图；与唯一执行所有者claim同提交。重复只读认同原固定输入，不取得第二启动权 |
| `deliverResult` | trusted原执行者、原callId、稳定resultKey、原结果来源＋归因 | adopted(ResultReceipt,custodyWitness)或alreadyAdopted(ResultReceipt,custodyWitness)；storedLate(ResultReceipt,custodyWitness)；identityConflict／invalidSource／unknownCommit／unavailable | 三个成功都证明Session已持久接管原完整结果及后续责任；原能力ACK仍由对应适配按原规则提交。最新attempt才推进，late不新建资格 |
| `scanWork` | trusted恢复资格、有限pageLimit／cursor | page(初始化、输入、等待、取消、交接义务,cursor)；invalidInput／unavailable | 公平分页；不要求Agent或新通知；扫描不是消费 |
| `reconcileSession` | trusted资格、Session、原调用可核实证据及source generations | readyToEvaluate或blocked(具体义务/原因)；retryFromFacts／unavailable | 对账只认原执行身份；读失败不能制造失败收场 |

`SessionStateParticipant`是内部存储端口：验证同实例StorageUnit，读／锁Session当前状态，参加追加已校验事实和状态更新。闭合step语义由上述定义拥有；调用者不能任意写表或伪造permit。
普通公共操作自己开原子单元；参加接口只在unit内暂存，不独立提交。unit结束后引用失效，普通append不自动参加。

实际发起端口由协调者打开一次unit，核当前授权和栅栏，调用原执行能力提供的OriginalIssueParticipant在同unit暂存原已出门／queued锚点及唯一execution claim，再统一提交。participant来自受信construction，不接收用户回调；绑定原call、输入与执行代际并校验同Storage实例，不能任意写表。它不另开事务、不先发IO；失败全体回滚，unknown保原身份查明。只有真正commit后返回issued并由绑定原claim的执行方启动，Session不取得send／tool-execute职责。两个先后独立提交不是此接口的实现。

readAttemptStarted是现行SessionFact联合类型的只读投影：合法attempt_started返回fact；其他合法已知变体返回other。它复用完整条目校验，未知版本、未知自称变体或坏的归因仍返回invalidInput，不能把混合日志中的合法创建、受理、Run或结果事实当成坏的attempt。

### 启动与推进授权

CoordinationAuthority是会话协调者的受信资格／代际，不是AttemptPermit。锁内校验当前拥有者及准入；身份生成沿既有类型，不预设字符串格式。stepKey及原位置稳定，重复只认回原提交。
公共写重放先核当前授权，再按完整OperationRef读原语义和回执；相同语义认回原receipt，异语义按操作表拒绝，只有未提交的新操作再判断当前状态。因此同key取消重放不因Run后来终结而丢失原receipt；新的取消键针对已终结Run才返回alreadyTerminal。

| step变体 | 必需输入与保护 | 成功后 |
|---|---|---|
| startRun | CoordinationAuthority、已受理资格位置；无未终结Run；不要求permit | 原子建立Run并承接资格；可尚无attempt |
| startAttempt | CoordinationAuthority、Run、开始原因；可推进且无有效旧推进者；不要求旧permit，锁内核原fence | 分配／认回attempt序号与身份、写开始事实及新fence，返回新AttemptPermit |
| adoptInput／prepareCall | 最新AttemptPermit、Run／attempt、原消费位置及来源；prepare另含原模型稳定creationKey或工具原调用身份 | 同提交采用位置／保存原调用准备，不凭prepare取得IO权 |
| adoptResult | 最新AttemptPermit、原位置和已持久原结果来源；只在可推进当前Run时应用 | 派生采用／推进；终态迟到只由deliverResult存事实，不走此变体 |
| finish(completed／异常收场) | 最新AttemptPermit、原段；锁内核无动作与无有资格待处理输入等源条件 | 写终态并撤推进权 |
| cancelStage／finish(force-cancel) | CoordinationAuthority及已提交取消意图；不要求Agent或permit | 治理者推进取消／写强杀终态，原结算义务继续 |

首次受理由协调器evaluateWork／commitStep建立Run，再在合法可推进条件下startAttempt；新permit提交后才开始Agent Loop。Agent driveStep只接已有attempt的最新permit，不处理会话启动、不伪造空Run的permit。治理取消不由普通Agent参数自称授权。

### 原结果保管与ACK

custodyWitness绑定原call/result身份、原ResponseId或工具原结果标识、原origin/dispatch、原值语义摘要、Session持久事实位置及SourceToken。原完整Pending及其必要引用在ACK前已由Session可靠保存，摘要不能替代全文。
adopted首次保存、alreadyAdopted认回同一原完整值、storedLate终态迟到保存，均返回保管凭证；迟到没有待推进资格。unknownCommit没有ACK，原执行方继续保管并查原resultKey。
保管承接不等于模型replyDisposition的consumed／vetoed／persisted；实际消息采用仍按原能力规则。模型适配将已核实保管事实映到[当前模型公开类型](../model-request-runtime/src/service-types.ts)的AcknowledgeCallInput，并遵循[当前模型ACK行为](../model-request-runtime/SPEC.md)。工具适配沿原delivery_ready／delivery_confirmed及结果引用存续协议，不借模型ACK。不把custodyWitness当通用伪ACK。模型接受ACK后才按自己的清理清单释放副本；工具交付确认不单凭确认释放必要引用或证明原作者／writer已停止。

## 类型之外的行为

SR1：成功受理必有可恢复事实、资格和work索引；未知与明确拒绝不同。成功回执只在真正提交后返回；通知失败不改提交事实。
SR2：所有改变Run当前选择／栅栏／资格／终态的决定，在同一Session写锁内读当前相关状态、重求值并提交事实和投影。expectedSource定位求值快照；与该步骤有关的Run／fence／资格／取消／装配变化必须重新判断，无关追加不能单凭全tail不同反复拒绝。昂贵纯组装先固定完整prefix，后续合法普通追加留下一步；需要tailEquals的原模型完整批在同一锁内读取最新tail并构造一次批次。正常completed锁内检查当前待处理资格。
SR3：任一Session至多一个未终结Run；任一原位置只有一次承接；Run终态吸收。并发冲突重新求值，不盲重试旧决定。
SR4：新attempt仅在可推进且无有效旧推进者时建立；原attempt仍有效则继续，等待未满足则无attempt。崩溃缺结束记录合法。
SR5：permit只准最新attempt推进／发起；原调用结算资格独立，旧attempt或终态迟到仍保存原结果／费用，不获得新推进权。
SR6：发起准入、模型原已出门／工具原queued意图与唯一执行owner claim同提交线性化；不增加更早的网络许可。仅原claim的execution generation可启动，重复证明只读，不发IO。旧执行所有者及所有可能writer真正停止且原模型／工具恢复规则允许时，才能由明确唯一后继接手；工具不因恢复重起，模型续发沿原dispatch序号／first-token守卫，不将认回当再发。取消之前未issued可拒绝，之后处理已发起，外部效果未知显式保留。禁止check-then-open间隙。
SR7：取消进展由会话协调承担，零Agent仍发现并继续；强杀无需原协程写终态，实际结算不伪称已完成。
SR8：扫描/等待/重试/缓存资源界是显式有界策略；错误可观测，进展仅在存储、授权、执行源、公平调度前提下声明。
SR9：事实分类不得把attempt包装为消息；不可变历史和合法业务消息保持，工作副本只在可靠交接完成后清除。
SR10：close同步撤新准入／失效代际，然后await真正owned work drain；未知交接保持责任及依赖，不以超时报告完成。返回closed或pending(明确义务)；dispose不是Session归档。

## 验证义务

二租户、受理丢回执、同key异载荷、事务半提交、finish/input竞争、attempt栅栏及准入竞争、重复结果／ACK、迟到费用、无Agent取消／恢复、unknown外部效果、typed公共入口与真实主体来源。
共享模型为[系统协调模型](verification/models/SessionWork.tla)；提供者真实storage故障、OpenRouter和多会话组合不能用有限模型代替。

### 锁内进展与实际权限

在公平、有界事务调度下，协调者取得Session写锁后处理当前有资格输入或取消阶段，采用显式批量界，不被持续无关append饿死。所有触碰该Session当前选择／资格／tail的写方使用同一存储顺序；不额外假设安静窗口。当前权限端口在实际提交／发出准入点核实并与撤权有确定先后；Access历史快照不是许可。装配无法提供当前性／同次序资格证据时明确unavailable并保责任，不默认允许。

本阶段操作的身份、授权、幂等、提交、通知与在途共用规则见[共用规则](adr/shared-operation-rules.md)。本文与该表一起读取；不从目录存在推断实现完成。

## Run事实的投影依据

会话日志是Run／attempt事实的唯一权威。相同Session／Run存在更大attempt序号的已确认条目时，原attempt已被取代；与Session Log尝试栅栏使用同一条件。attempt首条是其开始事实。明确Run终结事实使该Run进入吸收终态，后续延续是另一个Run，不能复活原Run。
完整prefix中的这两项事实同时求值，不混合两次读取；按同一确认日志前缀派生的表或缓存才可作为投影。确认的取代／终结不会倒退；明确不存在原attempt、未知日志版本／终结形状或读取故障不合成两个false。身份与可信调用方显式给出，不能从当前上下文猜测，也不向普通用户暴露内部事实端口。
Tool落账使用构造同一提交的完整prefix，不先读两个布尔再开写事务；Model沿其同prefix的RunHistoryReader。当前公开入口没有旧attemptFacts读方法或runAttemptFacts服务键，不为迁移增加兼容接口。未来跨进程读取必须说明日志位置和当前性，不能用滞后副本放宽栅栏或late责任。

Run事实验证须核同一prefix两轴一致、取代与Session Log拒旧fence同条件、原attempt不存在及来源故障不答当前／open、已取代和已终结只增；未知终结版本不能补false。本义务不因事实读API退出而删除，未执行结果仍需如实报告。
