# 存储事务行为

目标文档在 `packages/storage/storage`。本目录记录规格。workspace 包、源码和运行入口尚未建立。PanQiWei 于 2026-10-14 认可本规格的结果模型。断电耐久的提供者符合性仍由 [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 承接。系统行为以[数据与状态](../../../docs/architecture/data-and-state.md)为准。

[#247](https://github.com/nemori-ai/omne-harness-lite/issues/247) 补入的下列条款已由 PanQiWei 在[技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/247#issuecomment-6176738073)中接受：

- 幂等认回和 `identity_conflict` 按完整的操作身份比较。
- 登记结果、登记键和登记拒绝原因。
- `commit` 的拒绝原因 `writer_not_current`、`facts_not_json` 和 `participant_repeated`。
- 参加者端口。
- SQLite 提供者的启动核对、受理队列、读取路径、两段回滚、未知条件和关闭期限。

调用方学习三个操作：`registerCombination`、`commit`、`query`。写连接、SQL 和写者代际留在提供者内。

公共结果由这一份目标文档拥有。workspace 包要等具名消费者和可运行入口。本规格不把旧的 `write` 回调迁进来。那个回调在应用线程执行，和 Worker 内命令冲突。

## 参加者

调用方出示操作身份。结果未知时，调用方用同一身份调用 `query`。提交协调者登记参加者和组合版本。事实拥有者提供放进同一次 `commit` 的命令。存储提供者把一个事务域绑到一个数据库身份和一条写连接。命令在 Worker 内执行。

一次 `commit` 容纳这些事实拥有者的命令。输入受理协调者写入来源、提交身份和去处责任，并写入内容或有效引用。日程拥有者写入一次定义更新中必须同时成立的事实。HITL 与原等待的拥有者写入有效答复、等待状态和后续责任。各拥有者规定 `facts` 的含义。`facts` 放在命令里。

日历发布、通知送达、模型调用、工具效果和文件发送使用各自的后续操作。原拥有者在观察到已提交回执之后执行这些操作。

## 操作身份

操作身份包含租户、事务域、操作、协议版本和操作键。这五项都由调用方传入。本规格的协议版本是 `1`。

幂等认回和 `identity_conflict` 都比较完整的五项。五项中任何一项不同，就是另一个操作。另一租户使用相同的操作键，也是另一个操作。那个操作不认回本租户的回执，也不和本租户的回执冲突。

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

type CombinationRegistration = {
  readonly tenant: string
  readonly transactionDomain: string
  readonly combinationVersion: string
  readonly participants: readonly string[]
}

type RegisterResult =
  | {
      readonly kind: "registered"
      readonly registration: CombinationRegistration
    }
  | {
      readonly kind: "rejected_before_accept"
      readonly reason:
        | "field_missing"
        | "participant_repeated"
        | "participant_empty"
        | "registration_conflict"
        | "writer_not_current"
        | "domain_occupied"
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
  readonly reason:
    | "combination_unregistered"
    | "participant_not_in_combination"
    | "queue_full"
    | "field_missing"
    | "writer_not_current"
    | "facts_not_json"
    | "participant_repeated"
    | "unsupported_protocol"
    | "command_limit"
    | "closing"
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

协议版本 `1` 的输入摘要算法是 SHA-256。摘要写成十六进制小写。输入是命令数组的规范 JSON。调用方先按 `participant` 字典序排列命令。同一 `commit` 里 `participant` 重复时，提供者拒绝，不计算摘要。规范写出算法是 RFC 8785，见 [RFC-0006](../../../docs/rfcs/RFC-0006-json-canonical-text.md)。对象键按该标准排序。数组顺序保持调用方交给写出的顺序。JSON 中间没有空白。编码是 UTF-8。写出拒绝非 JSON 值，不自行转换。调用方不传入摘要。更换排序、空白或算法时，协议版本改为新的字符串。

提供者在计算摘要之前做两项核对。任一项不成立时，`commit` 返回受理前拒绝。提供者不计算摘要，不写入回执，操作也不进入受理队列。

- 两条命令的 `participant` 相同时，原因是 `participant_repeated`。
- 任一命令的 `facts` 含有非 JSON 值时，原因是 `facts_not_json`。

JSON 值只有 `null`、`true`、`false`、有限数、字符串、数组和普通对象。数组的元素和对象的值也必须是 JSON 值。这条规则对任何嵌套深度都成立。`undefined`、BigInt、NaN、Infinity、-Infinity、Date 和函数都不是 JSON 值。提供者不转换这些值。例如，提供者不把 Date 写成字符串，也不省略值为 `undefined` 的键。

## 登记

`registerCombination` 接收一份 `CombinationRegistration` 形状的请求。请求含租户、事务域、组合版本和参加者名字列表。

登记键是租户、事务域和组合版本。提供者按登记键保存登记。同一事务域可以同时保存多个组合版本的登记。保存新版本不覆盖旧版本。协调者进程重启后，提供者仍返回已保存的登记。

事务域以登记中的标识为准。调用方在操作身份中传入这份标识。

提供者在下列情况下拒绝登记。`registerCombination` 返回 `rejected_before_accept` 和原因。

| 原因 | 返回条件 |
| --- | --- |
| `field_missing` | 租户、事务域、组合版本或参加者列表缺失 |
| `participant_empty` | 参加者列表没有名字，或列表中有空字符串 |
| `participant_repeated` | 同一个名字在参加者列表中出现两次或更多 |
| `registration_conflict` | 同一登记键已经存在，且已保存的参加者列表与本次不同。列表相同则返回已保存的登记 |
| `writer_not_current` | 该事务域的旧写代际尚未排除 |
| `domain_occupied` | 该事务域已经绑定另一个租户 |

登记和登记拒绝都不写入提交回执。

新写者在旧写代际被排除之后开始。排除之前，提供者拒绝新的写准入。

## 提交

`commit` 接收操作身份、已登记的组合版本，以及命令。每条命令只含版本化数据。

提供者在受理前核对请求、写代际、组合和受理队列。任一项不成立时，`commit` 返回受理前拒绝，即 `rejected_before_accept`。受理前拒绝不写入回执，操作也不进入受理队列。

| 原因 | 返回条件 |
| --- | --- |
| `field_missing` | 操作身份的任一项、组合版本、命令数组，或某条命令的 `participant` 或 `facts` 缺失。命令数组为空也算缺失 |
| `unsupported_protocol` | `protocolVersion` 不是 `1` |
| `participant_repeated` | 两条命令的 `participant` 相同 |
| `facts_not_json` | 某条命令的 `facts` 含有非 JSON 值 |
| `command_limit` | 命令条数超过 `maxCommandsPerCommit`，或一条命令的 RFC 8785 UTF-8 字节数超过 `maxCommandBytes` |
| `writer_not_current` | 该事务域的旧写代际尚未排除 |
| `combination_unregistered` | 该租户、事务域和组合版本下没有登记 |
| `participant_not_in_combination` | 某条命令的 `participant` 不在该登记的参加者列表中 |
| `queue_full` | 这条写连接上已经预留、尚未确认结束的 `commit` 个数已经等于 `admissionQueueLimit`。控制侧不发送 |
| `closing` | 提供者已经停止新的准入 |

旧写代际尚未排除时，`commit` 返回 `writer_not_current`。这个操作没有回执。五项证明全部成立之前，`query` 对该身份返回未知。

提供者按该协议版本公布的规范编码，从命令数据计算输入摘要。

同一操作身份和同一输入摘要再次调用 `commit` 时，提供者返回已保存的回执。提供者不再执行命令。

同一操作身份配到不同输入摘要时，提供者从 `commit` 返回 `identity_conflict`。这个结果带上已有回执。

`commit` 返回 `rolled_back` 时，明确回滚回执已经持久保存。回滚之后提供者没有保存这份回执时，`commit` 返回 `unknown`。`ROLLBACK` 本身失败时，`commit` 也返回 `unknown`。

能确定的受理前失败返回 `rejected_before_accept`。其余不能判定的结果返回 `unknown`。

断开、超时、Worker 退出或取消观察时，调用方用同一身份调用 `query`。调用方在 `commit` 返回前失去响应时，也用同一身份调用 `query`。

持久回执只有已提交和明确回滚。`commit` 返回 `committed`、`rolled_back`、`unknown`、`identity_conflict` 或 `rejected_before_accept`。

## 查询

`query` 按原来的操作身份读取。

查询返回已提交回执、明确回滚回执或未知。五项证明全部由提供者内部构造时，查询返回未提交。五项证明是旧写代际已排除、旧事务已终止、数据库恢复已完成、权威读取已成功，以及该操作未进入受理队列。缺任何一项时，查询返回未知。

查询携带的租户与回执中的租户不同时，提供者返回未知。这个结果不透露另一租户是否有相同操作键的回执。

调用方读取查询结果。未提交的值由提供者构造。

回执记录提交结果。回执不新建 Run，也不发送通知。原拥有者在看到已提交回执之后，另行执行这些动作。

| 操作 | 返回 |
| --- | --- |
| `registerCombination` | `registered` 和已保存的登记，或 `rejected_before_accept` 和原因 |
| `commit` | `committed`、`rolled_back`、`unknown`、`identity_conflict` 和已有回执、`rejected_before_accept` |
| `query` | 已提交回执、明确回滚回执、未知、未提交 |

## 参加者端口

参加者模块在 Worker 内通过事务端口执行语句。

```ts
interface TransactionPort {
  execute(sql: string, params: readonly SqlValue[]): QueryRows
}
```

端口不把语句文本的词法近似当作事务权限。提供者在调用参加者期间设置 SQLite authorizer，拒绝 `SQLITE_TRANSACTION`。参加者发出的 `BEGIN`、`COMMIT`、`ROLLBACK`，包括前面带注释、`NUL` 或多条语句的文本，都由 SQLite 拒绝执行。提供者自己执行 `BEGIN IMMEDIATE`、`COMMIT` 或 `ROLLBACK` 之前，先撤下这个 authorizer。撤下之后才写回执或回滚。参加者拿不到数据库句柄。调用是事务内的 `execute(facts, port)`。`params` 只能是 `null`、布尔值、有限数、字符串或 `Uint8Array`。行的业务字段由参加者规定。

参加者的一条语句失败之后，提供者关闭这次调用的端口。同一次调用里后面的 `execute` 不再把 SQL 交给 SQLite。参加者捕获这次错误也不能重新打开端口。提供者先撤下 authorizer，再确认自己的事务还在不在。事务还在时，执行一次 `ROLLBACK`。这次 `ROLLBACK` 成功，才进入明确回滚回执。事务已经不在时，是失败的语句结束了提供者事务。提供者不再执行参加者语句，然后仍尝试写入明确回滚回执。`ROLLBACK` 因其他原因失败，或回执没有写入时，`commit` 返回 `unknown`。

## 提供者义务

SQLite 提供者在专用 Worker 内使用 `node:sqlite`。基线是 Node 24.21.0 内嵌的 SQLite 3.53.4。路线见[技术基础](../../../docs/architecture/technical-foundations.md#共同技术选择)。一个事务域使用一条写连接。命令在该连接的 `BEGIN IMMEDIATE` 中执行。提供者对每个连接读回 `journal_mode=WAL`、`synchronous=FULL` 和 `foreign_keys=ON`。Kysely 构造查询，并辅助迁移。提交边界是该连接上的事务。

正在执行的 SQL 执行到结束。AbortSignal 只释放观察方，不归还仍在执行的预留。观察方释放后，原操作仍有结果拥有者。

SQLite 提供者怎样兑现下列义务，见 [SQLite 提供者设计](docs/sqlite-provider.md)。

SQLite 提供者启动时先核对四项配置。任一项缺失，或者不是有限正数，提供者拒绝启动。装配者给出数值。本规格不规定数值。

| 配置 | 限制什么 |
| --- | --- |
| `admissionQueueLimit` | 一条写连接上，已经预留、尚未确认结束的 `commit` 个数 |
| `lockWaitMs` | 等待写锁的毫秒数 |
| `maxCommandsPerCommit` | 一次 `commit` 的命令条数 |
| `maxCommandBytes` | 一条命令的字节数 |

提供者打开写连接之后，读取该连接上的 `sqlite_version()`。读数低于 3.51.3 时，提供者拒绝启动。这项核对在设置 `journal_mode=WAL` 之前完成。

一个事务域只服务一个租户。第一次成功登记把事务域绑到该租户。之后另一租户对同一事务域登记，返回 `domain_occupied`。

新写者由打开这条写连接的提供者恢复，不由调用方恢复。同一进程里，前一个 Worker 的退出被观察到之前，不打开下一个写者。新进程在崩溃之后打开数据库文件。打开成功时，SQLite 结束死连接留下的未提交事务，并完成 WAL 恢复。打开抛错时，恢复未完成，提供者不准入写。`query` 不能返回未提交，因为「数据库恢复已完成」不成立。打开并且版本和三项 PRAGMA 读回成功之后，提供者在库里把写代际加一。加一完成之前，`commit` 和 `registerCombination` 返回 `writer_not_current`。加一完成之后，旧代际被排除。此时没有提供者打开的事务，所以旧事务已经终止。

受理队列的计数只由控制侧拥有。计数的是已经预留、尚未确认结束的 `commit`。确认结束只有四种：结果已经由结果拥有者收下，操作在执行前被确认撤下，发送失败，以及 Worker 退出。取消观察只让调用方停止等待，不归还仍在执行或已经发出、尚未确认撤下的预留。每个预留只归还一次。已经归还之后，迟到的结果不再减一。发送前，个数已经等于 `admissionQueueLimit` 时，控制侧返回 `queue_full`，并且不发送。允许发送时先把个数加一，再发送。Worker 退出时，控制侧把尚未归还的预留各归还一次，随后这条连接的计数是 0。Worker 不把这条已经预留的请求再按满额拒绝。Worker 只核验消息带有这次预留。没有预留的消息拒绝执行。重启后计数为 0。个数为 0 且上限至少为 1 时，第一条可以发送。SQLite 提供者不在租户之间轮转调度。慢语句期间持续提交的内存上界还没有探针。没有这次探针，不能声称内存已经证明有界。

默认的权威读取使用写连接。`query` 也使用写连接。SQLite 提供者不增加读连接。以后要增加读连接，由新的设计明确写出。

提交成功时，提供者在一个 `BEGIN IMMEDIATE` 事务中写入事实、已提交回执和待交接记录，然后执行 `COMMIT`。

某条命令出现明确的业务失败时，提供者先关闭这次调用的端口，再确认事务。事务还在则执行 `ROLLBACK`。语句已经把事务结束时，提供者不再执行参加者语句。然后提供者用第二个短事务只写入明确回滚回执。`ROLLBACK` 因其他原因失败，或第二个事务没有提交时，`commit` 返回 `unknown`。

SQLite 提供者在下列情况下不能判定结果。这时 `commit` 返回 `unknown`。

- 锁等待超过 `lockWaitMs`。
- `COMMIT` 的结果不确定。
- 回滚之后，明确回滚回执没有写入。
- `ROLLBACK` 因其他原因失败。

需要原子回滚的迁移把 DDL、数据和迁移标记放进同一连接事务。事务外步骤写明中断后的重入点。

提供者先停止受影响的新准入和写者。提供者核对原格式，按可恢复步骤迁移，并记录完成标记。核对参加者和投影资格之后，提供者才允许新的写准入。Kysely 返回的 error 和逐项结果都要检查。未抛出异常不等于迁移成功。失败时，提供者保持升级前的格式，并拒绝按新格式开闸。

断电耐久以相应故障试验为证据。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。

PostgreSQL 提供者使用独立的 `pg` 与 Kysely 事务租约。该提供者返回已提交、明确回滚和未知，并按原身份接受查询。写连接数量、`BEGIN IMMEDIATE`、WAL 读回和文件快照只属于 SQLite 提供者。一次 `commit` 使用一个事务域。第二个库的写入使用另一次提交。本规格把 PostgreSQL 集群留给单独的部署决定。

这些义务尚无各自的提供者成员。尚未建立的提供者补充自己的配置和资源。公共结果以本规格为准。

## 取消、预算与关闭

排队中、尚未开始的操作，在确认撤下之后归还预留，只归还一次。取消观察只释放观察方。仍在执行或已经发出的预留不因此归还。原操作仍有结果拥有者。

运行中的停止使用已经验证的 interrupt，或使用独立进程。停止之后，调用方按原身份查询。`node:sqlite` 路线把正在执行的 SQL 跑完。

操作、分页、事务大小、锁等待和维护各有提供者声明的有限上限。锁等待到期时，调用方把该操作记为未知。

关闭先停止新的准入。停止之后新到的 `commit` 返回 `closing`，不写入回执，也不进入队列。受理队列里尚未开始的操作被撤下，同样不写入回执。已经开始的语句跑完。提供者确认在途读取、语句、备份和消息的责任，然后观察连接关闭和 Worker 退出。已经发出的外部效果保持发出时的状态。

SQLite 提供者不打断正在执行的 SQL。关闭等待当前语句结束。关闭期限到达而当前语句还没有结束时，关闭结果是未完成 `incomplete`，不是已关闭 `closed`。装配侧的关闭报告则是 `timed-out`。这不是 `failed`。仍在执行的语句留在等待名单里，其后的步骤不再执行。结束 Worker 不是干净的回滚。Worker 被结束之后，调用方按原身份查询在途操作。

多个拒绝条件同时成立时，`commit` 返回下面顺序中的第一个原因，然后停止。`queue_full` 时不发送，也不增加预留。

1. `field_missing`
2. `participant_repeated`
3. `facts_not_json`
4. `unsupported_protocol`
5. `command_limit`
6. `queue_full`
7. `writer_not_current`
8. `combination_unregistered`
9. `participant_not_in_combination`

## 尚未决定

下列结果本规格尚未决定。实现这些情况之前，先由负责人决定。

- 调用方没有按 `participant` 排序时，提供者是否拒绝。现行规则下提供者不重排命令，摘要随顺序改变。
- 哪些语句失败算明确的业务失败。`ROLLBACK` 本身失败时，`commit` 返回 `unknown`。

## 验证义务与未覆盖

测试通过 `commit` 和 `query` 观察结果。测试不直接断言 SQL 文本。

后续测试覆盖这些场景。

- 查询携带的租户与回执中的租户不同时，提供者返回未知。
- 两个参加者的事实同时出现在同一份已提交回执中。任一命令失败时，该回执为明确回滚，两份事实都不在已提交结果里。
- 同一操作身份和同一输入摘要返回第一份回执。
- 同一操作身份和不同输入摘要返回 `identity_conflict` 和已有回执。
- 操作身份五项中任一项不同时，`commit` 不返回另一操作的回执，也不返回 `identity_conflict`。
- 同一操作身份再次提交键顺序不同、值相同的命令时，`commit` 返回第一份回执。
- 提交完成后、响应回到调用方之前，`query` 返回已提交回执。
- 旧写代际尚未排除时，`commit` 返回 `writer_not_current`。此时 `query` 返回未知。
- 同一事务域登记两个组合版本之后，按两个版本的提交都被受理。
- 重启之后，`registerCombination` 仍返回已保存的登记，按该登记的提交仍被受理。
- 参加者列表为空、含空字符串或含重复名字时，登记被拒绝。之后按该版本的 `commit` 返回 `combination_unregistered`。
- `facts` 含 `undefined`、BigInt、NaN、Infinity、Date 或函数时，`commit` 返回 `facts_not_json`。`query` 不返回已提交或明确回滚回执。
- 两条命令的 `participant` 相同时，`commit` 返回 `participant_repeated`。
- 命令出现明确的业务失败时，`commit` 返回 `rolled_back`。同一操作身份和同一输入摘要再次提交，返回同一份明确回滚回执。
- 锁等待超过 `lockWaitMs` 时，`commit` 返回 `unknown`。
- 四项配置中任一项缺失、为 0、为负数、为 NaN 或为 Infinity 时，提供者拒绝启动。
- 写连接上的 `sqlite_version()` 低于 3.51.3 时，提供者拒绝启动。
- 参加者模块不能经端口结束提供者的事务。
- 原子迁移的后续步骤失败时，DDL、数据和迁移标记回到迁移前。
- 排空失败时，关闭状态保持为仍在收尾。
- 断电耐久只在记录了相应故障试验时声明。

故障注入用这些步骤。

- 回执已经写入、响应尚未返回时结束 Worker。然后用原身份调用 `query`。预期结果是已提交回执。
- 旧写者仍持有写资格时提交新的写命令。预期结果是 `commit` 返回 `writer_not_current`。`query` 返回未知。
- 回滚之后，让写入明确回滚回执的第二个事务失败。预期结果是 `commit` 返回 `unknown`。
- 同连接事务的第二句失败。预期结果是第一句的 DDL 和数据都不保留。
- 让一条语句的执行超过关闭期限。预期结果是关闭结果为 `incomplete`。
- 关闭过程中排空失败。预期结果是关闭状态保持为仍在收尾。

2026-10-14 在本机主线程用 `node:sqlite` 做了一次探针。步骤是设置 `journal_mode=WAL`、`synchronous=FULL`、`foreign_keys=ON`，读回这三项，再在 `BEGIN IMMEDIATE` 中建表并插入。第二句主键冲突后执行 `ROLLBACK`，然后统计 `sqlite_master` 里该表的数量。进程退出码为 0。观察值是 Node `v26.0.0`、SQLite `3.53.0`、`journal_mode` 为 `wal`、`synchronous` 为 `2`、`foreign_keys` 为 `1`、表数量为 `0`。`synchronous` 的 `2` 在 SQLite 中表示 `FULL`。

这次探针的 Node 与 SQLite 版本不是规格基线 Node 24.21.0 和 SQLite 3.53.4。本机没有该基线。探针没有进入 Worker，也没有做断电试验。通知运输和 PostgreSQL 集群不在上述场景内。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。

#247 的 Worker 探针脚本是 `verification/worker-probe.mjs`。它不是生产提供者。运行之后，结果记入[探针观察](docs/probe-observations.md)。物理断电和 SQL-T01 不在 #247 内，仍未完成。行为模型也不在 #247 内。慢语句期间持续提交的内存上界还没有探针。
