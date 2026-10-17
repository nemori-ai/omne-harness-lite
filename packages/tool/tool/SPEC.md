# tool 实现规格

本页说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：独立执行作用域与执行包装器，以及之后的受理决定器、记录仓、推进协程和耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

下列决定已接受，由本包承担。完整记录见契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)：G1 账本工厂与记录仓端口，G2 独立执行作用域，G6 的 runtime 测试装配与记录仓一致性用例，G8 的 `executeTool`、`createIndependentToolScope`、`createToolRuntime` 及其构造形状。

## 当前范围

已实现：`createIndependentToolScope`（G2）与 `executeTool`（G8），即契约 SPEC [P11](../tool-contract/SPEC.md#p11-作者输出与等待原语) 的独立路径；账本工厂 `createToolLedger` 与记录仓端口 `ToolLedgerStore`（G1）；`createToolRuntime`（G8）的逻辑终局路径，即不进入环境或执行者的 admit、lookup、queryOperation、readResult、releaseDelivery 与 account（工单 05）。尚未实现：真实工具的准备、排队、启动与收场（工单 06 起），这些操作回复具名的 `unsupported`。内部机制见 [architecture](docs/architecture.md)。

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

请求形状按闭合字段检查。Ask 只允许 `kind`、`key`、`contract`、`request`。Resource 另有 `deadline`。多余字段返回 `invalid`。`contract` 只核形状：`kind` 与请求一致，`expiry` 合法，`adoption` 四个字段是字符串，`request.maxBytes` 与 `response.maxBytes` 是正安全整数。契约包的句柄标记不公开，所以本包不能核对品牌。`maxBytes` 不是正安全整数时返回 `unsupported`。`request` 必须是合法的标签 JSON 树，且编码后不超过 `contract.request.maxBytes`，否则返回 `invalid`。树的检查用显式栈，走到容器自身之内返回 `invalid`（原因含 `cycle`），访问超过一百万个节点返回 `invalid`（原因含 `budget`）；共享子树每次到达都计数。这份检查镜像契约包的私有检查器，节点上限与它相同；谁拥有这份共用走法是契约拥有者的未决项。Resource 的 `deadline` 为字符串时，契约的 `expiry` 必须是 `supported`，且值必须是 ISO 8601 时刻，否则返回 `invalid`。

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

账本由 `createToolLedger(store, guards, clock, configuration)` 构造。runtime 由 `createToolRuntime(dependencies, configuration)` 构造。两者可以取同一个 `ToolConfiguration`：账本只读其中的 `resultPageBytes` 与 `ledgerCommitAttempts`。数据形状与决定顺序见 [architecture](docs/architecture.md#本包的记录仓与决定器g1工单-05-起)。下列规则按编号对应测试。

签名与契约 [G1](../tool-contract/SPEC.md#契约缺口决定g1g9) 一致：`createToolLedger(store, guards, clock, configuration)` 返回 `{ commands, reads, admissions }`。`configuration` 给出结果页大小与提交重试上限，两者都只有一处来源，即 `ToolConfiguration`。

### 10 边界与资格

每个命令和读取先检查边界输入，再问 `guards.access`，再读记录仓。缺租户、租户形状不对、主体不属于该租户，都回复 `denied`，`action` 是本次动作；回复不区分调用是否存在。每个操作有自己的动作：`admit`、`lookup`、`query-operation`、`read-result`、`release-delivery`、`account` 等。调用或操作身份不合词法回复 `invalid`，`field` 是 `call`、`operation` 等。

账本只检查租户的形状：`TenantId`、`OrganizationId` 与 `AccountId` 三个名字和两段非空文本。`guards.access` 必须证明租户是 legal-identity 铸造的值，不是同形状的对象，伪造的租户回复 `denied`。账本按两段身份文本为记录定键，所以这项证明是隔离的前提，不能省略。

固定请求经 `judgeFixedToolRequest` 封闭检查，拒绝的字段前缀 `request.`。来源经 `guards.sources` 核验：伪造回复 `denied`，不可读回复 `unavailable`（`dependency` 为 `source-guard`）。资格守卫不可读回复 `unavailable`（`dependency` 为 `access-guard`）。守卫或记录仓抛出时，回复 `unavailable`，`diagnostic` 是只说明依赖名的固定文本，不带异常消息，因为异常消息可能含连接串等秘密（P05）。守卫与记录仓自己给出的 `diagnostic` 原样转交。这些拒绝都不写记录。

### 11 操作幂等（P01）

同 tenant、call、operation、同规范输入摘要的重送回复原回执。账本的 admit 同时说明它是否认回了已提交的受理，`createToolRuntime` 的 admit 把它作为 `recovered` 返回。runtime 不先读操作记录，所以受理只需要 `admit` 资格。两个首次受理同时竞争时，先提交的那次得到 `recovered: false`；后一次的提交因修订冲突失败，重读后认回原受理，得到原回执与 `recovered: true`。同操作异摘要回复 `conflict`。

已受理的调用再以另一操作号 admit 回复 `stale-revision`，`current` 是当前状态的修订号。带 `WriteContext` 的命令先比对 `expected` 与当前状态的修订号，不匹配回复 `stale-revision`，再进入命令本身。提交结果未知回复 `commit-unknown`，不重试提交。调用者以 `queryOperation` 认回：已落盘则 `committed`，重送得到原回执且不再写第二次；否定答案见第 14 条。记录仓读取失败回复 `unavailable`（`dependency` 为 `ledger-store`），不冒充调用不存在。修订冲突时重读重判，次数上限是 `ledgerCommitAttempts`；用尽后回复 `unavailable`（`ledger-store`，`<次数> revision conflicts in a row`）。

域修订号与状态修订号是两个值。域修订号是记录仓按域比对的并发令牌，每次提交加一，排除围栏（第 14 条）也加一。状态修订号是 `ToolState.revision`，等于写入该状态的那次提交的域修订号。围栏不改变状态，所以持有当前状态的写者不会因为别人的查询而失效。

下列三条是本包采用的解读，待契约拥有者确认：

- 已受理的调用再以另一操作号 admit，回复 `stale-revision`，不回复 `conflict`。admit 隐含的期望是"尚未受理"。
- 本租户内不存在的调用：`readResult`、`account` 与 `releaseDelivery` 回复 `invalid`（`call: unknown-call`）；`lookup` 回复 `not-accepted`，`queryOperation` 回复 `not-committed`。他租户的主体在这之前已经得到 `denied`，所以这个区别不跨租户泄露。
- 逻辑终局的账目取第 15 条的值：`trimmed` 为已知 `0` 字节，`duration` 未知，`receipt` 为 `received`。

### 12 逻辑终局（P02）

`known-unavailable` 的目标在身份、资格、来源与后台许可（第 13 条）核验后直接形成 `unavailable` 终局，原因是可用性给出的原因；不读参数，不查 `complete`，不调用任何其他端口。可用目标的参数先查 `complete`：`false` 回复 `invalid`（`request.arguments.complete: incomplete`），不受理。原参数与生效参数都经 `judgeToolArguments` 完整解析，任一失败形成 `failed` 终局，`cause` 为 `arguments`，`diagnostic` 是 `<original|effective>: <原因>`；半截文本与重复键都不产生参数值。

两种终局的状态是 `settled`、`foreground`、`foreground.final`、`execution.not-started`、`effect.not-started`、`timing.closed` 累计 `0`、`queue.none`、`delivery.pending`。一次提交同时写入 `call`、`operation`、`result`、`account` 与 `deliver` 任务。结果正文由 `guards.results` 生成、`guards.policy.judgeResult` 核验，核验失败回复 `unavailable`（`dependency` 为 `result-factory`），不受理。全部通过的真实工具在本增量回复 `unsupported`，`adoption` 是定义的采用。

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

本包接受的风险：

- 排除只对已经读过记录仓的命令生效。命令在首次读取之前（还在资格守卫或来源核验中）时给出的否定答案，不排除它：它随后首次读取时看到的是栅栏之后的修订号，照常提交。持有否定答案的调用方此时以异输入重送会得到 `conflict`。账本不能在资格守卫之前读取（拒绝的主体不得读到任何东西），关闭这个窗口需要端口或协议改动，由拥有者决定（O15）。

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

`createToolRuntime` 在构造时检查配置：作者限额、容量与 `ledgerCommitAttempts` 是正安全整数，延迟是非负安全整数。`createToolLedger` 检查它读取的 `resultPageBytes` 与 `ledgerCommitAttempts`。缺端口或超出范围抛 `TypeError`，因为这是装配缺陷。`ToolDependencies.admissions` 是账本的 admit 入口（`ToolLedger.admissions`），runtime 的 admit 直接用它。runtime 与 provider 都是冻结对象。本增量未实现的操作回复 `unsupported`，`adoption` 是 `tool-runtime` 或 `tool-ledger` 的采用，`reason` 说明操作名与所属工单；没有操作抛异常或回复空成功。`catalog`、`content` 与 `instances` 直接是依赖给出的端口。

### 18 非耐久记录仓（`./testing`）

`createMemoryToolLedgerStore` 声明 `durability: 'none'`。每个域从修订号 `0` 开始；`commit` 只在 `expected` 等于当前修订号时生效，否则回复 `conflict`。生效的提交不论写入集内容都把域修订号改为 `revision`：只写一条 `exclusion` 记录、不改任何记录、删除不存在的键，都同样推进修订号，没有空操作捷径。读取给出副本。域键是各段身份文本的 JSON，含分隔符的身份不会落到别的域。`injectRead` 与 `injectCommit` 按顺序注入下一次读取或提交的故障：

- `unavailable`：不尝试。
- `conflict`：不写入，回复冲突，如同别的写者先提交了。
- `unknown-applied`：已写入，回复未知。
- `unknown-dropped`：未写入，回复未知。
- `unknown-delayed`：现在不写入，回复未知；提交保持在途，直到 `landDelayed` 按顺序落盘。落盘时重新比对 `expected`，修订号已变则丢弃并报告 `conflict`。
- `throw-applied`：已写入后抛出。

## 验证

[tests/README](tests/README.md) 列出每条规则对应的测试。每条测试名以本页所属规则的编号开头，`vitest -t` 可按编号单独运行。

文档导航见 [index](index.md)。
