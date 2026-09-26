# 显式共同事务的存储绑定 · 候选 r2

实施输入为已接受 AI3 S-49/51 与 D-040 的显式参与方向；本页为 core/storage + infra/storage-sql 的待审提供者增量，不改变已冻结领域规格。

## 公开边界

普通 `Storage.read/write` 保留原协议：独立提交，嵌套调用仍是 StorageDefect。新增显式扩展面 `AtomicStorage extends Storage` 的 `atomic(fn)` 为显式共同提交入口；不是在 ALS 中自动合并普通 read/write。它开启一次既有写事务，给 fn 仅在此次调用内有效的 `StorageUnit`：

- `assertStorage(expected)`：由 owner 核验同一个 Storage 实例；不匹配为作用域误用并污染本次单元。
- `run(fn)`：在当前作用域内执行一个参与操作，明确跟踪嵌套调用；不能让并行分支共享同一事务。
- `query(fn)` / `mutate(fn)`：调用方在 unit.run 中执行，直接使用外层同一个 tx；返回仅表示该段完成，**不是提交**。query 提供只读类型视图，不声称有普通 read 连接的硬只读保证（见限制）。
- `afterCommit(notify)`：登记尽力通知，不立即派发，不等待监听者。运行结束或域不匹配立即拒绝；只有真实提交拥有者才可释放队列。

StorageUnit 使用 query/mutate 而非普通 read/write，不是可替代普通 Storage 的对象；owner 的执行上下文显式选择普通执行器或参与执行器。账号/治理导出具名参与方法包装，在每个 public 方法入口用 unit.run；内部 SQL 回调使用 unit.query/mutate。需要跨 owner 子调用时，通过同一个 unit 的对应参与面调用；不穿透其他包私有表。

## 实际提供者算法

SqlStorage.atomic 沿已有 storage.write 开一个写事务并继承其在途排空/提交/回滚机制；事务内构造单次 unit，运行最外 fn。unit 由 provider 内部创建，不提供公开可伪造的工厂。退出前关闭作用域，真实提交成功之后才派发通知；通知抛出记诊断，不把已提交结果改报业务失败。

unit 内使用每实例 AsyncLocalStorage **只跟踪调用帧的父子与生命周期**，不用于把普通 Storage 操作偷偷拉入事务。一个活帧同时只允许一个子调用。嵌套子调用拥有新帧，顺序 await 后释放；同一父帧的 Promise.all 第二条分支立即 StorageDefect。游离回调继承的帧若已关闭，调用也立即失败。这只能检测活跃帧/重叠及结束时仍在途，不能证明每个Promise都被await，也不能识别在父帧开放期间完成的所有后台交接；owner仍负责不派发游离工作。

不能因 Promise.all 提前拒绝就关连接：unit 跟踪所有已接纳参与调用，结束时若还有未 await 的调用则标为缺陷，禁止后续 SQL，等已接纳调用各自静止再把缺陷抛出到外层回滚。此前发出的 SQL 仍由同一个事务收场，不宣称 JS Promise 取消等于 SQL 静止。纯业务回调若永不结束，不虚构硬超时或可强杀 JS；沿现有进程停机上界收场。

任何作用域误用将本次单元标记失败，即使业务代码捕获了该异常，也不能在外层正常提交。参与 SQL 抛出的 StorageUnavailable/StorageDefect 同样污染本单元；P-2 的 UniqueViolation/ReferenceViolation 只有在所属参与操作 run 内部被 owner 合法处理、操作正常完成时才允许继续。任何异常一旦逃出 run（包含普通 Error 和这些冲突），都使单元不可提交，即使祖先捕获后正常返回也不解除，原异常仍传播。query/mutate 只观测逃出其回调的错误；不声称检测回调内部被吞掉的不可恢复 SQL 错误，可信 owner 不吞错是独立审查/测试义务。领域正常拒绝由 owner 选择只保留规范允许的单调事实。

接纳时即给每个受跟踪Promise挂内部拒绝观察，避免等排空才监听导致未处理拒绝；返回给调用方的Promise仍拒绝，不改为成功。提交前污染阻止提交；提交后旧unit误用只拒绝新SQL并报缺陷，不能追回既成提交。通知在事务和单元执行上下文之外派发，必须验证其可发起独立存储读取。

## 只读参与与通知限制

参与 read 使用同一写事务，不能继承普通只读连接的 query_only 保证。本期采用显式命名 `query(fn)`，类型为 ReadTx，但不声称数据库硬只读；owner 仍须遵循查询面规则。写入方法命名 `mutate(fn)`，这是执行器的明确选择，不把 SQL 程序分类当安全沙箱。普通 Storage.read 的硬只读保证完全不变。

afterCommit 只收无等待通知函数；退出事务后逐项调用，抛出必须由 provider 诊断。返回 Promise 的误用也要明确处理：不等待，不将 rejection 变成未处理拒绝，记录通知缺陷。队列不是可靠 outbox；不跨重启重放，不在未知提交时虚构送达。所有凭据/出示物不能进入通知队列或日志。

## 绑定与验证门槛

core/storage 增加独立 AtomicStorage/StorageUnit 接口与 P-13 协议/符合性，原 Storage 不增必选方法；SqlStorage 显式实现该扩展，未来新组合在装配时要求它；infra/storage-sql 实现单元，两个方言均只有原子提交协议，不因此宣称 PG 具备新版治理授权锁序。生产治理装配仍按 D-040 仅 SQLite；普通消费者不被隐式改提交。

实际验证：共同提交及关闭重开；第二步失败回滚第一步；查询看到本次暂存；通知 commit 后可从独立连接读到结果、回滚不发；作用域跨实例、关闭后、未await、并行与被catch的误用拒绝且回滚；普通 nested调用仍失败；故障时等待已接纳 SQL 静止，不提前释放句柄；合法顺序嵌套/跨 owner 调用不死锁。测试只用真实临时 SQLite，不造内存存储；PG 未配则如实留未测。

本页经独立提供者评审后才同步节点并实现；它不是完整 AI/OG 参与面的完成声明。

约束的检测边界是 unit/参与面公开 API。向可信 owner 的回调借出的 WriteTx/Kysely 必须只在该回调使用，不能保存或交后台；本增量不把任意 JS/SQL 回调变成安全沙箱，也不声称检测绕过公开API直接使用泄漏裸句柄的程序缺陷。

## r1 评审与局部原型

独立评审要求区分P-2语句恢复与run异常逃出，r2已明确；ALS检测范围、接纳即监听拒绝、提交后误用也已收窄。为保持普通消费者接口，不给Storage增加必选atomic，只提供显式AtomicStorage扩展；新生产组合另核要求。

临时原型使用现有真实SQLite提供者测试污染/嵌套/排空与通知，尚不作为产品实现。前两轮P-2夹具发现既有驱动不能从index_list识别INTEGER PRIMARY KEY的rowid别名，给主键命名也不解决；因此误映为StorageDefect。原失败保留，按既有P-11补驱动映射和真实事务测试后再跑原型。原型不能代替core符合性及完整provider实现。
