# tool 实现规格

本页说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：独立执行作用域与执行包装器，以及之后的受理决定器、记录仓、推进协程和耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

下列决定已接受，由本包承担。完整记录见契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)：G1 账本工厂与记录仓端口，G2 独立执行作用域，G6 的 runtime 测试装配与记录仓一致性用例，G8 的 `executeTool`、`createIndependentToolScope`、`createToolRuntime` 及其构造形状。

## 当前范围

已实现的范围如下。

- 独立路径：`createIndependentToolScope`（G2）与 `executeTool`（G8），即契约 SPEC [P11](../tool-contract/SPEC.md#p11-作者输出与等待原语) 的独立执行。
- 账本：账本工厂 `createToolLedger` 与记录仓端口 `ToolLedgerStore`（G1）。
- 逻辑终局：`createToolRuntime`（G8）的 admit、lookup、queryOperation、readResult、releaseDelivery 与 account。这些调用不进入环境或执行者（第 10–16 条）。
- 到启动为止的真实调用：受理、环境准备、FIFO 排队、启动意图、启动围栏与启动记录，以及启动前的拒绝收场（第 19–23 条）。前台启动通过装配传入的 `ToolClock.begin` 开启计时段。

尚未实现：已启动执行的事实接收、收场与名额释放，以及控制、计时段开启之后的计时、等待、恢复与退出。这些操作回复具名的 `unsupported`。所以一个已启动的调用停在 `running`，它的名额一直被占用。内部机制见 [architecture](docs/architecture.md)。

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

账本由 `createToolLedger(store, guards, clock, configuration)` 构造。runtime 由 `createToolRuntime(dependencies, configuration)` 构造。两者可以取同一个 `ToolConfiguration`：账本只读其中的 `resultPageBytes`、`ledgerCommitAttempts` 与 `queueCapacity`。数据形状与决定顺序见 [architecture](docs/architecture.md#本包的记录仓与决定器g1)。下列规则按编号对应测试。

签名与契约 [G1](../tool-contract/SPEC.md#契约缺口决定g1g9) 一致：`createToolLedger(store, guards, clock, configuration)` 返回 `{ commands, reads, admissions, queues }`。`configuration` 给出结果页大小、提交重试上限与队列容量，三者都只有一处来源，即 `ToolConfiguration`。

### 10 边界与资格

每个命令和读取先检查边界输入，再问 `guards.access`，再读记录仓。缺租户、租户形状不对、主体不属于该租户，都回复 `denied`，`action` 是本次动作；回复不区分调用是否存在。每个操作有自己的动作：`admit`、`lookup`、`query-operation`、`read-result`、`release-delivery`、`account` 等。调用或操作身份不合词法回复 `invalid`，`field` 是 `call`、`operation` 等。

账本只检查租户的形状：`TenantId`、`OrganizationId` 与 `AccountId` 三个名字和两段非空文本。`guards.access` 必须证明租户是 legal-identity 铸造的值，不是同形状的对象，伪造的租户回复 `denied`。账本按两段身份文本为记录定键，所以这项证明是隔离的前提，不能省略。

固定请求经 `judgeFixedToolRequest` 封闭检查，拒绝的字段前缀 `request.`。来源经 `guards.sources` 核验：伪造回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `source-guard`）。并发范围的授予经 `guards.grants` 核验：装配为每个接受的范围拥有者声明一个核验器，核验器确认范围拥有者已把 `scope.key` 授予当前租户和调用方。缺失、伪造或属于他方的授予回复 `denied`，范围拥有者没有声明核验器同样回复 `denied`，核验器不可读回复 `unavailable`（`dependency` 为 `grant-guard`）。资格守卫不可读回复 `unavailable`（`dependency` 为 `access-guard`）。守卫或记录仓抛出时，回复 `unavailable`，`diagnostic` 是只说明依赖名的固定文本，不带异常消息，因为异常消息可能含连接串等秘密（P05）。守卫与记录仓自己给出的 `diagnostic` 原样转交。这些拒绝都不写记录。

### 11 操作幂等（P01）

同 tenant、call、operation、同规范输入摘要的重送回复原回执。账本的 admit 同时说明它是否认回了已提交的受理，`createToolRuntime` 的 admit 把它作为 `recovered` 返回。runtime 不先读操作记录，所以受理只需要 `admit` 资格。两个首次受理同时竞争时，先提交的那次得到 `recovered: false`；后一次的提交因修订冲突失败，重读后认回原受理，得到原回执与 `recovered: true`。同操作异摘要回复 `conflict`。

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

`releaseDelivery` 先用契约的 `judgeConsumerRef` 与 `judgeHandoff` 封闭检查消费位置与交接证据，再比较或计算摘要。多出的字段回复 `invalid`（`unknown-field`），函数等非文本值回复 `invalid`（`type`），字段前缀是 `consumer.` 或 `evidence.`。之后核版本、交付号与消费位置都是记录的值：未知调用回复 `invalid`（`call: unknown-call`），交付号不符回复 `invalid`（`delivery: mismatch`），版本未知回复 `invalid`（`result: unknown-version`），消费位置不同回复 `conflict`，`operation` 是形成该版本的操作。`retained` 的 `custody` 或 `processed` 的 `completion` 的 `owner` 必须等于消费者的 `owner`，否则回复 `invalid`（`evidence.<custody|completion>.owner: owner-mismatch`）。

通过后一次提交同时写入结果记录的 `released`、操作回执、调用状态，并删除 `deliver` 任务。`released.evidence` 由本包铸造（第 15 条的 `delivery` 种类），不是请求证据的回送。已解除的交付再次解除（同操作或新操作）回复已解除状态，不再写入。解除后全文仍可经 `readResult` 读取。

### 17 工厂与后续增量

`createToolRuntime` 在构造时检查配置：作者限额、容量、`queueCapacity` 与 `ledgerCommitAttempts` 是正安全整数，处理延迟（`processBatchDelayMs` 等）是非负安全整数，可选的 `driverStepsPerRun` 缺省为 16，给出时是正安全整数；可选的 `driverRetryDelayMs` 缺省为 1000，给出时是 1 到 2147483647 的整数，这是定时器能持有的最长延迟，0 与超过定时器上限的值抛 `TypeError`（第 23 条）。`createToolLedger` 检查它读取的 `resultPageBytes`、`ledgerCommitAttempts` 与 `queueCapacity`。`ToolDependencies.instance` 必须是 `ToolInstanceId`。缺端口或超出范围抛 `TypeError`，因为这是装配缺陷。`ToolDependencies.admissions` 是账本的 admit 入口（`ToolLedger.admissions`），runtime 的 admit 直接用它；`ToolDependencies.queues` 是账本的队列维护入口（`ToolLedger.queues`），推进协程的等待者用它对账（第 22 条）。runtime 与 provider 都是冻结对象。

构造时 runtime 把推进协程装到 `instances.install`。装入不受理业务，也不读写记录仓。真实工具的 admit 回复 `accepted` 时，runtime 调用 `instances.schedule` 唤醒该调用。认回的受理也唤醒，因为第一次的回复可能在唤醒之前丢失。唤醒只是提示：它抛出或失败都不改变 admit 的回复。`inspect` 转给 `catalog.inspect`，不另加判断（P16）。

未实现的操作回复 `unsupported`，`adoption` 是 `tool-runtime` 或 `tool-ledger` 的采用，`reason` 说明操作名与它所属的后续增量。没有操作抛异常或回复空成功。`catalog`、`content` 与 `instances` 直接是依赖给出的端口。

### 18 非耐久记录仓（`./testing`）

`createMemoryToolLedgerStore` 声明 `durability: 'none'`。每个域从修订号 `0` 开始；`commit` 只在 `expected` 等于当前修订号时生效，否则回复 `conflict`。生效的提交不论写入集内容都把域修订号改为 `revision`：只写一条 `exclusion` 记录、不改任何记录、删除不存在的键，都同样推进修订号，没有空操作捷径。读取给出副本。域键是各段身份文本的 JSON，含分隔符的身份不会落到别的域。`injectRead` 与 `injectCommit` 按顺序注入下一次读取或提交的故障：

- `unavailable`：不尝试。
- `conflict`：不写入，回复冲突，如同别的写者先提交了。
- `unknown-applied`：已写入，回复未知。
- `unknown-dropped`：未写入，回复未知。
- `unknown-delayed`：现在不写入，回复未知；提交保持在途，直到 `landDelayed` 按顺序落盘。落盘时重新比对 `expected`，修订号已变则丢弃并报告 `conflict`。
- `throw-applied`：已写入后抛出。

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

- `started`：状态改为 `running`，`execution` 为 `live`，`instance` 是写入上下文的实例。前台调用先由 `clock.begin` 开始计时段，`timing` 为 `running`。后台调用的 `timing` 为 `paused`。删除 `start` 待办。名额保持。
- `rejected`：同提交永久的启动拒绝、`unavailable` 终局、`effect` 与 `execution` 为 `not-started`、计时关闭、`queue` 为 `released`（释放依据是排除证据）、第一个结果版本、替换件处理账与 `deliver` 待办。然后释放队列条目（第 22 条）。
- `not-started` 与 `unknown`：保存回执，启动记录与 `start` 待办保留。`unknown` 把 `execution` 改为 `unknown`。

`rejectPending` 用于没有启动记录的调用（阶段 `accepted`、`preparing` 或 `queued`）。它要求宿主先取得 `authority.exclude` 的排除证据，然后与 `recordStart(rejected)` 同样收场。已有启动记录时回复 `invalid`（`call: has-start-record`）。

### 22 跨域提交与修复

调用域与队列域没有共同事务。每个跨域转换按同一顺序提交：调用域先写 `queue` 待办，队列域再做转换，调用域最后写结果并删除该待办。启动拒绝是例外：调用域先写结果，队列域后释放，调用域最后删除待办（见下面的「启动拒绝」）。

队列条目复制了调用域拥有的阶段，而队列域不能读调用域，也就不能核对条目。所以条目的生命周期靠三件事守住：队列域记住释放过的调用，只凭调用域里的依据释放，条目记录移动它的操作号。

- 认回：条目的 `operation` 是最后移动它的操作号。`enqueue` 与 `prepareStart` 的队列步骤遇到已越过本步的条目时，同一操作号认回，另一个操作号回复 `conflict`，所以重做不会产生第二个条目或第二次持有，别的身份也不会借走已移动的条目。创建步骤（admit 的序号分配与 `planPreparation`）遇到仍是 `preparing` 的条目按调用认回：两个入口创建的是同一个条目，且这一步不移动它；遇到已越过 `preparing` 的条目时，只有移动它的操作号认回，其余回复 `conflict`。
- 释放记忆：队列域为每个释放过的调用保存一条 `queue-release` 记录（墓碑，键 `released:<调用>`）。释放把删除条目与写墓碑放进同一个队列提交，没有条目的调用也写墓碑。创建条目的决定见到墓碑就回复 `released`，什么也不写。所以已释放的调用在它的 key 里永远不会再得到条目，不论调用域的读取与队列域的提交怎样交错，也不论创建提交回答未知、延迟落盘、之后读取失败还是进程崩溃：延迟落盘的创建提交带着旧修订号，而释放已推进了队列域修订号，落盘时被丢弃。这是队列域本地的安全性质，不依赖谁先读谁先写。`planPreparation` 的创建步骤回复 `released` 时，计划已经过期：命令按调用域的现状回复 `stale-revision`，修订号仍相符时回复 `invalid`（`call: queue-released`），不留条目。墓碑在 0.0.x 不剪枝；以后只能在恢复增量的压缩下剪，并写明陈旧界限。时间界限只用于回收，绝不用于安全。
- 释放依据：只有调用域持有释放依据时才删除条目、写墓碑。依据由 `releaseBasisOf` 从调用记录读出：启动前拒绝保存的排除证据（`startRejection`）。仅逻辑收场（`settled`）不是依据，因为它不证明名额已空（契约 P02）。已启动执行的物理结束证明作为依据，随后续增量加入：`ReleaseBasis` 已声明它的位置（`physical-end`），本增量不构造它。`releaseQueue` 在收场提交之后重读调用域取依据，没有依据就不释放，也不关闭 `queue` 待办。

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

推进协程只经过账本命令写记录。它读 `loadRecovery`，按阶段与待办做一步，然后重读，直到调用等待、运行、收场或某个端口不能回答。每次最多 `ToolConfiguration.driverStepsPerRun` 步，缺省为 16。`commit-unknown`、`stale-revision` 与被否定答案排除的回复（第 14 条）都不停止推进：协程重读后重做同一步，同一身份。这三种回答都不算进展：只有提交了或认回了一次提交的步骤才算。它的操作号由受理操作号派生：`<受理>/plan`、`/prepared`、`/enqueue`、`/start`、`/started`、`/exclude`、`/reject`。所以崩溃后重做用的是同一身份，第 11 条的认回直接适用。同一进程内同一调用的运行串行，跨进程的唯一写者由修订号裁定。

一次运行结束后，协程自己决定要不要再运行这个调用，因为没有别的东西会运行它。重新推进的触发有三个，策略是配置，不是写死的值：

- 步数用尽而仍有工作：这次运行里至少有一步提交了或认回了提交的话，协程立即经 `instances.schedule` 重调度自己。整轮没有这样的一步，即回答全是被否定答案排除、修订号陈旧或提交未知的话，就没有证据说明任何东西前进了，改按重试延迟重调度，免得对一个不回答的记录仓，或一个持续排除这一步的读取者空转。
- 因记录仓或端口失败（`unavailable`）结束，或环境提供者对准备答 `pending`、`unknown`：协程在 `ToolConfiguration.driverRetryDelayMs`（缺省 1000 毫秒，1 到 2147483647 的整数，0 与超过定时器上限的值在构造时被拒绝）之后经 `instances.schedule` 重调度。上一条里没有进展的步数用尽也用这个延迟。每个调用同时只有一个等待中的重调度；`instances.schedule` 被拒绝或抛出时，再等一个延迟再试。其它失败（`invalid`、`denied`、`unsupported`、`conflict` 等）是判定，不重复。延迟是固定值；换成更复杂的退避（递增，或可替换的策略实现）由恢复扫描 `scanPending` 的调度一并评估。
- 等待者对账：见下面的「排队」。

被中止的运行不重调度：中止是宿主要它停下。重调度的定时器不占住进程（`unref`），它的释放同 `instances.install`，归排空协议（`quiesce` 与 `handover`）。除这三个触发和受理、同 key 释放的唤醒之外，没有别的东西运行一个调用；其余的缺口归恢复扫描 `scanPending`（第 22 条）。

- 环境准备：`prepared` 记下环境。`rejected` 先取得 `authority.exclude`，再 `rejectPending`，终局原因是 `environment: <原因>`。`pending` 与 `unknown` 保留准备任务，协程按重试延迟再运行，下一次运行读 `inspectPreparation` 而不再请求准备（本进程记得它问过；进程重启后没有这个记忆，协程重新请求，提供者按同一操作去重，契约 P03）。`excluded` 时停下，不启动，`excluded` 的读法见本页末的待确认项；环境端口失败时这一轮以 `unavailable` 结束，按重试延迟再来（上面的第二个触发），调用不收场。
- 排队：`prepareStart` 回复 `tool-queue` 时，协程记下该调用在等待，对本 key 对账一次（第 22 条），然后停下。对账删除了条目的话，协程唤醒同 key 的等待者；对账报告的有 `queue` 待办的调用，协程经 `instances.schedule` 运行；宿主不接受这个请求时，这次运行按失败处理，按重试延迟再来。同 key 的调用释放条目后，协程也经 `instances.schedule` 唤醒等待者。唤醒与对账是提示加修复，不是保证。
- 启动守卫拒绝：`prepareStart` 回复 `unsupported` 时，协程先取得 `authority.exclude`，再 `rejectPending`。
- 启动围栏：协程先问 `authority.inspect`。`started` 或 `rejected` 直接记录，不调用绑定。所以 `recordStart` 的回复丢失后，执行者不会被调用第二次。`unknown` 停下。只有 `not-started` 时，协程取得 `authority.prepare` 的许可、`bindings.resolve` 的绑定与环境，再调用绑定的 `start`。绑定负责暂存待发胶囊并调用 `authority.consume`。之后协程再问一次 `authority.inspect`，记录其答案。只接受 `live-only` 绑定。
- 环境值：本进程准备的环境值留在内存里。没有时协程调用 `inspectPreparation` 重新连接，失败回复 `unavailable`（`dependency` 为 `tool-environment`）。

### 本包采用的读法，待契约拥有者确认

- 环境提供者答 `excluded` 时，协程停下，不重新请求，也不收场。契约 P03 写的是“excluded 须排除全部延迟分配，才允许用原操作重新请求”：它允许在排除之后用原操作重新请求，没有规定由谁、在何时重新请求，也没有规定调用是否收场。本包不替宿主做这个决定。
- 创建步骤对 `preparing` 条目按调用认回、对已越过的条目按操作号认回（第 22 条）。契约没有规定创建步骤的操作号怎样对应两个入口；要求它严格按操作号认回，需要 admit 的序号分配改用 `<受理>/plan`，由拥有者决定。
- 对账不核对别的调用的资格，也不向调用域写记录（第 22 条）。
- 容量按 FIFO key 下尚未释放的队列条目计数，上限是 `queueCapacity`。读取与受理提交不在同一事务，所以并发受理可以短暂超出容量。序号分配失败的已受理调用在 `planPreparation` 之前不计数。
- 未轮到队首或没有名额，以及容量拒绝，都回复 `unavailable`，`dependency` 为 `tool-queue`。
- 首次启动拒绝的 `unavailable` 终局在拒绝提交里直接形成，不经后续的 `preserveResult`，因为从未执行的调用没有 `RawOutput`。契约 SPEC 写的是"首次启动被拒绝时，当前宿主随后以 preserveResult 保存 unavailable 终局"。所以本包不写 `settle` 待办，写 `deliver` 待办。
- `ToolDependencies.instance` 给出本实例的身份，执行引用的代次固定为 `1`。真实代次由后续的 `claim` 铸造。
- 写命令的主体放在 `WriteContext` 旁边，资格动作是 `write`（第 19 条）。实例代次与受信通道的核对随 `claim` 实现。
- 环境拒绝形成 `unavailable` 终局。契约 SPEC 没有规定环境拒绝的终局种类，而 `ToolTerminal` 有 `failed` 与 `cause: 'environment'`。环境拒绝的证据与清理责任尚未保存。
- 启动守卫在队列事务之前核对，不与名额裁定同事务。之间的资格变化由启动围栏的失效排序覆盖（P04）。

## 验证

[tests/README](tests/README.md) 列出每条规则对应的测试。每条测试名以本页所属规则的编号开头，`vitest -t` 可按编号单独运行。

文档导航见 [index](index.md)。
