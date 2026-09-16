# 记录端口与 codec：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

新增验收矩阵：

| 场景 | 必须断言 |
|---|---|
| 同流三 facts | 一次 accepted append 后 revision 为 `1`，三个 facts 的 eventId 不同；下一次 CAS=`1` 成功、CAS=`3` 冲突 |
| 多流任意 prepare 顺序 | adapter 输出每流唯一 append、流内顺序不变、跨流为版本化 canonical 顺序；codec 对非 canonical/重复 stream 具名拒绝 |
| codec round-trip/replay | envelope、receipt、readRange 与恢复得到相同 revision、flatten order 和 eventId；临时 correlation 不出现在 eventId 字段 |

这些项当前均未在新 v1 坐标下执行，不能从旧测试名或源码形状推断为通过。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
