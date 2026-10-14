# SQLite 提供者设计

状态为候选设计，待 [#247](https://github.com/nemori-ai/omne-harness-lite/issues/247) 结果接受。本页不授予生产实施资格。这里没有包、源码或生产提供者。

公共结果、拒绝原因、配置项和五项证明以 [SPEC](../SPEC.md) 为准。本页说明 SQLite 提供者怎样兑现这些结果。本页依次走查正常提交、拒绝、明确回滚、未知、查询和关闭。本页不新增结果。SPEC 尚未决定的结果列在 [SPEC 的尚未决定](../SPEC.md#尚未决定)。

## 部件与归属

| 部件 | 所在线程 | 拥有什么 |
| --- | --- | --- |
| 控制侧入口 | 调用方所在线程 | 字段核对、JSON 值核对、规范写出和输入摘要 |
| Worker | 专用 Worker 线程 | 写连接、写代际核对、登记读写、受理队列、事务和回执 |
| 参加者模块 | Worker 内 | 本参加者的事实语句。模块只拿到 `TransactionPort` |

控制侧入口只把版本化数据和操作身份发给 Worker，这条约束来自[数据与状态](../../../../docs/architecture/data-and-state.md#事务域与异步sqlite执行)。函数不能经结构化克隆进入 Worker。所以 JSON 值核对在控制侧完成，在消息发出之前。

Worker 是单线程。`node:sqlite` 的语句同步执行。Worker 处理一条消息时，写连接上没有别的语句在执行。参加者命令是同步命令，事务内不等待网络、模型、工具或 HITL。所以一个事务从 `BEGIN IMMEDIATE` 到 `COMMIT` 在一次处理中完成。事务进行时，Worker 不处理别的消息。

## 启动

1. 提供者核对 SPEC 列出的四项配置：`admissionQueueLimit`、`lockWaitMs`、`maxCommandsPerCommit` 和 `maxCommandBytes`。任一项缺失，或者不是有限正数，提供者拒绝启动。数值由装配者给出。本页不规定数值。
2. Worker 打开写连接，读取该连接上的 `sqlite_version()`。读数低于 3.51.3 时，提供者拒绝启动。版本以这次读数为准，不从 Node 版本推断。
3. Worker 设置 `journal_mode=WAL`、`synchronous=FULL` 和 `foreign_keys=ON`，然后读回这三项。第 2 步在这一步之前完成，所以低于下限的库不进入 WAL。
4. 提供者确认旧写代际已排除，然后开放写准入。确认之前，`commit` 返回 `writer_not_current`。

## 正常提交

下列核对顺序是候选。SPEC 尚未决定多个拒绝条件同时成立时返回哪个原因。

1. 控制侧入口核对必需字段。字段缺失时，`commit` 返回 `field_missing`。
2. 控制侧入口核对 `participant` 不重复，并且每条命令的 `facts` 都是 JSON 值。不成立时，`commit` 返回 `participant_repeated` 或 `facts_not_json`。
3. 控制侧入口用 RFC 8785 写出调用方排好的命令数组，再对写出的 UTF-8 字节计算 SHA-256。提供者不重排命令。
4. 控制侧入口把操作身份、组合版本、命令和输入摘要发给 Worker。
5. Worker 核对旧写代际已排除。未排除时，`commit` 返回 `writer_not_current`。
6. Worker 在写连接上读取该租户、事务域和组合版本的登记。没有登记时，`commit` 返回 `combination_unregistered`。某条命令的 `participant` 不在登记中时，`commit` 返回 `participant_not_in_combination`。
7. Worker 核对受理队列。尚未开始的操作已经达到 `admissionQueueLimit` 时，`commit` 返回 `queue_full`。否则操作进入队尾。
8. 轮到该操作时，Worker 执行 `BEGIN IMMEDIATE`。等待写锁的时间以 `lockWaitMs` 为上限。
9. Worker 在事务内按操作身份读取回执。回执存在且摘要相同时，Worker 用 `ROLLBACK` 结束这个还没有写入的事务，`commit` 返回已保存的回执。回执存在且摘要不同时，Worker 同样结束事务，`commit` 返回 `identity_conflict` 和已有回执。这两种情况都不执行命令。
10. Worker 按命令数组的顺序，把每条命令交给它的参加者模块。参加者模块通过 `TransactionPort` 执行语句。
11. Worker 写入已提交回执和待交接记录。
12. Worker 执行 `COMMIT`。`COMMIT` 成功后，`commit` 返回 `committed`。

第 5 到第 7 步在 Worker 处理这条消息时完成。这时写连接上没有正在执行的语句。所以登记读取可以走写连接，受理前拒绝也不进入受理队列。

第 8 到第 12 步在一次同步执行中完成。事实、已提交回执和待交接记录在同一个事务中提交，回执不会先于事实可见。

## 拒绝

所有受理前拒绝都出现在正常提交的第 1 到第 7 步，在操作进入受理队列之前。拒绝不写入回执，也不占用队列位置。

拒绝之后，调用方可以用同一身份调用 `query`。这时没有回执，结果由五项证明决定。

- `writer_not_current` 之后，旧写代际尚未排除，`query` 返回未知。
- 其他拒绝之后，五项证明全部成立时，`query` 返回未提交。缺任何一项时，`query` 返回未知。

`registerCombination` 也在 Worker 的写连接上写入登记。登记拒绝的三个原因见 SPEC。登记和登记拒绝都不写入提交回执。

## 明确回滚

1. 正常提交的第 10 步中，某条命令出现明确的业务失败。
2. Worker 对这个事务执行 `ROLLBACK`。所有参加者的事实都不保留。
3. Worker 开始第二个短事务。这个事务只写入明确回滚回执，然后执行 `COMMIT`。
4. 第二个事务提交后，`commit` 返回 `rolled_back`。同一操作身份和同一输入摘要以后再次提交，得到这份明确回滚回执。

`ROLLBACK` 撤下第一个事务里的全部写入。明确回滚回执必须在回滚之后仍然存在，所以它写在第二个事务里。

两个事务在同一次处理中完成。两个事务之间，Worker 不处理别的消息。所以同一身份的另一次尝试不会在回执写入之前开始执行。

第二个事务没有提交时，`commit` 返回 `unknown`。这时事实已经回滚，但没有可以认回的明确回滚回执。

## 未知

`commit` 在下列情况下返回 `unknown`。

- 第 8 步或第二个短事务等待写锁，时间超过 `lockWaitMs`。
- `COMMIT` 报错，提供者不能确定事务是否已经提交。
- 回滚之后，写入明确回滚回执的第二个事务没有提交。

在这些情况之外，提供者能判定结果。能确定的受理前失败返回 `rejected_before_accept`，不返回 `unknown`。

调用方收到 `unknown` 之后，用原身份调用 `query`。

## 查询

1. 控制侧入口把操作身份发给 Worker。`query` 不是受理，不进入受理队列。Worker 正在执行事务时，`query` 等到这次处理结束。
2. 查询的租户不是该事务域服务的租户时，Worker 返回未知，不读取回执。
3. Worker 在写连接上按操作身份读取回执。回执存在时，Worker 返回已提交回执或明确回滚回执。
4. 回执不存在时，Worker 核对五项证明。五项全部成立时，Worker 构造未提交并返回。缺任何一项时，Worker 返回未知。

| 证明 | 本设计的来源 |
| --- | --- |
| 旧写代际已排除 | 机制尚未选定 |
| 旧事务已终止 | 机制尚未选定 |
| 数据库恢复已完成 | 机制尚未选定 |
| 权威读取已成功 | 第 3 步在写连接上的读取成功 |
| 该操作未进入受理队列 | 当前 Worker 的受理队列中没有这个操作身份 |

受理队列只在内存中。重启后队列为空，旧队列中尚未开始的操作没有回执。

## 参加者端口

参加者模块只拿到 SPEC 定义的 `TransactionPort`。端口只有 `execute`。端口不能提交、回滚或关闭连接。参加者模块拿不到 `node:sqlite` 的数据库句柄。`BEGIN IMMEDIATE`、`COMMIT` 和 `ROLLBACK` 由 Worker 执行。

## 关闭

1. 提供者停止新的准入。
2. Worker 不打断正在执行的 SQL。关闭等待当前语句结束。事务在一次处理中完成，所以 Worker 处理关闭消息时，当前事务也已经结束。
3. 当前语句在关闭期限内结束时，Worker 关闭写连接，提供者观察 Worker 退出。之后关闭结果是 `closed`。
4. 关闭期限到达而当前语句还没有结束时，关闭结果是 `incomplete`，不是 `closed`。
5. 结束 Worker 不是干净的回滚。Worker 被结束之后，关闭方不能断定在途操作的结果。调用方按原身份调用 `query`。

## 探针

探针脚本是 `tmp/issue-247/probe.mjs`。它使用真实的 `node:sqlite` Worker 和隔离的数据库文件。探针是任务临时区里的临时脚本，不是生产提供者，不注册为包或入口。

运行之后，结果记在[探针观察](probe-observations.md)。本页不记录探针结果。

## 不在本设计内

物理断电和 [SQL-T01](../../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 仍未完成。本设计和探针都不证明断电耐久。

行为模型不在 #247 内。`writer_not_current` 保持为明确的拒绝，不用模型省掉。

本设计尚未选定下列机制。

- 确认旧写代际已排除、旧事务已终止和数据库恢复已完成的方法。
- 端口怎样拒绝经 `execute` 传入的事务控制语句，例如 `COMMIT`、`END` 和 `ROLLBACK`。
- `SqlValue`、`QueryRows` 和参加者模块入口的精确形状。
- 事务域与租户的绑定怎样配置。
- 读回的 PRAGMA 值与设定不符时，提供者怎样处置。
- Worker 在操作途中退出时，控制侧给 `commit` 的调用方返回什么。调用方仍按 SPEC 用原身份查询。
- 待交接记录的内容和消费方。
- 关闭期限由谁给出。
