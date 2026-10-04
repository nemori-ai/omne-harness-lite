# SQL 组织治理提供者

本包实现[公共承诺](../../core/organization-governance/SPEC.md)，不拥有另一套操作类型或业务政策。
业务协议、资源与未来义务的精确范围见[迁移清单](../../../.meta_harness/design/architecture/pilots/n4-ownership.md)。
根入口公开独立工厂、输入校验和迁移。插件只从 `./cordis` 导出。

## 生命周期与事务

一个插件 fiber 构造四个公共 Service 的子类。加载前校验严格配置与签名私钥，
缺依赖时不提供服务，配置错误导致启动失败。重装不清除持久业务事实。
撤除使四个服务不可解析，不能据此推断已提交事实被撤销或外部效果被补偿。
业务工厂可脱离 Cordis 单独消费，但调用方仍须提供完整依赖并承担事务终结责任。

账号、治理与登录的共同参与必须落在同一 AtomicStorage/StorageUnit。
同域检查失败不得降级成独立事务。参与异常向唯一事务终结边界传播，不能吞错提交。
个人组织 owner 的外键与唯一约束须和账号记录同处一份保护域。
通知只在提交后释放，监听失败只写诊断。撤除不删除库中事实。

## 实现理由与限制

[Service 子类与单 fiber](adr/service-faces.md)解释本批实现选择。
SQL 语义由既有存储提供者兑现，本包不新增分布式锁或跨存储原子性承诺。
SQLite 是当前生产组合；PG 的未闭合组合不能通过类型可用而开放。
账号/登录、storage/clock 的接口与键从各自公共定义消费。通知使用 organization-governance 命名空间。

## 验证

真实文件库的 `tests/` 验证业务与故障路径。集成用例验证 Service 注册、替换与撤除。
定义包类型检查和此包业务测试共同验证本批迁移，未执行的 PG/分布式范围保持未验证。

## 共享实例关闭

createOrganizationGovernance(dependencies) 返回同一实例的四个服务面及幂等 close。
close 停止新普通操作并等待已准入完整 Promise，不关闭借入依赖。
关闭后新普通调用以 OrganizationGovernanceStopped 使用错误拒绝，不加入业务失败集合。
同步 scopeLayers 仍同步返回或抛出；已交出的参与对象继续受原 StorageUnit 寿命约束。
原四个底层纯工厂继续可单独使用，调用方承担其完整业务及事务的结束责任；
正式绑定共用整体工厂，不分别关闭同一引擎。实际管理装配的组合验收仍归T2后续切片。
