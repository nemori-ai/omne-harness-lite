# 共同准入提供者：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。

关联的 legacy Admission 模型只见证授权、效果开始前耐久、取消/安全停止后迟到启动三个不变量。
它不覆盖 CC-05 outbox、CC-06 crash/recover/new epoch、CC-07 observation 或 recovery interleaving。

新增恢复发布验收矩阵：

| 场景 | 必须断言 |
|---|---|
| 部分 owner root、候选根校验失败或无法原子切换 | 无 owner/coordinator 水位部分可见，域保持隔离，原 operation 保持 committed-blocked |
| 旧 owner/host generation ack | 被拒且不能打开新代、推进水位或释放新代资源 |
| 完整 baseline 安装 | domain、watermark、writer epoch、host/owner generations 与全部跨 owner 关系一致；外部只见安装前或安装后快照 |
| 遗留 ExactUse 未结算/释放失败 | 即使 roots 已重建也不 reopen；原 claim 与清理责任可查询且不被新工作复用 |
| 原 operation 恢复查询 | 历史 completion 仍 blocked；受信投影可在 baseline 覆盖后报告 consumable，但 operation/receipt/result 不变且不广播 |
| 原 attempt 结果未知 | consumable 不触发执行；先 inspect/关联原 attempt，无法核实仍 unknown，外部效果不重复 |
| Account 源后果导入 | init 的 AI-08 初始账号与 registration 均以真实 Account/CC 双域测试核唯一凭据绑定、不复用 `UserRef`、来源权威/版本/全绑定和耐久去重；重复/丢响应查原 identity，pending 分配、seed 或客户端字符串不能授创建资格 |
| 双入口短门 | init 另核 Tenant 未建立、受信 seed/部署资格，registration 核注册来源；两者均先有 Account durable import；门内只读当前 Tenant/Admission roots，注入 Account I/O 停顿不使短门 await；三/二流资格代际/形状不可互冒 |
| 竞争与认回 | 同 key/input 先认回固定 target；异输入在占位或 outcome 存在时冲突；不同操作争 user/target 仅一个排位；unknown/not_seen 不释放，核实未提交并安全解除后同绑定重备 |
| 历史与现时 | Account active 或部署已初始化后原操作仍认回；closing/closed 后历史创建不授权业务；旧 committed-blocked 由新代完整 baseline 另行查询可消费而不改写 completion |

这些场景当前没有绑定实现 revision 的执行证据；既有模型与正常 publication 测试不能替代它们。
