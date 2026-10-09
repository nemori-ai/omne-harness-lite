# SQL 存储的公开面与资源责任

根入口提供独立 openStorage、SqlStorage、配置、升级守卫、驱动及维护工具。
`./cordis` 提供 StorageSqlPluginConfig、storageSqlPlugin、managedStorageSqlPlugin 和 SqlStorageService。
服务键、启动资源和完成目标由 core/storage 拥有，提供者不重复导出键或迁出的结果类型。
公共事务、完成观察与维护协议归 [core/storage](../../core/storage/SPEC.md)。本页拥有 SQL 方言、升级、维护物理实现及集成责任。

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

## SQLite 的异步执行与排他

每个SQLite连接及其原生SQL执行属于独立worker。打开、SQL、提交、回滚和关闭不得在应用事件循环上执行。main仍拥有事务回调和准入队列；同一连接的命令按进入顺序执行。等待不会隐式重放语句或事务回调。引擎的整数、字节、扩展错误和自动回滚状态保持，不以JS布尔值猜测事务是否仍在。

读池在等待打开前预占名额；失败退还名额，关停拒绝未取得连接的等候者。打开中的连接计入未关闭资源。关闭停止新命令、排空原队列与备份、关闭原生连接，并等待worker实际退出。error事件、发送close或发送terminate均不能替代退出。未知结果不得伪装成未提交。线程异常退出不自动重建连接或重放请求。

SQLite属主及维护工作根用永久文件的flock排他。main强持有文件描述符；helper只有无signal且退出码0才授予准入。失败或未知取得结果先等helper停止，再尝试关闭描述符。worker退出不释放main持有的排他。全部数据库工作、文件操作和升级恢复收场后，最后关闭描述符。关闭未证实成功时保留强引用和原排他。运行期间不得删除或替换锁文件。

`NodeSqliteDialect` 的 `readOnly: true` 仅允许用于 read 角色：以原生只读模式打开已有文件，不创建缺失文件、不设置 journal_mode。默认池保留原连接模式与 query_only 保护，避免改变最后连接关闭时的 WAL 检查点行为。

此Linux提供者需要util-linux的flock可执行文件。缺少依赖则启动失败，不降级为无锁模式。旧空SQLite锁与新flock锁不构成互斥协议；升级本实现前必须停止旧进程，不支持两种版本并发访问同一属主数据。本节取代旧节点设计中的空协调库机制，保留其唯一属主、恢复和关闭责任。

备份继续借原固定read transaction。取消只提出停止请求，资源仍保有到原生backup实际收场。查询元信息必须保留容量限制。worker内部同步执行不是应用线程同步执行，也不表示任意同步业务回调已被异步化。

## 方言事务与错误

SQLite 独立读句柄设置 query_only=ON，以 deferred BEGIN 开始；首条实际读固定 WAL 快照，不见后来提交。写句柄 BEGIN IMMEDIATE，callback 的 await 期间仍持写锁。写句柄 busy_timeout=0，以异步重试让持锁调用方继续进展，总等待上限 5 秒后 StorageUnavailable。当前等待序列为 1、2、4、8、16、32、50 毫秒，随后保持 50 毫秒；这是提供者选择，不是公平性保证。读句柄 busy_timeout=5000。

SQLite 的 lockRow/lockSentinel 由库级写锁覆盖。PostgreSQL lockRow 用 FOR UPDATE，不存在行不提供插入排他；唯一约束裁决竞争。lockSentinel 用事务级 advisory lock，无需业务表；哈希碰撞只增加串行等待，不表示身份相等。PG 写事务的每条语句使用 SAVEPOINT/RELEASE；失败先 ROLLBACK TO，允许同事务重读。事务外启动／迁移语句不加此装饰，共用 pool 只 end 一次。

| 方言错误                                                               | 提供者翻译                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| SQLite 2067/1555                                                       | UniqueViolation，反查明确迁移约束名；反查失败是 StorageDefect |
| SQLite 787/1811 且报文含 FOREIGN KEY                                   | delete 为 delete-restricted，其余触发语句为 missing-target    |
| SQLite BUSY、I/O、CANTOPEN、FULL 主码及已关闭句柄                      | StorageUnavailable，保留 cause                                |
| SQLite READONLY、NOT NULL、CHECK、语法、未知列、绑定误用及未知驱动错误 | StorageDefect；读写句柄上的 READONLY 均如此                   |
| PG 23505/23503                                                         | 唯一／引用错误；按触发 DELETE 区分引用方向                    |
| PG 08xxx、57P01/57P02、53xxx、40001/40P01/55P03                        | 连接、资源或并发不可用；不能把未知提交回执断言成未提交        |

调用方原异常不重包装。SQLite CREATE UNIQUE INDEX 使用明确索引名，主键统一 `<table>_pkey`，含 rowid 别名主键。表内 UNIQUE 的自动名不能冒称迁移约束名。业务迁移拥有命名纪律。当前 UPDATE 被引用主键仍按触发语句记 missing-target；PG 缺 constraint 返回 unknown，尚未兑现公共约束命名要求。两项差异不能据此页宣称闭合。

## 迁移与升级守卫

登记表不存在才是空序列，读失败绝不作空。登记按 timestamp 升序，同刻按 name 排序；目录及登记在同一只读事务给 preflight checks，detail/cause 保持。checks 全通过后，在拍快照／迁移前拒绝本次 migrations 不认识的登记，稳定 check 为 migration-registry-beyond-known。序列前缀、业务片段、即时外键及 ON DELETE RESTRICT 纪律归装配和迁移拥有者。全部启动迁移成功后才发布 SQL 服务；无守卫不能承诺撤回半截 SQLite DDL。

PG 的全部待跑迁移及其登记在同一个事务整批成立，任一迁移失败整批回滚。迁移提交之后的应用启动失败不能撤回已提交迁移；这与整批迁移原子及未知 COMMIT 回执分别判断，不能混成“PG 没有任何回滚保证”。

guarded 路径先取得跨进程属主排他；失败直接 occupied，不等待、不碰生产库／快照、不附着 guard。生产打开者必须遵守 guarded 运维协议；本提供者不能阻止 unguarded 打开者。取得属主后、生产库打开前，清理临时半成品并同步目录，再恢复既有快照／不存在标记。清理失败归 restore 阶段失败，不继续覆盖。

首次库不存在先持久化不存在标记再开库。已有库且有待迁移时，备份含 WAL 已提交数据；先写临时文件、同步文件、原子改名、同步目录，之后快照才成立。位置固定为 `<file>.upgrade-snapshot` 和 `.tmp`，与原库同目录／文件系统。

未确认撤除必须先等在途及 confirm，全部句柄真关闭后才恢复。先删 WAL/SHM 并让删除持久，再替换数据库并同步目录。不存在标记恢复先删库和附属文件、同步，再删标记；步骤可重做，不让升级后 WAL 回放到旧库。未确认期间其他写者已提交的写也随恢复撤回。属主排他最后释放。句柄未关闭不恢复；恢复失败保留位置及 cause，多阶段错误均保留，不能让最后错误覆盖先前错误。

只有本包真实 guard 可附着，单 guard 不同时拥有两个实例。启动完成前／撤除开始后的 confirm 拒绝 UpgradeGuardNotAttached；同附着重复确认返回首次结果。已开始的 confirm 与撤除等待真实结算，成功确认的快照不再恢复。snapshotRemoved 仅表示真实删除并同步目录。已有库无待迁移三个字段均 false；首次空迁移 migrated=false、另两项 true。外部先删快照可为 snapshotTaken=true/snapshotRemoved=false，不得补 true。PG 没有文件快照，不能伪造回滚能力。

pending 只观察原附着位置，never-attached/clear/pending(location) 不从新配置猜；无法确认按 pending，临时半成品不计快照。pending 不证明维护、句柄或属主已释放。确认删除后 fsync 失败可能已无恢复快照；此遗留故障边界保留，不能承诺 confirm 任意失败都有快照。装配负责确认成功后开闸；漏确认会撤回本次启动全部写。

## JSON、初始化与同步

JSON 列用 text，Driver/Kysely 不自动 parse/stringify；无损应用读写归 content-blocks。worker取得 DatabaseSync 即拥有，即使 PRAGMA 未完成也必须收场。按需 reader 在等待打开前占池名额，初始化失败归还名额。主错误与关闭错误均保留；close 抛但实际已关仍报告失败，不虚构泄漏；仍开则保强引用与已取得源锁。

normal 为缺省，full 只接受固定枚举，对当前／以后开的读写句柄和迁移写连接统一设置，不拼任意输入到 PRAGMA。FULL 依赖 OS、文件系统及设备兑现同步，不是已验证物理断电保证。

## 维护物理隔离与工作预算

工作根必须是绝对、规范、真实路径，已有私有父目录，父／根属于当前 uid 且 group/other 无权限，拒绝软链根。根以 0700 创建，`.omne-isolated` 以 0600 独占创建，内容恰 `omne-isolated/1\n`。标记、根、父目录同步全成功才允许任务明文；既有根缺标记不得补成安全根。cleanup 只删本任务目录，不删／搬保护根或 marker。随机 128 位任务名独占创建，不自动清理其他任务残余。

所有生产打开路径，包括独立 openStorage、直接方言／lazy driver、升级 acquire/restore/snapshot/confirm 和维护源读，都先核真实祖先 marker；存在 marker 或无法检查即拒绝。拒绝最终符号链接文件，新文件从真实父目录判断。私有 inspect 只打开当前持锁根任务文件，没有公开跳过 flag。保护覆盖断电后明文删除回退；恶意宿主搬明文、删 marker 或硬链接不在保证。

`.owner-lock` 是永久flock文件，main持有同一FileHandle到真实任务结束，不删除或替换文件。同根在线／离线跨进程互斥，取不到 busy。不同根可检查同封装，不承诺同源全局锁或全机资源封顶。

源专用只读句柄 BEGIN＋首读固定观察后备份；期间其他写者可提交，副本仍固定。backup Promise 真结算才 ROLLBACK/close，不由取消回调抛错／超时推定结束。page_count×page_size≤1GiB，可用空间≥两倍预估＋256MiB；progress 核取消、WAL≥1GiB 及实际页数界限。每次 run/session 检查操作共享以单调时间计的 5 分钟取消请求预算，不为每一步重新计时。预算不是结束上限，不证明故障 IO 能停止。

先核副本 integrity_check 恰一行 ok、foreign_key_check 无行，再做 owner checks。登记缺失／重复／非法为 invalid-data。结构只从同副本 sqlite_schema、table_xinfo/index_list/index_xinfo/foreign_key_list 有界读取，不执行输入 SQL、迁移或 trigger。SQL 不解释 centerId/clock 列／备份封装；业务 checks 归拥有者。inspect 按精确长度写私有文件，流失败 unavailable，长度不同 invalid-data；不迁移、不恢复升级快照、不建业务表。view/结构大小和资源协议引用 core/storage。

## worker 真实结束与失败收场

物理 checks 由本包固定 Node worker 顺序执行，每个维护 session 互斥限制最多一个 worker，snapshot/inspect 下一步不与它重叠；不同工作根可独立并行，不设本包全局 worker 单例。它只接已验证隔离文件，导出句柄先关，文件之后不改；结束后主线程才开只读 view。worker 不是新服务／fiber／治理身份。

worker finally 真关 DatabaseSync 后给稳定结果，不跨线程传行数据或 SQL 错误原文。主线程同时观察 error/message/exit；恰一合法结果且 exit=0 才继续。缺失／重复／非法结果、错误或非零退出均失败，仍等真实 exit 才删任务／释放 run；message 不是静止证明。close/signal/预算只请求取消；不能把 terminate 请求当结束。同步 pragma 不协作取消，实际结束前维持 stopping，无无限故障 IO 的有界关闭承诺。

backup、worker、已发 read 必须真结束。close 抛且 isOpen=true 时保强引用，不删仍开文件、不主动放已取得源／工作根锁，poisoned 拒新 run；显式 close 可再收尾。持续失败交给 host incomplete，进程实际死亡才由 OS 解锁，exitCode 不是死亡。抛但已关仍报告失败，可放物理锁。尚未返回 engine 的 FileHandle/marker/协调库也归原作用域；PRAGMA/BEGIN 失败核实际 close，native close 结束空协调事务，不先 ROLLBACK。未取得的锁不得声称已保有。

## 验证与范围

具名方法和限制见 [verification](verification/README.md)。当前治理宿主交付 SQLite；PG 独立协议保留，PG 整体恢复、写锁等待上限、专用会话锁断连／事务池代理边界未闭合。普通进程重启和有限探针不证明物理断电、全部平台、任意公平调度或接近容量上界性能。维护保护不覆盖整机／磁盘损毁灾难恢复。
