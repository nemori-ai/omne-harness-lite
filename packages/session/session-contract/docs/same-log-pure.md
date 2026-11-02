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
- `saved`：本会话的已存进度，每个 `(run, execution, channel)` 一项。三个提供者都传入 `snapshot.entriesProgress`，字段缺席时传空数组。缺该项表示该通道从未提交。
- `record`：提供者对该操作标识的记录，没有时为 `null`。

已存进度是输入参数，它的来源是快照的 `entriesProgress` 字段。纯检查不读存储，不看时钟，也不抛出：每个失败都返回 `rejected`。

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

日志里的 `entries.interpreted` 行是权威。已存进度是 `WorkSnapshot.entriesProgress`，`reduce` 从这些行求得它。`reduce` 对每个进度行核对 RD-2 与 RD-3，并在批末对照上一个快照的 `entriesProgress` 核对 RD-1（[reduce.ts](../src/reduce.ts)）：

| ID | 核对 | 不成立时 |
| --- | --- | --- |
| RD-1 | 行的 `after` 等于该通道已存进度的 `through`，没有已存进度时等于 `0`。 | `quarantined` |
| RD-2 | 行的 `through` 大于行的 `after`。 | `quarantined` |
| RD-3 | 行的执行属于行的 `run`。 | `quarantined`，诊断 `missing historical execution binding` |

都成立时，该通道的已存进度设为行的 `through`，`interpreted` 设为本批的批次证据，即归约后快照的 `source`。重放日志会再次算出同样的值。同一批再次归约时认回原状态，已存进度不变。没有进度行的批次不改已存进度。从来没有进度行的会话，快照里没有这个字段。回执 `SessionEntriesReceipt.interpreted` 也取这个批次证据。

### 提供者的步骤

两个内存替身按下列顺序提交：

1. 租户文本不是 legal-identity 铸造的：`invalid`，字段 `tenant`。
2. 该租户下没有这个会话：`denied`，`action` 为 `commitEntries`。答复不说明会话是否属于别的租户。
3. 该标识已是只有答案的控制记录：`conflict`。
4. 调用 `projectSessionEntries`，`saved` 取快照的 `entriesProgress`。
5. 合法时分配条目 id 与修订，然后归约。归约隔离时返回 `quarantined`，不写任何东西。
6. 一次替换写入条目、快照（含已存进度）、模型视图与操作记录。

读取会话与这次替换之间没有 `await`。检查与归约全部通过之前，替身不写入任何东西。操作记录用 `digestSessionEntries` 的摘要，回执是普通的 `CommitReceipt`。所以 `queryOperation` 对 entries 记录答 `committed`，`queryControlOperation` 答 `conflict`。

session-storage-sql 在 `session` 参加者的一次写事务里完成同样的判定与写入，步骤与表见该成员的 [SPEC](../../session-storage-sql/SPEC.md)。它的操作记录形式是 `entries`。

### 调用者义务

调用者是受信的解释者。端口不替它做下列事：

1. `start` 只取 Session 的已存进度：经 `readWork` 读快照，在 `entriesProgress` 里按 `(run, execution, channel)` 找到该通道的项，构造 `saved`。没有该项时用 `initial`。调用者重启后也走这条路径，不需要保留内存。调用者刚收到本通道上一次提交的成功回执时，也可以用回执的 `through` 与 `interpreted` 构造下一个 `start`。
2. 收到 `changed` 时经 `readWork` 重读已存进度，不用同一个 `start` 重试。
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
| KL-4 | 内存替身不耐久，不证明事务、持久或跨进程。session-storage-sql 的同事务写入由 `node:sqlite` 夹具与真实 sqlite-provider 验证，见该成员的验证义务。 |
| KL-5 | 不认识 `entries.interpreted` 载荷的旧解释器按 SL12 隔离会话。0.0.x 不承诺历史字节兼容。 |
| KL-6 | 已存进度每个 `(run, execution, channel)` 一项。终态 Run 的项不删除，本版不裁剪。 |
| KL-7 | 本通道不核对生产者绑定的 Run 归属（原 EI-22 已删除），只由 EI-08 在执行层核对。将来要按 Run 归属分流后果行，或出现跨 Run 的结果误挂时，需要重新设计这一核对。 |
| KL-8 | `WorkSnapshot.entriesProgress` 只是派生投影。它的正确性依赖 `reduce` 逐批归约日志：手工改写快照行而不改日志时，提供者不发现这一差异。SQL 提供者本版不从日志起点重建快照，所以 RD-1 至 RD-3 只在提交路径逐批核对，全链重放核对等快照重建能力交付后才成立。 |

## 事件通道的解释提交

`SessionTransactionPort.commitLog` 提交一次事件通道的解释结果，是 `commitEntries` 在事件通道上的对应口。它是可选端口成员：不提供它的提供者省略它，调用者见到缺席时按 `unavailable` 处理。调用者是受信的解释者，端口不做访问检查，也不新增 `sl_operation_evidence` 之类的行：Agent 原事件已经由同一 Journal 提交保存，这里只保存 Session 的解释。受信入口不调用访问裁定，委派视图若带有这个方法，必须答 `denied`。

纯层只给两件东西：[log-interpretation.ts](../src/log-interpretation.ts) 的 `digestSessionLog` 求认回摘要，`executionReadThrough` 从快照读某个执行已保存的事件进度。后果检查仍是 `projectSessionLog`，归约仍是 `reduce`。每个提供者都调用它们，不另写一份检查。

### 输入与回执

输入是 `SessionLogCommitObservation`：事件通道的 `SessionLogObservation`，其中 `operation` 与 `executionEvidence` 必填。操作标识是重试时认回的依据，头回执是保存的事实所绑定的原执行 head。摘要 `digestSessionLog` 绑定除操作标识外的完整观察输入，用 `log` 标签与全部命令及 entries 通道的摘要隔开。

回执是 `SessionLogReceipt`：`operation`、`execution`、`readThrough`、`interpreted`、`recovered`。`readThrough` 是提交后该执行的事件进度。`interpreted` 是保存的解释事实的证据，即该次提交里执行进度行的证据，不是占位，也不是观察里的 `source` 或 `executionEvidence`。`recovered` 为真表示这次答案认回了已提交的解释。

### 检查顺序与失败

| ID | 规则 | 失败 |
| --- | --- | --- |
| LC-01 | 租户与会话指向一个存在的会话。另一租户与不存在的会话不可区分。 | `denied`，`action` 为 `commitLog` 或 `projectSessionLog` |
| LC-02 | `operation` 是非空文本。 | `invalid`，字段 `operation` |
| LC-03 | 提供者有该操作标识的事件通道记录且摘要相同：认回原回执。 | 不是失败，返回原回执，`recovered` 为真 |
| LC-04 | 该操作标识已有记录但摘要不同，或属于其他形式的记录。 | `conflict`，`operation` 取本次标识 |
| LC-05 | `projectSessionLog` 的全部检查：执行与 Run 归属、head 修订、事件序号范围、完整后果次序、各后果的原事实。 | 该函数给出的失败；head 修订不符是 `invalid`，字段 `revision` |
| LC-06 | 事件序号不大于该执行已保存的进度：认回覆盖该序号的原提交，不新增提交，不保存这次的操作标识。没有这样的原提交时不猜。 | 认回时返回原回执，`recovered` 为真；找不到原提交时 `unavailable` |
| LC-07 | 至少一项后果不是 `observed`。只有 `observed` 的事件不单独提交，下一批的进度检查仍从已存进度起算。 | `invalid`，字段 `consequences` |
| LC-08 | 归约通过。 | `quarantined` |
| LC-09 | 发布前重新读取头：提供者在读取之后、发布之前，会话已被另一次提交改动。 | `changed`，`revision` 取新的修订，什么都没写 |

第一条失败的规则决定失败类别。LC-03 的认回先于 LC-05 至 LC-08 的状态检查。

### 成功时写什么

一次成功的提交在同一次发布里写：后果行，一条 `history.annotated` 的执行进度行，操作记录（摘要为 `digestSessionLog`，回执为 `SessionLogReceipt`），以及归约后的快照。`readThrough` 取自归约后快照里该执行的进度。`interpreted` 是执行进度行的证据。失败与认回都不改变日志、快照与进度。

### 提供者的步骤

1. 读该会话与操作记录。无会话答 `denied`。有记录按 LC-03、LC-04 处理。
2. 取同根历史材料，调用 `projectSessionLog`。失败原样返回。
3. 没有行可写：按 LC-06 认回，或按 LC-07 拒绝。
4. 调用 `reduce`。隔离则返回 `quarantined`。
5. 发布前核对读取头（LC-09）。未变则一次写入后果行、进度行、操作记录与快照。
6. 回执取自保存的行，不另造证据。

### 调用者义务

1. 同一个事件用同一个操作标识重试。事件通道的记录既不是批次回执，也不是控制回执：`queryOperation` 与 `queryControlOperation` 对它的操作标识都答 `conflict`。结果不明时（例如 `commit-unknown`），用同一个操作标识与同一观察重发 `commitLog` 来认回，不靠这两个查询口。
2. 收到 `changed` 时重读会话，再用同一观察重试。重试不会重复提交：事件已被另一次提交解释时按 LC-06 认回。
3. 同一个操作标识只用于同一个观察。

### 兑现者与限制

| 保证 | 兑现者 | 说明 |
| --- | --- | --- |
| 后果行、进度行、操作记录与快照同时可见，失败时都不可见 | 提供者的单次提交 | 内存替身只在进程内成立 |
| 两次交错的提交只有一次写入，失败的一次答 `changed` 或认回 | LC-09。内存替身在读取与发布之间让出一次，使这条核对可观察 | 生产提供者由同事务内的读写兑现 |

内存替身不耐久，不证明事务、持久或跨进程。真实提供者与 AD-03 的服务供给由后续成员兑现；`./testing` 的 `controls.project` 保留旧回执形状与行为，迁移与删除由后续闭包协调。

## 登记、控制与压缩

[call-values.ts](../src/call-values.ts) 区分真实 associated 调用与没有 invocation reference 的 Tool intent。原 Model purpose、固定请求和原 attempt 保持不变。取消后关联只转换原控制的核对目标，不恢复业务等待。

[work-entry-values.ts](../src/work-entry-values.ts) 定义原条目引用。归约从真实 `HistoryEntry.id` 保存首次 SE18、当前 SE22、原 SE24、当前 SE25 和关联条目。控制保存其原选择，责任完全结清后才退出压缩下界。`decide` 先核对 `compaction.open`，再调用原 Message 压缩判断。非消息不能伪装成 retained；未结责任期间可能没有合法的第二次压缩范围。

## 验证资源与提供者交接

- [frontier-behavior.spec.ts](../tests/frontier-behavior.spec.ts) 检查根与原事实、完整后果、操作身份、PM-02 的精确剩余集合、历史承接以及未关联责任。
- [frontier-release.spec.ts](../tests/frontier-release.spec.ts) 检查冻结取消、收束与归档的完整解除，以及普通取消和 active freeze 的原门槛。
- [work-entry-behavior.spec.ts](../tests/work-entry-behavior.spec.ts) 检查原控制引用、逐项漏下界、缺索引、非消息压缩、责任结清及旧事件重放。
- [same-log-integrity.spec.ts](../tests/same-log-integrity.spec.ts) 检查直接归约的跨 Run 拒绝、双向批次完整性、空事件对账及合法迟到认回。
- [entries-interpretation.spec.ts](../tests/entries-interpretation.spec.ts) 对 EI-01 至 EI-23（无 EI-22）各写一条只违反该规则的用例，断言失败类别与字段，并检查 RD-1 至 RD-3 的进度链与重放。
- [testing-log.ts](../src/testing-log.ts) 是 `commitLog` 的共用符合性用例 `sessionLogConformance`（LC-01 至 LC-09 与委派视图一例），经 `./testing` 导出。夹具用 `observe` 向提供者的历史陈述原事件，用可选的 `delegatedView` 给出委派视图。[log-conformance.spec.ts](../tests/log-conformance.spec.ts) 在内存替身上运行它，并用违反各规则的变体证明每条用例都会变红。
- [adoption-verdict.spec.ts](../tests/adoption-verdict.spec.ts) 检查 `startRun` 与 `reload` 的采用材料带 `verdict` 时判定为 `frozen` 且不生成条目。[log-types.spec-d.ts](../tests/log-types.spec-d.ts) 是类型负控。
- [testing-entries.ts](../src/testing-entries.ts) 是 `commitEntries` 的共用符合性用例 `sessionEntriesConformance`（CF-01 至 CF-09），经 `./testing` 导出。CF-02 与 CF-03 只从 `readWork().entriesProgress` 读回已存进度并续写。CF-09 要求夹具提供 `askedAccessChecks`，断言提交、认回与拒绝都不问访问检查。两个内存替身、session-storage-sql 的 `node:sqlite` 夹具与真实 sqlite-provider 各跑一次。自证与违例变体在 [transactions-conformance.spec.ts](../tests/transactions-conformance.spec.ts)。
- [history-source-isolation.spec.ts](../tests/history-source-isolation.spec.ts) 检查同文本身份在不同租户、不同 Session 的原事件、目录、前缀与根隔离。
- [testing-history-source.ts](../src/testing-history-source.ts) 是显式填入原事件与原受理的内存夹具。grant 与 attachment 由测试提供，不从 pending 或页长度产生。`observe` 从观察值取得显式 tenant/session，`admit(scope, input, admission)` 必须传同样的作用域。`read` 按 snapshot 的作用域读取，拒绝另一作用域的 Session 原日志。根位置和摘要只包含本作用域材料。它不证明 Agent 原协议归一。

服务提供者在纯归约后必须从新共同根更新可信历史索引；不能把前一次根或目录带入下一次提交。捕获 E 的全部前缀、共享隔离门、当前 grant、预算接续和最终共同根提交归 [AD-02](../../session-adapters/SPEC.md#ad-02)。本包用例不证明这些适配责任或完整组合已经实现。
