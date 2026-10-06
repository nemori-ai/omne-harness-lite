# 装配代际的资源收尾

本包拥有 `AssemblyLifetime`、逐行端口及其关闭协议。纯根不加载 Cordis。
`./cordis` 定义抽象 `AssemblyLifetimeService` 及管理启动 helper，唯一服务键为 `assemblyLifetime`。
它实现 `AssemblyLifetimePort`，不把整体关闭权交给行提供者。
此端口隔离只路由资源责任，不授予租户权限。

## 控制权与资格

调用方先给出非空、唯一的行 id。协调器复制并固定该序列，未知 id 是使用错误。
依赖提供者必须排在消费者之前。装配拥有者负责核对真实依赖与该顺序一致。
同一运行时的多个服务面登记为一行。协调器不推导依赖图，不替代 Cordis 服务发现。

`isPristine` 只观察尚未接管且未停止的初始状态。`tryClaim` 同步接管一次，不能释放或重用。
接管成功之前不得安装资源。未接管时 `register` 拒绝，不改变初始状态。
每行只登记一次。重复登记或停止后登记均拒绝，并同步请求整个代际停止。

第一次停止先使协调器及全部端口 `isCurrent` 恒为 false，再调用 `onStopping`。
回调必须同步，只通知状态变化，不承担排空或资源释放。
回调抛错记录 `assembly-stop-failed`，仍继续关闭，不恢复资格。
装配必须直接读取该资格，不能仅靠事件、回调或已兑现的启动 Promise 控制新准入。

## 资源与完成

提供者在任何资源副作用之前登记 `OwnedWork`。它用 deferred `ready` 观察本次 setup。
setup 成功兑现 ready，失败拒绝 ready。协调器立即观察拒绝并请求整个代际停止。
effect 安装失败或启动取消也必须结束 ready 并请求停止，不能留下无人完成的占位。
close 必须能收尾任意已取得的资源前缀，不能在 setup 失败时遗漏局部资源。

提供者在登记的同一 fiber 上安装 effect。effect 只请求停止并等待本行 `closed`，
不得另外关闭资源。唯一实际关闭者是协调器调用的 `OwnedWork.close`。
关闭任务独立于 fiber disposal，不能先等 effect 退出再调用资源 close。

管理绑定的 apply 同步返回 void，使用 `./cordis` 的 `startAssemblyWork(ctx, setup, close)`。
helper 先登记 ready，再安装 effect，随后才调度异步 setup。
setup 前及成功返回后都核对 fiber 尚未撤除、代际仍 current。
setup 失败、资格失效及 effect 安装失败均拒绝 ready 并请求停止。
effect 安装失败不执行 setup；登记失败同步抛出使用错误，不创建资源。
登记之后的失败通过 ready 交付，helper 不向 Cordis logger 重复输出原异常。
所有异步拒绝立即观察。close 仍须处理实际取得的全部资源前缀。

代际资格检查失败使用纯根的 `AssemblyWorkStopped`。setup 自己抛出的异常保持原对象，
不因同时收到停止请求而替换成此错误。应用可据此区分初始化取消和真实打开失败；
该错误只说明启动资格失效，不表示工作或资源已关闭。

装配的逐行端口捕获 ready，必须同时等待其成功、fiber ACTIVE、服务可见及资格有效。
`await fiber` 成功不能替代资源就绪，也不能授权开闸。
提供者跨 await 后发布 Service 或开放网络之前，仍须核对本行资格。
helper 最后的检查不回滚已经发生的外部效果，也不替代提供者的发布前检查。

协调器按已给序列的逆序处理已登记行。每行先等 ready，再调用 close。
ready 失败仍须调用 close。两处失败分别记为 `setup` 和 `close`，不暴露原异常内容。
本行实际完成后才兑现本行 receipt，随后处理前一行。
未登记行没有资源结果；完整装配是否缺登记由装配协议核对，不能从空报告推断完整加载。

close 的兑现或拒绝都必须晚于本行全部业务工作静止。
它可以在静止后报告资源释放失败。不能确认静止时保持 pending，不能提前拒绝或跳过该行。
超时、取消请求、发现入口撤除和网络连接关闭均不等于工作完成。
进展依赖 setup、已接纳工作及 close 最终返回，本包不强迫外部工作结束。

`close()` 与 `closed` 是同一个 Promise。重复停止不再次通知或关闭。
没有停止请求时 closed 保持 pending。报告只在全部已登记行处理完后返回。
只有 setup、close 和停止通知都无失败时 complete 才为 true。
它不表示 fiber、外部资源端口或宿主 guard 已完成处理，也不表示业务都成功。
本协调器只产生 `assembly-stop-failed`；装配层另建报告合并其协议和 disposal 错误。
已返回报告不可修改。资源失败尚未处置或完成状态未知时，不得启动后继代际。

## 装配与验证责任

### 未确认关闭的保有

纯根的 `createRetainedWork(ready, attemptClose)` 返回 `{work, control}`。
`ready` 为 `Promise<void>`，`attemptClose` 为 `() => Promise<void>`。
返回的 work 是 `OwnedWork`，control 是 `RetainedCloseControl`。
`work.ready` 必须引用传入的同一 Promise，不替换原初始化结果。
`work.close()` 只启动第一次原 attemptClose，每次返回同一个完成 Promise。
原关闭成功后才兑现该完成 Promise。原关闭拒绝或同步抛错，只产生 retained 观察，完成仍 pending。
真正 pending 的原关闭也保持 pending。适配不判断权限、物理停止或失败后重试安全，这些责任归原根。

关闭开始前，control 的两个方法均固定等待第一次尝试，不发起停止或自动重试。
关闭开始后，`closeAttempt()` 固定观察调用时最近已发起的尝试，后来重试不改变该次观察。
`retryClose()` 在有在途尝试时加入它；没有在途尝试且未成功时，显式发起一次同原根重试。
并发重试合并。成功后两方法返回 closed，不再调用原 attemptClose。
closed 仅表示原关闭成功，retained 不能作为静止依据。没有定时或自动重试。

行端口的 `retainClose(control)` 只接受已登记、尚未完成收尾的行。
有效输入为非 null 对象，且 closeAttempt 和 retryClose 均为函数；检查仅判形状，不授予权限。
正常返回表示原行已持有该引用。同引用重复可认回，异引用不得覆盖。
未登记、已完成、冲突、无效输入或方法读取抛错均同步拒绝，并请求整个代际停止。
这些使用错误抛出内建 Error，不定义封闭 code 或可依赖的错误正文；方法读取异常转为该使用错误。
完成指实际 close 完成并即将兑现本行 receipt，不指 ready 成功。
关闭已开始但本行未完成时，仍允许原 setup 交付控制；不能因停止丢失原责任。

根的 `closeControl(id)` 只供实际装配拥有者取得原行维护控制，不给行提供者整体关闭权。
未知 id 同步拒绝；已知但尚未保有返回 undefined。undefined 不能作为静止依据。
未知 id 沿用 port 查询的内建 Error 使用错误，不承诺错误正文。
已保有引用跨 Service/fiber 撤除及根完成保持原身份，不重新发现或绑定后继实例。
控制不得进入插件 JSON、工具能力、runtime context 或模型输入。

`./cordis` 的 `startRetainedAssemblyWork(ctx, setup, attemptClose)` 同步返回 void。
精确签名为 `(ctx: Context, setup: () => Promise<void>, attemptClose: () => Promise<void>) => void`。
它复用原管理启动流程，登记前构造 deferred ready 和安全 work。
登记后、安装 effect 和调度 setup 前，向本行 Service 交付原 control。
交付失败拒绝 managed ready 并请求停止，不执行 setup；原已登记 work 仍负责实际资源前缀。
原 helper 的 effect、资格核验、异常保持及异步拒绝观察要求全部适用。
普通 startAssemblyWork 保持原静止后 settle 要求，不自动转换资源失败。
需要保有未确认责任的绑定显式选用新 helper；不能将 retained 写成业务成功或资源已释放。

宿主先等待资源收尾，再逆序撤 fiber 和外部资源端口，最后核对自身 guard 与完成回调。
下一代必须新建协调器和代际资源。独立函数调用方仍显式拥有其资源，不必加载本包。
未采用此协议的独立 Cordis 绑定要求调用方先排空消费者再撤依赖。

本包验证同步失效、独占接管、真实 Cordis 撤除、局部启动、双失败和等待次序。
身份/治理提供者的真实业务 Promise、SQLite/scrypt 及双网络面保证由其组合验收接续。
受控 OwnedWork 测试不能代替这些业务验证。

## 采用依据

精确协议由 [身份领域集成设计](../../../.meta_harness/design/architecture/identity-integration/retirement.md)
及其 [限定采用](../../../.meta_harness/design/record/decisions/identity-integration-design/decision.md)确定。
本页接续模块的执行承诺；跨模块装配顺序及采用范围仍归该设计。
新增绑定坐标由 [T2 补充采用](../../../.meta_harness/design/record/decisions/identity-t2-binding-coordinates/decision.md)确定。
同步 apply 与双重就绪由[启动期投影采用](../../../.meta_harness/design/record/decisions/identity-startup-lifecycle/decision.md)补足。
本包出现不表示相关提供者或真实宿主已完成迁移。

保有控制扩展与 retained-work 的精确职责由[共享机制投影采用](../../../.meta_harness/design/record/decisions/identity-shared-mechanism-projection/decision.md)接续；普通关闭失败和本代依赖保有义务不被取代。
