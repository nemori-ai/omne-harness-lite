# Tenant Governance v1 验证范围

TG-01～TG-05 由语言无关候选正文和三份固定研究提供来源。当前实现只有共同值声明、
严格记录 decoder 与纯 fold；TenantHost、Cordis plugin、身份适配、当前资格门和引用来源组合
尚未实现。租户隔离、最后 super-admin、重加入不复活旧权、引用阻断和关闭恢复都需真实组合证据。

TG-01 的[统一创建场景](v1/scenarios.md)覆盖两来源的首次准入、同一 global claim、
二/三流同批、原操作/target 认回、unknown/blocked 与历史/可消费/当前资格三层。
当前只有文字场景，尚无覆盖两个来源、多注册竞争、CC-05 导入和 CC-06 恢复交错
的行为模型、严格格式证据或产品故障实验。真实验收至少要求 Account 源后果成立与
耐久导入、Tenant/Admission 同门、DR 受限混合写与 conflict target 认回、完整
owner publication 的组合。DR-01/CC-03 候选现已声明统一封闭许可；对应
writer/Admission provider 与 TenantHost 尚无符合性证据，后续注册实际入口保持
unavailable。本候选不能被当成实现许可或实现符合。
初始账号还须按 AI-08 验证：Account 在 Tenant init 前耐久分配不复用 `UserRef`、完成唯一
凭据绑定及与 seed/target 一致的一次创建后果；缺任一事实、seed 错绑或仅有
seed 字符串均拒绝 init。Account/CC 在 Tenant 权威未建立时的来源导入、unknown
target 认回及恢复映射尚无提供者证据。每次创建只产一份 personal/owner，不能
从该回执推断账号已 active 或授予 pending 身份业务访问。
TG-P14/P15 还须核验 ready→close→Account active 交错：personal 创建已 durable
ready 而账号仍 pending 时，owner close/管理变更在逻辑门拒绝且不会在激活后自动
执行；同一账号耐久 active 后新请求可关闭。异账号、seed/系统标签、active
证明缺席、owner revision 变化和普通成员操作试图暂停/移除个人 owner 均失败
关闭；首版没有受信系统关闭旁路。该 active 事实的同门 provider 映射尚未验证。
