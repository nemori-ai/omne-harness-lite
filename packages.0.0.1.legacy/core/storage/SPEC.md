# Storage 公共集成承诺

本包拥有 Storage、AtomicStorage、StorageUnit、存储失败、迁移及维护的公开形状。
根入口保留纯定义与工具，`./conformance` 保留由调用方传入 runner 的提供者符合性套件。
`./cordis` 拥有 StorageService、唯一 STORAGE_SERVICE 和 Context 增补。

StorageService 只要求原 Storage 的 read/write。AtomicStorage 是显式可选扩展；需要它的消费者必须核验。
服务定义没有打开存储或执行事务的实现。只导入类型或装上服务，不会自动获得事务、持久性、维护或租户授权保证。

## 事务、锁与分类失败

以下承诺约束任何提供者。接口声明不证明这些行为已成立。

| 性质 | 必须保持的行为 |
|---|---|
| P-1 单次提交 | write 的回调正常返回才提交并透传返回值；回调抛出则全部回滚、原异常同一实例上抛；提交本身失败为 StorageUnavailable |
| P-2 语句级失败 | UniqueViolation／ReferenceViolation 不废整个事务，同一 tx 可继续读写并提交；不是延迟到提交才报约束失败 |
| P-3 写内读 | 读全部已提交写的最新值及自己的写；PostgreSQL 写事务采用 READ COMMITTED |
| P-4 行锁 | lockRow 后的同事务读写与其他同样锁行的写排成次序，不留先读后写窗口；空行不锁，空行互斥须用唯一约束及 P-2 |
| P-5 哨兵锁 | 同名 lockSentinel 的另一写事务在本事务结束前不能进入锁后部分；不强制哨兵表 |
| P-6 只读快照 | read 回调内全部读是同一已提交快照；写语句为 StorageDefect，库中无变化 |
| P-7 持久性 | 提交后跨进程重启仍在。提供者声明提交所覆盖的故障范围；业务确认保存须满足[已确认保存的耐久边界](../../../docs/architecture/data-and-state.md#已确认保存的耐久边界)，不能仅凭事务返回便声称抵御断电 |
| P-8 分类 | 连接、忙超时、IO、关闭期间拒绝为 StorageUnavailable，不假装空结果或旧快照；语法、列名、NOT NULL／CHECK、只读内写、嵌套调用及未知约束名为带 cause 的 StorageDefect，不折成不可用 |
| P-9 唯一值释放 | 删除后同一唯一约束立即允许同值插入 |
| P-10 引用两向 | 删除被引用行为 delete-restricted；插入／更新指向不存在目标为 missing-target，按触发语句分类；要求 ON DELETE RESTRICT、SQLite foreign_keys=ON，不用延迟约束 |
| P-11 稳定约束名 | 同一约束跨方言返回同一迁移名字；唯一约束用显式命名 CREATE UNIQUE INDEX，不用表内 UNIQUE；主键统一报 <table>_pkey；映射不到为 StorageDefect |
| P-12 同进程并发 | 并发 write 不阻塞线程、不因互相争锁报 busy；每次仍是一项完整事务，read 与 write 可真正并发 |

消费者不得在 read／write 的回调内调用经同一存储实例的其他服务面或再调用 read／write；嵌套为 StorageDefect，外层仍可按既有回调结果收场。跨 owner 同提交使用下述显式单元，不能靠嵌套兑现。

mapStorageError 只折 StorageUnavailable 为调用方给定值；其他三类、调用方异常及任意非匹配值原样重抛。UniqueViolation／ReferenceViolation 应由操作自己的有效分支先处理。narrow 只是类型断言，不证明表存在或取得写权。

## P-13 显式共同事务

AtomicStorage 是可选扩展，单元 query／mutate 仅暂存，不各自提交；query 只给 ReadTx 类型，不承诺数据库硬只读。普通 read／write 仍独立提交、不隐式参与。

单元核验同一底层实例、活跃调用帧与串行子调用。run 可嵌套参与操作，逃出 run 的异常永久污染整单元；P-2 冲突只能在所属参与操作内处理。受理即挂拒绝观察；作用域结束还有子调用在途时关新准入，等待实际结束后回滚。它不检测所有未 await 的背景交接，也不沙箱化裸 SQL。

atomic 复用一次 write 及排空。afterCommit 只在真正提交后、事务和单元上下文之外尽力通知；抛出或返回 Promise 只记无秘密诊断，不改报已提交业务失败。提交未知不通知；单元结束后调用报缺陷，不追回提交。原符合性套件通过不自动证明此扩展。

同提交要求参与方使用同一底层存储实例。提供者可有独立与注入访问面，但必须给这些面同一实例身份。
同一文件、服务键、租户标签或等价配置不能使不同实例参与同一事务。
普通 read/write 不隐式加入 atomic；提交拥有者、异常污染、在途等待和提交后通知均维持原责任。

服务定义不增加 close 或 maintenance 的强制要求。这些扩展由实际提供者公开并保持自己的生命周期。
借用服务发布与存储资源所有权必须分别声明。撤除发布不等于事务已停止；资源拥有者必须完成准入和在途收场。
跨进程后不能用本地对象身份代替事务协议，租户授权也不能从 Context 推断。

普通 StorageInstance.close 先关准入、等在途、再关句柄；之后的 read／write 为 StorageUnavailable。在途 write 回调不因关闭或 fiber 撤除而取消，须跑完并依原完整提交／失败收场，绝无部分提交。等待期限由提供者明确，不以期限到达代替结束。下述维护 run 的取消请求不改变普通事务规则。

StorageUnit.observeCompletion在有效单元调用帧内取得本地提交拥有者的操作结束Promise。它不开始事务、提交或取得写权限；调用方不能在原事务内await它，否则会等待自己。参与者在事务外等待该信号，再根据其结果排空已经暂存的责任。
结果committed只在实际提交成功后给出；rolledBack表示原回调失败且write已可靠完成回滚；提交结果不能确认时返回unknown。unknown必须沿参与者原身份认回，不能据结束信号假定原事实不存在或远端所有可能writer已经停止。网络断开时本地调用可以结束，但服务端事务仍可能提交。参与者只有认回已提交结果或可靠确认未提交后，才能解除对应未知提交责任。静止证据只排除未来写入，不能单独代替结果认回或保管义务；其后仍须核对原事实及应承接责任。未完成这些核对时，不报告关闭或重发。
该Promise正常解决，不携带原异常或秘密，也不回调参与者代码。重复观察返回同一个Promise，单元结束后不能重新取得观察面。普通afterCommit仍是提交后的尽力通知，不代替结束观察。

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
实际资源由[治理宿主](../../../apps.0.0.1.legacy/tenancy-host/SPEC.md)构造，[SQL提供者](../../infra/storage-sql/SPEC.md)保留原私有guard核验和真实完成。

## 迁移与维护

各事实拥有者导出只含 up 的 MigrationFragment，名称在包内稳定，只追加不重排；装配排序并用 composeMigrations 合成，合成名是四位全局位置编号加片段名。重名抛出，不静默覆盖。迁移运行器归提供者，表、真实跨 owner 外键和约束要求归各事实拥有者及装配，本包不持有业务表。

PreflightCheck 在同一只读事务观察表名、按执行次序的已登记迁移名及 ReadTx。失败的稳定 check 和 detail 由启动路径原样接续，不以类型检查证明真实存储合形。

快照公开类型归本包；类型外约束见[快照维护协议](#快照维护协议)。构造、物理隔离、锁和收场归实际 SQL 提供者，不把维护当通用治理授权。

## 快照维护协议

以下接续已采用 D055／D056 的维护精化，不把旧首稿的候选状态当作当前实现结论。普通 Storage／AtomicStorage 不变；PostgreSQL 不须提供文件快照。维护只承载本地物理工作，不授予治理资格。

run 是从受理到回调、全部子资源及清理真实结束的完整边界；单实例仅一个 run，不排队。未确认升级、关闭后、无源或不支持均拒绝，不从旧路径另开连接。run 全程计入实例 close 的在途；回调抛出不释放未结束的子任务。signal／close 只请求取消，期限不等于实际结束。session.cancelled 为只读取消状态，用于阻止尚未发布的新副作用；已发布对象不能因此删除。

在线 session 提供 snapshot 和 inspect，两操作只能顺序执行，不重叠或重入；snapshot 从本实例源取一致副本。inspect 输入必须精确声明 byteLength：最多 1GiB，每块最多 64KiB；越界 capacity，提前或多余字节 invalid-data。生产调用者固定，不允许网络输入任意回调。

use 借用只读 SnapshotView，其 inspection 绑定同一副本只读事务、表名和已登记迁移名；read 每次最多 64KiB、不能超界，必须全长，不把短读当 EOF 成功。view 不提供路径、原生 SQLite 句柄或写权。回调结算后 read 拒绝，ReadTx 不得逃逸；提供者还须等待已启动 read 结束，再关事务／句柄和清理任务目录。

离线 SnapshotInspection 只提供 inspect，不提供 snapshot；构造和 close 归 SQL 提供者，复用物理隔离与读数，不造临时生产 Storage、不跑迁移。同工作根在线／离线跨进程排他，拿不到为 busy；不同工作根可并行只读检查同一封装，但每个输入固定，恢复目标仍独占。无全机 IO 或内存总量封顶承诺。

busy／unavailable／capacity／invalid-data／cancelled 是物理失败，不是治理失败。只有真实工作和清理结束才可 cancelled；清理失败将此前普通失败改为 unavailable，附内部残余定位而不输出内容。上层已发布 unknown 的优先级保持；IO 读错为 unavailable，明确内容／完整性失败才为 invalid-data。未知异常不能冒充坏副本，须具名诊断。

SnapshotView.structure 只从同一副本读取用户表 columns、indexes、foreignKeys 及 views／triggers；不含行数据或查询参数。最多 64 表，每表 128 列／索引／外键，每个定义 16KiB，超界 capacity。无拥有者认可的额外对象或列不得默认放行。SnapshotCheck 只读返回稳定检查名，IO 异常不折成 false；checkpoint 表示／报告只能含稳定检查名，不包含行值或内部动态结构。具体 SQL 结构解析归提供者。

ownResource 仅由静态本地消费者在 open 成功后立即登记 close／isClosed；作用域归同一 run。它不把文件路径、封装格式或发布策略交给 SQL，也不由网络传回调。返回释放函数可显式重试收尾，不重放写入或发布。取消／close 关新 run，不提前封当前 run 登记窗口；已在途 open 仍须登记，调用方不得逃逸未 await 的 open。

回调和全部子操作真实结算后才封登记并关剩余资源；结束后登记为内部缺陷。close 正常返回但 isClosed=false 仍是缺陷，不能认为已释放；close 抛出但实际已关须保留失败，可释放物理所有权。仍未关则保强引用、poisoned 拒新 run；显式 close 可再收尾，持续失败保工作区和源锁直到真实故障退出。普通残余文件删除失败与未关句柄分别处理。

真实收尾失败和内部缺陷不能被回调捕获或 cancelled 掩盖；普通操作拒绝可由回调处理，上层发布 unknown 保持。释放函数不得逃出作用域开启新工作。close／isClosed 只依赖持有的原资源，不查询已撤除服务、不等待本 run 自己结束，否则为生命周期缺陷。

## 验证与采用边界

方法及未覆盖范围见[验证义务](verification/README.md)。真实 SQLite、PostgreSQL、业务外键、跨进程持久与明确同提交组合各有独立责任，任一有限测试不能授予整体完成。PostgreSQL 保留既有协议，不以本次 SQLite 验证声称整体恢复。

集成边界遵循[IC](../../../docs/architecture/cordis-integration-conventions.md)，共享装配沿[插件树协议](../cordis-plugin-tree/SPEC.md)，启动与完成资源由本页唯一维护。本页接续已采用 P-1～P-13 及公开集成承诺，未更改领域或租户政策。
