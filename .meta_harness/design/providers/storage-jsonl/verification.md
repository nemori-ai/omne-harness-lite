# JSONL 存储提供者：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

新增真实后端矩阵：

| 场景 | 在线与重启后的共同断言 |
|---|---|
| 同流三 facts | 首次 receipt/head revision 为 `1`；下一次 expected=`1` 成功、expected=`3` 形成原操作的耐久 conflict |
| canonical 多流提交 | 不同 prepare 输入排列经 adapter 得到相同 envelope；流内顺序不变，eventId 的 recordIndex 稳定 |
| 非 canonical 直达 writer | 在分配 seq、占 operation 或写盘前拒绝；journal 字节与 head 不变 |
| replay/recovery | 扫描完整前缀重建的 stream heads、operation lookup、receipt 与 eventId 等于在线结果 |
| 二/三流资格封闭 | 真实 Admission/Tenant Host 与 writer 联合检验两个来源各自完整形状；错来源、额外/少流、错 target/revision/domain/代际及伪造字段在写盘和分配位置前拒绝 |
| system-only conflict | 仅 personal-index CAS 冲突时另写同原操作的 provider outcome envelope，不写成功批次；`currents` 只含索引，v3 outcome 与 fact version `3` 的绑定字段一致，lookup/replay 同结果去重 |
| v3 严格 replay 与旧字节 | 缺失/多余字段、错版本、错 target、非 canonical 顺序及损坏前缀阻断可写恢复；旧候选或未知格式字节先保全原件，再拒绝按 v3 可写恢复，无兼容读取或转换假设 |
| unknown 后原操作重备 | 回执丢失与暂时 not_seen 保持原目标/占位；只有旧 writer 完整前缀证明未提交且占位安全解除后，当前代才可同绑定重备 |

当前没有绑定新 v1 坐标的执行报告；已有实现和旧测试只作为待核对输入。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
