# Tenant Governance v1 验证范围

TG-01～TG-05 是候选。个人创建的[规范场景](v1/scenarios.md)固定 F→T/C、单条目标租户流、init/signup、unknown、publication 与当前资格分层；文字场景不是已运行测试。

| 范围 | 待取得的证据 | 状态 |
|---|---|---|
| F 受信读取及目标映射 | Account 当前代服务来源/版本、同 ref 内容不变、UserRef 注入式 target、Account 暂失与换代重读 | 未执行 |
| T/C 与目标流唯一性 | sourceRef→T 注入性、C canonical 摘要、两个 F 同 UserRef 冲突、不同 UserRef 可独立提交、空前态 CAS | 未执行 |
| 恢复与发布 | T unknown/未提交证明、完整前缀、CC-06 全 owner 本代基线、错 user/owner/target 拒绝 | 未执行；旧单操作模型不覆盖新链 |
| init 准入 | Account 已核实空根、独占首账号位置及凭据绑定；Tenant 已核实完整空前缀，seed/客户端字段不冒身份 | 未执行 |
| owner 管理 | ready 而账号 pending 时 close 拒绝且不占后来位置；active 后新请求、异账号/系统标签/旧 owner revision 拒绝 | 未执行 |

本能力其他成员、定义和权益性质仍需各自的真实组合证据。候选不代表提供者已实现或验证。
