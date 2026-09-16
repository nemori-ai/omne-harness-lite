# JSONL 存储提供者：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
