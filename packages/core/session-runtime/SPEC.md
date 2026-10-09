# Session Runtime 薄规格

状态：负责人已授权F0限定地基实施。公开形状、操作身份校验、Session事实及共同事务参加协议属于本次施工输入；事实与校验函数已有实现。完整Session状态提供者、持久协调、调度与恢复装配仍为后续阶段目标，不能据本包定义推断已经实现。F0交付评审与负责人review尚未完成。

来源：PF-015生命周期／创建／恢复、PF-014受理／待处理、PF-012 Run／attempt／取消，以及SYS-TENANT／COMPOSITION。本包操作形状用于F0共同边界及后续提供者施工；它们尚非已发布产品API。

## 公开形状

沿既有TenantId、SessionRef、RunId、AttemptId、Message及合法AgentDefinition引用。`Access`由可信登录／系统／agent主体端口签发，显式含tenant、principal、权限观测代际；调用body自称主体不合法。
`OperationKey`是提交者稳定身份，不规定字符串生成格式；同key不同semanticDigest拒绝。
`OperationRef`闭合字段为tenant、可信principal、operation、operationKey、session。operation只取createSession／submitInput／cancelRun／setArchived；创建的session显式为null，其余必须为SessionRef。OperationKey是此ref内的键值，不暗含操作名。回执与未知公共提交均携带完整OperationRef；创建回执另携已分配SessionRef。查询按完整ref定位，不凭同键值猜操作。
`SourceToken`引用[Session Log定义](../session-log/SPEC.md#固定日志坐标)，不另定义。progress输出额外携带projectionRuleVersion；它是派生规则版本，不属于日志坐标。
`AttemptPermit`不是裸ID，绑定tenant/session/run/attempt、执行者代际及已验证准入事实，只由协调者签发。
`Receipt`包括OperationRef、受理／创建事实位置及SourceToken。全操作结果为下表成功联合或限定失败；未知公共提交按OperationRef查。内部step使用稳定stepKey／原消费位置认回，未知后重读该Session原事实，不另起新step；原调用仍按原call/result身份认回。
内部StepReceipt含tenant/session、Run/attempt或显式null、stepKey、step变体、事实位置及SourceToken，不冒充公共OperationRef。ResultReceipt含tenant/session、原call/resultKey、事实位置及SourceToken。三个receipt各按其原身份认回；公共readReceipt不查询内部step或原结果。

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
保管承接不等于模型replyDisposition的consumed／vetoed／persisted；实际消息采用仍按原能力规则。模型适配将已核实保管事实映到[当前模型公开类型](../model-request-runtime/src/service-types.ts)的AcknowledgeCallInput，并遵循[当前模型ACK行为](../model-request-runtime/SPEC.md)；工具适配沿工具原ACK。不把custodyWitness当通用伪ACK。原能力接受ACK后才按自己的清理清单释放副本。

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
