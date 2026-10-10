# Session 模型调用编排

本模块提供 Session 的模型调用编排、主体投影、结果采用和关闭协调。
公共操作协议、形状和独立算法从[公共定义](../../core/model-request-runtime/SPEC.md)消费，不在此复制算法。
本包根入口公开独立函数与工厂，Cordis 工厂从 `./cordis` 导出。

整批结算的操作、句柄、请求、暂存工作行及恢复输入归core/model-request-runtime。
协调器、结算工作及恢复判断由session-runtime-local提供。SessionModelConstruction与SessionModelRuntimeConstruction必须显式提供settlementFactory，不提供本地兜底实现。
每条调用保留原binding、owner、Run解释器、策略及scheduler。未知批次和正在停止的操作继续使用原协调器；投影变更不替换这些资源。
Model 提供原内容存储的 SQL 工作行机制与删除端口，Session 使用原 custody 协调清理。它们不解释Session日志；Session决定完整批次、残留或可靠缺席后才请求删除。

## 会话请求准备的实际拥有者

既有SessionModelConstruction必须显式提供requestPreparation。createSessionModelRuntimeLocal也必须在可信构造参数中取得同一接口，不提供内置会话准备器或默认政策。CLI根选择Session提供者的sessionModelRequestPreparation。

会话超时求值、工具描述解析与完整历史校准由本包的请求准备拥有者完成。编排负责登记并等待该操作，将固定结果交给原发送和结算机制。

新调用的目录选择、模态判断、档案快照和参数合并通过requestPreparation.prepareCreation完成。本模块消费同包准备拥有者产生的PreparedModelCreation，不在新调用路径读取完整前缀或再次选择档案。获取transport及规划前核对准备内容的原CallKey、creationKey、来源和完整创建输入；不匹配时零规划、零发送、零创建写入。规划使用准备结果的已采用快照、参数、消息和工具。

发起前检查、续接检查和原调用停止检查通过requestPreparation.readCall取得CallHistoryResult，不在这三条路径直接读取完整前缀。已ACK的调用仍是终态，不能再次发送或续接。历史不可用时不得开始准备或发送。控制操作的普通中断／释放、未知控制写入认回及关闭时后台终结确认也通过Session读取历史。未知写入保留写入时的Session读取函数、各原解释器和原登记；投影替换不得改变这些引用。原任务停止后才核对同一前缀中的历史并释放登记。结算、结算工作恢复和ACK确认已由Session提供。本模块中的完整前缀读取属于 Session；物理执行池仍须单独满足其窄接口。

实际发送路径消费准备结果中的PreparedModelExecution。在规划或发送前，核对完整租户／会话／调用／发出序号、原创建键、调用来源及PlanInput目标；任何不匹配返回invalidInput，不规划、不发送、不追加日志。凭据和政策留在可信进程内的准备结果中，不进入可序列化执行请求。

## 保持的运行责任

十五操作的形状归公共 `ModelRuntimeOperations`；类型之外的共享行为归公共 SPEC。
共享生命周期与跨拥有者组合义务见[迁移范围](../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)。
接口迁移不得把当前 local 实现限制写成通用模型能力政策。

运行时负责提交后的观测、取消、退出和恢复。在途工作未实际停止前不得释放其责任。
停止等待超时只能形成诊断，不能把仍运行的效果改记为已撤除。
耐久 acknowledge 先保护当前状态，再在同一存储提交中推进释放；不能先删内容再声称提交成功。
外部效果、日志及模型请求的失败范围沿原协议，不以换包名或改入口消除义务。

## 实际调用容器的存续读面

根工厂createCallContainerPresence只借入本包实际createCallContainerStore返回的原store，不接受复制或自造store。它不拥有store的关闭权，也不授调用资格。

有原容器时，read核原创建Scope、日志generation及指定的executionGeneration，然后交付实际容器的原世代。sourceVersion来自该容器借入的sourceVersions。observed回调期间保有原容器读引用；精确租约释放和原close不得越过它。close撤新读，读引用未归还时返回unavailable，归还后可显式重试原close。回调失败保留原异常，仍归还读引用。

原容器缺失时只返回unknown、空executionGeneration及请求所带日志进度的版本表示。这个结果不证明来源有效、数据不存在或原执行已停止。不制造stopped目标或清空未知批次。已开始关闭的实际容器返回unavailable，不能以缺少容器或租约引用冒充关闭证明。实际重启恢复及停止证明仍归原恢复拥有者。

## 固定主体与共享执行

`createSessionModelRuntime(construction)` 返回默认完整 `service`、`project(inputs, facts)`、唯一整体 `close` 与原调用容器的 `executionSource`。
`inputs` 是受信装配提供的 `ModelRuntimeHostInputs`，每个端口固定本次真实主体和来源。
资格在原操作使用点重核。端口是当前资格的事实来源，不能捕获一次允许后永久放行。
装配须提供稳定端口对象，不能在投影建立后将其中的方法替换为另一主体。

`facts` 是同一 `createSessionModelCallFacts` 拥有者的借用视图。
该工厂的 `project(presence)` 固定 presence 端口并共用原 content/index。
视图没有整体 `close`，其 content 是借用端口，消费者不得关闭物理内容。
外来 content 对象使 `runtime.project` 同步抛出 `TypeError`，这是受信构造错误，不是业务结果。

投影只创建操作闭包，共用原 calls、ACK custody、结算 work、恢复登记、准备作用域和 inFlight。
投影不创建第二份完整运行时，没有整体 `close`，也不由运行时强缓存。
消费者和真实任务只保有自己需要的原来源。
未知 append/control 和背景收场条目保有生成时的原 history.call。
整体关闭逐条用原来源认回，不以基础主体或后继主体的 reader 替换。

每次 reconcile 先按公共约定校验输入并取得本次 recovery.authorize，再触碰共享恢复条目。
拒绝、来源异常或 await 后已关闭时返回 unavailable，原 scope 和任务保持。
原 enter/scope 只拥有物理停止和恢复责任，不能作为另一个主体的当前资格。
本地 reply_pending 的结算也先绑定当前 Session，核同一日志和结果，并取得当前 settle 证据。
失败不得调用原 invocation、发布 settling 或释放其责任。

应用从认证入口建立固定主体投影，driver 在取得实际授权主体后捕获该投影。
它们仍使用原调用容器、日志、恢复与 transport 拥有者。
这项纯工厂能力不表示下文的正式 Service 与资源注入已经实现。

`ownOpenCallInput(input)` 与 `openCall` 共用表示检查和请求复制。
成功返回请求自有的 JSON 值，host 与 observer endpoint 保持原能力引用。
非法表示返回原 `invalidInput`，不查询权限、不登记资源、不产生业务效果。
宿主在执行附加的 host 装配检查前使用此函数，不能用前置资格门遮蔽表示错误。

`validDispatchInput(input)` 复用 dispatch 入口对 SessionRef、ModelCallId 和可选 AttemptId 的表示检查。
它不核验权限、重试计划或调用状态，不登记资源。宿主在表示成立后才能报告自身停止准入。

## 无键选择命令的收口

无键的模型选择命令不承诺恰一次认回。追加回执未知时，不能凭当前 route 判原命令成功，也不能自动重放。原追加及相关回调全部实际停止后，可以释放该次命令的物理登记；不能为它制造待补 ModelResponse 或永久调用资源责任。仍活跃的写者必须继续持有登记。这不解除日志提供者自身的 IO 与恢复责任，也不放宽模型调用完整原批的认回义务。

## 保留差距

同一调用容器已确认的业务停止结果，在该容器后续close中保持有效。观察者或其他资源未排空时，继续返回unavailable并保留原引用；重试继续收尾未完成责任，不要求已经关闭的结算源重新提供停止证明。未确认的停止仍须重试，不能凭关闭请求、超时或取消信号缓存成功。

十五操作的公共定义与 Cordis Service 定义归 core/model-request-runtime；本包维护实际提供者和私有 construction。跨包调用者使用 core 公共类型，不依赖本包私有实现类型。完整迁移验收尚未完成。
生产 Session/Run 历史、终结与恢复来源仍由其各自拥有者承担，本批不宣称完整 Agent Runtime 已实现。
正式 createSessionModelRuntimeLocal 工厂以公共定义的本地 Service 子类提供十五操作，唯一键归 core。具名宿主输入、执行支持及按实际调用方 fiber 捕获主体遵循[资源与集成责任](adr/model-service-lifetime.md)。配置只含显式序列化界限；提供者自建私有调用、内容及事实，原 owner/source 仅交可信工厂创建者。消费 effect 在异步取得前登记，原 consumer 实际 stopped 后才归还借用；提供者也主动收场贡献，失败保有同 owner 重试。纯 construction 工厂保持独立使用。

## 验证

既有耐久、恢复、保留、默认策略和 codec 用例保持。纯 retryDelay 向量随其唯一拥有者迁移。
真实消费者用新公开入口，独立验证须对本批精确版本核对隔离、同提交、撤除与恢复热点。

## 实际执行来源的生产

Session 调用容器拥有者另外取得公共 `ModelRuntimeExecutionSource`；service/project 不携带它。
所有投影共用原 calls store 的私有转接，正常与 resumable 创建都在 insert 的同步边界登记。
原 insert 前先保有 prepared 原引用，不读取 view、不 await 或调用外部登记回调。
预保有分配失败时原 insert 尚未发生，准备责任沿原失败收场。
原 insert 返回 false 只撤本次新增引用；true 后不再分配登记；抛错时保有原候选并传播原失败。
其余 store 方法保持原 receiver、reservation 身份和结果。
调用 store 的唯一拥有者检查仍用原 store 身份。

索引保有全原容器或 ACK 后的小见证，不新增实际 store、事实、Schema、writer 或任务。
metadata 查询仅对 full record 读取一次原 view，以原 find/canRemove 取得登记/释放事实。
ACK 后小见证直接投影先前确认的原停止/释放事实，不再读原容器或为此保有闭包。
lookup 仅查该 key 的原代际；选择和借用规则沿公共协议。
capture 分配全部原投影及 frame 后，才同步发布逐原记录 pin 和全局 frame 计数。
释放后 frame 清自己的数组和记录引用，不依赖 GC，不撤销外部逃逸能力。

整体 factory 的唯一 ACK custody 取得私有 stopCapture/releaseCopies 配对；独立 custody 可以不取得该资源。
content.confirmAcknowledgement 真正确认后先封该 key，再原 releaseInMemory 完成实际关闭/移除。
releaseCopies 对全部原代核同 log binding、真实 released/未 registered 和旧 capture 计数。
不一致为 receipt_unknown，未实际停为 writer_in_flight，旧 pin 为 external_retention。
失败保有原副本，沿既有显式 cleanup 政策/scheduler 重试，不新增定时器或立即完成承诺。
全部小见证先准备完成，再同步清全原容器/句柄及每调用大引用，之后才允许原 Storage cleanup=released。
已耐久 released 不倒退，但不能跳过本进程副本检查。非 ACK stop/remove 保有原恢复及费用责任。
整体 close 不隐式清来源；source.release 还须全部 frame 已释放。

原 A22-V10 GC 两例、六轮收集和 90000ms 保持。
另验 metadata 外持、request/pending/invocation 的大引用、idle frame、活动 capture 对 ACK 的阻挡与释放后重试。
有限机制模型核同步 pin/seal/erase/released 和整体释放次序，不证明 GC 或 IO。

## 停止新工作与实际关闭

独立 `createSessionModelRuntime` 的 `closeAdmission()` 与正式提供者的同名控制仅关闭 openCall、dispatch、dispatchAgain 的新工作门。表示、当前资格和原完整逐操作失败次序保持；新门只拒绝进入实际新工作，已越过该点的任务保有原输入及资源。现存事实的读取、消费、失败来源、恢复、处分及 ACK 不由此关闭。应用已准入的恢复必须能继续使用原拥有者。

实际 `close()` 才启动原物理停止/排空与消费收场。消费 release 请求不是 stopped，原 source 同步 release 抛错不能归还其借用。只有实际资源和贡献责任全部归还后，可信装配才释放执行来源与 setup 借用；失败保有同 owner 重试。

异步 `acquireCall` 已创建真实 consumer 却因原资格撤销或物理停止而不能交付时，获取操作须请求该原 consumer 释放并等待其真实 `stopped` 后返回失败。不得丢弃句柄后提前归还获取所借的宿主来源；成功交付后的责任仍归调用贡献，不停止共享执行。

提供者 Config 中 tokenMargin.multiplier/reserveTokens 及 reservationWaitPolicy.maxWaitersPerCall/timeoutMs 唯一使用严格 JSON 数字词法字符串。前者保留 multiplier ≥ 1、非负整数 reserveTokens；后者保留正整数义务。非法词法或下界在取得资源前拒绝，无默认或数字兼容分支。提供者用 LosslessNumber 恢复精确值；装配方用公共 jsonNumberSource 编码，不能经 Number 舍入。独立函数的 JsonNumber 业务类型不变。

## 外部内容保有

外部内容的保有、发布许可和删除边界归 [Model 内容库](../../model/model-request-runtime-local/SPEC.md#内容与物理执行)。本模块必须等待该原内容库确认保有，不以引用存在代替原字节可用。

`createSessionModelRuntimeLocal(construction)` 将同一可选保有端口交给自建内容存储。可选 `decorateTransport` 只装饰原取得 lease 的 adapter。binding、signal、track、release 与原提供者责任保持。装饰同步抛错时归还该原 lease。两端口仅归可信装配闭包，不进入 Config 或普通 Context 服务，也不授予调用主体权限。装饰器必须保留原计划语义、取消与真实执行停止。

装配创建时固定两端口。装饰只用于请求投影，保留原 send、read、projectOutput、品牌及借用语义。它不能取得独立资源或关闭权，不能启动返回任务未覆盖的工作。


## 借用会话记录发布

SessionModelConstruction及SessionModelRuntimeConstruction必须由装配根显式提供recordPublication。创建与reply_ready路径调用它，不自行解释完整会话前缀或构造日志标记。Session 管理原读取登记和原追加任务，Model 内容库管理原发布许可；借入的会话发布者不得被替换为成功占位函数。

会话记录发布由同包的 Session 发布者完成。共用回执校验和停止等待函数归 Core。模型内容库只负责原件保管及许可，不参与会话状态恢复。

未知创建标记的恢复由 Session 发行 `ModelCreationPublication`。本模块保有该句柄并调用 `retry`／`close`；原标记是否存在由 Session 发布者判断。物理模型调用器不取得该句柄。

未知写入的关闭认回使用原操作登记时捕获的Session `readCall` 及原调用解释器。本模块等待原写与读任务实际停止，只消费原调用的读取结果，不自行读取完整前缀。读取不可用或释放失败时保留原任务与许可，后继装配不能替换原读取函数。


## 借用Session ACK拥有者

`SessionModelConstruction` 和 `SessionModelRuntimeConstruction` 必须显式提供 `acknowledgementFactory`。本模块构造原清理器后，将原内容端口和清理动作交给该工厂。`acknowledgeCall` 委派给其结果；物理 Model 调用器不参与 ACK 的日志判断。调用者选择 Session 的公开根工厂。

本模块保留原内容锁、固定批次和清理资源。重装配调用同一拥有者的 `project`，不重建确认状态。确认拥有者与清理器各自参加原运行时收场；只有全部真实任务结束，才关闭容器与内容存储。该迁移不改变原执行资格、引用计数、ACK内容摘要或清理策略。

## 调用事实索引的装配

调用事实索引由Session的createSessionModelCallFacts实现。SessionModelRuntimeConstruction必须提供callFactsFactory，本包没有内置实现或后备索引。纯createSessionModelRuntime沿用已有的callFacts输入。Core维护CallFacts、CallFactsView、SessionModelCallFactsFactory及原内容存储的共享形状。

插件创建原内容存储后，只调用一次工厂。每个主体投影借用同一索引及content原对象，不重复构造缓存或关闭拥有者。索引仍由原物理运行时关闭，不能随单会话Context卸载。工厂失败时不发布就绪服务，原资源按既有流程排空。完整执行池构造及其消费者仍须按公开契约验证，此项不单独表示完成。


## 委托Session完成会话恢复

完整日志恢复实现归 Session。本模块通过必需的settlementFactory.createReconciler创建一次恢复拥有者；投影只调用其project，关闭仍等待同一拥有者的close。构造失败不发布就绪服务，不使用内置恢复实现。

冷回复认回调用settlementFactory.recognizeReply；控制记录追加调用settlementFactory.appendControl。本模块保留原执行句柄、完整结果 custody、内容许可和实际停止责任，并将日志判断委派给同包的 Session 恢复拥有者。共享UnknownAppendTracker只等待原任务，并调用已捕获的Session读取能力。该迁移不改变原请求、费用、处分、ACK或关闭重试语义；最终纯ModelPool总装仍有独立交付判据。


## 会话选择的装配

SessionModelConstruction及SessionModelRuntimeConstruction必须提供selectionFactory，当前应用选择Session的createSessionModelSelection。本模块消费同包的选择工厂，不再由 Model 提供者执行会话选择。

原读取适配器按Session串行建立句柄；相同输入使用原句柄，输入变化先关闭旧句柄。未成功关闭则保留原拥有者，返回不可用而不覆盖。投影共享原句柄和锁，物理读取拥有者负责关闭。工厂抛错时保持不可用，不回退到本包实现。物理执行池不取得会话选择或历史读取接口。

### 读取的Session拥有者

SessionModelConstruction与SessionModelRuntimeConstruction必须提供readFactory。createRuntimeReads只适配本机执行视图和原custody，将读取交给该工厂；它不读取或解释完整会话日志。单独构造时只建立一个custody并交给同一读取拥有者，各投影共享它。完整ModelRuntime已有的custody只借出view，关闭仍归该运行时。

原失败响应交给SessionModelSettlement.readFailure核对，原发起从captureSource取得实际SourceToken。原registration、retainedReads、失败source集合、原收据验证、claim消费、物理launch和清理顺序保留。新接口不新增发送授权、不改变unknown处置，也不重建Session历史。

## 原调用协调的移交

createAnchoredModelInvocation归Session提供者，AnchoredInvocationInput归Core公开类型。独立物理执行函数 invokeModel 归 Model 提供者。现行服务通过借入的 sessionModelSettlement.createInvocation 创建原 handle，并显式传入构造时借入的 ModelInvoker；它继续保留同一个handle，直到原ready确认或实际关闭完成。不得以工厂返回成功代替原结果保管、ready或停止证明。这里是 Session 的原调用协调，不属于物理执行池。


## 物理调用与内容库的选择

SessionModelConstruction 必须借入公开 ModelInvoker。createSessionModelRuntime 在占有调用 store 前验证该函数存在。
SessionModelRuntimeConstruction 还须借入原 createContentStore 工厂。
应用选择具体 Model 提供者，本包不导入 model-request-runtime-local。

原 Session 协调器完成同 Unit 发起确认及原 claim 消费后，调用借入的 invoke。
调用器收到原规划、凭据、取消信号与回调，其同步返回的句柄仍由原协调器保有。
这次所有权迁移不增加模型使用许可，不再执行一次 claim 消费，不改变 ready、ACK 或 unknown 的语义。

这里的 executionSource 仍观察 Session 调用容器及原结算句柄，不能当作纯物理池的窄观察接口。
物理执行池的窄构造与当前消费者迁移仍未完整兑现。
