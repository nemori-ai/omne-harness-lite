# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有导出的断言
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：Cordis 绑定入口没有导出的断言
- [session-conformance.spec.ts](session-conformance.spec.ts)：用 session-contract 的事务契约测试件检查内存提供者，并检出有缺陷的参加钩子（JC-06）
- [entries-conformance.spec.ts](entries-conformance.spec.ts)：用 agent-contract 的 entries 与 received 契约测试件检查内存提供者
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
- [journal-coordination.spec.ts](journal-coordination.spec.ts)：coordinated 绑定的声明、`open`/`attach`/`submit` 的参加者冲突译为 denied、取消收束的 attach 与 `tryFinish` 的 changed
- [journal-core-conformance.spec.ts](journal-core-conformance.spec.ts)：Session 替身以 coordinated 绑定运行 agent-contract `./testing` 的 Journal 核心一致性套件
- [record-fault.spec-d.ts](record-fault.spec-d.ts)：本地 `RecordFault` 与契约测试件的 `RecordFault` 互相可赋值
- [fixtures/](fixtures/index.md)：测试共用的构造与固定输入，有 7 个文件
