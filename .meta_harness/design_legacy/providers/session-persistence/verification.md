# Session 持久提供者：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。

恢复联合验收应故障注入：`recoverSession` 只产生未发布候选且不写 arrival；任一 required owner 缺失、异水位/旧 generation、跨 owner 关系错误或遗留 ExactUse 未接管时不得安装或 reopen；全根原子安装后，accepted-arrival 扫描须经正常 CC 提交，扫描/attempt 核实未完成时不得发行 epoch/WorkPermit 或进入驱动。历史 `committed_blocked` completion 保持原样，只有新代 lookup 可另报带 baselineRef 的 consumable；没有这些实际证据不能把纯 fold 成功报作工作恢复。
