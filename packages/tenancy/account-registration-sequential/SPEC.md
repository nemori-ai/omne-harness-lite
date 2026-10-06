# 顺序注册提供者

本包实现[注册公共承诺](../../core/account-registration/SPEC.md)。
根公开 createRegistrationService(dependencies)、RegistrationDeps、RegistrationInstance 和配置校验。
返回实例提供 register、purgeExpired 与幂等 close，不加载 Cordis。
原注册和清除方法体的步骤、签名位置、失败映射及重试上限保持。

实例捕获三个依赖面、签名密钥、资格谓词与缺陷记录器。
close 同步废止自身资格，等待全部已交出的步骤实际返回。它不关闭借入依赖，
不新增持久状态、自动清扫、补偿或共同事务。迟到步骤仍被观察，但不得开始下一步。

`./cordis` 的 Registration 委托该实例。独立绑定先排空消费者再撤依赖；
管理绑定按[有序收尾](../../../.meta_harness/design/architecture/identity-integration/retirement.md)立即检查代际资格，
不能只依赖延后的 close。公开类、服务发现和业务实例寿命分别验证。

managedRegistrationPlugin 的纯 describeAssembly 声明提供 registration，必需 accounts、
organizations、organizationPurge，投影原私钥配置为 tenancy-host/registration v1。
声明沿[插件树协议](../../core/cordis-plugin-tree/SPEC.md)，不新增跨步骤事务或补偿。

继续执行原 AR2 场景和模型，覆盖三个注册步骤、两步清除、各步中断、未知结果及真实 SQLite 提交。
本批未迁旧业务条款的精确来源见[保留清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
