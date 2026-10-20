# tool 实现规格

本页说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：独立执行作用域与执行包装器，以及之后的受理决定器、记录仓、推进协程和耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

下列决定已接受，由本包承担。完整记录见契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)：G1 账本工厂与记录仓端口，G2 独立执行作用域，G6 的 runtime 测试装配与记录仓一致性用例，G8 的 `executeTool`、`createIndependentToolScope`、`createToolRuntime` 及其构造形状。

## 当前范围

已实现的范围如下。

- 独立路径：`createIndependentToolScope`（G2）与 `executeTool`（G8），即契约 SPEC [P11](../tool-contract/SPEC.md#p11-作者输出与等待原语) 的独立执行。
- 账本：账本工厂 `createToolLedger` 与记录仓端口 `ToolLedgerStore`（G1）。
- 逻辑终局：`createToolRuntime`（G8）的 invoke、queries.lookup、queries.queryOperation、queries.readResult、commands.releaseDelivery 与 queries.account。这些调用不进入环境或执行者（第 10–16 条）。
- 事实保管：受信 `commands.receiveFacts` 接收 process/final，`recordFactAcknowledgement` 核来源确认并清除 ACK 责任，`loadRecovery.streams` 与实现读口 `ledger.facts.read` 提供恢复依据（第 24 条）。
- 已启动调用收场：从原保存 final 主动确认独立结果保管，原子建立原结果、交付、真实 effect、物理结束及后继任务，跨域修复释放队列名额。环境释放只交付计划与报告核验（第 26 条）。
- 到启动为止的真实调用：受理、环境准备、FIFO 排队、启动意图、live-only 绑定启动、原围栏对账与启动记录，以及永久排除后的启动前拒绝收场（第 19–23 条）。前台启动通过装配传入的 `ToolClock.begin` 开启计时段。

尚未实现：真实环境 release 自动驱动、完整计时、控制、等待、过程观察、恢复扫描、排空与交接。未交付的操作或分支回复具名 `unsupported`。slot 释放不证明环境资源已经释放。内部机制见 [architecture](docs/architecture.md)。

## 独立执行怎样满足 P11

### 作用域的数据

一个作用域对应一次执行。它持有三组状态：

- 输出账：受理序号、待确认的字节数与条数、每个 `index` 的模式、封块状态与累计字节、一条串行交接链、第一条接收者没有接下的输出。
- 等待历史：按 `key` 的记录表。每条记录保存 key、输入摘要、固定后的请求、结果、在途 Promise 和中断器。作用域另记已预留的历史字节与当前活动等待。
- 收尾：第一次关闭的种类（`returned`、`failed` 或 `cancelled`）、取消标志和 `finish` 的记忆。

作者只拿到 `context`。`context.mode` 固定为 `independent`，`context.signal` 是输入的信号。

### emit

受理前先复制并检查输入。检查顺序是：作用域是否已关闭或取消，是否有接收者，输入形状，`index` 的模式与封块状态，容量。`replace` 的内容必须是 `judgeContentBlock` 接受的块，且 `visibility.toHuman` 为 `true`，因为过程输出只面向人。独立模式没有保管者，所以不核对附件资格。拒绝的更新不占序号，不进入交接链，以后也不会发送。

受理在第一次 `await` 之前完成：序号加一，待确认额度扣减，块状态更新。之后更新进入交接链。链上每条更新在前一条的接收结果返回后才交给接收者，所以并发 emit 按受理顺序到达，后一条的接收结果不能先发布。回执是 `{ kind: 'local', sequence }`，只说明接收者已接管。

字节按固定编码计算：`JSON.stringify({ sequence, update })` 的 UTF-8 长度。`append-text` 的累计状态是该块未封前所有文本的 UTF-8 字节和。`replace` 的累计状态是最新块的 JSON 字节数。封块后累计状态归零，只保留模式与封块标记。

容量有两个账，都以 `authorBufferBytes` 为上限，分别计算：待确认输出的字节与条数，以及全部未封块的累计字节。单条更新或单块累计状态超过上限返回 `too-large`。待确认条数达到 `authorBufferItems`，或剩余字节不足，返回 `capacity`。两者都不排队。

### wait

检查顺序是：作用域是否已关闭或取消，是否有提供者，请求形状，key 的历史，活动等待，历史容量。

请求形状按闭合字段检查。Ask 只允许 `kind`、`key`、`contract`、`request`。Resource 另有 `deadline`。多余字段返回 `invalid`。`contract` 只核形状：`kind` 与请求一致，`expiry` 合法，`adoption` 四个字段是字符串，`request.maxBytes` 与 `response.maxBytes` 是正安全整数。契约包的句柄标记不公开，所以本包不能核对品牌。`maxBytes` 不是正安全整数时返回 `unsupported`。`request` 必须是合法的标签 JSON 树，且编码后不超过 `contract.request.maxBytes`，否则返回 `invalid`。树的检查是 json-text 的 `judgeJsonValue`，走到容器自身之内返回 `invalid`（原因含 `cycle`）；共享子树每次到达都计数。访问上限取一百万与 `request.maxBytes` 中较小者：每个节点在规范文本里至少占一个字节，所以访问数超过 `maxBytes` 的树编码后必然超过 `maxBytes`。`maxBytes` 小于一百万时，到达上限返回 `invalid`（原因含 `too-large`），检查在读完整棵树之前停下；`maxBytes` 不小于一百万时，到达上限返回 `invalid`（原因含 `budget`）。契约包的值树判定用同一个函数。Resource 的 `deadline` 为字符串时，契约的 `expiry` 必须是 `supported`，且值必须是 ISO 8601 时刻，否则返回 `invalid`。

输入摘要由 kind、adoption、deadline 和请求的规范 JSON 文本组成。同 key 同摘要共享原记录：已结束则返回原结果，在途则共享同一个 Promise，提供者不会被再次调用。同 key 异摘要返回 `conflict`。有活动等待时开放别的 key 返回 `busy`。

新 key 先预留历史容量。预留量是 `contract.request.maxBytes + contract.response.maxBytes + key 的字节数`。预留量超过 `authorWaitHistoryBytes` 返回 `too-large`。条数达到 `authorWaitHistoryItems` 或剩余字节不足返回 `capacity`。旧记录不淘汰，仍可认回。

开放先设输出屏障：等待调用时刻之前受理的全部输出都已交给接收者，才把请求交给提供者。屏障期间作者仍可 emit，这些输出不属于该屏障。屏障因输出故障失败时，等待返回该故障，但位置保留并仍是活动等待：同 key 同输入重试会再次开放，别的 key 返回 `busy`，直到该位置结束。一次执行只有一个未结束的逻辑等待。屏障因取消或关闭失败时，等待以该失败结束。

提供者的结果按值接收。提供者返回失败时，该失败就是等待的结果。提供者抛出异常时，等待返回 `unknown`，`operation` 为 `wait:<key>`。提供者的回答与中断竞争：先到的生效。回答到达后、交给作者之前，作用域再看一次取消标志：已取消则等待以 `cancelled` 结束，回答不交给作者；否则交出回答，之后的取消不撤销它。

回答的 `value` 受协议的 `response.maxBytes` 约束：`value` 的 JSON 文本超过该上限，或没有 JSON 文本，等待返回 `unavailable`，`operation` 为 `wait:<key>`，回答不交给作者。`no-answer`、`declined`、`expired` 没有 `value`，不量。该失败与提供者返回的失败一样成为该 key 的结果，同 key 同输入认回它，提供者不再被调用。

### 取消

信号中止时作用域立即取消。活动等待以 `cancelled` 结束。之后的新原语返回 `cancelled`。已交给作者的回答不撤销。取消标志盖过 `returned`，所以中止后的 `finish('returned')` 返回 `cancelled`。

作用域在信号上登记一个中止监听器。取消时，以及 `finish` 的 Promise 结束后，监听器从信号上移除。此后信号再中止，作用域不再改变：新原语返回 `closed`。

### finish

`finish` 调用时同步关闭新受理。同一 exit 再次调用得到同一个 Promise。不同 exit 返回 `conflict`。

`finish('returned')` 先看活动等待。存在活动等待时（在途的，或因输出故障保留的位置），等待以 `closed` 结束，收尾返回 `invalid`；等待已因取消结束时收尾返回 `cancelled`。否则等待调用时刻之前受理的输出全部交接完成。取消先于或发生在等待期间都返回 `cancelled`。输出故障返回该故障。

`finish('failed')` 不等待输出。活动等待以 `closed` 结束。已取消时仍成功。接收者继续承担它已接下的输出。

### 失败解释

| 情况                                                                                                                                                                          | 结果                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已封块再写、跨模式写、`replace` 的块对人不可见、Ask 带 `deadline`、`expiry` 为 `forbidden` 时给 `deadline`、`deadline` 不是 ISO 8601 时刻、请求不是合法 JSON 树或超过协议上限 | `invalid`                                                                                                                                                                        |
| 没有接收者或提供者；契约没有有限上限                                                                                                                                          | `unsupported`                                                                                                                                                                    |
| `finish` 的 exit 与首次不同                                                                                                                                                   | `conflict`                                                                                                                                                                       |
| 作者有活动等待却正常返回                                                                                                                                                      | `finish('returned')` 返回 `invalid`，等待以 `closed` 结束                                                                                                                        |
| 接收者返回失败                                                                                                                                                                | 该 emit 返回那个失败。输出账记下第一条故障。之后的屏障返回该故障：接收者的失败是 `unavailable` 或 `unknown` 时原样返回，否则包成 `unavailable`，`operation` 为 `emit:<sequence>` |
| 回答的 `value` 超过 `contract.response.maxBytes` 或没有 JSON 文本                                                                                                             | `unavailable`，`operation` 为 `wait:<key>`；回答不交给作者                                                                                                                       |
| 接收者或提供者抛出异常，或返回的值不是 Outcome                                                                                                                                | `unknown`，`operation` 为 `emit:<sequence>` 或 `wait:<key>`                                                                                                                      |
| 作用域的程序缺陷                                                                                                                                                              | 抛出异常                                                                                                                                                                         |

### executeTool

包装器先核对作用域：`context.mode` 是 `independent`，`limits` 的四项是正安全整数，`finish` 是函数。不匹配时返回 `effect: 'not-started'`，不调用作者。作者返回后调用 `finish('returned')`。该收尾失败时返回失败，`reason` 是 `<kind>: <reason>`，`effect` 是 `unknown`。收尾成功后才交出 R。作者抛出时调用 `finish('failed')`，再返回 `effect: 'unknown'`，`reason` 是异常的名字与消息。

## 受理账本怎样满足 P01、P02、P08 与 P09

账本由 `createToolLedger(store, guards, clock, configuration, settlementPorts)` 构造。runtime 由 `createToolRuntime(dependencies, configuration)` 构造。两者可以取同一个 `ToolConfiguration`：账本只读其中的 `resultPageBytes`、`ledgerCommitAttempts` 与 `queueCapacity`。数据形状与决定顺序见 [architecture](docs/architecture.md#本包的记录仓与决定器g1)。下列规则按编号对应测试。

签名与契约 [G1](../tool-contract/SPEC.md#契约缺口决定g1g9) 一致：`createToolLedger(store, guards, clock, configuration, settlementPorts)` 返回 `{ commands, reads, admissions, queues, facts }`。`configuration` 给出结果页大小、提交重试上限与队列容量，三者都只有一处来源，即 `ToolConfiguration`。第五参数 `ToolLedgerSettlementPorts<P>` 必填，提供 `custody.retainResult` 与 `releaseInspection.inspectRelease`，不提供默认授权或旧构造。runtime 的 `dependencies.facts` 必须使用同账本 `facts`，配置检查核必要方法。

### 10 边界与资格

每个命令和读取先检查边界输入，再问 `guards.access`，再读记录仓。缺租户、租户形状不对、主体不属于该租户，都回复 `denied`，`action` 是本次动作；回复不区分调用是否存在。每个操作有自己的动作：`admit`、`lookup`、`query-operation`、`read-result`、`release-delivery`、`account` 等。调用或操作身份不合词法回复 `invalid`，`field` 是 `call`、`operation` 等。

账本只检查租户的形状：`TenantId`、`OrganizationId` 与 `AccountId` 三个名字和两段非空文本。`guards.access` 必须证明租户是 legal-identity 铸造的值，不是同形状的对象，伪造的租户回复 `denied`。账本按两段身份文本为记录定键，所以这项证明是隔离的前提，不能省略。

固定请求经 `judgeFixedToolRequest` 封闭检查，拒绝的字段前缀 `request.`。来源经 `guards.sources.verify` 接收完整 Mutation 与 FixedToolRequest 核验：伪造回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `source-guard`）。并发范围的授予经 `guards.grants` 核验：装配为每个接受的范围拥有者声明一个核验器，核验器确认范围拥有者已把 `scope.key` 授予当前租户和调用方。缺失、伪造或属于他方的授予回复 `denied`，范围拥有者没有声明核验器同样回复 `denied`，核验器不可读回复 `unavailable`（`dependency` 为 `grant-guard`）。资格守卫不可读回复 `unavailable`（`dependency` 为 `access-guard`）。守卫或记录仓抛出时，回复 `unavailable`，`diagnostic` 是只说明依赖名的固定文本，不带异常消息，因为异常消息可能含连接串等秘密（P05）。守卫与记录仓自己给出的 `diagnostic` 原样转交。这些拒绝都不写记录。

### 11 操作幂等（P01）

同 tenant、call、operation、同规范输入摘要的重送回复原回执。内部账本的 admit 同时说明它是否认回了已提交的受理。普通 runtime.invoke 通过来源 resolve 认回原身份，accepted.recovered 为来源或账本认回的逻辑或。内部 admission 不先读操作记录，所以受理只需要 `admit` 资格。两个首次受理同时竞争时，先提交的那次得到 `recovered: false`；后一次的提交因修订冲突失败，重读后认回原受理，得到原回执与 `recovered: true`。同操作异摘要回复 `conflict`。

已受理的调用再以另一操作号 admit 回复 `stale-revision`，`current` 是当前状态的修订号。带 `WriteContext` 的命令先比对 `expected` 与当前状态的修订号，不匹配回复 `stale-revision`，再进入命令本身。提交结果未知回复 `commit-unknown`，Tool 不在内部重试该提交。调用者以 `queryOperation` 认回：已落盘则 `committed`，重送得到原回执且不再写第二次；否定答案见第 14 条。记录仓读取失败回复 `unavailable`（`dependency` 为 `ledger-store`），不冒充调用不存在。修订冲突时重读重判，次数上限是 `ledgerCommitAttempts`；用尽后回复 `unavailable`（`ledger-store`，`<次数> revision conflicts in a row`）。

域修订号与状态修订号是两个值。域修订号是记录仓按域比对的并发令牌，每次提交加一，排除围栏（第 14 条）也加一。状态修订号是 `ToolState.revision`，等于写入该状态的那次提交的域修订号。围栏不改变状态，所以持有当前状态的写者不会因为别人的查询而失效。

下列三条是本包采用的解读，待契约拥有者确认：

- 已受理的调用再以另一操作号 admit，回复 `stale-revision`，不回复 `conflict`。admit 隐含的期望是"尚未受理"。
- 本租户内不存在的调用：`readResult`、`account` 与 `releaseDelivery` 回复 `invalid`（`call: unknown-call`）；`lookup` 回复 `not-accepted`，`queryOperation` 回复 `not-committed`。他租户的主体在这之前已经得到 `denied`，所以这个区别不跨租户泄露。
- 逻辑终局的账目取第 15 条的值：`trimmed` 为已知 `0` 字节，`duration` 未知，`receipt` 为 `received`。

### 12 逻辑终局（P02）

`known-unavailable` 的目标在身份、资格、来源与后台许可（第 13 条）核验后直接形成 `unavailable` 终局，原因是可用性给出的原因；不读参数，不查 `complete`，不调用任何其他端口。可用目标的参数先查 `complete`：`false` 回复 `invalid`（`request.arguments.complete: incomplete`），不受理。原参数与生效参数都经 `judgeToolArguments` 完整解析，任一失败形成 `failed` 终局，`cause` 为 `arguments`，`diagnostic` 是 `<original|effective>: <原因>`；半截文本与重复键都不产生参数值。

两种终局的状态是 `settled`、`foreground`、`foreground.final`、`execution.not-started`、`effect.not-started`、`timing.closed` 累计 `0`、`queue.none`、`delivery.pending`。一次提交同时写入 `call`、`operation`、`result`、`account` 与 `deliver` 任务。结果正文由 `guards.results` 生成、`guards.policy.judgeResult` 核验，核验失败回复 `unavailable`（`dependency` 为 `result-factory`），不受理。全部通过的真实工具被受理，之后的路径见第 20 条。

### 13 调用方式许可

`mode` 为 `background` 而定义 `backgroundAllowed` 为 `false` 时回复 `invalid`（`request.mode: background-not-allowed`），不写记录。这项检查在可用性分支之前，所以 dummy 与参数失败也得到同一拒绝：请求本身不被定义许可，不因为结果不需要执行而放过。`programmatic` 调用的目标定义 `programmable` 不是 `true` 时回复 `unsupported`，`adoption` 是定义的采用，不写记录；dummy 不受这项检查，仍回复不可用终局。

### 14 查询（P01）

`lookup` 以受理操作号认回：`call` 记录存在且受理操作号相同回复 `found` 与当前权威状态。`queryOperation` 对已提交操作回复 `committed`，`revision` 是提交修订号，`receipt` 是指向该操作记录的证据。

否定答案（`lookup` 的 `not-accepted`、`queryOperation` 的 `not-committed`）必须排除该操作所有在途提交（P01）。所以账本按下列顺序给出：

1. 完整读取域快照，快照里没有该操作。读取失败回复 `unavailable`，不给否定答案。
2. 提交排除围栏：在调用域写入一条 `exclusion` 记录（键 `exclusion:<operation>`，值是操作号与本次提交的新域修订号），`expected` 是快照的域修订号，域修订号加一。该操作已有 `exclusion` 记录时被替换为更新的修订号。此后任何按旧修订号准备的在途提交都因修订号不符而失败。
3. 围栏提交成功后，按第 1 步的快照给出否定答案。
4. 围栏冲突时，说明有提交在读取之后落盘。账本重读并重新判断，所以已落盘的操作得到 `committed`；另一读取者的围栏不排除本次读取，本次重读后再次围栏。重读次数受 `ledgerCommitAttempts` 限制。
5. 围栏结果未知时，`queryOperation` 回复 `unknown`，`lookup` 回复 `unavailable`（`ledger-store`）。围栏不可用时，两者回复 `unavailable`。两者都不给否定答案。

按操作号定键的命令（`admit`、`releaseDelivery`，以及带 `WriteContext` 或操作号的后续命令）记住自己第一次读取的域修订号。提交冲突后重读时，快照里若有本操作的 `exclusion` 记录，且其修订号大于第一次读取的修订号，说明否定答案在本命令在途时给出、已经把本次提交排除在外：命令停止重试，回复可重试的 `unavailable`（`dependency` 为 `ledger-store`，`diagnostic` 固定为 `operation <operation> was excluded by a negative answer; resubmit with the same identity`），不回复 `commit-unknown`，也不落盘。第一次读取就看到 `exclusion` 记录的新一次重送正常进行：它的提交在同一写入集里删除本操作的 `exclusion` 记录，所以否定答案之后同身份恰好受理一次。在途提交已被排除时，同身份异输入的重送也作为首次受理，不与它冲突。认回先于排除：快照里已有该操作记录时回复原回执，不论 `exclusion` 记录。

跨域命令（`planPreparation`、`enqueue`、`prepareStart`、`rejectPending`、`recordStart`）在队列步骤与端口调用之前先读调用域，用这次读取判断认回与前置闸门。这次读取就是它们的第一次读取：事务把它的修订号当作初始的第一次读取，所以否定答案在这次读取之后、事务之前给出（不论中间做了队列步骤、`qualifyStart` 还是 `clock.begin`），也排除这条命令，回复上面那条 `unavailable`，不落盘。`recordStart` 在调用 `clock.begin` 之前再读一次调用域：已被排除的操作不开始计时段。之后给出的否定答案由事务排除，此时计时段已经开始，它随这次失败的提交丢弃。推进协程把这条回复当作可重试的：重读后以同一身份重做，重做的第一次读取已经看到围栏，所以正常提交（第 23 条）。

本包接受的风险：

- 排除只对已经读过记录仓的命令生效。命令在首次读取之前（还在资格守卫或来源核验中）时给出的否定答案，不排除它：它随后首次读取时看到的是栅栏之后的修订号，照常提交。持有否定答案的调用方此时以异输入重送会得到 `conflict`。账本不能在资格守卫之前读取（拒绝的主体不得读到任何东西），关闭这个窗口需要端口或协议改动，由契约拥有者决定。

- 获准 `lookup` 或 `query-operation` 资格的主体每得到一个否定答案就写一次提交。所以本租户内有读取资格的主体能够创建 `exclusion` 记录、无上限地推进一个调用的域修订号；他租户主体与无资格主体在任何写入之前已被 `denied`，不写记录（第 10 条）。
- 反复轮询否定答案的读取者能让一个写者连续冲突，最多 `ledgerCommitAttempts` 次后写者回复 `unavailable`。

两条由拥有者决定是否收紧。

### 15 结果分页与账目（P08、P09）

`readResult` 按完整内容块分页：从游标位置起累计块的 JSON 字节数，不超过 `ToolConfiguration.resultPageBytes` 的块进入本页，至少一块；第一块就超过预算时回复 `unsupported`，不切块。每页携带版本的同一 `data`、`original`、`attachments`、终局、效果与来源证据。`next` 是绑定租户、调用、版本、投影与下一块位置的 JSON 文本；另一结果的游标（含他租户同调用同版本的游标）回复 `invalid-cursor`（`another-result`），不是游标的文本回复 `invalid-cursor`（`not-a-cursor`）。账本只为存在的块签发游标，所以位置等于或超过块数的游标回复 `invalid-cursor`（`past-the-end`），不回复空页。未知版本回复 `invalid`（`result: unknown-version`），未收场回复 `not-settled`，未知调用回复 `invalid`（`call: unknown-call`）。`account` 只回复账目：逻辑终局的账目是替换件处理账，`usage` 与 `cost` 为空，`trimmed` 为已知 `0` 字节，`duration` 未知，不编原工具用量。

本包铸造的每种证据都定位租户与调用（P01 的身份是 `(tenant, call, operation)`）。`record` 是种类加定位值的规范 JSON，租户写成两段身份文本；`digest` 覆盖种类、定位值与内容。各种类的定位值如下：

| 种类 | 定位值 |
| --- | --- |
| `state` | 租户、调用 |
| `result` | 租户、调用、版本、交付号、产生该版本的操作（ResultPage.source 的"实际来源"） |
| `delivery` | 租户、调用、版本、交付号 |
| `operation` | 租户、调用、操作 |
| `account` | 租户、调用、账目事件 |

所以两个租户用同一调用号时，每种证据的 `record` 与 `digest` 都不同。

### 16 交付解除（P08）

普通 `runtime.commands.releaseDelivery` 成功返回 `released` 和生产者原耐久回执，不附本次操作引用。已释放后的重入不写新操作。未知结果携带本次操作引用，queryOperation 只查询该操作；可靠否定只否定该次操作，不证明交付仍 pending。调用方在可靠否定后可以明确再次释放以取得原回执，未知或不可读时不能自动重发。lookup 用原 admission 定位并返回当前权威 ToolState，可按当前 result 及 delivery 中的交付号与 consumer 认回已有释放。invoke 的 state 是受理时回执。readProcess 未支持，ResultPage 不含 DeliveryState。

`releaseDelivery` 先用契约的 `judgeConsumerRef` 与 `judgeHandoff` 封闭检查消费位置与交接证据，再比较或计算摘要。多出的字段回复 `invalid`（`unknown-field`），函数等非文本值回复 `invalid`（`type`），字段前缀是 `consumer.` 或 `evidence.`。之后核版本、交付号与消费位置都是记录的值：未知调用回复 `invalid`（`call: unknown-call`），交付号不符回复 `invalid`（`delivery: mismatch`），版本未知回复 `invalid`（`result: unknown-version`），消费位置不同回复 `conflict`，`operation` 是形成该版本的操作。`retained` 的 `custody` 或 `processed` 的 `completion` 的 `owner` 必须等于消费者的 `owner`，否则回复 `invalid`（`evidence.<custody|completion>.owner: owner-mismatch`）。

通过后一次提交同时写入结果记录的 `released`、操作回执、调用状态，并删除 `deliver` 任务。`released.evidence` 由本包铸造（第 15 条的 `delivery` 种类），不是请求证据的回送。已解除的交付再次解除（同操作或新操作）回复已解除状态，不再写入。解除后全文仍可经 `readResult` 读取。

### 17 工厂与后续增量

`createToolRuntime` 在构造时检查配置：作者限额、容量、`queueCapacity` 与 `ledgerCommitAttempts` 是正安全整数，处理延迟（`processBatchDelayMs` 等）是非负安全整数，可选的 `driverStepsPerRun` 缺省为 16，给出时是正安全整数；可选的 `driverRetryDelayMs` 缺省为 1000，给出时是 1 到 2147483647 的整数，这是定时器能持有的最长延迟，0 与超过定时器上限的值抛 `TypeError`（第 23 条）。`createToolLedger` 检查它读取的 `resultPageBytes`、`ledgerCommitAttempts` 与 `queueCapacity`。宿主每次调用 driver.run 显式提供 instance，不存在工厂级 instance。缺端口或超出范围抛 `TypeError`，因为这是装配缺陷。`ToolDependencies.admissions` 是账本的 admit 入口（`ToolLedger.admissions`），runtime 的 invoke 在来源 resolve 原子建立或认回原身份后用它；`ToolDependencies.queues` 是账本的队列维护入口（`ToolLedger.queues`），推进协程的等待者用它对账（第 22 条）。runtime、窄接口与 provider 都是冻结对象。受信的 operationIdentities 和 sourceIssuer.resolve 必须显式装配，不提供生产默认来源签发器。普通调用及引用失败协议归[契约的普通操作](../tool-contract/SPEC.md#342-普通操作与实例目录)。

构造时 runtime 把推进协程装到 `instances.install`。装入不受理业务，也不读写记录仓。真实工具的 invoke 受理成功且阶段为 `accepted` 时，runtime 调用 `instances.schedule` 唤醒该调用。原受理回执被认回时，lookup 当前状态仍待启动则补 wake，running/settled 不补；查询未知允许保守补 wake。唤醒只是提示：它抛出或失败都不改变 accepted 的回复。`inspect` 转给 `catalog.inspect`，不另加判断（P16）。

未实现的操作回复 `unsupported`，`adoption` 是 `tool-runtime` 或 `tool-ledger` 的采用，`reason` 说明操作名与它所属的后续增量。没有操作抛异常或回复空成功。`catalog` 是依赖给出的端口，content 与 instances 先解析调用引用再进入原读取端口或目录。

### 18 非耐久记录仓（`./testing`）

`createMemoryToolLedgerStore` 声明 `durability: 'none'`。每个域从修订号 `0` 开始；`commit` 只在 `expected` 等于当前修订号时生效，否则回复 `conflict`。生效的提交不论写入集内容都把域修订号改为 `revision`：只写一条 `exclusion` 记录、不改任何记录、删除不存在的键，都同样推进修订号，没有空操作捷径。读取给出副本。域键是各段身份文本的 JSON，含分隔符的身份不会落到别的域。`injectRead` 与 `injectCommit` 按顺序注入下一次读取或提交的故障：

- `unavailable`：不尝试。
- `conflict`：不写入，回复冲突，如同别的写者先提交了。
- `unknown-applied`：已写入，回复未知。
- `unknown-dropped`：未写入，回复未知。
- `unknown-delayed`：现在不写入，回复未知；提交保持在途，直到 `landDelayed` 按顺序落盘。落盘时重新比对 `expected`，修订号已变则丢弃并报告 `conflict`。
- `throw-applied`：已写入后抛出。

`createTestToolDependencies<P>` 的公开类型由 `src/testing.ts` 拥有。它固定使用 `ContentBlock` 和 `MemoryEnvironment`，每次新建七个契约内存替身、记录仓与账本，并返回完整依赖与原始手柄。调用方显式提供实例身份、守卫、配置、宿主、Catalog、子调用端口及 `bindingsFor` 解析接线。工厂不隐式授予权限，也不把 executor binding 当作 `ToolBindings`。runtime 与账本共用调用方给定的结果政策。工厂本身不构造 runtime、不装入推进协程、不调度调用，异常沿既有账本构造或调用方回调传播。输入和使用方式见 [README](README_ZH.md#testing-入口)。

该工厂和记录仓只从 `./testing` 导出，均为非耐久测试设施。源码不得依赖测试目录；root 与 testing 的源码、JavaScript 和声明图均不得引入 Cordis、tool-host-local 或 tool-cordis-contract。根入口图另不得引入 testing 或 `node:assert`。

## 真实调用怎样到达启动（P02、P03、P04）

本节说明一个可用工具的调用从受理到启动记录的路径。并发范围与限额都由调用方交入：FIFO key 在租户内取自 `FixedToolRequest.scope` 的 `owner`、`key` 与工具名，并发上限取自固定的 `limits.concurrency`。Tool 只在这个范围内计数和排队，不为调用创建或推进任何外部工作对象，后续工作由消费方按其规则决定。整批批准与编排归发起协调者，Tool 只在启动边界核对交来的可信依据（启动守卫与启动围栏）。

### 19 写命令的边界

`planPreparation`、`prepared`、`enqueue`、`prepareStart`、`rejectPending` 与 `recordStart` 取契约的 `WriteContext`。契约的 `WriteContext` 没有主体字段，所以宿主把自己的主体放在同一输入的 `principal` 里。每个写命令先检查 `WriteContext` 的形状，再问 `guards.access`，动作是 `write`，然后才读记录仓。缺租户、缺主体或主体不属于该租户都回复 `denied`（`action` 为 `write`），不读任何记录。`loadRecovery` 的动作是 `recover`。

每个写命令先认回：同操作号同输入摘要回复原回执，异摘要回复 `conflict`。然后比对 `expected` 与当前状态修订号，不符回复 `stale-revision`。调用记录不存在时回复 `invalid`（`call: unknown-call`）。阶段不符回复 `invalid`（`call: phase:<阶段>`）。

### 20 准备与排队

1. admit 受理真实工具时同提交调用记录、受理回执与一条 `queue` 待办。状态是 `accepted`、`execution` 与 `effect` 为 `not-started`、`queue` 为 `none`、`delivery` 为 `null`。后台起步的调用同时固定后台占位。
2. admit 回复前，账本在队列域给该调用分配序号，条目阶段是 `preparing`。所以一个在另一个 admit 回复之后受理的调用，序号更大。这一步只属于首次受理：认回的受理回复首次回执里的 `accepted` 状态，即使调用已经收场、条目已经释放，也不再分配。已释放的调用得不到条目：队列域记着它（第 22 条），创建条目的步骤回复 `released`，admit 的回复不变。这一步失败时受理仍然成立，序号改由 `planPreparation` 分配。
3. `planPreparation` 保存 `PreparationRecord` 与 `prepare` 待办，状态改为 `preparing`，`queue` 为 `waiting` 与序号。只接受 `initial` 用途与受理时固定的请求。`resume` 用途回复 `unsupported`。
4. `prepared` 核对准备记录是本调用计划的那一条，记下环境证据，删除 `prepare` 待办，写 `queue` 待办。
5. `enqueue` 先把队列条目改为 `ready`，再把状态改为 `queued`。
6. `prepareStart` 在一个队列域事务里裁定队首与名额。条目是 `ready`，没有序号更小且尚未持有名额的条目，且已持有名额的条目数小于本调用固定的 `limits.concurrency`，才把条目改为 `held`。`null` 表示没有数量上限，但 FIFO 仍然适用。未轮到时回复 `unavailable`（`dependency` 为 `tool-queue`），诊断说明前面的条目数、持有数与上限。这一回复不写任何记录，也不是执行失败。

仍在准备的较早调用（条目 `preparing`）不持有名额，但后来的同 key 调用不能越过它。转后台的调用与前台调用一样持有名额，因为名额按条目阶段计数，不看关系。名额只在条目删除时释放，删除只凭调用域里的释放依据（第 22 条）。本包现在的释放依据只有启动前的拒绝（第 21 条）。已启动执行的物理结束作为依据，随后续增量加入；仅逻辑收场不是依据。

容量：真实工具的 admit 在提交前读一次队列域。该 key 下尚未释放的条目数达到 `ToolConfiguration.queueCapacity` 时回复 `unavailable`（`dependency` 为 `tool-queue`），不写记录。容量只拒绝参数通过的真实工具：dummy 不读队列域，参数失败照常形成失败终局，两者都不占条目。重送已受理的操作先认回，不受容量影响。

环境准备的结果由推进协程处理（第 23 条）。环境拒绝时调用不启动，也不改用别的宿主。环境端口失败时调用停在 `preparing`，`prepare` 待办保留。

### 21 启动意图与启动围栏

`prepareStart` 在队列步骤之前问 `guards.starts.qualifyStart`：当前调用方式许可与资格是否仍成立。`refused` 回复 `unsupported`，`adoption` 是定义的采用，不产生启动意图。不可读回复 `unavailable`（`dependency` 为 `start-guard`），从不当作允许。已持有启动拒绝的调用回复 `invalid`（`call: start-rejected`）。

队列步骤成立后，调用域同提交唯一的启动记录（`ToolStartRecord`，`kind` 为 `start`）、`start` 待办与状态 `starting`，`queue` 为 `held`，`execution` 为 `starting`。

`recordStart` 只接受本调用保存的那条启动记录，阶段必须是 `starting`。

- `started`：状态改为 `running`，`execution` 为 `live`，`instance` 是写入上下文的实例。前台调用先由 `clock.begin` 开始计时段，`timing` 为 `running`。后台调用的 `timing` 为 `paused`。删除 `start` 待办，并同提交原 start 的 `facts` 续读待办，其独立 fact-reader evidence 绑定原 start。名额保持。
- `rejected`：同提交永久的启动拒绝、`unavailable` 终局、`effect` 与 `execution` 为 `not-started`、计时关闭、`queue` 为 `released`（释放依据是排除证据）、第一个结果版本、替换件处理账与 `deliver` 待办。然后释放队列条目（第 22 条）。
- `not-started` 与 `unknown`：保存回执，启动记录与 `start` 待办保留。`unknown` 把 `execution` 改为 `unknown`。

`rejectPending` 用于没有启动记录的调用（阶段 `accepted`、`preparing` 或 `queued`）。它要求宿主先取得 `authority.exclude` 的排除证据，然后与 `recordStart(rejected)` 同样收场。已有启动记录时回复 `invalid`（`call: has-start-record`）。

### 22 跨域提交与修复

调用域与队列域没有共同事务。每个跨域转换按同一顺序提交：调用域先写 `queue` 待办，队列域再做转换，调用域最后写结果并删除该待办。启动拒绝是例外：调用域先写结果，队列域后释放，调用域最后删除待办（见下面的「启动拒绝」）。

队列条目复制了调用域拥有的阶段，而队列域不能读调用域，也就不能核对条目。所以条目的生命周期靠三件事守住：队列域记住释放过的调用，只凭调用域里的依据释放，条目记录移动它的操作号。

- 认回：条目的 `operation` 是最后移动它的操作号。`enqueue` 与 `prepareStart` 的队列步骤遇到已越过本步的条目时，同一操作号认回，另一个操作号回复 `conflict`，所以重做不会产生第二个条目或第二次持有，别的身份也不会借走已移动的条目。创建步骤（admit 的序号分配与 `planPreparation`）遇到仍是 `preparing` 的条目按调用认回：两个入口创建的是同一个条目，且这一步不移动它；遇到已越过 `preparing` 的条目时，只有移动它的操作号认回，其余回复 `conflict`。
- 释放记忆：队列域为每个释放过的调用保存一条 `queue-release` 记录（墓碑，键 `released:<调用>`）。释放把删除条目与写墓碑放进同一个队列提交，没有条目的调用也写墓碑。创建条目的决定见到墓碑就回复 `released`，什么也不写。所以已释放的调用在它的 key 里永远不会再得到条目，不论调用域的读取与队列域的提交怎样交错，也不论创建提交回答未知、延迟落盘、之后读取失败还是进程崩溃：延迟落盘的创建提交带着旧修订号，而释放已推进了队列域修订号，落盘时被丢弃。这是队列域本地的安全性质，不依赖谁先读谁先写。`planPreparation` 的创建步骤回复 `released` 时，计划已经过期：命令按调用域的现状回复 `stale-revision`，修订号仍相符时回复 `invalid`（`call: queue-released`），不留条目。墓碑在 0.0.x 不剪枝；以后只能在恢复增量的压缩下剪，并写明陈旧界限。时间界限只用于回收，绝不用于安全。
- 释放依据：只有调用域持有释放依据时才删除条目、写墓碑。依据由 `releaseBasisOf` 从调用记录读出：启动前拒绝保存的排除证据（`startRejection`）。仅逻辑收场（`settled`）不是依据，因为它不证明名额已空（契约 P02）。已启动执行只从已 settled 且 `execution.ended` 持有的可信原 final 构造 `physical-end` 依据（第 26 条），不能从任意 terminal、通道结束或 disposer 推断。`releaseQueue` 在收场提交之后重读调用域取依据，没有依据就不释放，也不关闭 `queue` 待办。

- 启动拒绝：调用域先收场，队列域后释放。释放失败时命令回复失败，`queue` 待办保留。推进协程看到已收场且有 `queue` 待办的调用时，以原操作号重发同一拒绝命令：调用域认回原回执，队列域释放（条目已不存在也写墓碑），调用域删除待办。
- 被否定答案排除（第 14 条）的 `prepareStart` 已经完成队列步骤时，条目保持 `held`，没有对应的启动提交。命令不回退这一步：回退把条目放回 `ready` 并不释放名额，还会与另一个进程对同一操作的重做竞争。`planPreparation` 与 `enqueue` 被排除时条目保留 `preparing` 或 `ready`，调用仍在等待这一步，重做认回它们。
- 没有启动记录的 `held` 条目是待履行义务，不是启动（契约 [P02](../tool-contract/SPEC.md#p02-定义准入与队列)：名额可以先于启动记录被持有，由同一操作身份的重做对账）。调用域此时仍是 `queued`，带着 `queue` 待办。义务由该调用的下一次推进履行：重做认回已持有的条目，调用域提交启动意图；启动守卫拒绝时，义务也可以经 `rejectPending` 以释放了结。本包只在三个前提都成立时保证这一点：**这个调用被再推进一次**，记录仓与端口终会回答，宿主接受调度请求（`instances.schedule`）。第一个前提在第 23 条的三个触发里任何一个成立时成立：一轮推进因步数用尽而重调度自己；一轮推进因记录仓或端口失败结束而按重试延迟重调度；同 key 的等待者在 `prepareStart` 得到 `tool-queue` 时对账，并请宿主运行排在它前面或持有名额的调用中仍有 `queue` 待办的那些。保证是有条件的、最终的，不是「一轮推进结束时每个 `held` 条目都属于已提交的启动」。
- 对账：等待者经 `ToolLedger.queues.reconcile` 对本 key 对账一次。它先按等待者自己的调用问资格（动作 `recover`），读队列域，对排在等待者前面或持有名额的每个条目，不加围栏地读它的调用域：不经 `lookup` 与 `queryOperation`，因为它们的否定答案会写 `exclusion` 记录，把拥有者在途的重做排除在外；对账也从不向调用域写任何记录。调用域持有释放依据的条目，在一个以队列域修订号为条件的提交里删除并写墓碑；调用域有未关 `queue` 待办的调用报告给协程（`redrive`），由它经 `instances.schedule` 运行；被释放的调用只删去条目并唤醒同 key 的等待者，除非它同时有未关 `queue` 待办，否则不被调度运行。对账永不改变别的调用的条目阶段：不把 `held` 改回 `ready`，也不把 `ready` 改成 `preparing`，因为另一进程对同一操作的重做可能已在认回它，回退会留下已提交的启动对应 `ready` 条目。对账读取同租户同 key 的别的调用域，不核对对方的资格：读到的事实只用来删除有依据的条目或请求运行。对账答复只把同租户同 key 的调用身份交给推进协程，不经 runtime 的公开操作暴露。`reconcile` 的回复：成功时是 `{ released, redrive }`（删除了条目的调用，与有未关 `queue` 待办、请求运行的调用）；边界检查与对等待者调用的 `recover` 资格回复 `denied` 或 `invalid`；等待者的调用未受理时回复 `invalid`（`call: unknown-call`）；等待者的调用不是真实工具调用（例如 dummy）时没有队列，回复空答案（两个列表都为空）；读取失败，或释放提交回答未知，回复 `unavailable`，不回复 `commit-unknown`，因为对账没有可认回的操作身份，下一次对账重读即可。
- 同一操作由两个进程同时重做时，修订号裁定唯一写者。写者的认回与排除判断都在调用域事务里，队列域的转换是幂等的，所以不产生第二个条目或第二次持有。

本包接受的风险：

- 一个条目的调用，在进程退出之后或运行被宿主中止之后（中止的运行不重调度），既没有再被受理、被唤醒，也没有同 key 的等待者时，没有人再推进它。排在它后面的调用被它挡住，直到有人推进它。这一段由恢复扫描 `scanPending` 负责：它必须另含队列域的一遍，对每个队列域的每个条目读它的调用域，删除持有释放依据的条目，并对有未关 `queue` 待办的调用调度推进，规则与对账相同，但不限于有等待者的 key。本包的 `scanPending` 现在回复 `unsupported`。
- 已收场且持有释放依据、条目却没有释放的调用（释放提交与收场提交之间进程崩溃，没有进程内的失败重调度），仍占一个容量。key 的容量满时，新的受理在提交之前被拒绝，所以不会出现新的等待者；容量满之前已受理的同 key 等待者若已没有进程运行它们，也不会再对账。这时的修复例如恢复扫描 `scanPending` 的队列域一遍，或任一同 key 已受理调用的受理重送使它再被推进、进入对账。
- 墓碑不剪枝，队列域的读取与存储随释放过的调用增长，直到恢复增量的压缩。
- 对账的读取量随 key 下的条目数线性增长，上限是 `queueCapacity`。

### 23 推进协程

推进协程只经过账本命令写记录。它读 `loadRecovery`，按阶段与待办做一步，然后重读，直到调用等待、运行、收场或某个端口不能回答。每次最多 `ToolConfiguration.driverStepsPerRun` 步，缺省为 16。`commit-unknown`、`stale-revision` 与被否定答案排除的回复（第 14 条）都不停止推进：协程重读后重做同一步，同一身份。这三种回答都不算进展：只有提交了或认回了一次提交的步骤才算；原结果收场与 queue 修复还必须复核原 queue 待办已关闭（第 26 条），不能只凭历史主回执算作释放进展。它的操作号由受理操作号派生：`<受理>/plan`、`/prepared`、`/enqueue`、`/start`、`/started`、`/start-failed`、`/exclude`、`/reject`。所以崩溃后重做用的是同一身份，第 11 条的认回直接适用。同一进程内同一调用的运行串行，跨进程的唯一写者由修订号裁定。

一次运行结束后，协程自己决定要不要再运行这个调用，因为没有别的东西会运行它。重新推进的触发有三个，策略是配置，不是写死的值：

- 步数用尽而仍有工作：这次运行里至少有一步提交了或认回了提交的话，协程立即经 `instances.schedule` 重调度自己。整轮没有这样的一步，即回答全是被否定答案排除、修订号陈旧或提交未知的话，就没有证据说明任何东西前进了，改按重试延迟重调度，免得对一个不回答的记录仓，或一个持续排除这一步的读取者空转。
- 因记录仓或端口失败（`unavailable`）结束，或环境提供者对准备答 `pending`、`unknown`：协程在 `ToolConfiguration.driverRetryDelayMs`（缺省 1000 毫秒，1 到 2147483647 的整数，0 与超过定时器上限的值在构造时被拒绝）之后经 `instances.schedule` 重调度。上一条里没有进展的步数用尽也用这个延迟。每个调用同时只有一个等待中的重调度；`instances.schedule` 被拒绝或抛出时，再等一个延迟再试。其它失败（`invalid`、`denied`、`unsupported`、`conflict` 等）是判定，不重复。延迟是固定值；换成更复杂的退避（递增，或可替换的策略实现）由恢复扫描 `scanPending` 的调度一并评估。
- 等待者对账：见下面的「排队」。

被中止的运行不重调度：中止是宿主要它停下。重调度的定时器不占住进程（`unref`），它的释放同 `instances.install`，归排空协议（`quiesce` 与 `handover`）。除这三个触发和受理、同 key 释放、原事实 ready 及原 reader 重连的唤醒之外，没有别的东西运行一个调用；其余的缺口归恢复扫描 `scanPending`（第 22 条）。

- 环境准备：`prepared` 记下环境。`rejected` 先取得 `authority.exclude`，再 `rejectPending`，终局原因是 `environment: <原因>`。`pending` 与 `unknown` 保留准备任务，协程按重试延迟再运行，下一次运行读 `inspectPreparation` 而不再请求准备（本进程记得它问过；进程重启后没有这个记忆，协程重新请求，提供者按同一操作去重，契约 P03）。`excluded` 时停下，不启动，`excluded` 的读法见本页末的待确认项；环境端口失败时这一轮以 `unavailable` 结束，按重试延迟再来（上面的第二个触发），调用不收场。
- 排队：`prepareStart` 回复 `tool-queue` 时，协程记下该调用在等待，对本 key 对账一次（第 22 条），然后停下。对账删除了条目的话，协程唤醒同 key 的等待者；对账报告的有 `queue` 待办的调用，协程经 `instances.schedule` 运行；宿主不接受这个请求时，这次运行按失败处理，按重试延迟再来。同 key 的调用释放条目后，协程也经 `instances.schedule` 唤醒等待者。唤醒与对账是提示加修复，不是保证。
- 启动守卫拒绝：`prepareStart` 回复 `unsupported` 时，协程先取得 `authority.exclude`，再 `rejectPending`。
- 启动围栏：协程查询原 `/start-failed` 操作回执，再问 `authority.inspect`。`started` 或 `rejected` 直接按原 invocation 记录，不调用绑定。只有合规 `not-started`、没有已确认的失败标记或本协程尚待确认的绑定失败、也没有已知 live 句柄时，才取得新许可、绑定与环境，调用 `live-only` 绑定的 `start`。绑定负责暂存待发胶囊并调用 `authority.consume`。协程随后核实实际围栏，不能以绑定失败或抛错推定未启动。
- 启动未知：`authority` 答 `unknown` 时，协程解析固定请求采用的原绑定并调用 `inspectStart`，保留查到的 live 句柄。live、settled、lost、not-started 与 unknown 查询结果都不代替 authority 的 acceptance，也不在本增量保存执行事实或释放名额。查询失败保留启动待办和责任。已知 live 与 authority 的排除矛盾时停下，不重发。
- 启动失败：绑定返回失败或抛错，围栏若已受理则记录 `started`，若已永久拒绝则记录 `rejected`。未确定时用独立 `/start-failed` 操作记录固定诊断的 `unknown`，保留原启动记录、待办与名额。该标记确认后重读调用，再向原绑定与 authority 对账。确认没有启动后，以原 `/exclude` 永久排除整次调用，成功后才用 `/started` 记录 `rejected`，建立结果、交付待办并释放名额。排除失败或回执未知不终局。下一次可从 authority 认回已提交的永久拒绝。
- 失败标记认回：`reads.operation` 的 committed 才证明本驱动失败标记存在，不能从 `execution: unknown` 推断。unknown 或不可读不授权启动。not-committed 与 rolled-back 沿 P01 的否定答案排除机制处理，可能排除在途旧提交。同一协程记住尚未确认的失败，按原标记身份重试，不再调用绑定。`/started` 仅写最终的 started 或 rejected，不先写 unknown 后更换 outcome。绑定解析、许可准备与环境重连在进入 start 前失败时，仍保留原可重试语义。

失败观察在标记真正提交前随进程丢失时，新协程不能从空标记区分「从未尝试」与「尝试失败」。此时仅当合规 authority 的 not-started 已排除原 ticket 及延迟请求、且没有永久拒绝时，才允许同逻辑调用、原 start 身份重新核权并取得新 permit，形成首次受理。它不重放已受理的执行效果。已读到 committed 标记的推进不再调用 start，当前协程已观察但尚未确认的失败也不再调用 start。另一协程持旧否定读时，即使标记随后提交，它仍可能进入绑定方法。标记是调用域的失败观察，不是 authority 的派发资格。consume 先于永久 exclude 成立时，继续认回原 acceptance 与 running，不能写 unavailable 或释放名额；exclude 先成立时，旧 permit 不能形成新的 acceptance 或实际执行。正常首次启动的 acceptance 与实际 launch 各恰好一次，重复推进不增加二者。内存标记不是跨重启围栏，实际唯一受理仍依赖合规 P04 提供者。

本口径按 [#430 revision 2 的具名决定](https://github.com/nemori-ai/omne-harness-lite/issues/430#issuecomment-6285621097)取代此前附加的「marker 提交后所有并发协程都不再调用 start」保证。旧 C430-1 反例的两次方法尝试、一次实际 launch 仍是有效反例，不能声称旧保证已修复。

本增量没有诊断正文的持久化端口。`run` 不向外输出原绑定异常正文，`readDiagnostics` 仍未交付。固定的失败标记仅用于识别启动责任，不证明原异常正文已保存。发起前端口和查询端口返回的具名失败仍交回驱动。它们抛出的未知异常以同一错误对象向 `run` 调用方传播，不映射为 `unavailable`，也不因此自动重调度或写终局。原启动待办与名额保留。绑定已尝试后的失败与抛错则必须沿原围栏对账，不因捕获异常就终局或释放名额。后续查询抛错时传播该查询错误，保留尚未确认的绑定失败责任。运行成功或失败后只清除本次串行记录，不删除后继运行，也不生成额外的未处理拒绝。
- 环境值：本进程准备的环境值留在内存里。没有时协程调用 `inspectPreparation` 重新连接，失败回复 `unavailable`（`dependency` 为 `tool-environment`）。

### 本包采用的读法，待契约拥有者确认

- 环境提供者答 `excluded` 时，协程停下，不重新请求，也不收场。契约 P03 写的是“excluded 须排除全部延迟分配，才允许用原操作重新请求”：它允许在排除之后用原操作重新请求，没有规定由谁、在何时重新请求，也没有规定调用是否收场。本包不替宿主做这个决定。
- 创建步骤对 `preparing` 条目按调用认回、对已越过的条目按操作号认回（第 22 条）。契约没有规定创建步骤的操作号怎样对应两个入口；要求它严格按操作号认回，需要 admit 的序号分配改用 `<受理>/plan`，由拥有者决定。
- 对账不核对别的调用的资格，也不向调用域写记录（第 22 条）。
- 容量按 FIFO key 下尚未释放的队列条目计数，上限是 `queueCapacity`。读取与受理提交不在同一事务，所以并发受理可以短暂超出容量。序号分配失败的已受理调用在 `planPreparation` 之前不计数。
- 未轮到队首或没有名额，以及容量拒绝，都回复 `unavailable`，`dependency` 为 `tool-queue`。
- 首次启动拒绝的 `unavailable` 终局在拒绝提交里直接形成，不经后续的 `preserveResult`，因为从未执行的调用没有 `RawOutput`。契约 SPEC 写的是"首次启动被拒绝时，当前宿主随后以 preserveResult 保存 unavailable 终局"。所以本包不写 `settle` 待办，写 `deliver` 待办。
- 宿主通过 `ToolDriver.run` 传入本实例的身份，执行引用的代次固定为 `1`。真实代次由后续的 `claim` 铸造。
- 写命令的主体放在 `WriteContext` 旁边，资格动作是 `write`（第 19 条）。实例代次与受信通道的核对随 `claim` 实现。
- 环境拒绝形成 `unavailable` 终局。契约 SPEC 没有规定环境拒绝的终局种类，而 `ToolTerminal` 有 `failed` 与 `cause: 'environment'`。环境拒绝的证据与清理责任尚未保存。
- 启动守卫在队列事务之前核对，不与名额裁定同事务。之间的资格变化由启动围栏的失效排序覆盖（P04）。

## 验证

[tests/README](tests/README.md) 列出每条规则对应的测试。每条测试名以本页所属规则的编号开头，`vitest -t` 可按编号单独运行。

文档导航见 [index](index.md)。

## 普通调用重入的实现范围

本实现采用契约 [普通操作](../tool-contract/SPEC.md#342-普通操作与实例目录) 的来源拥有方案。runtime 无调用身份 mint 依赖，也无关联缓存；source.resolve 拥有唯一键。来源或准入任一认回时 accepted.recovered 为 true，原回执与当前 lookup 分开。当前状态为 accepted、preparing、queued 或 starting，以及查询未知时可补 wake，running/settled 不补。

`ToolInvokeAuthority` 由来源提供者拥有，显式检查当前 tenant/consumer 资格及稳定主体。配对 guard 复用同一 authority 核对原主体与完整绑定；ledger 对当前凭据继续核调用及 scope 授予。测试来源提供者明确为非耐久，在同步写段分配保存 reservation，原子性只覆盖当前进程的同一共享实例。UUID 分配不是存储唯一约束或跨重启耐久证明。

`createTestInvocationSource` 必填 `snapshotPrincipal:(principal:P)=>P`，由凭据语义拥有者同步取得稳定、保留认证意义的视图。可变 P 必须独立捕获，真正不可变的 opaque P 可安全复用。resolve 在请求和 tenant 形状有效后、第一次 await 前取得该视图；来源 qualify 与 samePrincipal.current 使用它，原主体保存该视图。ledger 和来源 guard 的 current 仍使用本次原始 P。通用 structuredClone 或 JSON 不作为泛型 P 的认证、复制或身份协议。

快照失败答 rejected/unavailable，dependency 为 principal-snapshot，诊断不泄露异常文本；此时不读关联、不分配或写来源。来源证据摘要只覆盖 tenant、call/admission、固定请求及来源记录数据，不序列化 P。原主体由受信比较器核验，摘要不代替绑定真实性。bindings 以装配方快照隔离诊断 principal，并独立复制 tenant、request 和 invocation 等数据；返回值变异不能改写内部历史。

可选 `beforeIssue?:()=>void` 是 testing 专用的同步故障钩子，在 reservation 保存后、签发前执行。抛错答 issuance-unknown，保留原 call/admission 与 reservation；下一次同意图重入按原身份重试签发。issued 重入不再执行该钩子。它不是异步事务回调，也不增加生产端口或耐久保证。该局部修订依据 [#547 来源快照与恢复补充采用](https://github.com/nemori-ai/omne-harness-lite/issues/547#issuecomment-6288512604)。

公开 control 已实现输入封闭复制、分配新 operation、引用编码和现有 commands.control 的结果映射。非法 intent 不分配；委托抛错为带原 operation 的 commit-unknown。真实 ledger 控制状态机仍 unsupported，合法调用消耗身份但零控制事实，不声称停止完成。配对 commands/reads 替身只验证门面操作对账。

当前提供者、原子步骤和有界模型的映射见 [恢复验证](verification/models/README.md)。未交付生产来源、自动恢复 scanner、完整控制或生产宿主。

## 24. 原执行事实保管（P05、P08）

本实现采用 [#431 的具名决定](https://github.com/nemori-ai/omne-harness-lite/issues/431#issuecomment-6289828424)。公开事实协议与类型仍归契约包 [P05](../tool-contract/SPEC.md#p05-执行事实与原输出) 和 [P08](../tool-contract/SPEC.md#p08-过程分页与全文交接)。以下只规定本实现的选择。

`receiveFacts` 在首次 await 前固定原 start、source、batch 和嵌套事实。凭据 principal 保持原对象交给当前 access guard，不参与 JSON 复制。边界拒绝访问器、循环、额外字段和无法保管的值。结果由装配的 ResultPolicy 验证，过程由 ContentBlock 判断验证。`write` 是受信推进方权限，不能仅凭 source owner 文本当作外部来源认证。

调用域内分存事件、批次、流和过程当前块。键采用规范元组，分别包含原 start operation、source owner 和局部 event/batch。完整原 start 与 source 固定比较，source record/revision/digest 换版被拒绝。协调实例的当前代次不代替原执行身份。当前实现只交付首次 start，不交付 resume。

先认回已知批次。同批同完整输入返回原回执，零写入，不回退后续 cursor，不重建已清除 ACK。新批 after 必须等于保存 cursor，首批为 null。cursor 不解析、不排序，旧边界与环被拒绝。一批可含多个事件及已知同值事件。事件同值只应用一次，异值拒绝整批。

process/final 全批预判成功后，以域 revision 为条件一次提交完整新事件、过程当前块或 settle 待办、原 receipt、cursor、fact-ack 与调用 revision。event 与 custody evidence 分用途，摘要覆盖原输入，任务身份覆盖用途及完整稳定定位。同 start 的同值 final 不形成第二 settle 待办，冲突 final 不覆盖原候选。final 不写 settled、结果版本、delivery 或释放依据。

process 按原 start/index 保存当前块，并保留历史事件。sequence 用 BigInt 比较，严格增大但不要求加一。相同历史 sequence 必须同值，mode 开块后固定，closed 后禁止新更新。append 只支持 text/thinking 的累计前缀，同时固定 id、kind 和 visibility。媒体、file 和 ref append 返回 unsupported，replace 支持合法完整块。过程必须对人可见。trim 的数量、原因和历史原文持续保存，不能借 trim 绕过前缀约束。readProcess/observe 仍不支持。

含 wait、continued、account 或 program-scheduling 的批次整体 unsupported，零写入、零成功回执、零 ACK。源继续持有责任。原批重投只认回原保管回执。来源确认由下述 ACK 命令推进。

`ledger.facts.read` 是实现包的恢复读口，输入精确 event evidence，返回具名 SavedFact。它逐次核 tenant/call 的 recover 资格，并核完整原 evidence，不按任意 record 文本读取。返回数据与存储脱离。后继收场凭 settle basis 取得完整原 final，无须源继续提供原批次。

失败使用现有 ToolFailure：after 缺口或复用边界为 invalid-cursor；批次、事件、start/source 冲突为 invalid，带固定字段与原因；未知 fact basis 为 invalid。接收提交未知为 unavailable，dependency 为 ledger-store，诊断明确结果未知并要求重投原批，不伪造 operation。revision conflict 重读重判，未知提交不立即重做。端口异常脱敏。本表是本实现选择，不补写契约验证文档仍未决定的全局失败政策。

`ToolLedgerGuards.factAcknowledgements` 是必填构造依赖，返回既有 SourceVerdict，只判断来源确认。`createToolFactAcknowledgementGuard(bindings)` 与 runtime 使用同一 bindings。它恢复原 start 的绑定，经 acknowledge 重送原 receipt，再比较完整 sourceReceipt。来源与确认的 owner 无须相同。来源端口失败、抛错或返回非法 evidence 为 unavailable；只有真实合法确认与待核值不同才为 forged。诊断不暴露来源文本。

`recordFactAcknowledgement` 在首次 await 前固定 receipt、sourceReceipt、operation 与访问字段，tenant 和 principal 保持原身份与凭据。当前 write 资格逐次核验。已提交的同 operation 同输入认回原 progress，异输入 conflict，不再访问来源。未提交 operation 先核本域原 start、batch 和完整 receipt；未知 batch 为 invalid（receipt.batch），伪 custody、cursor 或原件为 invalid（receipt），均不调用来源。

pending 时在事务外核来源；失败保留任务。已确认的同值 sourceReceipt 不重送 ACK。随后携最初预读 revision 进入事务，保留 P01 排除围栏。确认状态、完整 operation 回执、待确认项移除、fact-ack 删除及调用 revision 同提交。新 operation 的重复确认也保存自身可查询回执。原 operation 的 FactProgress 保持历史值，不随后续 cursor 改写。本域提交未知使用真实 operation 的 commit-unknown，原 receipt 和任务仍能恢复；它不表示源 ACK 未发生。

验证入口为 [facts-receive.spec.ts](tests/facts-receive.spec.ts) 与 [fact-acknowledgement.spec.ts](tests/fact-acknowledgement.spec.ts)。真实账本、内存 store 与受信恢复绑定覆盖同提交、重复、冲突、未知切点、过程、重建读取、伪确认、ACK 丢答和排除围栏。自动读取组合另见下节。未覆盖生产耐久、跨进程。已保存 final 的后继收场见第 26 条。

## 25. 原事实受管推进

`recordStart(started)` 与 running 状态同提交原 start 的 facts 续读任务。它与 process、settle、fact-ack 的业务依据分开。driver-binding 的 live 键为 tenant/call/原 start，恢复使用 bindings.recover，不重新 start 已执行调用。

`driver-facts` 持有每原 start 的 session。session 包含 controller、宿主 signal 监听、iterator、一个在途 next、一个 ready 及清理 Promise。next 回调只保存 ready 并 schedule 原 call。driver 在既有 stepsPerRun 内调用 receiveFacts，再处理 fact-ack。一个批次确认前不读下一批。ready 保管失败时保持原输入，未知重投同批。ACK operation 由原 start 和完整原 receipt 的规范摘要稳定派生，重投不换身份。

driver 先修复 settled 的 queue 待办，再推进尚未终局的 settle，然后处理 fact-ack、可推进 facts 与既有准备和启动路径。ACK 故障不能遮蔽已保存 final 的收场，blocked 清理也不能遮蔽剩余 facts 或 ACK。driver 向原 live 或 recover 发送原 receipt，再调用 recordFactAcknowledgement；后者仍通过同 bindings 的 guard 独立核完整确认。ACK 提交未知沿原 operation 重试，来源已释放不能当作本域责任已消除。

每次 run 开始只捕获当时仍活动的 session signal，与本轮 run.signal 共同约束命令发起。每个命令边界读取这些原信号的 aborted 值，不新增合并监听或 Promise，也不延长 session 生命周期。已经清理中的旧 signal 不进入新 run 的边界。

run 返回不等于 abort。session 仅在宿主给本连接的 signal 有效时存活。监听注册前后都检查 aborted。abort 移除监听、取消 controller 并登记 iterator.return 与在途 next 的完成或拒绝。之后不发起新的读、调度和 ledger/source 命令；已经发出的命令不承诺撤销。清理完成前不开第二 reader，清理完成删除 session 引用。源永不完成 next/return 时，清理仍未完成，不声称已回收。

旧清理期间的新 run 保存最新待接回意图及 signal。清理完成后，仅当该 signal 仍有效才通过已有 schedule/retryDelay 唤醒。多个意图合并到同一原 start。已中止的 signal 不重调度。session Map 只提供本 driver 的资源边界，跨实例同批唯一仍归 ledger 的 revision CAS。

正常 completed 收场后，driver 按原 start 关闭 reader，汇合原 abort、return 和在途 next。关闭不作为物理结束依据，也不阻塞 queue 修复。未确认 ACK 保留原 live 或 bindings.recover.acknowledge 路由。非正常终局保留 facts 与可继续交付的 reader，晚到原 process 仍保管并 ACK，不改首结果。

流 end/throw 不生成 final 或释放名额。非正常 settled 后的 end/throw/失联按第 26 条持久 blocked facts，关闭本地 reader，不自动重新启动作者。尚未收场的连接从保存 cursor 沿 driverRetryDelayMs 重试。schedule 拒绝使用同一重试政策。unavailable 重试；unsupported、invalid 等确定失败返回 DriverStop，不自动忙循环。inspectStart settled 缺 batch/cursor 时返回 unsupported，reason 为 settled-start-facts-recovery-needs-original-batch-and-cursor，保留恢复责任。完整原事实恢复仍未交付。

[driver-facts.spec.ts](tests/driver-facts.spec.ts) 验证真实 invoke、ledger、绑定执行源与受控宿主的自动链，以及取消、在途命令、清理竞争、拒绝唤醒、流终止和原 ACK 恢复。调度快照用例只检验对应顺序；真实收场与下一同 slot 调用启动由 [driver-settlement.spec.ts](tests/driver-settlement.spec.ts) 的本地组合另验。[有限模型](verification/models/README.md#事实保管交接模型)仅检查 call 域原子 CAS 假设下的责任交接。生产耐久、生产宿主、恢复扫描、resume、完整异常源恢复与真实环境释放驱动未覆盖。

## 26. 原结果收场与释放责任

本实现采用 [#432 revision 2 决定](https://github.com/nemori-ai/omne-harness-lite/issues/432#issuecomment-6293517910)。公开操作与端口协议仍归契约包。普通调用方继续使用 invoke 及原引用，同 tenant、完整 ConsumerRef 和固定输入认回原受理。收场不重新运行作者。

### 原 final 与独立保管

`preserveResult` 使用 WriteContext，首次 await 前封闭复制 raw、value、terminal、effect 和执行定位。它逐次核当前 write 资格、tenant/call/instance/generation，先按 operation 和稳定摘要认回，再核 expected、原 start、当前执行与 settle.basis 指向的完整本域 final。四项输出必须逐项等于原 final。不同操作竞争先按 expected 返回 stale-revision，刷新后返回指向原 settledBy 的 conflict，不产生第二原结果或 delivery。任意 terminal 外形、reader 关闭、通道 end/throw、取消受理和 disposer 都不构成物理结束依据。

账本主动调用第五构造参数的 custody.retainResult。retain 身份由原 settle 及完整 final 稳定派生，竞争协调者也使用同一保管身份。外部 retain 不放进 CAS 重试的纯决定器。同身份保管重送保持原 raw/value。确定失败保持原失败；保管 commit-unknown 或抛错返回 `unavailable`，dependency 为 `output-custody`，诊断固定且脱敏。它不冒充 call 的 commit-unknown。保管已应用但丢答仍未确认，不建立终局或释放依据，也不清除原任务。

确认保管后，一个 call CAS 同提交唯一 original 版本、完整结果、真实 effect、原 consumer 与 pending delivery、execution custody 的 raw/final/retain 回执、settled 状态、execution.ended、preserve 回执、deliver 和 queue 待办，以及全部必要 release、清理和 clock 责任。前台关系成为 final，后台保留原关系。已确认的外部保管不因后继冲突而声称撤销。未执行替代结果仍用 synthetic 保管种类，不伪造 raw 或真实执行账目。

所有待写 operation 都受第 14 条的首次读取排除围栏保护，包括同提交自动 canonical plan 的身份。任一身份出现更新的否定围栏就停止本次提交。已提交回执认回优先，首次读取已看见的旧围栏允许同身份新尝试，并在成功提交时清除。自动计划回执不得覆盖其他种类或异输入回执；preserve 与 canonical plan 使用同一 operation 也 conflict。每次入口核当前 write 资格，CAS 每次重读重新核本域前提与完整历史保管闭包。

### call 与 queue 的独立提交

主收场回执只证明 call 提交。即使认回已提交 preserve，也必须继续 releaseQueue tail，不再次 retain 或重写结果。它重读已 settled 且可信 execution.ended 的原 final 依据，随后 queue CAS 同提交 entry 删除与永久墓碑，最后 call CAS 关闭原 queue 待办。各域的 dropped/applied unknown 分别保留原操作和责任。queue 墓碑阻止迟到 order/enqueue 复活，call 与 queue 没有共同事务。启动拒绝保持第 22 条的原排除路径。

driver 从原 settle 或 queue.basis 经 facts.read 取 SavedFact，核 final 与原 execution 后，以原 task.operation 和当前 expected 重送 preserveResult。成功后重读 loadRecovery，确认原 queue 待办消失才报告释放进展并 wake 等待者。任务仍在则返回具名 blocked `the original queue release is still unconfirmed`，避免把历史回执当作进展热循环。读取失败保留实际 failure 与适用重试。取消后不发起新读或 wake。等待者 reconcile 可先修复 queue，原调用仍负责关闭自己的待办。

### canonical 环境计划与报告核验

正常 completed 只在全部历史 process 引用已有独立保管时自动形成 canonical 环境计划。闭包检查完整历史事件，按完整 ref 比对已保管 raw.content 或最终 attachments；inline/text/thinking 原字节由本域保存。旧 file 只有地址时不能推定覆盖。计划与原终局同提交，固定原 preparation、resources、环境 adoption 和刚确认的 retained 证据，不能留下终局已成立却无人负责规划的窗口。

`planRelease`、`recordRelease`、受限 `recordTask` 使用 Mutation，仅有 operation，没有 caller expected。三者在首次 await 前固定业务输入，固定副本用于当前资格核验与域 CAS 重判。public planRelease 核原准备、资源、可信 ended、原 retained、completed 及全部历史闭包。它按 preparation 唯一认回原 ReleaseRecord，新 planning operation 可以保存 alias 回执，但不创建第二环境 release 身份或 task；原任务关闭后也不重建。缺证据或非正常 final 返回具名 unsupported，保留 blocked 清理，不接受调用方新造 custody 字符串解锁。

`recordRelease` 先认回自己的原观察回执，再核完整 canonical 记录。reported released 必须由原环境 inspectRelease 返回同一完整 evidence 确认，不仅比较 owner 文本。核验失败、抛错或 unknown 不清任务。pending/unknown/rejected 保存固定观察及操作回执并保留 release 责任，rejected 可 blocked。released 将确认、回执和 release task 删除同提交，不改业务结果、delivery 或 effect。released 不倒退，同值重送不复活任务，异 released evidence conflict。资源 release.operation 永久固定，后续观察使用新 recordRelease operation，原观察重试仍回原回执。本入口只核验报告，不自动调用环境 release。slot 释放不等于环境资源释放。

### 非正常输出与时钟责任

failed/interrupted 等非 completed final 即使历史为空，也不证明正常输出屏障闭合。结果和物理结束可以成立，环境清理保持 `awaiting-independent-custody` 的 blocked settle 责任，不自动或公开规划释放。facts 及仍可交付的 reader 保留，原 source 后续 process 继续保管及 ACK，不改原结果，也不自动解除清理 blocked。

非正常 settled 的原 facts 源 end、throw 或失联时，受限 recordTask 只接受当前原 facts 完整 task/basis、resolution=blocked，以及 `settled-facts-source-ended` 或 `settled-facts-source-unavailable` 诊断。它用独立稳定 operation 同提交 blocked 任务、回执与当前 revision。同操作认回，异输入 conflict。done、其他 task 种类或其他诊断仍具名 unsupported，不能借此清除责任。协调 signal 取消不持久标记源失联。完整异常源恢复、额外过程保管和环境释放驱动仍未交付。

当前 final 没有实际结束 clock marker。running 计时转 unknown，保存原 segment、accumulatedMs，诊断为 `execution-end-clock-marker-unavailable`，同提交 blocked clock 任务。原 unknown 保持证据与诊断；paused/closed 保留已知累计并 closed。收场不调用晚到 elapsed、不写零、不重复累计，也不把保管等待计成执行时间。clock 未知不阻止可信结束后的 slot 释放。

[收场账本测试](tests/ledger-settlement.spec.ts)、[环境计划与确认测试](tests/ledger-environment-release.spec.ts)、[排除交错](tests/exclusion-interleavings.spec.ts)和 [driver 组合](tests/driver-settlement.spec.ts)分别覆盖对应边界。它们使用真实内存 ledger/custody/executor 与受控宿主，不能证明生产耐久、跨进程或断电恢复。[有限收场模型](verification/models/README.md#原结果与队列释放模型)只检查其明确有界范围；完整计时、控制、scanner、真实环境自动 release、完整异常源恢复及 late-result 仍未覆盖。
