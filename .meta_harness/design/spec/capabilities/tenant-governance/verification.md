# Tenant Governance v1 验证范围

TG-01～TG-05 由语言无关候选正文和三份固定研究提供来源。当前实现只有共同值声明、
严格记录 decoder 与纯 fold；TenantHost、Cordis plugin、身份适配、当前资格门和引用来源组合
尚未实现。租户隔离、最后 super-admin、重加入不复活旧权、引用阻断和关闭恢复都需真实组合证据。

TG-01 的[统一创建场景](v1/scenarios.md)覆盖两来源的首次准入、同一 global claim、
二/三流同批、原操作/target 认回、unknown/blocked 与历史/可消费/当前资格三层。
当前只有文字场景，尚无覆盖两个来源、多注册竞争、CC-05 导入和 CC-06 恢复交错
的行为模型、严格格式证据或产品故障实验。真实验收至少要求 Account 源后果成立与
耐久导入、Tenant/Admission 同门、DR 受限混合写与 conflict target 认回、完整
owner publication 的组合。现有 DR-01/CC-03 只授予 bootstrap，后续注册保持
unavailable；本候选不能被当成新许可或实现符合。
注册成功提交点恰有一个 personal tenant 的组合检查还须覆盖 pending 账号并发组织
`addMember` 被同门拒绝、激活后明确组织加入可成功；这项 ACR/TG 联合准入和可信
账号状态证明尚无提供者证据。
