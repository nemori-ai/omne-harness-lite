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
- [session-log-journal-custody.spec.ts](session-log-journal-custody.spec.ts)：保管链在根 recordHandoff 的存储结果未定时的行为：同一 H 的另一根仍被拒；接管栅栏使它排除后，直接后继接上保管链
- [create-depth.spec.ts](create-depth.spec.ts)：带首条输入的 Session `create` 提交嵌套 69 层，不带的 48 层，解释真实 provider 场景为何要把 `maxJsonDepth` 设在 64 以上
- [session-log-journal-real.spec.ts](session-log-journal-real.spec.ts)：生产 Journal 提供者在真实 sqlite-provider 上的首次共同发布、核对冲突回滚、清单摘要不符与解释提交（慢层）
- [session-log-journal-replay.spec.ts](session-log-journal-replay.spec.ts)：AG-23 轨迹回放对生产 Journal 提供者，保留副本与每次重建两种
- [session-log-journal-complexity.spec.ts](session-log-journal-complexity.spec.ts)：读进度标记之后一页的读次数不随 N 增长，从头读的负控随 N 增长
- [common-journal.spec.ts](common-journal.spec.ts)：共用会话日志上从原资格创建 Session 并打开 Agent；只观察的尾部扫描后可以终结，不单写游标；已记录条件的 `entry` 事件只观察，不产生 Session 后果
- [journal-ports.spec.ts](journal-ports.spec.ts)：detach 与 attach 围住旧 Authority 并保留原操作答案；答复准入按原决定分页，输出确认不确认 Model；commit 拒绝由 Journal 分配的 `entry` 与 `ended` 事件正文；context 转换与原 Agent 答案共同发布、共同恢复；终态后观察者沿原 passage
- [call-normalization.spec.ts](call-normalization.spec.ts)：多个生产者按原用途登记，事件序号不随后来的 head 变化；producer 事件沿原效果并绑定发起的 attempt；未关联的 Tool intent 在后来的事件给出实际调用时保留原身份
- [control-normalization.spec.ts](control-normalization.spec.ts)：控制的同日志解释：accepted 单独不能对账取消；无关的 Agent 控制只观察；生产者确认与物理停止不能解除选定的未关联责任；同一调用的每个 K 意图分别对账；紧急中断经原 submit 传播
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
- [fixtures/](fixtures/index.md)：测试共用的构造与固定输入，有 7 个文件

## 本绑定不可达的分支

下列分支在会话日志绑定上没有测试，因为 Journal 与 Session 参加者读同一份权威状态，Journal 按 Agent 的判定次序先返回。这些分支在本绑定上不可达，这些行上的变异存活体按 Agent 开放问题的 [U-25](../../../agent/agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口) 计为等价。

- [factory.ts:777](../src/testing/factory.ts#L777)，`tryFinish` 参加者对推进授权的「冲突」（PA-08 第 3 项）：Run 为 SE26 cancelled 时，`advances` 从同一 Run 求出推进资格已撤，Journal 先返回 `stale-advance`，参加者不被调用。该分支的其他情形（例如 Session 已受理而未交入的输入）仍可达，有测试。Journal 与参加者读面分开的绑定会走到该情形。
- [factory.ts:773](../src/testing/factory.ts#L773)，`tryFinish` 参加者的 PA-02 控制核对：判断输入已带 Session 的参加者事实，控制不是 SE26 引用的控制时判断为 blocked，tryFinish 按判断记录返回；参加者事实在判断之后改变时，Journal 按判断输入与当前闭包不同返回 changed；路线控制与授权控制不同时，Journal 返回 invalid。结论不是 cancelled 时，Journal 按授权种类与候选结论不符返回 denied。判断输入不带参加者事实、或参加者读面与 Journal 分开的绑定会走到该分支。这一论证以已安装的取消政策符合 SPEC 判据为前提，即政策不把参加者的 changed 或 blocked 判为 allowed；测试政策 `agent-contract/src/testing-cancellation.ts` 满足这一前提。换成不符合判据的政策时该分支可达。
