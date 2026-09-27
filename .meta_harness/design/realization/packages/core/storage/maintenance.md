# SQLite 快照维护扩展 · 候选 R1

状态：仅提供者协议候选，消费 EC3 S-55～S-59；没有产品实现或接受。普通 Storage/AtomicStorage 的语义不变，PostgreSQL 不被要求提供文件快照。框架拓扑沿原 storage 服务，不增通用治理能力。

## 类型与责任

公开类型放 core/storage，具体构造在 storage-sql。`SnapshotMaintenance.run<T>(fn: (session: SnapshotSession) => Promise<T>, options?: { signal?: AbortSignal }): Promise<T>` 是一个完整维护工作边界。单实例只准一个 run，不排队；未确认升级、关闭后、无源或不支持拒绝，不从旧路径另开一个未受管连接。run 从受理到 fn、全部子资源和清理真实结束一直计入 StorageInstance.close 的在途；fn 抛错不释放尚未结束的子任务。关闭/取消只提出请求，不能将期限当结束。

`SnapshotSession` 提供 `snapshot(use)` 和 `inspect(input, use)`；两者在一次 run 中只能顺序调用，不允许重叠或重入。snapshot 从本实例的源取得一致副本；inspect 将受限字节输入写入隔离文件后检查。input 是 `{ byteLength, chunks: AsyncIterable<Uint8Array> }`，长度精确、最多1GiB，每块最多64KiB，越界 capacity，提前/多余字节 invalid-data。生产调用者由入口包固定，不从网络把任意回调交给它。

两操作的 use 获得 `SnapshotView`：`inspection: PreflightInput`、`byteLength`、`read(offset,length): Promise<Uint8Array>`。inspection 是绑定本副本只读事务的表名、迁移名及 ReadTx；read 每次最多64KiB、不能超界，要求全长读取，不将短读当EOF成功。view没有文件路径、原始SQLite句柄或写权限。回调结算后 view失效，read拒绝；ReadTx同现有存储协议仅在回调有效，不许逃逸。提供者在回调结算及已启动read全部结束后才关事务/句柄，再清理任务目录；反例测试回调提前返回而read仍在途。

离线工具消费 `SnapshotInspection.run(fn)`，session只有inspect、没有snapshot。其构造与close归storage-sql，复用同一隔离与读数代码；不造临时生产Storage，不跑迁移。在线与离线同工作根的进程锁互斥，拿不到busy；不同工作根相互独立但每次输入必须固定，目标仍独占。

失败类型 `SnapshotFailure` 具名为 busy/unavailable/capacity/invalid-data/cancelled；它们是物理维护失败，不是治理失败。只有真实工作结束且清理完成才能 cancelled。清理失败覆盖此前普通失败为unavailable，附内部残余定位（不输出内容）；已有发布unknown的优先级由上层保留，不由此类型推断无副作用。IO读错是unavailable，内容/完整性检查明确失败才invalid-data。禁止未知错误假冒坏副本；未知异常记录具名诊断并收场。

## 验证义务

存储提供者承担：单run排他、关闭拒绝新工作且等待原工作；回调/子read真实结算；固定观察与并发业务提交；view逃逸拒绝；取消和Promise拒绝后真实释放；永久隔离先于明文、跨进程工作根排他、失败清理仍有保护。EC3有限模型不证明这些实际机制。绑定尚无实际测试，不登记已兑现。

排他域澄清：在线一个中心属主单维护工作；离线每调用作用域单工作，同工作根跨进程锁。不同工作根可并行只读校验同一封装，每个固定自身输入与隔离暂存；相同恢复目标仍独占。没有全机IO/内存总量封顶承诺。此精化须与EC3候选同步，不以工作根锁冒称同源文件全局锁。

R2候选补足：调用方signal和实例close只请求取消，session暴露只读cancelled状态以阻止尚未发布的新副作用；signal不带治理含义，取消后已发布对象不得删除。

`SnapshotView.structure` 是SQL提供者从同一副本只读取得的有限结构读数：每个用户表的columns（name、声明type、notNull、pk序号），indexes（唯一性、列顺序、partial条件及表达式）、foreignKeys（源/目标列、表、onUpdate/onDelete），以及views/triggers清单。列、索引与FK读数不含行数据或查询参数。默认不允许未经owner声明的对象/列；支持格式由静态owner检查决定。枚举边界最多64表、每表128列/128索引/128外键、每个定义16KiB；超过capacity。这是本制品格式检查输入，不是新增可远程查询的数据库元数据服务。

各owner静态`SnapshotCheck`签名为`(view: SnapshotView) => Promise<PreflightResult>`；只读检查可返回具名不合形，IO异常不折成false。checkpoint表示/报告只能含稳定检查名，不包含行值。snapshotCheck中的结构比较语义与具体SQL解析归本版提供者，不新增远程payload。

## R3候选：调用方资源归入同一run

沿EC3 S59与[候选比较](../../../../record/proposals/governance-production-mechanisms/maintenance-resource-lifetime.md)，SnapshotInspectionSession增加`ownResource(close: () => void | Promise<void>, isClosed: () => boolean): () => Promise<void>`，在线SnapshotSession继承。仅静态本地消费者用，不由网络传回调。登记归run级，覆盖封装输入/输出/目录FileHandle；SQL只调用收尾与闭合观察，不获得文件路径/格式/发布策略。entry在open实际成功后立即登记，返回函数是显式可重试的释放，不重放写入/发布。

取消与close只关新run，不提前关当前run登记窗口：已在途open仍须登记。fn与全部已发子操作结算后才封登记并关闭所有剩余资源；调用方不许逃逸未await的open。结束后的登记抛内部缺陷。登记回调正常返回但isClosed=false同样是内部缺陷，不能当已结束；close抛且isClosed=true保留失败但可以释放物理所有权；仍false则保留强引用、poisoned拒新run，close可再收尾，持续失败保留工作区和源锁直到真实故障退出。普通残余文件删除失败与未关句柄不同，沿D055规则。

run级收尾失败与任务级收尾失败采用同一优先级：普通操作拒绝可由fn处理，真实收尾失败或内部缺陷不可吞，cancelled不能掩盖；上层已发布unknown仍按EC3保持。资源释放函数不许逃逸到作用域外开启新工作。对象生死和能力边界不变；该提供者修订未改变冻结EC3/HT3。

验证义务：fn拒绝/取消之后才返回的open仍登记；内层关闭失败被fn捕获也不得假成功；close正常返回但isClosed=false拒绝；在线source.close与离线inspection.close等待在途；FileHandle关闭故障仍开时两个跨进程锁保留；句柄已关但close抛错仅报告失败而不误称仍开；全部资源正常关闭才能clean。entry取得句柄后必须登记的路径以实际文件API故障注入覆盖。

登记的close/isClosed回调只依赖它持有的原资源，不查询已撤除服务，不等待本run自身结束；否则构成内部生命周期缺陷。
