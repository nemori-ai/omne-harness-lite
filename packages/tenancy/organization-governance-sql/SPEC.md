# SQL 组织治理提供者

本包实现[公共承诺](../../core/organization-governance/SPEC.md)，不拥有另一套操作类型或业务政策。
业务、有限模型和未来OG3义务由[公共承诺](../../core/organization-governance/SPEC.md#已接受而未实现的资产治理增量)及其verification持有；本提供者未来负责具体兑现，不从当前SQL结构推断已实现。
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
正式绑定共用整体工厂，不分别关闭同一引擎。
managedOrganizationGovernancePlugin 的纯 describeAssembly 声明提供四服务，必需 storage、clock、
accounts、logins，投影原密钥和有效期为 tenancy-host/organizations v1。
声明沿[插件树协议](../../core/cordis-plugin-tree/SPEC.md)。T4 树及真实宿主的完整组合仍须独立验收。

## 策略与记录后端

纯策略只消费私有具名记录面；原行表示仍在原业务观察位置解码。SQL 后端拥有查询、五类锁、原 upsert 和写谓词，不拥有授权、期限、成员资格或父链判断。公共操作、Schema 身份、六表结构及原失败次序保持。

装配绑定原 StorageUnit，不提前核验、观察或终结。每次参与调用先检查真实 Storage 实例，再在原 unit.run 中依次构造账号和登录参与面。query、mutate、afterCommit 直接委托当前单元；普通操作恰有一次原 atomic。不可用在 run 内污染当前单元，不能由业务层捕获后提交先前暂存效果。

四个公开独立工厂继续可单独消费。整体工厂共享一个依赖投影并保持原准入和关闭责任。后端不另开连接、缓存参与对象或关闭借入资源。实现理由及复核条件见[策略与记录后端](adr/policy-persistence.md)。

## 绑定入口与生命周期坐标

`@omne-harness-lite/organization-governance-sql/cordis`导出`organizationGovernancePlugin`和`managedOrganizationGovernancePlugin`，限定name分别为`organization-governance-sql`和`organization-governance-sql-managed`。两者使用同一纯实现和配置Schema；管理版声明`assemblyLifecycle: 1`并必需注入`assemblyLifetime`，先登记后开始资源效果，缺端口不回退独立模式。独立版由调用方先排空消费者再撤依赖，管理版由[装配生命周期](../../core/assembly-lifecycle/SPEC.md)安排真实逆序收场。
