# 共同准入提供者：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。特别是当前 `CommittedNotice` 的 receipt 型测试不能证明原 envelope 广播；旧 P1 接受只覆盖其当时的实现范围。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。

关联的 legacy Admission 模型只见证授权、效果开始前耐久、取消/安全停止后迟到启动三个不变量。
它不覆盖 CC-05 outbox、CC-06 crash/recover/new epoch、CC-07 observation 或 recovery interleaving。

来源与证据边界：[legacy provider 设计](../../../../packages/coordination/admission/design.md) 的 SHA-256 为
`5b9c851da9d4eed57b61322a25005d31271dc16ad1aa934c0613117c0d98cec8`；
[P1 provider 证据](../../../../packages/coordination/admission/evidence/provider/README.md) 和
[真实 JSONL/Admission 组合证据](../../../../apps/local-harness/evidence/storage-admission/README.md)
分别证明旧版精确使用/同步发布、真实写泵/隔离等切片，不含新 v1 的全 owner 恢复基线或
原 envelope handoff。旧 [广播测试](../../../../packages/coordination/admission/tests/committed-broadcast.spec.ts)
仅断言 `composition + canonicalInput + receipt` 通知，缺少 appends、facts、逐事实 eventId，
故对 [LC-06](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 留红。

目标 provider 的定向符合性矩阵（尚无绑定新版本实现的执行结果）：

| 场景 | 必须断言 |
|---|---|
| 短门及第二次去重 | 门外准备后准入门重读当前资格和原 operation；并发撤权、修订变化、同键同/异输入及重入下，只有合法新票据获得位置；旧结果认回不复算后果；`not_seen` 不被当作未提交证明 |
| 参与者与快照 | 缺/重/多 publication owner 或 use binding、伪造 issuer/pin、accessor、提交后篡改数组/descriptor/回调均在写入排位前拒绝或不影响原票据；owners/requiredUses 与捕获集精确相等 |
| 同步发布与隔离 | enter/retainAt/logical/durable 返回 thenable、抛错、晚 reject、晚 resolve、回调重入和 close 交错；隔离后不推进后续根/水位，late reject 有原票据诊断且无 unhandled rejection；已耐久票据只能 committed-blocked |
| ExactUse 五态 | 原 pin 只 capture/claim/retain 一次；同票据重试不释放原 claim，新 fresh pin 只清理自身；releasing 并发不抢 claim，retained/released 不复用；unknown/释放失败保留原 owner 责任 |
| 双视图与 close | durable n 发布不得覆盖 logical n+2；writer 先提交、owner 发布后 coordinator 才给 ready completion；close 等所有原票据的记录及 owner publication 再关闭 writer，不能漏完成/越过缺口 |
| 原 envelope handoff 与广播 | 真实 writer committed 结果的完整不可变 envelope 与同一已核实前缀/receipt/position 逐字段和 canonical 字节一致；一批多 stream、多 fact 按 canonical flatten 顺序具有独立 `(domain,batchSeq,recordIndex)` eventId；广播原对象，不从 receipt 造第二事件或丢事实 |
| 广播顺序、scope 与失败 | committed/ready 且全部 owner 根已发布、coordinator completion 已 resolve 后，按 seq 门外各票据一次；blocked/unknown 不误广播；tenant/Session 过滤不越界；listener 抛错/重入不改变结果、水位或其他 listener，delivery 故障可定位原位置 |
| 丢通知与恢复 | committed→广播间崩溃、监听者缺席或失败时，提供者启动扫描原完整前缀补漏；反应者按 eventId 幂等并在自身门内重读，不因扫描再次提交原事实；blocked 恢复基线不补发假广播 |
| 通用 conflict outcome | 由 CC/DR 语义 owner 界定普通 `record_conflict` 的广播条件；个人创建使用普通单 tenant 流冲突，不另设专用 envelope。旧 conflict 不广播行为不构成新规则 |

新增恢复发布验收矩阵：

| 场景 | 必须断言 |
|---|---|
| 部分 owner root、候选根校验失败或无法原子切换 | 无 owner/coordinator 水位部分可见，域保持隔离，原 operation 保持 committed-blocked |
| 旧 owner/host generation ack | 被拒且不能打开新代、推进水位或释放新代资源 |
| 完整 baseline 安装 | domain、watermark、writer epoch、host/owner generations 与全部跨 owner 关系一致；外部只见安装前或安装后快照 |
| 遗留 ExactUse 未结算/释放失败 | 即使 roots 已重建也不 reopen；原 claim 与清理责任可查询且不被新工作复用 |
| 原 operation 恢复查询 | 历史 completion 仍 blocked；受信投影可在 baseline 覆盖后报告 consumable，但 operation/receipt/result 不变且不广播 |
| 原 attempt 结果未知 | consumable 不触发执行；先 inspect/关联原 attempt，无法核实仍 unknown，外部效果不重复 |
| Account F 受信读取 | init 与 signup 均从本代 Account 取得完整不可变 F，核唯一凭据绑定、不复用 `UserRef`、版本与 target；未发行、内容变化、失联或换代后未重读均不启动新 T，pending 分配、seed 和客户端字符串不能授创建资格 |
| 共同单流短门 | init 的一次性资格由 Account 证明，signup 只在部署建立后准入；门外读 F 并冻结 T/C，门内只读当前 Tenant/Admission roots，Account I/O 停顿不使短门 await；仅向目标 tenant 流写一个包含 personal 与唯一 owner 的 append |
| 竞争与认回 | 同 T/C 先认回固定 target；异 C 冲突；不同 F 争同一 UserRef/target 仅一者可提交，不同 UserRef 无共享索引竞争；unknown/`not_seen` 不释放，核实未提交并安全解除后沿同 T/C 重备 |
| 历史与现时 | Account active 或部署已初始化后原操作仍认回；closing/closed 后历史创建不授权业务；旧 committed-blocked 由新代完整 baseline 另行查询可消费而不改写 completion |

这些场景当前没有绑定实现 revision 的执行证据；既有模型与正常 publication 测试不能替代它们。
