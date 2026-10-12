# 原Run读取绑定

原Run日志借用在建立时核验固定准入事实，后续读取持有私有绑定。
行为归[提供者SPEC](../SPEC.md#持久run生命周期协调)及[共享借用协议](../../../core/session-runtime/SPEC.md#可信工作读取与原run日志)。

## 固定事实与当前状态

`sr_run_grant`保存完整Scope、Run、宿主principal和原AdmissionTicket。
`sr_admission_use`保存原ticket的完整binding及原stepKey。
两张表的合法操作只有insert和select。它们不表示当前登录、成员或attempt状态。
`originalGrant`读取并严格解析这些事实，核对固定中心、账号、租户、Session、Run和宿主身份。
缺Run仍是denied。固定事实校验失败时不发表借用，保留原核验路径的异常。

## 私有闭包与发表边界

`runtimeAuthority.bindRun(unit, scope, run)`先核实际Storage及Unit重入，再调用原`originalGrant`。
它复制并冻结完整Scope，返回接收实际Unit和读回调的私有闭包。
闭包不保留grant正文，也不输出可序列化token或可复制的证明字段。
它只由`createOriginalRunJournal`交给对应的`BoundRunJournal`，不经包的公开入口导出。

borrow必须等待实际外层`storage.atomic`成功，才构造和登记`BoundRunJournal`并返回端口。
回调成功后的回滚、提交失败或返回丢失均不发表借用。
后续读取进入新的实际Unit。闭包检查原Storage、固定租户及Unit回调重入。
它把固定Scope登记到现有`runs`上下文，调用`unit.run`，并在`finally`清除登记。
日志参加者通过该上下文核完整租户和Session，仍在同一Unit读取当前SourceToken及所需记录。
Scope字段、复制权限对象和外来StorageUnit不能取得这个上下文。

`readPrefix`、`readProjection`、`log.readByKey`、`log.readSince`和`withReadUnit`使用这条绑定。
`withReadUnit`仍是可信消费者的只读接口，其实际Unit不提供数据库只读沙箱。
消费者不得写数据、发送外部IO或使Unit逃逸。
append继续调用`withinRun`，每次重新核grant及ticket，再由日志参加者核最新attempt fence、条件和去重。
其他原Run协调操作也继续使用各自的完整核验路径。

## 所有权与成本

借用拥有者保留原reservation、`maxInFlight`和pending登记。
close同步关闭新读取，使借用generation失效，并等待真实在途操作结束。
Ingress关闭后，已接受借用仍可完成原责任，直到借用者明确归还。
这项绑定不关闭借入的日志或Storage。

首次borrow对两张固定事实表各作一次按主键查询，并承担原grant解析及ticket核对成本。
后续读取对这两张表的查询和解析次数为零。
每次读取仍承担真实事务、Storage身份及上下文检查，还有原日志所需的来源和记录读取。
完整prefix的读取成本仍随记录数及字节数增长，按key读取仍沿现有prefix筛选实现。
这里没有历史缓存或历史索引，也没有延迟收益声明。

每个借用新增一个闭包和一份固定Scope，不保留历史或第二份grant证明表。
活跃借用数量沿现有显式上界，关闭结果和调用者仍持有的端口引用沿原生命周期。
实现复用现有StorageUnit、originalGrant和日志参加者，没有新增依赖。

## 检测范围与验证

绑定依赖合法操作不修改已保存事实。它不检测已有借用期间对固定表的非法外部修改。
新borrow和新进程必须重新核验持久事实。append也继续检测当前存储中的grant损坏。
若以后增加原grant撤销或修改语义，必须先修订这项绑定及其行为承诺。
登录失效不等于原grant撤销，最新attempt的写入约束也不能由读取绑定替代。

[真实SQLite测试](../tests/runtime.spec.ts)核对首次拒绝、实际执行的SQL次数、当前prefix及suffix、外层失败不发表、外来Unit、重入、关闭排空和旧attempt写拒绝。
这些测试使用真实Storage和原日志fixture，不替代完整运行时验收或性能测量。
