# Storage 公共集成承诺

本包拥有 Storage、AtomicStorage、StorageUnit、存储失败、迁移及维护的公开形状。
根入口保留纯定义与工具，`./conformance` 保留由调用方传入 runner 的提供者符合性套件。
`./cordis` 拥有 StorageService、唯一 STORAGE_SERVICE 和 Context 增补。

StorageService 只要求原 Storage 的 read/write。AtomicStorage 是显式可选扩展；需要它的消费者必须核验。
服务定义没有打开存储或执行事务的实现。只导入类型或装上服务，不会自动获得事务、持久性、维护或租户授权保证。

事务、锁、分类失败、嵌套拒绝和显式共同事务继续消费旧 core/storage design 的 P-1～P-12 及末节 P-13。
维护继续消费原 maintenance.md。本批只迁移集成承诺，不复制、退役或改写这些行为源。

同提交要求参与方使用同一底层存储实例。提供者可有独立与注入访问面，但必须给这些面同一实例身份。
同一文件、服务键、租户标签或等价配置不能使不同实例参与同一事务。
普通 read/write 不隐式加入 atomic；提交拥有者、异常污染、在途等待和提交后通知均维持原责任。

服务定义不增加 close 或 maintenance 的强制要求。这些扩展由实际提供者公开并保持自己的生命周期。
借用服务发布与存储资源所有权必须分别声明。撤除发布不等于事务已停止；资源拥有者必须完成准入和在途收场。
跨进程后不能用本地对象身份代替事务协议，租户授权也不能从 Context 推断。

提供者须通过真实存储符合性及同提交/撤除组合。四层公开入口检查须包含源码、声明、运行装载与实际制品消费。

## 启动资源和完成通知

StorageStartupResources 由宿主持有同一次启动的迁移提供者与升级守卫。
StorageStartup 和 StorageCompletion 只提供这些资源及完成通知，不能代替存储所有者。
guard 的结构接口只允许 confirm/pending；SQL 提供者继续核验原真实实例和私有附着身份。
确认结果及 pending 的原形状、快照删除持久保证、确认后不回滚的规则均保持。

SQL owning 绑定在 migrate 路径必需注入 storageStartup；plain 不取得它。
启用维护时必需注入 storageCompletion。实际数据库及锁收场后只通知一次，
通知不替代完成 Promise。宿主在整代 closed 后才核对并释放这些资源。
独立 openStorage 仍可显式接收运行对象；可序列化插件树配置不能携带它们。
依据为[已接受的树资源协议](../../../.meta_harness/design/architecture/identity-integration/plugin-tree.md#运行资源的唯一拥有者)。

## 依据及未迁责任

未迁行为及验证义务继续归[旧节点设计](../../../.meta_harness/design/realization/packages/core/storage/design.md)与[验证义务](../../../.meta_harness/design/realization/packages/core/storage/verification.md)。
快照维护继续归[原维护协议](../../../.meta_harness/design/realization/packages/core/storage/maintenance.md)。
本页只接续本批公开集成承诺；不据本页退役其余旧正文。
集成边界依据 D-114，承诺归属依据 D-115。
