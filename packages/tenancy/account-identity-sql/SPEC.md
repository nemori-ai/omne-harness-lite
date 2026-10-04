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

必须验证凭据准备期间关闭、票据销毁/错实例/失败消费、实际 SQLite 同提交和回滚、
依赖替换与真实迟到业务完成。绑定消失或网络断开均不是业务结束证据。
