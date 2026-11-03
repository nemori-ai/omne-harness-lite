# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出的断言
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：Cordis 绑定入口没有导出的断言
- [session-conformance.spec.ts](session-conformance.spec.ts)：用 session-contract 的事务契约测试件检查内存提供者，并检出有缺陷的参加钩子（JC-06）
- [entries-conformance.spec.ts](entries-conformance.spec.ts)：用 agent-contract 的 entries 与 received 契约测试件检查内存提供者
- [session-log-journal.spec.ts](session-log-journal.spec.ts)：生产 Journal 提供者在 node:sqlite 替身上的首次共同发布、解释提交、只读核对冲突、P6、丢答复认回、受理前拒绝、被丢弃与未定的写入、无操作身份的写入、竞争、跨租户与未登记租户
- [agent-journal-provider.spec.ts](agent-journal-provider.spec.ts)：`agentJournal` 插件在真实 Cordis 上的装载、停止与按 execution 路由；agent-contract 的核心 Journal 套件经插件与直接用 `forSession` 各运行一遍，唯一的提供者缺口按断言固定；真实 sqlite-provider 上的路由（慢层）
- [drive-source-basis.spec.ts](drive-source-basis.spec.ts)：AD-14 在真实 Cordis 上交的 `AcceptedInput` 原样到达会话日志 Journal 的只读核对：invoke 以 SE13 回执、submit 以 SE11 回执成立；输入的 origin 或另一输入的回执被拒，不写记录
- [session-log-journal-history.spec.ts](session-log-journal-history.spec.ts)：Ja 写入的 Session 历史行：主回复（caller none）写 `message.assistant`，Tool 结果（caller message）写 `message.tool`，与 Agent 记录同一次存储提交；失败两侧都不在，重试只写一次，rejected 不写行
- [session-log-journal-custody.spec.ts](session-log-journal-custody.spec.ts)：保管链在根 recordHandoff 的存储结果未定时的行为：同一 H 的另一根仍被拒；接管栅栏使它排除后，直接后继接上保管链
- [create-depth.spec.ts](create-depth.spec.ts)：带首条输入的 Session `create` 提交嵌套 69 层，不带的 48 层，解释真实 provider 场景为何要把 `maxJsonDepth` 设在 64 以上
- [session-log-journal-real.spec.ts](session-log-journal-real.spec.ts)：生产 Journal 提供者在真实 sqlite-provider 上的首次共同发布、核对冲突回滚、清单摘要不符与解释提交（慢层）
- [session-log-journal-replay.spec.ts](session-log-journal-replay.spec.ts)：AG-23 轨迹回放对生产 Journal 提供者，保留副本与每次重建两种
- [session-log-journal-complexity.spec.ts](session-log-journal-complexity.spec.ts)：读进度标记之后一页的读次数不随 N 增长，从头读的负控随 N 增长
- [journal-adopted-part.spec.ts](journal-adopted-part.spec.ts)：分区 `a`（FIXED-FACTS F4）：主用途 M0 的请求与 Agent 记录同一次提交，`x:` 写入后注入失败两者都不可见；不变的发布不写 `a`；跨 execution 的 `order` 递增且不是执行修订；冷启动与竞争输方读到的一致；200 轮里 `a` 的字节数不增长
- [journal-parts-read.spec.ts](journal-parts-read.spec.ts)：提供者分页读 Agent 记录：一页放不下的会话由全部页重建；各页发布计数不一致时从首页重读，每次都不一致读满 3 次后答 unavailable；首页带整份状态时答 unavailable（夹具把每页改成最多一个分区）
- [journal-parts.spec.ts](journal-parts.spec.ts)：K-8 分区存储：记录按 execution 归入分区，一次发布只写变了的分区与写入方分区，删除与清空分区，删除后重写的顺序在重建副本里不变，畸形分区不重建；分区 `a` 只为新的 `adoptedRequest` 计划，随重建与合并读出
- [common-journal.spec.ts](common-journal.spec.ts)：共用会话日志上从原资格创建 Session 并打开 Agent；只观察的尾部扫描后可以终结，不单写游标；已记录条件的 `entry` 事件只观察，不产生 Session 后果
- [journal-ports.spec.ts](journal-ports.spec.ts)：detach 与 attach 围住旧 Authority 并保留原操作答案；答复准入按原决定分页，输出确认不确认 Model；commit 拒绝由 Journal 分配的 `entry` 与 `ended` 事件正文；context 转换与原 Agent 答案共同发布、共同恢复；终态后观察者沿原 passage
- [call-normalization.spec.ts](call-normalization.spec.ts)：多个生产者按原用途登记，事件序号不随后来的 head 变化；producer 事件沿原效果并绑定发起的 attempt；未关联的 Tool intent 在后来的事件给出实际调用时保留原身份
- [control-normalization.spec.ts](control-normalization.spec.ts)：控制的同日志解释：accepted 单独不能对账取消；无关的 Agent 控制只观察；生产者确认与物理停止不能解除选定的未关联责任；同一调用的每个 K 意图分别对账；紧急中断经原 submit 传播
- [fragment-reads.spec.ts](fragment-reads.spec.ts)：事件原片段的读取：缺失的原片段安静地不作决定，`TypeError` 同样不作决定但经 fault 通道报告，其他错误不被吞
- [taken-range.spec.ts](taken-range.spec.ts)：重建副本里空批次的输入范围只认本执行签发过的身份：另一执行的身份、from 与 to 不同、超出已接受输入的范围，load 仍抛「original input batch range is unavailable」
- [model-settlement.spec.ts](model-settlement.spec.ts)：具名停止点之前采用原答复准入，准入证据与收场证据分开；同一调用的其他控制不能满足 K 的生产者确认
- [human-waiting.spec.ts](human-waiting.spec.ts)：checkpoint 删除后保留原无动作人工等待；remark 答复与 chosen、declined 一样登记为卡片的决定；跨轮次保留选定的卡片；执行动作之前的 ask 使用 extension-batch；原材料缺失时不伪造等待解释
- [background.spec.ts](background.spec.ts)：真实后台槽位经后来的快照对账，checkpoint 替换后保留原槽位；后台形状的 checkpoint 在原发布点被拒
- [frontier.spec.ts](frontier.spec.ts)：冻结取消先解释完整的已捕获后缀，包括 Q 消失之后的等待
- [frontier-lifecycle.spec.ts](frontier-lifecycle.spec.ts)：先解释旧的 taken 再选后继，同一输入不受理两次；冻结与普通取消；解释失败保留原事件、游标与操作身份；缺必需前缀时最终决定失败，不部分释放
- [capacity-races.spec.ts](capacity-races.spec.ts)：不可拆的最终批次超出容量时不留冻结与释放条目；必需原材料过大时准备失败，不释放待处理输入；Session 最终发布先于暂停的业务承接时，旧资格被拒
- [publication-races.spec.ts](publication-races.spec.ts)：taken 发布胜过暂停中的最终准备；共用隔离闸阻止最终发布；丢答复的 Session 发布先认回；暂停后重核被撤销的 Agent 资格；Session 读取与系统目录保留不可用资格；未签发的租户被拒
- [scope-isolation.spec.ts](scope-isolation.spec.ts)：同一后端的三个根中相同的原 ID 互相隔离；可信原历史不能覆盖根，也不能接纳不完整或外来的历史；证据策略在实际 open 之前绑定完整输入与作用域
- [receiving-stream.spec.ts](receiving-stream.spec.ts)：Tool 账目按实际已提交的 Pending 绑定接收；实时输出只在共同根发布后唤醒，abort 释放等待
- [result-identity.spec.ts](result-identity.spec.ts)：字段不同的结果在准备与共同发布之前被拒；重试与同键冲突中保留一个完整结果及原答案
- [result-participation.spec.ts](result-participation.spec.ts)：首个结果只登记此前已提交的 Pending，再共同发布；准备未知时停止，重试时认回旧登记；故障保留两个发布边界；畸形或不匹配的请求不触发登记
- [result-lifecycle.spec.ts](result-lifecycle.spec.ts)：保管合格的原 Tool 结果而不改变当前 Run；recordResult 的位置冲突；新版本在原执行处理；新 attempt 接管后保留原调用；保管不解释无关等待，也不推进 readThrough；迟到保管与两个操作答案原子成立；拒绝外租户与无关调用
- [result-release.spec.ts](result-release.spec.ts)：投影 Tool 原解除回执，不重复结果或答案；Session 故障与 Agent 确认分开；多个版本与消费分开；复用确认不能解除其他版本、消费、执行或 Session；Model 确认经对账保持未决
- [transactions-access.spec.ts](transactions-access.spec.ts)：`createMemorySessionJournal` 必需 `accessCheck`、commit 显式 access、每次公开读写各问一次、`readInput` 与 `queryOperation` 的 denied/unavailable 不披露答案、denied/unavailable/抛错无副作用、内部提交路径不暴露
- [participation-access.spec.ts](participation-access.spec.ts)：Agent 提交派生的四种 Session 参加各问检查一次、denied/unavailable 两侧不写、allowed 证据随同次提交可读回、认回再问一次、裁定后修订被推进时返回可重试的 unavailable 且不写入、被拒调用不改变后续回执、scene 记录每次裁定的结论且外租户由检查本身拒绝
- [record-fault.spec.ts](record-fault.spec.ts)：`failNextRecord` 只作用于布置它的租户与 execution，被拒的调用不消耗它
- [journal-coordination.spec.ts](journal-coordination.spec.ts)：coordinated 绑定的声明、`open`/`attach`/`submit` 的参加者冲突译为 denied、取消收束的 attach（取消前最后授予的 attempt）、取消路线的 establish、judge、`prepareFinish` 与 `tryFinish`，以及 `tryFinish` 参加者的 changed 与 PA-02 取消分支；PA-08 第 3 项：SE26 cancelled 之后推进授权的结束为 `stale-advance`，取消路线以取消授权结束，读到的结束事件只认回，全程只有一个 SE26
- [journal-finishing.spec.ts](journal-finishing.spec.ts)：会话日志绑定上的条件终结规则：settling commit 的形状与有效取消下的候选、prepareFinish 发行与 tryFinish 重算的责任闭包、作者路线与取消路线的判定次序、`commitSettlement` 的资格名与目标核对
- [journal-core-conformance.spec.ts](journal-core-conformance.spec.ts)：Session 替身以 coordinated 绑定运行 agent-contract `./testing` 的 Journal 核心一致性套件，含消息准入的 P、Ja、Rh 与 submit 谱系，以及条件终结的候选、清单、五类阻塞次序与 `commitSettlement` 六变体；夹具装入测试取消政策并登记宿主记录，经内存提供者的 `seedLegacyCandidate` 写入旧协议的取消候选，并按套件的 `qualify` 决定调用方持有 `settle`、`migrate-cancellation`、`reconcile` 中的哪几个资格；夹具在每次首个 submit 成功后记录 Session 一侧的交接，使普通结束不在 Session 一侧受阻
- [journal-replay.spec.ts](journal-replay.spec.ts)：Session 替身以 coordinated 绑定运行 agent-contract `./testing` 的轨迹回放（AG-23）：收尾协议模型导出的轨迹逐步核对答复与状态投影，三条负控的违规轨迹须在最后一步被报告；夹具在每次首个 submit 成功后记录 Session 一侧的交接
- [record-fault.spec-d.ts](record-fault.spec-d.ts)：本地 `RecordFault` 与契约测试件的 `RecordFault` 互相可赋值
- [host-record.spec-d.ts](host-record.spec-d.ts)：本地 `TestHostRecord` 与一致性套件的 `TestHostRecord` 互相可赋值
- [history-source-cursor.spec.ts](history-source-cursor.spec.ts)：AD-04 在 session-storage-sql 签发的游标上读模型视图：跨页只交出签发游标；多轮读取量不随历史增长（E9）；冷启动、被拒收的游标与另一个 epoch 从开头读，行仍正确；游标表满 16 个且历史超过一页（420 行）时从开头读仍逐页前进，调用数有界
- [context-facts.spec.ts](context-facts.spec.ts)：AD-03 事实插件 `session-ad03-facts` 在真实 Cordis 上：提交通知与会话快照共同点名的作用域答 `known`，带快照的租户、会话与代次；伪造的作用域文本、另一会话的日志点名的作用域、插件启动后没有见过的作用域答 `unknown`；读失败、缺协调者主体、缺 `session` 与插件已停止答 `unavailable`；旧代次的作用域保留自己的代次；`replayFacts` 不依赖回放子插件。条目到提交输入的翻译用脚本化替身
- [history-source.spec.ts](history-source.spec.ts)：AD-04 在真实 Cordis 4.0.4 上：`contextHolderSourcesConformance`；历史读、压缩窗口、读取资格；窄采用来源读脚本化的 `sessionAdoptedRequests`，逐项拼出 `AdoptedRequestFact`，核对租户、作用域与覆盖摘要，`unavailable` 不变成 `null`；RQ-14 组合用真实 `createContextAccounting`
- [history-session.spec.ts](history-session.spec.ts)：`historySessionOf` 从 Journal 核心铸的 history 证据解出租户文本与会话；别的 owner 铸的证据、不是「命名空间、execution、`/history`」的记录、命名空间不是两个文本的数组都解为 null
- [journal-interpretation.spec.ts](journal-interpretation.spec.ts)：AD-02 生产插件在真实 Cordis 4.0.4 与 node:sqlite 替身上：一次 Agent 写入之后不经测试调用就解释，进度到达后读历史的 Session 命令通过；丢答复以同一操作认回；同一事件触发两次只提交一次；读到提交之间头行被改动时重读一次；没有输入的步骤、停止的插件、缺 `sessionTransactions`、另一租户的事件与拒绝的视图都不提交；取消之后带非 `observed` 尾部的 Run；每轮的 `commitLog` 次数不随此前的轮数增长；Session 取消的延后控制事实
- [journal-kinds.spec.ts](journal-kinds.spec.ts)：生产 Journal 在发布点写的事实行种类等于其归一后果的种类，Session 纯层在同一提交里接受这些后果；控制事件带延后标记与 Agent 证据；开 Run 的反向输入目录行指名原 attempt；AD-02 从事实行读进度之后的事件，没有正文时回退到读分区；Agent 发布换掉持有的 Session 快照的索引（session-storage-sql RT-04）。发布提交后工作缓存只换索引，共同提交带 Session 参加时折叠其批次，两种情形下一次读都不整读、答案与整读相等（session-storage-sql RT-04）。
- [journal-commit-work.spec.ts](journal-commit-work.spec.ts)：共同提交交给工作缓存的 Session `work` 只来自本次发出、已提交、非认回、非 `recovered` 的回复；回滚与没有 Session 参加的提交不给。
- [message-handoff.spec.ts](message-handoff.spec.ts)：J06 消息准入提供者在真实 Cordis 与 node:sqlite 替身上：invoke 与 submit 分支经可信事实绑定请求，意图先于结果保存；同一 Ki 认回原 H 与结果且不写；execution 分支认回 Journal 的 P，被取代的推进答 `stale-advance`，已固定的结果先于推进判定认回；结果只固定一次；`lookup` 不写；伪造与他租户的作用域、没有 Run 的 execution 与被拒的资格都被拒且不写；他租户读不到记录
- [conditions.spec.ts](conditions.spec.ts)：J06 当前条件提供者在真实 Cordis 与 node:sqlite 替身上：完整来源时各字段与已提交事实一致且同事实同 `source`；auto-drive 的默认与声明变化投影为 `continue`；默认模式不可解、无模型选择、未登记 execution、已停止提供者各自关闭；他租户 Access 读不到快照；被取代的 Authority 带 previous 仍答 `stale-advance`
- [message-handoff-real.spec.ts](message-handoff-real.spec.ts)：J06 在真实 sqlite-provider 上（慢层）：子进程（[fixtures/message-handoff-child.ts](fixtures/message-handoff-child.ts)）保存 invoke 准入的意图与结果后被 SIGKILL，新进程按原 Ki 读回完整记录，同一 prepare 认回原结果且不写
- [fixtures/](fixtures/index.md)：测试共用的构造与固定输入

## 本绑定不可达的分支

下列分支在会话日志绑定上没有测试，因为 Journal 与 Session 参加者读同一份权威状态，Journal 按 Agent 的判定次序先返回。这些分支在本绑定上不可达，这些行上的变异存活体按 Agent 开放问题的 [U-25](../../../agent/agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口) 计为等价。

- [factory.ts:777](../src/testing/factory.ts#L777)，`tryFinish` 参加者对推进授权的「冲突」（PA-08 第 3 项）：Run 为 SE26 cancelled 时，`advances` 从同一 Run 求出推进资格已撤，Journal 先返回 `stale-advance`，参加者不被调用。该分支的其他情形（例如 Session 已受理而未交入的输入）仍可达，有测试。Journal 与参加者读面分开的绑定会走到该情形。
- [factory.ts:773](../src/testing/factory.ts#L773)，`tryFinish` 参加者的 PA-02 控制核对：判断输入已带 Session 的参加者事实，控制不是 SE26 引用的控制时判断为 blocked，tryFinish 按判断记录返回；参加者事实在判断之后改变时，Journal 按判断输入与当前闭包不同返回 changed；路线控制与授权控制不同时，Journal 返回 invalid。结论不是 cancelled 时，Journal 按授权种类与候选结论不符返回 denied。判断输入不带参加者事实、或参加者读面与 Journal 分开的绑定会走到该分支。这一论证以已安装的取消政策符合 SPEC 判据为前提，即政策不把参加者的 changed 或 blocked 判为 allowed；测试政策 `agent-contract/src/testing-cancellation.ts` 满足这一前提。换成不符合判据的政策时该分支可达。
