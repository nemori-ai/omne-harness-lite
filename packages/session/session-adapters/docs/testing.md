# 使用共同日志内存提供者

从 `@omne-harness/session-adapters/testing` 导入 `createMemorySessionJournal`。它提供同一后端的 Session 事务端口，以及每个 tenant/session 的完整 Agent Journal、entries、materials 和 received 视图。根入口与 Cordis 入口仍不提供运行插件。本提供者的 `durability` 固定为 `none`；它不模拟磁盘、进程恢复或跨进程事务。

## 建立作用域

工厂需要三个明确的依赖：初始化来源 `initialization.verify`、Session 公开读写的 `accessCheck`（session-contract 的 `SessionAccessCheck`），以及 Agent Journal 操作的 `authorize`。`accessCheck` 没有默认允许。`transactions.commit` 显式携带本次 `SessionAccess`，每个公开读写在实际执行处调用一次 `check`，denied 与 unavailable 都不写入。`authorize` 回调返回 allowed、denied 或 unavailable；暂不可用不折叠为拒绝。这些依赖判断当前资格，不能用“操作曾成功”代替当前授权。Agent `commit` 或 `recordResult` 带 caller 时派生一个 Session 参加命令（`recordMessage`、`commitDerived`、`preserveResult`、`completeConsumption`）。提供者在共同发布之前按该命令调用一次 `accessCheck`，访问身份取本次 Agent 调用的 principal、tenant 与本会话。`denied` 与 `unavailable` 时两侧都不写入。allowed 的证据随同一次共同提交保存，`controls.decisionOf` 可按派生的 Session operation 读回。裁定的对象是按当前修订推出的 Agent 回执。裁定返回之前，同一 execution 的另一次写入可能已推进修订。这时本次调用两侧都不写入，返回 `unavailable`，owner 为 `session-qualification`，可以重试。本次调用内不再重新裁定。推出回执只读取已发布的根，不推进序号。被拒或被超越的调用不改变后续写入的回执。`controls.reconcile` 的每个 release 事实按 `receive` 各调用一次。接入范围见 session-contract 的[访问检查](../../session-contract/docs/access-check.md)。初始化验证必须绑定完整原命令及可信来源；不能把任意 guard 当作已获准。

先通过 `transactions.commit` 创建 Session、完成所需初始化并启动 Run，再用 `forSession({tenant, session})` 取得该根上的视图。Agent `open` 使用原启动回执的 grant、原 execution 和初始输入；后续 `submit` 使用 Session 已接纳的原输入。`sessionView(session)` 按每次调用的 tenant 路由到该 Session 的根，不改写 execution 或材料标识。

## 发布与解释

Agent 原记录、四类 CallerCommit 参加事实及原 Agent 答案同批可见。received 的条目、完整材料、消费绑定、saved 和原答案也在一次发布中可见。`controls.interpret` 从同根原事件读取材料，并以独立 Session operation 发布后果和解释进度。事件 sequence 与 Agent revision 分别保存；无后果事件不产生单独的 cursor 提交。

`controls.reconcile` 用新的稳定 Session operation 读取同根原结果和控制快照。它使用 `sequence: null`，不推进事件 cursor。它能处理无事件的结果责任更新，以及原后台槽位在控制事件之后才成立的情形。它不能补造 Model ACK 或 Tool 物理停止。停止核对中的原收场替代项只消费完整原调用关联且先于原具名控制提交的 Tool result 槽位或 ModelReplyAdmission；原请求对应的生产者确认仍按 AD-02 核对。Model facts 的未公开 schema 保持未解释。

Tool 的原 `release.confirmed.receipt` 由 `recordResult` 保存后，`controls.reconcile` 核对原 execution 所属 Run、consumption、完整结果和保管事实。它以原 receipt 为 source，经现有 `receive(release)` 决定写 SE19。一次对账中的全部释放与快照后果经过完整 reduce 校验，在一个 Session 修订和共同根中发布，并保存原 reconcile operation 的答案。任一释放被拒绝时不发布本批其他条目。已经反映的释放不重复写；发布后失答复可查询原 operation 或以原参数重试。Agent 确认与 Session 对账各有一次发布，Session 对账失败不会撤销原 Agent 确认。Model ACK 未决边界保持。

`recordResult.result` 与非 none 的 `transfer.result` 必须完整相同，包括 delivery 和 source。不同完整材料即使具有相同 producer、call 和 version，也在 Pending 准备之前被拒绝。查找既有责任仍按原结果键进行，同键异值不能新增第二份责任。

首次 custody/processed 的调用若尚未登记，提供者先核新请求和原操作，再以独立 operation 解释此前已提交 Pending/effect 的登记。准备未知时停止新结果提交。后续 joint 失败可以留下这笔旧 Pending 登记，但不能留下新结果或其 Session 参加事实。重试已提交的 Agent 操作直接认回原答案。

结果参加按原 execution 读取 SE13/SE15 材料，不依赖当前 pending 输入是否仍包含它。合格 custody 在原 Run ended、后继启动或 Session 归档后仍归原 Consumption，不推进事件解释进度。`recordResult(processed)` 的原 execution 与当前推进位置不相容时返回绑定原 Agent operation 的 conflict。缺材料、资格拒绝和提交未知保留各自结果。同一 active execution 内换 attempt 不改写原调用归属。对应回归在 `tests/result-lifecycle.spec.ts`。

冻结后的终态及后继输入承接先准备相关输入的全部原交入关系和必要前缀，再在当前根决定。原 `ended` 边界、授权、交入目录和解释进度都有同根索引。条目/字节预算耗尽会在内部让出执行；容量不足返回 unavailable，不截短最终释放批次。`finishRun.expected` 保持调用者原值；独立前缀解释若推进 Session 修订，首次请求可以返回 changed。调用者须重读，再以新操作和新 expected 收束。已成功的原操作仍先认回。

## 受信夹具和故障控制

`controls.loadHistory` 仅在尚未建立的根上装载完整、同作用域的原 Session 批次。它通过公开 decide/reduce 核验初始化、Run 和 attempt 关系；当前句柄只支持创建时的原初始输入，不能从后续批次中补造未随初始化提供的完整输入；不能覆盖已经发布的根。此句柄用于公共 entries 套件的既有合法历史前提。真实创建、启动、承接和收束组合测试使用公开命令。

`view.controls.planEvidence(input, method, evidence)` 可在真实 open/submit 之前预定原回执的证据名称。它绑定完整输入、tenant/session、execution、method 和 operation；不生成已提交事实。同域同证据不能复用于另一输入，已有原答案不能改名。Session 公共套件用它满足预先给定的 opaque 回执。套件的 `publishMessageParticipation` 则执行真实 Agent commit，并返回其原 Participation；套件先 query Session half，再核历史与原 ExecutionRef，最后重放认回。

entries 夹具为每个 `(tenant, execution)` 分配明确的 Session，材料按原消费绑定和已成立的材料引用路由。它的统计只减去第一次真实 open 后的固定 revision 基线，同时保留原始观测。该套件不证明同一 Session 的多 execution；对应义务由真实 Run 后继组合测试覆盖。

故障句柄只安排暂停、提交前失败、提交后失答复或材料损失。`pauseWrite`/`faultWrite` 针对原 Agent 方法；`pauseSession`/`faultSession` 针对原 Session operation。`resultPreparationOperation` 返回结果参加前准备的独立 operation，供同一故障控制使用。`quarantine` 关闭共享 gap 门，不需要推进根位置；旧准备不能因此继续发布。它们不授予业务资格，也不提供成功事实。

## 验证范围与资源成本

持续用例位于本包 `tests/`，包含 Agent entries/required received 与 Session 公共套件，以及真实同日志组合、原身份、隔离、故障和并发场景。外域 Model/Tool/HITL 原值采用明确的离线夹具；这些测试不证明外部生产者执行或交付能力。

预算约束本次所需读取与不可分割提交的容量。内存根发布仍复制 Map、索引和历史数组，其总成本随保留历史增长。`frontierMetrics` 统计准备时计入预算的目录、关系、事件与让出次数；它不代表所有 CPU、分配或根复制成本。使用实际端到端计时评估当前数据规模，不能只看后缀计数。
