# 本地状态公共承诺

根入口拥有记录、缓存、快照、CAS结果和 ClientStateUsageDefect，不加载 Cordis。
`./cordis` 拥有 ClientLocalStateService、ClientStateStorage 及其唯一服务键。
本地记录、落盘、快照资格及停止沿 CLS1 S1～8。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[身份迁移保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页不替代尚未迁移的完整操作条款；N5/N6 接续剩余旧源及资源登记。

storeId、revision、operationId 的身份及单调规则保持。快照凭据由读取实例签发，
不能伪造或跨实例使用。损坏记录不自动重建，未确认结果不代表未安装。
CAS 使用原单次事务和冲突检查；读取、原快照及替换结果不可被调用者改写。

LocalStateStorageFactory 只接收已经核对的私有 SQLite 文件。工厂以 full 耐久级别打开，
不运行治理中心迁移。拒绝不转移实例所有权；返回后该实例由本次 CLS 独占关闭。
工厂拥有者不得提前关闭已经交出的存储。目录、文件和存储的实际完成由提供者负责。

关闭停止新访问，保留已准入完整读/CAS/同步工作直至真实完成，再释放资源。
登记必须先于可能重入关闭的调用方或存储回调。旧引用拒绝原 closed 使用错误；
关闭不能因为工作仍未返回 Promise 就漏掉它。重复关闭观察同一完成过程。
验证包括真实私有目录、SQLite、多进程、耐久失败、不可伪造快照、关闭和重入。
