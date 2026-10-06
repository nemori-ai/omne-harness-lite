# SQL 存储的公开面与资源责任

根入口提供独立 openStorage、SqlStorage、配置、升级守卫、驱动及维护工具。
`./cordis` 提供 StorageSqlPluginConfig、storageSqlPlugin、managedStorageSqlPlugin 和 SqlStorageService。
服务键、启动资源和完成目标由 core/storage 拥有，提供者不重复导出键或迁出的结果类型。
SQL 事务、迁移、错误映射与维护算法继续按原精确节点设计执行；本批只接续以下集成投影。

## 拥有插件

两种拥有绑定使用严格的数据配置 StorageSqlPluginConfig。startup 缺省为 plain；plain 不取启动资源，也不允许 maintenance。
migrate 从 storageStartup 取得原 migrations/upgrade；启用 maintenance 时另从 storageCompletion 取得 closed 目标。
转换保留同一真实 guard、检查函数及完成目标，原 StorageSqlConfig 和 openStorage 独立输入仍可使用运行对象。
缺资源或非法资源使启动失败，不降级为 plain。条件依赖在子作用域 inject，声明列出全部条件键。

storageSqlPlugin 在打开前登记关闭 effect。撤除时等待已开始的 setup，再关闭取得的资源；启动失败不丢失已取得前缀。
managedStorageSqlPlugin 同步登记原 AssemblyLifetime 的 OwnedWork，再启动条件子作用域及原打开路径。
其 ready 独立于 fiber ACTIVE；条件子作用域撤除停止同一代，撤除完成等待真实 SQL 关闭。
该等待不依赖父 fiber.dispose，避免父子撤除相互等待。首次失败继续拒绝 ready，closed 另报告收场结果。
Service 构造或重复键失败仍由同一拥有路径收场。
基类构造器负责占键，插件不再登记同一个键。

关闭仍归原 SqlStorage：停止新准入、等待在途、关闭句柄，再按原升级/维护责任恢复或释放。
关闭失败的诊断与守卫核查保持原规则；不能以 fiber.dispose 返回成功断言底层已经释放。
在途事务不随服务不可见而凭空消失，也不新增基于调用方 fiber 的事务取消。

## 借用绑定

SqlStorageService 只发布已经打开的 SqlStorage，不接管它的资源。
撤除借用发布不关闭底层实例；装配拥有者继续负责等待业务并调用 close。
服务显式 close 与独立 close 是同一个资源动作，保持原返回 Promise、幂等与失败语义。
maintenance 转交同一底层对象，不新开维护控制器或旁路数据库连接。

## 同提交身份

独立实例和它的 Service 调用方代理可参加同一 SqlStorageUnit。
提供者通过不导出的局部 Symbol 将自己建立的访问面关联到确切底层实例；属性在运行时不可写且不可重配。
unit 保留原 frame、busy、既有污染的校验次序，再核验实例身份。
不能读取身份的非法对象按原不同实例路径拒绝并污染整单元；业务捕获这次异常也不能提交或通知。

同一文件上的另一个实例、替换后的新底层实例、没有合法对应身份的对象都不能参加原单元。
该投影不是租户授权或跨进程事务协议。公共 read/write、atomic、原回调、异常对象和提交后通知的语义均保持。
私有投影不从包入口导出，纯 SQL 根不加载 Cordis。

验证必须覆盖双向参与、多个调用方、跨实例拒绝、污染、回滚、通知、拥有/借用撤除及提供者换代。
既有 SQLite 符合性、升级、维护、真实治理/模型消费者与实际制品消费继续承担各自验证责任。

## 依据及未迁责任

未迁行为及验证义务继续归[旧节点设计](../../../.meta_harness/design/realization/packages/infra/storage-sql/design.md)与[验证义务](../../../.meta_harness/design/realization/packages/infra/storage-sql/verification.md)。
本页只接续本批公开集成承诺；不据本页退役其余旧正文。
集成边界依据 D-114，承诺归属依据 D-115。
本批配置与资源责任依据已采用的 T4 接缝。PostgreSQL 独立路径保留，不据 SQLite 验证声明 PostgreSQL 恢复通过。
