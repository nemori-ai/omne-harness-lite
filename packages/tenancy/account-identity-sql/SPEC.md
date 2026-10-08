# 身份 SQL 提供者

本包实现[公共身份承诺](../../core/account-identity/SPEC.md)。表、列、迁移及快照身份保持；
业务算法继续沿原 AI3，未迁条款和模型见[保留清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。

纯根公开 createAccountIdentity(config, dependencies)、配置校验、迁移与快照检查。
工厂返回同一实例的 accounts、logins 和幂等 close。公钥和政策从配置取得，
storage、clock、逐调用 credentials 解析、通知、诊断和随机源由调用方显式传入。
两个服务面保留共同事务及票据身份。独立工厂不加载 Cordis。

close 停止新普通调用，等待完整已准入 Promise，包括事务外 scrypt；
此后销毁本实例准备票据。新普通调用以 AccountIdentityStopped 拒绝，
不混入正常失败集合。close 不关闭借入的 storage、clock 或 credentials。
停止前交出的参与面仍按原 StorageUnit 的寿命和共同提交规则执行。

`./cordis` 的两个正式 Service 委托同一纯实例。独立绑定要求调用方先排空消费者，
再撤除依赖。管理装配的有序收尾按[生命周期设计](../../../.meta_harness/design/architecture/identity-integration/retirement.md)实施，
本包出现不表示真实宿主已经完成接入。

managedAccountIdentityPlugin 的纯 describeAssembly 声明提供 accounts/logins、必需 storage/clock，
credentials 仍为逐调用可选依赖。tenancy-host/accounts v1 投影原公钥、有效期及有限 JSON 政策。
政策缺席时省略字段，保持原缺席拒绝规则；声明沿[插件树协议](../../core/cordis-plugin-tree/SPEC.md)。

必须验证凭据准备期间关闭、票据销毁/错实例/失败消费、实际 SQLite 同提交和回滚、
依赖替换与真实迟到业务完成。绑定消失或网络断开均不是业务结束证据。

内部数据边界由 identity-data.ts 定义，identity-sql.ts 实现原四项读取、两项锁和八项写入。
记录读取返回原始列表示；解码仍在原策略使用点，保留凭据、期限、授权及错误优先次序。
账号/登录策略不接收存储实例、SQL 或通用事务回调，不独立结束共同事务。

factory 在装配门绑定公开 StorageUnit。绑定不作 I/O 或提前核验；每次参与调用先
assertStorage，再进入原 unit.run。query/mutate 只包装当次真实事务，afterCommit
只登记原回调；失败污染、暂存读取和唯一提交仍归原 StorageUnit。具名数据操作不缓存、
不另开连接、不吞错，也不表示外层已提交。普通调用的存储异常映射和通知时点保持。
内部桥接和 assembleIdentityServices 不从公开根导出，不新增跨包参与例外。

迁移必须复验原完整 AI 用例、SQL 约束和读取排序、真实跨 owner unit/回滚、
票据与 G 重核、最后时钟故障、提交后通知和隐私负控。原模型及未迁承诺继续有效；
私有端口的局部分支观察不能代替真实 SQLite、领域组合或外部打包消费。

## 注册留存期限

当前提供者在账号产生时固定该行retention_deadline，已形成的到期事实保持单调；后续修改部署留存值不回写既存行。更强的产品变参政策尚未定义，不能由迁移为既存记录重新计算期限；不能把不可用或配置缺席当未到期。

## 异步并发下的账号占用判定

S-13 的锁内重读若已见已激活账号，该占用是稳定终态，不再因快照来自 none/live 而消耗重试。原 S-20 禁止该行消失或退回未激活。事务只交出私有占用判定；若此前命中认回分支而跳过政策，必须在事务结束后补政策检查，政策拒绝仍先于 identifier-taken。持锁段不得调用 credentials。已激活账号不能凭旧 match 被认回。

none/live/expired 的其他变化仍要求重取相同账号及凭据证据，沿原两次尝试上限；重复替换未激活账号仍可返回 storage-unavailable。本段取代旧提供者对“再次变为已激活也必定耗尽”的实现取舍，保持公开账号拒绝次序与并发注册 S-31。验证须同时覆盖 none→live→activated 收敛、认回期间激活后的严格政策拒绝，以及 live 身份更换后的有限失败。
