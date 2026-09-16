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

当前没有绑定新 v1 坐标的执行报告；已有实现和旧测试只作为待核对输入。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
