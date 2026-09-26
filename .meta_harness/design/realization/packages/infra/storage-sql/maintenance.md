# SQLite 快照、检查与隔离 · 候选 R1

消费 [core/storage 维护扩展](../../core/storage/maintenance.md) 与 EC3 S-59。仅候选，现有普通存储代码不据此提升支持状态。方案依据 [三种分工](../../../../record/proposals/governance-production-mechanisms/maintenance-ownership.md)。

## 同一属主和生命周期

SqlStorage 可选 `maintenance` facet；仅带已确认升级守卫的SQLite实例以及显式维护工作目录配置才提供。创建和销毁都归storage-sql，既有storage fiber不变。run使用该SqlStorage的同一准入和在途计数并加一个busy槽；stop关准入并请求当前任务取消，close等待run实际结束，再关业务句柄/升级收场/放源owner。不能用应用传来的源路径重新取资格。升级guard未确认不准受理。

维护工作根在存储装载时准备、加排他直到实例close。进程锁复用本包私有空锁库 BEGIN IMMEDIATE/timeout0 的属主机制，路径 `<workRoot>/.owner-lock`，只是协调文件，不当业务数据库打开；连接强引用到close，死进程由OS解锁。离线 openSnapshotInspection(workRoot) 用同一实现，不得和在线共用根并行。根内临时任务名用随机128位独占目录；不自动清理其他任务残余，避免混淆进行中或故障证据。

## 持久隔离与打开检查

工作根必须有已存在的私有父目录；绝对规范真实路径，父/根归当前uid且group/other无权限；拒绝符号链接根。以0700独占创建根，以0600独占创建固定 `.omne-isolated` 标记，内容恰 `omne-isolated/1\n`。先fsync标记、根、已有父目录全部成功，才能创建任务明文。既有根必须同样验证标记/权限并重新确认耐久；不将标记缺失的既有目录补成“本来安全”。新建失败的无明文根可留下并报告，不能继续。

标记和根在产品cleanup永不删除或移走。任务子目录可删，失败留具名诊断；断电撤销删除时保护祖先仍在。平台和介质必须兑现同步；恶意宿主删标记/硬链接/迁出明文不在保证内。

`assertProductionStoragePath(file)` 在所有生产SQLite打开之前做：规范化已有父目录/文件realpath并逐祖先检查标记；有标记或检查失败即拒绝。已有符号链接文件拒绝，未存在文件从真实父目录判。覆盖openStorage、openSqlite/驱动首次打开、SqliteOwnerSite升级恢复/快照/确认路径及维护源连接；不得只在host命令处检查。内部inspect只允许本模块刚创建且属于持锁工作根的任务文件，使用不同私有打开函数，不提供绕过guard的公开flag。历史实验制品不在正式支持集合。

## 在线固定观察

snapshot使用原源文件专用只读DatabaseSync，BEGIN并首读固定观察；检查page_count×page_size≤1GiB和空间至少2×预估大小+256MiB。调用Node24.21 backup导出至隔离任务文件。每次progress检查取消/5分钟预算/WAL≥1GiB/实际页数上界；预算用单调时间，不是完成承诺。backup Promise真实结算才ROLLBACK和关闭原源句柄；失败路径同样等待。取消回调抛错的真实Finalize依据既有2026-09-25-backup-cancellation研究，固定观察依据pinned-read-backup研究。

完成副本以只读句柄检查SQLite integrity_check恰一行ok、foreign_key_check无行；读所有用户表名及完整Kysely迁移登记；缺失/重复/非法登记为invalid-data。只读事务把这些和view提供给owner检查。SQL不识别centerId、clock列或备份文件头。源事务关闭后业务写不再保留WAL；源实例run仍覆盖use内发布与后续清理。最终副本所有读句柄结束才删任务文件。

inspect先按input精确字节数流式写入私有文件，输入流异常为unavailable，长度不符为invalid-data；完成后同样检查。绝不迁移、恢复升级快照或创建业务表；SQLite解析损坏映射invalid-data，IO/资源异常unavailable。每次run/session检查操作共有5分钟取消请求预算，无法取得IO进展时不宣称有界终止。

## 取证义务与缺口

实际源并发提交而副本固定、导出期间源close/第二owner、cancel/断连/30秒以后仍持资源、各种IO失败；根创建同步顺序故障和SIGKILL明文残余的全部生产路径拒绝；不同进程共用工作根busy；恶意长度/SQLite内容/迁移登记与句柄释放。无真实证据前不能标完成。PostgreSQL维护不提供，本期host仍显式仅SQLite。

排他域澄清：在线一个中心属主单维护工作；离线每调用作用域单工作，同工作根跨进程锁。不同工作根可并行只读校验同一封装，每个固定自身输入与隔离暂存；相同恢复目标仍独占。没有全机IO/内存总量封顶承诺。此精化须与EC3候选同步，不以工作根锁冒称同源文件全局锁。

关闭结果交接：带维护的SqlStorage.close最外层必须在workspace锁/所有句柄及源owner最后释放后才把host静态提供的storage观察槽置clean；任何关闭/释放异常记error，pending不算成功。不可用现有closeLogged日志或guard.pending无快照替代此事实；observer缺席时提供者本身仍拒绝假成功，但本期host要求明确装配。

性能待验：DatabaseSync完整integrity_check/foreign_key_check会同步占用调用线程。实际验收须覆盖接近1GiB和多索引/FK副本的校验阶段，同时持续真实业务与clock续约；无源写锁不证明员工访问保持可用。若该执行方式使时钟失效或业务停顿超出已承诺规则，阻断实现采用并回本节点重新选择执行归属，不能只跑小数据通过。当前无可用性性能结论。

R2结构读数：在同一副本只读事务使用sqlite_schema与PRAGMA table_xinfo/index_list/index_xinfo/foreign_key_list提取core/storage SnapshotView.structure；包括部分索引条件/表达式原始定义并在owner检查时按本版已知形式核对。不执行来自封装的SQL、触发器或迁移。索引/表结构定义有界读，超过协议边界capacity；外键的物理行检查仍独立保留。没有owner认可的额外view/trigger拒绝，不能仅靠migrationNames相信表仍在。

## R3：物理完整性校验的单工作线程

2026-09-26双平台约869MB/百万行/三索引探针表明，主线程integrity_check阻塞约3.4秒，超过clock续约周期；R2仅留性能义务不足以作为当前执行选择。R3替代“在请求线程执行全库物理检查”的绑定：固定副本的integrity_check与foreign_key_check在本包拥有的一个Node worker内顺序执行，其他owner的有限结构/标识/底线读取仍在同一固定副本上。副本文件生成后不再修改，先关闭导出写者；worker结束后再开启主线程只读view，所以无需跨线程传Kysely句柄。

worker是storage任务的子执行资源，不是新fiber/service/资格拥有者。入口只接内部已验证工作根任务文件路径，代码入口固定本包文件，无来自网络的SQL/脚本/worker选项。Worker只读打开，执行两个固定pragma，完整输出不越过线程：只返回ok或具名invalid-data/unavailable和稳定错误类，不传行资料/SQL错误原文；finally关闭DatabaseSync后才发结果并关闭parentPort。主线程同时观察error/message/exit，必须有恰一个合法结果且实际exit=0才能继续；消息到达不等于退出。错误/缺结果/非零exit均失败，仍等待真实exit后才清理文件或释放run。

最多一个子worker，由session已有互斥承担；snapshot/inspect下一步不与它重叠。关闭、AbortSignal与5分钟预算只请求取消并记录，不能用terminate发起或消息收到冒充实际静止；同步pragma期间不能协作取消，维持stopping到worker真实结束，SIGKILL中心仍属异常。worker异常退出后该副本不用作成功，根marker仍保护残余；Node进程本身死亡依已有异常恢复边界。没有无限故障IO的正常关闭上限承诺。

验证：两平台对同一近界副本比较主线程计时器响应、结果与worker退出顺序；实际产品业务/clock续约仍必需。延迟退出、error后exit、结果前退出、重复/非法消息、取消期间close和第二owner拒绝是生命周期负例。打包需worker文件进manifest；从归档而非源码路径运行，避免开发可用但制品缺worker。源码/制品阶段均验证固定入口，测试不得注入任意远程代码路径。

## D055关闭失败的实施绑定澄清

在backup/worker/已发读取均真实结算之后，若DatabaseSync.close抛而isOpen仍true，资源作用域保留强引用，执行方poisoned拒新工作；未关资源所在任务文件不删除，源owner与工作区锁都不主动释放。close可以显式再尝试资源收尾，仍失败则向host记录incomplete并非零故障退出，只有进程实际死亡才由OS释放锁；设置exitCode不等于死亡。不能把尚在执行/挂起的任务套进这条故障退出路径，后者仍等待真实结束、期限仅诊断。全部句柄已关而删除失败仍按既有unavailable+隔离残余规则。独立架构评审对此限定绑定无阻断；真实多进程注入验证待实现。

## R4候选：同一run内的调用方资源

消费core/storage maintenance R3的ownResource。SnapshotEngine每run持一份独立资源作用域，和各snapshot/inspect任务内SQLite作用域分开；fn和children真实结算后封闭登记并收尾。显式释放失败的事实保留到run结果，即使fn吞掉也不消失；正常坏副本拒绝仍可处理。未closed的run资源持强引用并进入与task残余相同的关闭保锁判据，不能仅据task目录清空认为settled。在线SqlStorage与离线factory共享实现；ownResource不泄露到离线snapshot面以外的任何治理动作。SQL层只接close/isClosed，不读路径或封装。
