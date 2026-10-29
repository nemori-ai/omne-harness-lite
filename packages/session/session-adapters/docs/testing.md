# 使用共同日志内存提供者

从 `@omne-harness/session-adapters/testing` 导入 `createMemorySessionJournal`。它提供同一后端的 Session 事务端口，以及每个 tenant/session 的完整 Agent Journal、entries、materials 和 received 视图。根入口与 Cordis 入口仍不提供运行插件。本提供者的 `durability` 固定为 `none`；它不模拟磁盘、进程恢复或跨进程事务。

## 建立作用域

工厂需要三个明确的依赖：初始化来源 `initialization.verify`、读与 Agent 操作的 `authorize`、Session 变更的 `authorizeCommand`。目录查询另用 `authorizeDirectory`。回调返回 allowed、denied 或 unavailable；暂不可用不折叠为拒绝。这些回调判断当前资格，不能用“操作曾成功”代替当前授权。初始化验证必须绑定完整原命令及可信来源；不能把任意 guard 当作已获准。

先通过 `transactions.commit` 创建 Session、完成所需初始化并启动 Run，再用 `forSession({tenant, session})` 取得该根上的视图。Agent `open` 使用原启动回执的 grant、原 execution 和初始输入；后续 `submit` 使用 Session 已接纳的原输入。`sessionView(session)` 按每次调用的 tenant 路由到该 Session 的根，不改写 execution 或材料标识。

## 发布与解释

Agent 原记录、四类 CallerCommit 参加事实及原 Agent 答案同批可见。received 的条目、完整材料、消费绑定、saved 和原答案也在一次发布中可见。`controls.interpret` 从同根原事件读取材料，并以独立 Session operation 发布后果和解释进度。事件 sequence 与 Agent revision 分别保存；无后果事件不产生单独的 cursor 提交。

`controls.reconcile` 用新的稳定 Session operation 读取同根原结果和控制快照。它使用 `sequence: null`，不推进事件 cursor。它能处理无事件的结果责任更新，以及原后台槽位在控制事件之后才成立的情形。它不能补造 Model ACK 或 Tool 物理停止。停止核对中的原收场替代项只消费完整原调用关联且先于原具名控制提交的 Tool result 槽位或 ModelReplyAdmission；原请求对应的生产者确认仍按 AD-02 核对。Model facts 的未公开 schema 保持未解释。

首次 custody/processed 的调用若尚未登记，提供者先核新请求和原操作，再以独立 operation 解释此前已提交 Pending/effect 的登记。准备未知时停止新结果提交。后续 joint 失败可以留下这笔旧 Pending 登记，但不能留下新结果或其 Session 参加事实。重试已提交的 Agent 操作直接认回原答案。

冻结后的终态及后继输入承接先准备相关输入的全部原交入关系和必要前缀，再在当前根决定。原 `ended` 边界、授权、交入目录和解释进度都有同根索引。条目/字节预算耗尽会在内部让出执行；容量不足返回 unavailable，不截短最终释放批次。`finishRun.expected` 保持调用者原值；独立前缀解释若推进 Session 修订，首次请求可以返回 changed。调用者须重读，再以新操作和新 expected 收束。已成功的原操作仍先认回。

## 受信夹具和故障控制

`controls.loadHistory` 仅在尚未建立的根上装载完整、同作用域的原 Session 批次。它通过公开 decide/reduce 核验初始化、Run 和 attempt 关系；当前句柄只支持创建时的原初始输入，不能从后续批次中补造未随初始化提供的完整输入；不能覆盖已经发布的根。此句柄用于公共 entries 套件的既有合法历史前提。真实创建、启动、承接和收束组合测试使用公开命令。

`view.controls.planEvidence(input, method, evidence)` 可在真实 open/submit 之前预定原回执的证据名称。它绑定完整输入、tenant/session、execution、method 和 operation；不生成已提交事实。同域同证据不能复用于另一输入，已有原答案不能改名。Session 公共套件用它满足预先给定的 opaque 回执。套件的 `publishMessageParticipation` 则执行真实 Agent commit，并返回其原 Participation；套件先 query Session half，再核历史与原 ExecutionRef，最后重放认回。

entries 夹具为每个 `(tenant, execution)` 分配明确的 Session，材料按原消费绑定和已成立的材料引用路由。它的统计只减去第一次真实 open 后的固定 revision 基线，同时保留原始观测。该套件不证明同一 Session 的多 execution；对应义务由真实 Run 后继组合测试覆盖。

故障句柄只安排暂停、提交前失败、提交后失答复或材料损失。`pauseWrite`/`faultWrite` 针对原 Agent 方法；`pauseSession`/`faultSession` 针对原 Session operation。`resultPreparationOperation` 返回结果参加前准备的独立 operation，供同一故障控制使用。`quarantine` 关闭共享 gap 门，不需要推进根位置；旧准备不能因此继续发布。它们不授予业务资格，也不提供成功事实。

## 验证范围与资源成本

持续用例位于本包 `tests/`，包含 Agent entries/required received 与 Session 公共套件，以及真实同日志组合、原身份、隔离、故障和并发场景。外域 Model/Tool/HITL 原值采用明确的离线夹具；这些测试不证明外部生产者执行或交付能力。

预算约束本次所需读取与不可分割提交的容量。内存根发布仍复制 Map、索引和历史数组，其总成本随保留历史增长。`frontierMetrics` 统计准备时计入预算的目录、关系、事件与让出次数；它不代表所有 CPU、分配或根复制成本。使用实际端到端计时评估当前数据规模，不能只看后缀计数。
