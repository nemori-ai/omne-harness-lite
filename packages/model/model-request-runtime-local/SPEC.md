# 本地模型请求运行时提供者

本包提供既有模型调用、默认策略、日志 codec 与耐久运行时。
公共操作协议、形状和独立算法从[公共定义](../../core/model-request-runtime/SPEC.md)消费，不在此复制算法。
根入口公开独立函数/工厂，Cordis 插件从 `./cordis` 导出。旧插件子入口已移除。

独立整批结算的共享操作、句柄、请求及暂存批次形状归core/model-request-runtime。
本提供者消费并重导出原类型名；SettlementCoordinatorInput和具体createSettlementCoordinator仍由本提供者拥有。
构造输入沿core的SettlementCoordinatorBinding，另加本提供者原政策／scheduler／diagnostic字段。
应用可将本工厂绑定为core的SettlementCoordinatorFactory；抽象分面不代替实际桥及借入资源的收场证明。
应用选择实际工厂及显式owner／竞争／时钟策略，Session消费者只借入公开结算协议。
原未知批次、实际停止及close保留责任不因定义归位改变。

## 会话请求准备的实际拥有者

既有RuntimeConstruction必须显式提供requestPreparation。createModelRuntimeLocal也必须在可信构造参数中取得同一接口，不提供内置会话准备器或默认政策。CLI根选择Session提供者的sessionModelRequestPreparation。

本包不再实现会话超时求值、工具描述解析或完整历史校准。旧call-tools和service-calibration模块已删除。当前混合消费者仍负责登记并等待准备操作，将固定结果交给原发送和结算机制；其记录／控制依赖仍需继续按窄执行池接口迁移。

新调用的目录选择、模态判断、档案快照和参数合并通过requestPreparation.prepareCreation完成。本包只消费PreparedModelCreation，不在新调用路径读取完整前缀或再次选择档案。获取transport及规划前核对准备内容的原CallKey、creationKey、来源和完整创建输入；不匹配时零规划、零发送、零创建写入。规划使用准备结果的已采用快照、参数、消息和工具。

发起前检查、续接检查和原调用停止检查通过requestPreparation.readCall取得CallHistoryResult，不在这三条路径直接读取完整前缀。已ACK的调用仍是终态，不能再次发送或续接。历史不可用时不得开始准备或发送。控制操作的普通中断／释放、未知控制写入认回及关闭时后台终结确认也通过Session读取历史。未知写入保留写入时的Session读取函数、各原解释器和原登记；投影替换不得改变这些引用。原任务停止后才核对同一前缀中的历史并释放登记。失败结算、ACK及其他未知写入认回仍待迁移，此处不表示完整执行池已完成。

实际发送路径消费准备结果中的PreparedModelExecution。在规划或发送前，核对完整租户／会话／调用／发出序号、原创建键、调用来源及PlanInput目标；任何不匹配返回invalidInput，不规划、不发送、不追加日志。凭据和政策留在可信进程内的准备结果中，不进入可序列化执行请求。

## 保持的运行责任

原发起Owner的共享操作形状归core/model-request-runtime，本包公开类型沿同一源重导出。
具体createOriginalIssueOwner选同Storage、实际日志和权限，并保留原limit／持久实现。
该Owner只借入日志的appendIn和readByKeyIn。关闭时，在同一StorageUnit中读取原发起索引和固定SourceToken下的原dispatch记录；它不读取完整Session前缀。
只有原索引、执行代次和完整记录（含原位置）全部匹配，才解除未知提交的保有责任。记录缺失、内容或位置不同、读取失败时仍返回pending；这不授予再次发送的权利。
这项限定不代表完整Model执行池已完成迁移，也不据此证明Session桥已消费实际owner。

createOriginalIssueOwner返回ModelExecutionRecords的stageOriginalIn和stageConsumeIn子集。prepareOriginal发行ModelExecutionJob；stageOriginalIn与原participant使用同一个函数和活体登记表。复制job、异拥有者job及异StorageUnit不能暂存；不保留另一套ticket类型或转换表。

stageConsumeIn只在调用者的实际StorageUnit内核对原claim、当前授权、原索引及精确日志条目，并暂存mr_original_consumption。该记录与同Unit的其他变更一起提交或回滚；方法本身不提交、不发送模型请求，也不返回launch。

消费记录按原Session、call和dispatch唯一，保存完整租户、原拥有者代际及原消费位置。重复相同原件返回alreadyConsumed；不同原件冲突。复制claim、已关闭拥有者或无法认回原件均不能新增消费记录。异存储Unit触发StorageDefect并中止该Unit，不包装成可继续提交的业务拒绝。

既有consumeOriginal使用同一stageConsumeIn写入路径。它先等原发起提交，再提交消费记录；只有明确提交成功且原拥有者仍接收工作，才返回一次launch。回滚或提交回复丢失不返回launch，认回已消费记录也不再次授权发送。其进程内单次调用保护和原资源收场继续保留。

十五操作的形状归公共 `ModelRuntimeOperations`；类型之外的共享行为归公共 SPEC。
尚未迁移的具体生命周期投影与跨拥有者组合义务继续按精确旧源，见[迁移范围](../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)。
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

`createModelRuntime(construction)` 返回默认完整 `service`、`project(inputs, facts)`、唯一整体 `close` 与物理拥有者的 `executionSource`。
`inputs` 是受信装配提供的 `ModelRuntimeHostInputs`，每个端口固定本次真实主体和来源。
资格在原操作使用点重核。端口是当前资格的事实来源，不能捕获一次允许后永久放行。
装配须提供稳定端口对象，不能在投影建立后将其中的方法替换为另一主体。

`facts` 是同一 `createModelCallFacts` 拥有者的借用视图。
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

真实 demo 从认证入口建立固定主体投影，runner 在取得实际授权主体后捕获该投影。
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

十五操作的公共定义与 Cordis Service 定义已迁至 core/model-request-runtime；本包维护实际提供者和私有 construction。跨包调用者使用 core 公共类型，不依赖本包私有实现类型。完整迁移验收尚未完成。
生产 Session/Run 历史、终结与恢复来源仍由其各自拥有者承担，本批不宣称完整 Agent Runtime 已实现。
正式 createModelRuntimeLocal 工厂以公共定义的本地 Service 子类提供十五操作，唯一键归 core。具名宿主输入、执行支持及按实际调用方 fiber 捕获主体遵循[资源与集成责任](adr/service-lifetime.md)。配置只含显式序列化界限；提供者自建私有调用、内容及事实，原 owner/source 仅交可信工厂创建者。消费 effect 在异步取得前登记，原 consumer 实际 stopped 后才归还借用；提供者也主动收场贡献，失败保有同 owner 重试。纯 construction 工厂保持独立使用。

## 验证

既有耐久、恢复、保留、默认策略和 codec 用例保持。纯 retryDelay 向量随其唯一拥有者迁移。
真实消费者用新公开入口，独立验证须对本批精确版本核对隔离、同提交、撤除与恢复热点。

## 实际执行来源的生产

工厂物理拥有者另外取得公共 `ModelRuntimeExecutionSource`；service/project 不携带它。
所有投影共用原 calls store 的私有转接，正常与 resumable 创建都在 insert 的同步边界登记。
原 insert 前先保有 prepared 原引用，不读取 view、不 await 或调用外部登记回调。
预保有分配失败时原 insert 尚未发生，准备责任沿原失败收场。
原 insert 返回 false 只撤本次新增引用；true 后不再分配登记；抛错时保有原候选并传播原失败。
其余 store 方法保持原 receiver、reservation 身份和结果。
物理 store 的唯一拥有者检查仍用原 store 身份。

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

独立 `createModelRuntime` 的 `closeAdmission()` 与正式提供者的同名控制仅关闭 openCall、dispatch、dispatchAgain 的新工作门。表示、当前资格和原完整逐操作失败次序保持；新门只拒绝进入实际新工作，已越过该点的任务保有原输入及资源。现存事实的读取、消费、失败来源、恢复、处分及 ACK 不由此关闭。应用已准入的恢复必须能继续使用原拥有者。

实际 `close()` 才启动原物理停止/排空与消费收场。消费 release 请求不是 stopped，原 source 同步 release 抛错不能归还其借用。只有实际资源和贡献责任全部归还后，可信装配才释放执行来源与 setup 借用；失败保有同 owner 重试。

异步 `acquireCall` 已创建真实 consumer 却因原资格撤销或物理停止而不能交付时，获取操作须请求该原 consumer 释放并等待其真实 `stopped` 后返回失败。不得丢弃句柄后提前归还获取所借的宿主来源；成功交付后的责任仍归调用贡献，不停止共享执行。

提供者 Config 中 tokenMargin.multiplier/reserveTokens 及 reservationWaitPolicy.maxWaitersPerCall/timeoutMs 唯一使用严格 JSON 数字词法字符串。前者保留 multiplier ≥ 1、非负整数 reserveTokens；后者保留正整数义务。非法词法或下界在取得资源前拒绝，无默认或数字兼容分支。提供者用 LosslessNumber 恢复精确值；装配方用公共 jsonNumberSource 编码，不能经 Number 舍入。独立函数的 JsonNumber 业务类型不变。

## 外部内容保有

`createModelCallContentStore` 默认拒绝外部附件引用。可选 `externalContent` 是受信构造端口，不是租户配置。提供者返回 `retained` 前，必须确认原内容中的全部外部原字节已耐久、不可变保有。保有须覆盖本调用内容的完整寿命及冷恢复。提供者可以按自身寿命保留更久。本存储的 ACK 清理只删除模型调用内容，不删除外部拥有者的字节。

确认失败、异常或原日志代际已变时，不发布内容引用。确认任务归原存储的在途任务，close 须等其实际停止。原内容摘要、retention 同提交、publish permit 和 ACK 规则保持。提供者不支持某种外部内容时必须拒绝，不能仅凭 locator 存在宣告保有。

`createModelRuntimeLocal(construction)` 将同一可选保有端口交给自建内容存储。可选 `decorateTransport` 只装饰原取得 lease 的 adapter。binding、signal、track、release 与原提供者责任保持。装饰同步抛错时归还该原 lease。两端口仅归可信装配闭包，不进入 Config 或普通 Context 服务，也不授予调用主体权限。装饰器必须保留原计划语义、取消与真实执行停止。

装配创建时固定两端口。装饰只用于请求投影，保留原 send、read、projectOutput、品牌及借用语义。它不能取得独立资源或关闭权，不能启动返回任务未覆盖的工作。


## 借用会话记录发布

现有混合RuntimeConstruction及ModelRuntimeLocalConstruction必须由装配根显式提供recordPublication。创建与reply_ready路径调用它，不自行解释完整会话前缀或构造日志标记。模型侧管理原读取登记、原追加任务及内容发布许可的存续；借入的会话发布者不得被替换为成功占位函数。

旧reference-publish实现已迁入Session且物理删除。共用回执校验和停止等待函数归Core。模型内容库仍负责原件保管及许可，不参与会话状态恢复。其他ACK、结算及恢复中的完整日志依赖仍待迁移，本变化不表示完整ModelPoolConstruction已兑现。
