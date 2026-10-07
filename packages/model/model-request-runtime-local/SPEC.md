# 本地模型请求运行时提供者

本包提供既有模型调用、默认策略、日志 codec 与耐久运行时。
公共操作协议、形状和独立算法从[公共定义](../../core/model-request-runtime/SPEC.md)消费，不在此复制算法。
根入口公开独立函数/工厂，Cordis 插件从 `./cordis` 导出。旧插件子入口已移除。

## 保持的运行责任

十五操作的形状归公共 `ModelRuntimeOperations`；类型之外的共享行为归公共 SPEC。
尚未迁移的具体生命周期投影与跨拥有者组合义务继续按精确旧源，见[迁移范围](../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)。
接口迁移不得把当前 local 实现限制写成通用模型能力政策。

运行时负责提交后的观测、取消、退出和恢复。在途工作未实际停止前不得释放其责任。
停止等待超时只能形成诊断，不能把仍运行的效果改记为已撤除。
耐久 acknowledge 先保护当前状态，再在同一存储提交中推进释放；不能先删内容再声称提交成功。
外部效果、日志及模型请求的失败范围沿原协议，不以换包名或改入口消除义务。

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

公共十五方法及独立选择/重试/历史/响应算法已由 core 拥有；本包只导出其具体独立调用与工厂。
`RuntimeConstruction` 是显式工厂输入，不能作为 JSON 插件配置。五个相关公共拥有者保持各自边界。
生产 Session/Run 历史、终结与恢复来源仍由其各自拥有者承担，本批不宣称完整 Agent Runtime 已实现。
实际 runtime 仍以普通对象提供，正式 Service 的实现与运行资源注入尚未完成。
唯一 `MODEL_RUNTIME_SERVICE` 键已归公共 `./cordis`；键唯一不表示普通对象已满足正式 Service 集成。

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
