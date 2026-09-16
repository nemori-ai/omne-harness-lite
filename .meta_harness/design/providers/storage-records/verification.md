# 记录端口与 codec：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

新增验收矩阵：

| 场景 | 必须断言 |
|---|---|
| 同流三 facts | 一次 accepted append 后 revision 为 `1`，三个 facts 的 eventId 不同；下一次 CAS=`1` 成功、CAS=`3` 冲突 |
| 多流任意 prepare 顺序 | adapter 输出每流唯一 append、流内顺序不变、跨流为版本化 canonical 顺序；codec 对非 canonical/重复 stream 具名拒绝 |
| codec round-trip/replay | envelope、receipt、readRange 与恢复得到相同 revision、flatten order 和 eventId；临时 correlation 不出现在 eventId 字段 |
| personal creation 二/三流 | 真实受信绑定接受唯一 registration 二流或 init 三流；伪来源、额外 system/tenant 流、错 target/revision/domain/代际拒绝且不分配位置 |
| system-only conflict | personal-index CAS 独自冲突时 v3 durable outcome 与同一 provider fact 均保留原 target/来源/操作/摘要/`UserRef`；`currents` 仅真实 mismatch，重启 lookup 一致 |
| v3 codec 与旧字节 | 缺字段、额外字段、错版本、错 target、outcome/fact 不一致、非 canonical 编码拒绝；实际旧候选前缀保全原件且不能按 v3 可写恢复 |

这些项当前均未在新 v1 坐标下执行，不能从旧测试名或源码形状推断为通过。
验收还须清点开发环境实际 journal 字节；若发现旧候选格式，由独立处置决定如何
保全或弃用，不把其读取/迁移作为本候选协议的兼容要求。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
