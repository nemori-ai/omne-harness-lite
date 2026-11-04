# 答复推导审计

本页逐个核对 Journal 写操作的答复能否由原批推导。Agent 事实族不存答复副本：同一操作同一语义输入的重试，以及 `query` 的 committed 结论，都由该操作那一批的事实推导出原答复。这是模型性质 P6（见 [README](README.md#性质)）在实现上的前提。

依据：Agent SPEC 的[原操作认回与恢复](../../../../agent/agent-contract/SPEC.md#原操作认回与恢复)第 1、5 条与[执行修订](../../../../agent/agent-contract/SPEC.md#执行修订)。原答复不随当前确认、控制阶段或 revision 更新而改写。认回的 revision 是被认回事实的修订，不是查询时的最新修订。

审计对象：基线 `4d5a7e0bc` 的 Agent 契约类型（`packages/agent/agent-contract/src/journal.ts`、`receiving.ts`、`finishing.ts`）与内存参考实现（`packages/session/session-adapters/src/testing/journal.ts`）。事实种类名取自已采用的终态设计，最终名称以事实车道合入的编解码为准。

## 三类推导

| 类 | 含义 | 处置 |
| --- | --- | --- |
| 甲 | 答复只是本批的函数 | 批里有全部字段即可 |
| 乙 | 答复是本批加本批显式引用的较早批的函数 | 引用以 `pub` 记在本批里。被引用的批只追加、不改写，推导结果固定。重试时可能要把视图折叠到那个 `pub` |
| 丙 | 答复依赖后来的状态，或依赖提交时未写进批的当前值 | 必须在批里补字段，或改变落批规则 |

## 共同字段：`CommandReceipt`

大多数答复含 `CommandReceipt`。它的五个字段按下表推导。

| 字段 | 推导 | 类 | 要补的字段 |
| --- | --- | --- | --- |
| `operation` | 批信封的 `op` | 甲 | 无 |
| `execution` | 批的 execution 键 | 甲 | 无 |
| `revision` | 普通批取信封的 `rev`。认回批取被认回批的 `rev` | 甲或乙 | 认回批要显式记被认回批的 `pub`，见[发现 2](#发现-2认回批必须显式记被认回的批) |
| `evidence` | 由 `(tenant, session, pub, ord, digest)` 纯函数铸造，`revision` 字段取上一行的值 | 丙（现状） | 现状由每个 execution 的发证计数器 `execution.serial` 铸造，计数器在认回时也前进。改为按批位置铸造后为甲，见[发现 6](#发现-6回执证据按批位置铸造) |
| `state` | 由操作种类决定：`control` 为 `accepted`，其余为 `applied`。现状没有答 `unresolved` 的写操作 | 甲 | 无。不得按当前控制阶段计算 |

## 20 个写操作

20 个写操作是 `AgentJournal` 的 13 个写方法，`commitSettlement` 按六个变体各计一个，加上 `AgentReceivedCommits.commit`。读取（`load`、`inputs`、`readReplyAdmissions`、`query`、`output.read`、`output.events`、`readCancellationInstallation`）不写认回，不在审计范围内。

| # | 操作 | 答复 | 首次成功时由哪批推导 | 认回或重试 | 类 | 要补的字段 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `open` | 回执加 `Authority` | `exec.opened` | 只恢复原操作 | 丙 | `exec.opened` 记完整 `Authority`：`executionAttachment`、`instance`、`generation`、`source`。设计表只列了运行时上下文引用与原输入受理引用 |
| 2 | `attach` | 回执加 `Authority` | `exec.attached` | 只恢复原操作 | 丙 | 同上。设计表只列了代次与 grant，缺 `executionAttachment`、`instance` 与 `source` |
| 3 | `detach` | 交接依据 `DurableEvidence` | `exec.detached`，依据按批位置铸造 | 目标已 detached 时，新操作认回原交接依据，修订取原 detach 批 | 乙 | 认回批记原 `exec.detached` 的 `pub` |
| 4 | `commit` | 回执 | 本次 commit 的批 | 无变化的 commit 答提交时的当前修订 | 丙 | 见[发现 1](#发现-1无变化的-commit-也要落信封) |
| 5 | `submit` | 回执 | `input.accepted` | `recognize-input` 的新操作认回原受理，修订取原受理批 | 乙 | `op.recognized` 记原 `input.accepted` 的 `pub` |
| 6 | `control` | 回执，`state` 为 `accepted` | `control.stage`（accepted） | 不跨操作认回 | 甲 | 无。后续阶段推进不改写这个答复 |
| 7 | `acknowledge` | 回执 | `ack.through` | `through` 在已确认前缀内时认回该前缀，修订取前缀最近一次推进的批 | 乙 | 认回批记那次 `ack.through` 的 `pub`。不能在重试时取「当前前缀」 |
| 8 | `recordResult` | 回执 | `result.handled` | 无新责任时认回，修订取建立该责任的批 | 乙 | 认回批记那一批的 `pub` |
| 9 | `recordControl` | 回执，或持久拒绝的 `conflict` | `control.stage`（阶段事实，或 `rejected` 审计） | 同控制、阶段、状态与来源时认回 | 甲（拒绝）或乙（认回） | `rejected` 事实记固定的 `conflict`、审计依据与被冲突的既有事实的 `pub`。认回批记原阶段事实的 `pub` |
| 10 | `recordHandoff` | 回执 | `handoff.recorded` | 同完整输入认回原结果；永久排除的 attempt 答 `invalid` | 甲，排除见发现 3 | 见[发现 3](#发现-3排除要有自己的事实) |
| 11 | `prepareFinish` | 回执加清单依据 | `finish.obligations` | 只恢复原操作 | 甲 | 事实记完整责任清单与 `FinishIntent.obligations`。清单由提交时的权威闭包算出，必须整份落在本批 |
| 12 | `tryFinish` | `FinishResult` | `ended` 分支由 `finish.ended` 推导 | `changed` 与 `blocked` 不产生事实，重试重新求值 | 甲（ended） | `changed`、`blocked` 见[发现 4](#发现-4无写入的答复不是固定结果) |
| 13 | `commitSettlement` `establish-cancellation` | 回执、候选、路线、取代关系 | `settlement.candidate` | 只恢复原操作 | 乙 | 候选的 `checkpoint` 是候选 F1 提交时的游标折叠值。批记候选 checkpoint 所在的 `pub`，以及 `origin`、`inputWatermark`、`conditions` 与取代关系的全部字段 |
| 14 | `commitSettlement` `migrate-cancellation` | 回执、迁移记录、路线 | `settlement.migration` | 只恢复原操作 | 乙 | 批记 `from` 一侧原作者路线所在的 `pub`、`progress` 全表与新路线 |
| 15 | `commitSettlement` `judge-cancellation` | 回执、判断记录 | `settlement.judgment` | 只恢复原操作 | 甲 | 批记完整 `CancellationJudgmentInput` 与 `decision`。判断输入由提交时的闭包算出，不能在重试时重算 |
| 16 | `commitSettlement` `record-card-reconciliation` | 回执、卡片对账记录 | `settlement.card` | 只恢复原操作 | 甲 | 批记 `obligation` 的完整值。它取自提交时的责任清单 |
| 17 | `commitSettlement` `record-legacy-return` | 回执、旧调用返回记录 | `settlement.legacy-return` | 只恢复原操作 | 甲 | 批记 `result`、`received`、`custody` 依据的完整值 |
| 18 | `commitSettlement` `record-tool-association` | 回执、关联登记记录 | `settlement.association` | 只恢复原操作；后继 attempt 带排除前驱 | 甲，排除见发现 3 | 批记 `association`、`obligation` 与 `priorExcluded` 的完整值 |
| 19 | `recordTerminalObservation` | 回执 | `observation.recorded` | 同值认回，修订取原观察批 | 乙 | 认回批记原观察批的 `pub` |
| 20 | `AgentReceivedCommits.commit` | committed：回执、条目、saved；或 excluded：排除依据 | `result.received` 加保管块 | 另一操作重送同一交付时认回整项原值，回执保持原操作与原修订 | 乙；excluded 见发现 3 | `result.received` 记交付键与账目、冻结 consumer、消费位置、保管块摘要。`saved.owner` 取冻结 consumer 的 owner，由批铸造。认回批记原 `result.received` 的 `pub` |

审计范围外还有一个写端口：`AgentJournalEntries.record`。它写 `start-fence` 条目，答 `CommandReceipt`。终态设计的事实种类表没有 `start-fence`。事实车道要给它一个种类，至少记 Tool 操作身份、guard 与 fence 依据，见[发现 5](#发现-5start-fence-条目缺事实种类)。

## 发现

### 发现 1：无变化的 commit 也要落信封

Agent SPEC「执行修订」规定：无变化的 commit 不推进 revision，回执的 revision 是提交时的当前修订。现状把这次 commit 当作认回保存操作记录，所以重试与 `query` 都得到原修订。

终态设计让「除位置外没有新事实」的 commit 不落批。若这次 commit 什么都不写，会出现两个问题：

1. 重试会读到之后别的批推进过的修订，答复随后来状态改变，违背 P6。
2. `query` 查不到这个操作，只能答 `unknown`。SPEC 要求成功且已稳定保存的操作答 `committed`。

另外，只改了位置的 commit 按现行 SPEC 是新 checkpoint，属于新修订。设计改变的是这条 SPEC 条款，不只是落批规则。

要补的：

- 默认做法：这类 commit 落一个只有信封的批（`ord = 0` 一行，没有事实，不推进 `rev`），信封记当时的头 `pub`。答复的修订取该 `pub` 那批的 `rev`。它守住 P3 与 P6。代价是每次这样的 commit 仍是一次提交。提交次数的减少要由协调器在纯节点不调用 commit 来取得。
- 另一做法：Agent SPEC 把「无新事实的 commit」改为不登记的操作，`query` 答 `unknown`，重试按当前状态重答。这要 Agent 契约拥有者裁定，并同步「执行修订」与「原操作认回与恢复」两节。

归属：事实车道与检查点车道。

### 发现 2：认回批必须显式记被认回的批

7 个操作有跨操作认回：`detach`、`submit`、`acknowledge`、`recordResult`、`recordControl`、`recordTerminalObservation` 与接收共同提交。现状在认回时读一个当前指针（例如 `acknowledgedAt`、`handoffRevision`），把它的修订写进认回记录的回执。

终态里认回批是 `op.recognized`。它要显式记被认回批的 `pub`。答复的修订由那一批推导。重试时不能再读当前指针：指针在之后可能前进。模型里的 `target` 字段就是它（见 [proofs/README.md](proofs/README.md) 命题 6）。

### 发现 3：排除要有自己的事实

三处答复依赖「这个操作已被排除」：

- 接收共同提交的 `excluded` 结论带原排除依据。重复提交不能复活被排除的操作。
- `recordHandoff` 的 attempt 被永久排除后，原方法答 `invalid`，reason 为 `operation-permanently-excluded`。SPEC 要求首次真实排除在自己的权威发布事务里保存。
- 恢复接管时，旧代次未定的写入被围栏排除（现状 `fence` 把待定操作改为 excluded）。

终态设计的事实种类表没有排除事实。要补一个种类，例如 `op.excluded`，记被排除的操作身份、排除原因与排除依据（围栏或权威记录的引用），并在保管链里记前驱关系。排除之后，同一操作的写入在判定时被视图拒绝。排除必须是日志里的事实，不能由「查不到」推出。

### 发现 4：无写入的答复不是固定结果

失败答复、`tryFinish` 的 `changed` 与 `blocked` 不产生事实。SPEC 允许同一操作重试时重新求值。现状在这些答复之后写一条 `excluded`（原因 `no-write`）的操作记录，之后 `query` 答 `excluded`，而重试仍会重新执行。

终态里视图只是日志的折叠，没有批就没有这条记录。默认做法：无写入的答复不落批，`query` 答 `unknown`。`unknown` 不授权换身份，调用方沿原操作重试，这与 SPEC 相容。若某个消费者依赖 `no-write` 之后的 `excluded`，要改为处理 `unknown`。事实车道确认 Agent 与 Session 适配层里没有这样的消费者，待车道确认。

### 发现 5：start-fence 条目缺事实种类

`AgentJournalEntries.record` 写 `start-fence` 条目（Tool 启动围栏，Agent SPEC J03）。终态设计的事实种类表没有它。要补一个种类，记 Tool 操作身份、guard 资源与修订、`invalidate` 返回的 fence 依据。答复按甲类推导。

### 发现 6：回执证据按批位置铸造

现状的 `nextEvidence` 用每个 execution 的发证计数器拼出证据记录名。计数器在事务内前进，认回也会前进。若证据仍按计数器铸造，重试时计数器已变，证据不同，答复改变。

终态要求证据是 `(tenant, session, pub, ord, digest)` 的纯函数，不读计数器、时钟或随机数。这样所有证据都可以在重试时重新铸造，不必存储。`DurableEvidence` 的形状不变。

## 结论

20 个写操作里：

- 甲类 8 个：`control`、`recordHandoff`、`prepareFinish`、`tryFinish`（ended 分支）与 `commitSettlement` 的 `judge-cancellation`、`record-card-reconciliation`、`record-legacy-return`、`record-tool-association`。前提是事实整份记下提交时算出的清单、判断输入与记录值。`recordControl` 的持久拒绝也是甲类。
- 乙类 9 个：`detach`、`submit`、`acknowledge`、`recordResult`、`recordControl`（认回）、`recordTerminalObservation`、`establish-cancellation`、`migrate-cancellation` 与接收共同提交。要补的是显式的被引用批 `pub`。
- 丙类 3 个：`open`、`attach` 与 `commit`。`open` 与 `attach` 要在事实里记完整 `Authority`。`commit` 要按发现 1 裁定。

另有四条横向要求：排除事实（发现 3）、无写入答复的查询语义（发现 4）、`start-fence` 种类（发现 5）与按批位置铸造证据（发现 6）。补齐这些之后，没有答复依赖后来状态。
