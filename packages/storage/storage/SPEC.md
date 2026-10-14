# 存储事务行为

目标文档在 `packages/storage/storage`。本目录记录规格。workspace 包、源码和运行入口尚未建立。PanQiWei 于 2026-10-14 认可本规格的结果模型。断电耐久的提供者符合性仍由 [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 承接。系统行为以[数据与状态](../../../docs/architecture/data-and-state.md)为准。

调用方学习三个操作：`registerCombination`、`commit`、`query`。写连接、SQL 和写者代际留在提供者内。

公共结果由这一份目标文档拥有。workspace 包要等具名消费者和可运行入口。本规格不把旧的 `write` 回调迁进来。那个回调在应用线程执行，和 Worker 内命令冲突。

## 参加者

调用方出示操作身份。结果未知时，调用方用同一身份调用 `query`。提交协调者登记参加者和组合版本。事实拥有者提供放进同一次 `commit` 的命令。存储提供者把一个事务域绑到一个数据库身份和一条写连接。命令在 Worker 内执行。

一次 `commit` 容纳这些事实拥有者的命令。输入受理协调者写入来源、提交身份和去处责任，并写入内容或有效引用。日程拥有者写入一次定义更新中必须同时成立的事实。HITL 与原等待的拥有者写入有效答复、等待状态和后续责任。各拥有者规定 `facts` 的含义。`facts` 放在命令里。

日历发布、通知送达、模型调用、工具效果和文件发送使用各自的后续操作。原拥有者在观察到已提交回执之后执行这些操作。

## 操作身份

操作身份包含租户、事务域、操作、协议版本和操作键。这五项都由调用方传入。本规格的协议版本是 `1`。

## 公开类型

类型把不能同时成立的结果拆开。`commit` 的返回值不含未提交。未提交只出现在 `query`。

```ts
type ProtocolVersion = "1"

type OperationIdentity = {
  readonly tenant: string
  readonly transactionDomain: string
  readonly operation: string
  readonly protocolVersion: ProtocolVersion
  readonly operationKey: string
}

type FactCommand = {
  readonly participant: string
  readonly facts: Readonly<Record<string, unknown>>
}

type CommitRequest = {
  readonly identity: OperationIdentity
  readonly combinationVersion: string
  readonly commands: readonly FactCommand[]
}

type Committed = {
  readonly kind: "committed"
  readonly identity: OperationIdentity
  readonly inputDigest: string
}

type RolledBack = {
  readonly kind: "rolled_back"
  readonly identity: OperationIdentity
  readonly inputDigest: string
}

type Unknown = {
  readonly kind: "unknown"
  readonly identity: OperationIdentity
}

type IdentityConflict = {
  readonly kind: "identity_conflict"
  readonly identity: OperationIdentity
  readonly existing: Committed | RolledBack
}

type RejectedBeforeAccept = {
  readonly kind: "rejected_before_accept"
  readonly identity: OperationIdentity
  readonly reason: "combination_unregistered" | "participant_not_in_combination" | "queue_full" | "field_missing"
}

type CommitResult = Committed | RolledBack | Unknown | IdentityConflict | RejectedBeforeAccept

type NotCommitted = {
  readonly kind: "not_committed"
  readonly identity: OperationIdentity
  readonly proofs: {
    readonly writerGenerationExcluded: true
    readonly oldTransactionTerminated: true
    readonly databaseRecoveryFinished: true
    readonly authoritativeReadSucceeded: true
    readonly operationNotQueued: true
  }
}

type QueryResult = Committed | RolledBack | Unknown | NotCommitted
```

`NotCommitted` 的五项证明由提供者构造。调用方代码不组装这个对象。

协议版本 `1` 的输入摘要算法是 SHA-256。摘要写成十六进制小写。输入是命令数组的规范 JSON。对象键按字典序排列。命令按 `participant` 字典序排列。JSON 中间没有空白。编码是 UTF-8。调用方不传入摘要。更换排序、空白或算法时，协议版本改为新的字符串。

## 登记

`registerCombination` 把参加者名字和组合版本登记到一个事务域。提供者按该事务域保存登记。协调者进程重启后，提供者仍返回这份登记。

事务域以登记中的标识为准。调用方在操作身份中传入这份标识。

新写者在旧写代际被排除之后开始。排除之前，提供者拒绝新的写准入。

名字缺失时，提供者拒绝登记。版本缺失时，提供者拒绝登记。拒绝不写入回执。

尚未开始的操作已经达到提供者声明的队列上限时，`commit` 返回受理前拒绝，原因是 `queue_full`。这次拒绝不写入回执。

## 提交

`commit` 接收操作身份、已登记的组合版本，以及命令。每条命令只含版本化数据。

提供者在受理前核对组合。组合已登记，并且每条命令的参加者属于该组合时，提供者受理。否则提供者拒绝。拒绝不写入回执。这次拒绝的名称是受理前拒绝。

提供者按该协议版本公布的规范编码，从命令数据计算输入摘要。

同一操作键和同一输入摘要再次调用 `commit` 时，提供者返回已保存的回执。提供者不再执行命令。

同一操作键配到不同输入摘要时，提供者从 `commit` 返回 `identity_conflict`。这个结果带上已有回执。

断开、超时、Worker 退出或取消观察时，调用方用同一身份调用 `query`。调用方在 `commit` 返回前失去响应时，也用同一身份调用 `query`。

持久回执只有已提交和明确回滚。`commit` 返回 `committed`、`rolled_back`、`unknown`、`identity_conflict` 或 `rejected_before_accept`。

## 查询

`query` 按原来的操作身份读取。

查询返回已提交回执、明确回滚回执或未知。五项证明全部由提供者内部构造时，查询返回未提交。五项证明是旧写代际已排除、旧事务已终止、数据库恢复已完成、权威读取已成功，以及该操作未进入受理队列。缺任何一项时，查询返回未知。

调用方读取查询结果。未提交的值由提供者构造。

回执记录提交结果。回执不新建 Run，也不发送通知。原拥有者在看到已提交回执之后，另行执行这些动作。

| 操作 | 返回 |
| --- | --- |
| `registerCombination` | 已保存的登记，或受理前拒绝 |
| `commit` | `committed`、`rolled_back`、`unknown`、`identity_conflict` 和已有回执、`rejected_before_accept` |
| `query` | 已提交回执、明确回滚回执、未知、未提交 |

## 提供者义务

SQLite 提供者在专用 Worker 内使用 `node:sqlite`。基线是 Node 24.21.0 内嵌的 SQLite 3.53.4。路线见[技术基础](../../../docs/architecture/technical-foundations.md#共同技术选择)。一个事务域使用一条写连接。命令在该连接的 `BEGIN IMMEDIATE` 中执行。提供者对每个连接读回 `journal_mode=WAL`、`synchronous=FULL` 和 `foreign_keys=ON`。Kysely 构造查询，并辅助迁移。提交边界是该连接上的事务。

正在执行的 SQL 执行到结束。AbortSignal 只释放观察方。观察方释放后，原操作仍有结果拥有者。

需要原子回滚的迁移把 DDL、数据和迁移标记放进同一连接事务。事务外步骤写明中断后的重入点。

提供者先停止受影响的新准入和写者。提供者核对原格式，按可恢复步骤迁移，并记录完成标记。核对参加者和投影资格之后，提供者才允许新的写准入。Kysely 返回的 error 和逐项结果都要检查。未抛出异常不等于迁移成功。失败时，提供者保持升级前的格式，并拒绝按新格式开闸。

断电耐久以相应故障试验为证据。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。

PostgreSQL 提供者使用独立的 `pg` 与 Kysely 事务租约。该提供者返回已提交、明确回滚和未知，并按原身份接受查询。写连接数量、`BEGIN IMMEDIATE`、WAL 读回和文件快照只属于 SQLite 提供者。一次 `commit` 使用一个事务域。第二个库的写入使用另一次提交。本规格把 PostgreSQL 集群留给单独的部署决定。

这些义务尚无各自的提供者成员。尚未建立的提供者补充自己的配置和资源。公共结果以本规格为准。

## 取消、预算与关闭

排队中的取消撤下尚未开始的操作。取消观察释放观察方。原操作仍有结果拥有者。

运行中的停止使用已经验证的 interrupt，或使用独立进程。停止之后，调用方按原身份查询。`node:sqlite` 路线把正在执行的 SQL 跑完。

操作、分页、事务大小、锁等待和维护各有提供者声明的有限上限。锁等待到期时，调用方把该操作记为未知。

关闭先停止新的准入。提供者确认在途读取、语句、备份和消息的责任，然后观察连接关闭和 Worker 退出。已经发出的外部效果保持发出时的状态。

## 验证义务与未覆盖

测试通过 `commit` 和 `query` 观察结果。测试不直接断言 SQL 文本。

后续测试覆盖这些场景。

- 查询携带的租户与回执中的租户不同时，提供者返回未知。
- 两个参加者的事实同时出现在同一份已提交回执中。任一命令失败时，该回执为明确回滚，两份事实都不在已提交结果里。
- 同一操作键和同一输入摘要返回第一份回执。
- 同一操作键和不同输入摘要返回 `identity_conflict` 和已有回执。
- 提交完成后、响应回到调用方之前，`query` 返回已提交回执。
- 旧写代际尚未排除时，新写者未开始。此时 `query` 返回未知。
- 原子迁移的后续步骤失败时，DDL、数据和迁移标记回到迁移前。
- 排空失败时，关闭状态保持为仍在收尾。
- 断电耐久只在记录了相应故障试验时声明。

故障注入用这些步骤。

- 回执已经写入、响应尚未返回时结束 Worker。然后用原身份调用 `query`。预期结果是已提交回执。
- 旧写者仍持有写资格时提交新的写命令。预期结果是新写准入被拒绝。`query` 返回未知。
- 同连接事务的第二句失败。预期结果是第一句的 DDL 和数据都不保留。
- 关闭过程中排空失败。预期结果是关闭状态保持为仍在收尾。

2026-10-14 在本机主线程用 `node:sqlite` 做了一次探针。步骤是设置 `journal_mode=WAL`、`synchronous=FULL`、`foreign_keys=ON`，读回这三项，再在 `BEGIN IMMEDIATE` 中建表并插入。第二句主键冲突后执行 `ROLLBACK`，然后统计 `sqlite_master` 里该表的数量。进程退出码为 0。观察值是 Node `v26.0.0`、SQLite `3.53.0`、`journal_mode` 为 `wal`、`synchronous` 为 `2`、`foreign_keys` 为 `1`、表数量为 `0`。`synchronous` 的 `2` 在 SQLite 中表示 `FULL`。

这次探针的 Node 与 SQLite 版本不是规格基线 Node 24.21.0 和 SQLite 3.53.4。本机没有该基线。探针没有进入 Worker，也没有做断电试验。通知运输和 PostgreSQL 集群不在上述场景内。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。
