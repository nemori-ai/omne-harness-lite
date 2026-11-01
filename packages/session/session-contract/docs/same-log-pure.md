# 同日志解释的纯层

本包实现 [FR-01 至 FR-07](../SPEC.md#fr-01) 的 Session 类型、决定、投影与归约校验。共同日志提供者仍须取得真实原材料、执行原协议解码、完成前缀准备并串行发布。纯函数不证明一个调用者同时伪造的完整一致快照，也不提供持久化或跨进程保证。

## 输入与失败

[history-values.ts](../src/history-values.ts) 定义可信根、完整输入目录、原执行与 attempt、批次和读取材料。`historyIndex` 来自同根原日志；`reads` 只能补充它已有的原事实。空数组不证明未知关系不存在。根位置、Session 修订、执行修订与事件序号分别核验，整数文本按精确十进制处理。

`decide` 在后继首条输入与全部 SE38 路径核对相应输入范围。`projectSessionLog` 保存真实 head 回执与原事件来源，逐项检查同次观察中的登记、等待和结果。`reduce` 用相同本域校验拒绝矛盾的新协议批次，不发布临时状态。已提交副作用必须在原快照中成立，读取材料不能代替它们。原事件重放仍核对来源与固定身份，但不重新施加旧等待或旧控制进度。

同日志批次同时核验后果与执行进度。每项后果须有匹配原执行的进度行，推进范围内须有全部适用后果。这项配对核对只适用于事件通道（`via` 为 `same-log`）。entries 通道的核对见下一节。缺任一项则隔离整批。entries/results 对账保持已有事件序号，不虚构新 cursor。归约在同批临时状态中核对调用的原 SE15 与原事件 Run；旧 call 分支遵循相同约束。

缺少必要原材料返回 `unavailable`；错域先返回 `denied`。输入字段错误返回具体 `invalid`，固定绑定冲突回显本次 `observation.operation`。需要冲突身份却省略 operation 时返回 `unavailable`。新完整日志的矛盾在归约入口返回 `quarantined`。精确解释采用不匹配仍按原版本边界拒绝。

## entries 通道的解释提交

`SessionTransactionPort.commitEntries` 提交一段 entries 通道的解释结果。调用者是受信的解释者，端口不做访问检查。[entries-interpretation.ts](../src/entries-interpretation.ts) 的 `projectSessionEntries` 做范围检查，`digestSessionEntries` 求认回摘要。每个提供者都调用这两个函数，不另写一份检查。规则来源是 P3 候选 r2 与 #502 的决策记录：采用 23 条规则，删去 EI-22。

### 输入

纯检查读五项输入：

- `snapshot`：提交事务内的当前快照。
- `observation`：本次观察，范围是 `(after, through]`。
- `start`：调用者声称的已存进度，即端口入参。
- `saved`：提供者保存的本会话已存进度，每个 `(run, execution, channel)` 一项。缺该项表示该通道从未提交。
- `record`：提供者对该操作标识的记录，没有时为 `null`。

已存进度是输入参数。`WorkSnapshot` 目前不带它。纯检查不读存储，不看时钟，也不抛出：每个失败都返回 `rejected`。

### 检查顺序与失败

规则按下表顺序检查。第一条失败的规则决定失败类别。认回先于全部状态检查（SL07）。

| ID | 规则 | 失败 |
| --- | --- | --- |
| EI-01 | `observation` 的租户与会话等于快照的租户与会话。 | `denied`，`action` 为 `commitEntries` |
| EI-02 | `operation` 是非空文本。 | `invalid`，字段 `operation` |
| EI-03 | `record` 存在且摘要等于 `digestSessionEntries(observation)`：认回原回执。 | 不是失败，返回 `recovered` |
| EI-04 | `record` 存在但摘要不同，包括该标识属于普通批次或控制记录。 | `conflict`，`operation` 取本次标识 |
| EI-05 | `after`、`through`、`boundary.count`、`boundary.revision` 是规范非负十进制文本。`items[i].ordinal` 是规范正十进制文本。 | `invalid`，字段为出错字段 |
| EI-06 | `boundary.executionEvidence`、`items[i].fact` 与每个生产者事实的 `source` 都是完整证据。 | `invalid`，字段为证据成员的路径 |
| EI-07 | Session 记录过该执行：当前 Run 的执行或 `executions` 中的某项。 | `unavailable`，`owner` 为 `session-history` |
| EI-08 | 该执行属于 `observation.run`。 | `invalid`，字段 `run` |
| EI-09 | `boundary.execution` 等于 `observation.execution`。 | `invalid`，字段 `boundary.execution` |
| EI-10 | `boundary.channel` 等于 `observation.channel`。 | `invalid`，字段 `boundary.channel` |
| EI-11 | `through` 大于 `after`。 | `invalid`，字段 `through` |
| EI-12 | `through` 不大于 `boundary.count`。 | `invalid`，字段 `through` |
| EI-13 | `after` 与 `start` 一致：`initial` 对应 `0`，`saved` 对应其 `through`。 | `invalid`，字段 `after` |
| EI-14 | `start` 不落后于该通道的已存进度。 | `changed`，`revision` 取快照修订 |
| EI-15 | `start` 不落后时，等于该通道的已存进度：键、`through` 与 `interpreted` 都相同。 | `invalid`，字段 `start` |
| EI-16 | `items` 的项数等于 `through - after`。 | `invalid`，字段 `items` |
| EI-17 | 第 i 项（从 0 起）的序位等于 `after + 1 + i`。 | `invalid`，字段 `items[i].ordinal` |
| EI-18 | 每项的 `key` 非空。 | `invalid`，字段 `items[i].key` |
| EI-19 | 同一批内 `key` 不重复。 | `invalid`，字段为第二次出现处的 `items[i].key` |
| EI-20 | 每项的 `interpretation` 非空，只含 `observed`、`execution`、`account`，含 `observed` 时只含它一个。 | `invalid`，字段 `items[i].interpretation` |
| EI-21 | 每个生产者事实在快照里有原绑定。这一判断复用 `decideProducerFact`。 | `invalid`，字段 `items[i].interpretation[j].fact.producer` |
| EI-23 | 至少一项带后果。只有 `observed` 的范围不单独提交。 | `invalid`，字段 `items` |

补充说明：

1. `operation` 是必填字段。所以本通道没有「省略 operation 时返回 `unavailable`」这一支。
2. 本通道不以 Run 终态或会话归档拒绝。Run 终态之后，迟到的结果与账目仍要登记。
3. `boundary.revision` 只做形态检查，原样记进进度行。它不与 `ExecutionRef.revision` 比较。
4. `start` 落后表示别的提交已推进该通道，所以返回 `changed`。`start` 领先、键不同或证据不同返回 `invalid`。

### 成功时写什么

合法范围返回 `entries`，行的顺序如下：

1. 每个生产者事实的后果行。编码复用 `decideProducerFact`：`execution` 写 `call.execution-fact`，`account` 写 `account.linked`。
2. 最后一行是进度行 `entries.interpreted`。载荷是 `run`、`execution`、`channel`、`after`、`through`、`boundary`（`revision`、`executionEvidence`、`count`）与 `interpreted`（每项的 `ordinal` 与 `key`）。

每行的 `origin` 是 `{ owner: 'agent', via: 'same-log-entries', source }`。后果行的 `source` 是该项的 `fact`，进度行的 `source` 是最后一项的 `fact`。`via` 不是 `same-log`，所以事件通道的配对核对不处理这些行。`Decision.progress` 与 `Decision.interpreted` 回显进度行的内容。

本通道不写执行进度行，也不改 `ExecutionRef` 的 `revision`、`evidence` 与 `readThrough`。事件进度与 entries 进度互相独立。

### 已存进度与归约

日志里的 `entries.interpreted` 行是权威。已存进度从这些行求得。`reduce` 对每个进度行核对 RD-2 与 RD-3。`reduceWithEntriesProgress`（[reduce.ts](../src/reduce.ts)）另外携带已存进度并核对 RD-1：

| ID | 核对 | 不成立时 |
| --- | --- | --- |
| RD-1 | 行的 `after` 等于该通道已存进度的 `through`，没有已存进度时等于 `0`。 | `quarantined` |
| RD-2 | 行的 `through` 大于行的 `after`。 | `quarantined` |
| RD-3 | 行的执行属于行的 `run`。 | `quarantined`，诊断 `missing historical execution binding` |

都成立时，该通道的已存进度设为行的 `through`，`interpreted` 设为本批的批次证据，即归约后快照的 `source`。重放日志会再次算出同样的值。同一批再次归约时认回原状态，已存进度不变。回执 `SessionEntriesReceipt.interpreted` 也取这个批次证据。

### 提供者的步骤

两个内存替身按下列顺序提交：

1. 租户文本不是 legal-identity 铸造的：`invalid`，字段 `tenant`。
2. 该租户下没有这个会话：`denied`，`action` 为 `commitEntries`。答复不说明会话是否属于别的租户。
3. 该标识已是只有答案的控制记录：`conflict`。
4. 调用 `projectSessionEntries`，`saved` 取替身内保存的已存进度。
5. 合法时分配条目 id 与修订，然后归约。归约隔离时返回 `quarantined`，不写任何东西。
6. 一次替换写入条目、快照、模型视图、操作记录与已存进度。

读取会话与这次替换之间没有 `await`。检查与归约全部通过之前，替身不写入任何东西。操作记录用 `digestSessionEntries` 的摘要，回执是普通的 `CommitReceipt`。所以 `queryOperation` 对 entries 记录答 `committed`，`queryControlOperation` 答 `conflict`。session-storage-sql 的实现另行交付。

### 调用者义务

调用者是受信的解释者。端口不替它做下列事：

1. `start` 只取 Session 的已存进度。调用者刚收到本通道上一次提交的成功回执时，可以用回执的 `through` 与 `interpreted` 构造下一个 `start`。
2. 收到 `changed` 时重读已存进度，不用同一个 `start` 重试。
3. 只有 `observed` 的项不单独提交。下一批的 `after` 仍是已存进度，`items` 从已存进度之后的第一项开始，包括这些项。
4. 同一个操作标识只用于同一个观察。

### 互斥与原子性由谁给

| 保证 | 兑现者 | 跨进程是否成立 |
| --- | --- | --- |
| 一次成功提交的后果行、进度行、快照、操作记录与已存进度同时可见，失败时都不可见 | 提供者的单次提交 | 随提供者。内存替身只在进程内成立 |
| 同一通道两次同 `start` 的并发提交只有一次成功；与普通 `commit` 交错时后者被发现 | 装配给出的租户事务域：同一租户的提交串行。内存替身在一个同步片段内完成读、判定与写 | 只在装配给出一租户一事务域时成立 |

消费者不能把第二行当成端口自带的保证。

### 已知限制

| ID | 内容 |
| --- | --- |
| KL-1 | `openWork.unreadEvents` 只计事件通道。entries 通道里已落日志、尚未解释的项不计入未结工作。 |
| KL-2 | 重放时两条通道的核对强度不同。entries 通道的后果行只在提交前由 EI-21 核对一次。重放时只核对进度行自身（RD-1 至 RD-3），不核对后果行与进度行同批配对。 |
| KL-3 | 同一 `key` 跨批重复交付不检查。批内重复由 EI-19 拒绝。 |
| KL-4 | 内存替身不耐久，不证明事务、持久或跨进程。 |
| KL-5 | 不认识 `entries.interpreted` 载荷的旧解释器按 SL12 隔离会话。0.0.x 不承诺历史字节兼容。 |
| KL-6 | 已存进度每个 `(run, execution, channel)` 一项。终态 Run 的项不删除，本版不裁剪。 |
| KL-7 | 本通道不核对生产者绑定的 Run 归属（原 EI-22 已删除），只由 EI-08 在执行层核对。将来要按 Run 归属分流后果行，或出现跨 Run 的结果误挂时，需要重新设计这一核对。 |
| KL-8 | `WorkSnapshot` 目前不带已存进度。两个内存替身把它存在替身内部，`readWork` 读不到它。调用者重启后读回已存进度的路径另行交付。 |

## 登记、控制与压缩

[call-values.ts](../src/call-values.ts) 区分真实 associated 调用与没有 invocation reference 的 Tool intent。原 Model purpose、固定请求和原 attempt 保持不变。取消后关联只转换原控制的核对目标，不恢复业务等待。

[work-entry-values.ts](../src/work-entry-values.ts) 定义原条目引用。归约从真实 `HistoryEntry.id` 保存首次 SE18、当前 SE22、原 SE24、当前 SE25 和关联条目。控制保存其原选择，责任完全结清后才退出压缩下界。`decide` 先核对 `compaction.open`，再调用原 Message 压缩判断。非消息不能伪装成 retained；未结责任期间可能没有合法的第二次压缩范围。

## 验证资源与提供者交接

- [frontier-behavior.spec.ts](../tests/frontier-behavior.spec.ts) 检查根与原事实、完整后果、操作身份、PM-02 的精确剩余集合、历史承接以及未关联责任。
- [frontier-release.spec.ts](../tests/frontier-release.spec.ts) 检查冻结取消、收束与归档的完整解除，以及普通取消和 active freeze 的原门槛。
- [work-entry-behavior.spec.ts](../tests/work-entry-behavior.spec.ts) 检查原控制引用、逐项漏下界、缺索引、非消息压缩、责任结清及旧事件重放。
- [same-log-integrity.spec.ts](../tests/same-log-integrity.spec.ts) 检查直接归约的跨 Run 拒绝、双向批次完整性、空事件对账及合法迟到认回。
- [entries-interpretation.spec.ts](../tests/entries-interpretation.spec.ts) 对 EI-01 至 EI-23（无 EI-22）各写一条只违反该规则的用例，断言失败类别与字段，并检查 RD-1 至 RD-3 的进度链与重放。
- [testing-entries.ts](../src/testing-entries.ts) 是 `commitEntries` 的共用符合性用例 `sessionEntriesConformance`，经 `./testing` 导出。两个内存替身各跑一次，自证与违例变体在 [transactions-conformance.spec.ts](../tests/transactions-conformance.spec.ts)。
- [history-source-isolation.spec.ts](../tests/history-source-isolation.spec.ts) 检查同文本身份在不同租户、不同 Session 的原事件、目录、前缀与根隔离。
- [testing-history-source.ts](../src/testing-history-source.ts) 是显式填入原事件与原受理的内存夹具。grant 与 attachment 由测试提供，不从 pending 或页长度产生。`observe` 从观察值取得显式 tenant/session，`admit(scope, input, admission)` 必须传同样的作用域。`read` 按 snapshot 的作用域读取，拒绝另一作用域的 Session 原日志。根位置和摘要只包含本作用域材料。它不证明 Agent 原协议归一。

服务提供者在纯归约后必须从新共同根更新可信历史索引；不能把前一次根或目录带入下一次提交。捕获 E 的全部前缀、共享隔离门、当前 grant、预算接续和最终共同根提交归 [AD-02](../../session-adapters/SPEC.md#ad-02)。本包用例不证明这些适配责任或完整组合已经实现。
