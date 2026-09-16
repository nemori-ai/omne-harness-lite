# Tenant 治理提供者验证边界

来源设计固定为 `packages/governance/tenant/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `5dc39f429f3decbfe9f32a93f5a5bffd034faea1bd87b319643b3b2a1ffe4f55`）。当前结论：共同值声明、bootstrap/personal-index/tenant/member 严格 decoder 与纯 fold 已实现；TenantHost、插件、身份适配和运行资格门未实现。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。

统一 personal creation 须按 [TG-01 规范场景](../../spec/capabilities/tenant-governance/v1/scenarios.md)
验收两个来源：init 的前态/seed/三流与 AI-02a 账号注册授权后果/CC-05 耐久导入/
二流，两者共享一次 claim、target/outcome codec 与恢复路径。拒绝客户端 origin、
旧 bootstrap 诊断字段或历史记录冒充新代资格、任意 null-tenant 跨 scope 混写；仅 system stream revision
冲突且 `currents` 无目标 tenant 引用时，统一 target outcome 仍须可按原绑定查回，
不能伪造 tenant current。严格 codec/replay 要验证字段缺失/错配、历史完整前缀和
新格式的读取边界，不能重新解释旧字节。

真实故障实验还须覆盖：init seed 与 Account 初始 `UserRef` 错绑、唯一凭据绑定或
一次创建后果缺失、初始 target unknown 后认回、较早 pending 分配或凭据碰撞
不得发授权、sourceFact 未核实/
未耐久导入、导入后 Account 失联或账号 active、旧 provider generation 冒充、
同键同/异输入认回、两个账号争 claim/target、延迟 fsync 的资格读取负例、sync
unknown、回执丢失、独占恢复与安全释放、错批/错 user/错 owner/第二 owner、
publication blocked 与 CC-06 新代全 owner 基线、closing/closed 后历史认回与当前
资格分离。本创建只建立一份 personal/owner，不附带组织成员；不能从 personal
创建后果推断账号 active 或把 pending 身份用于业务。
另测个人 owner 管理/close 的位置竞争：Tenant 创建已可消费而 Account 仍 pending、
请求与 Account active 先后交错、actor 是别的账号、seed/系统标签冒充、active
证明不可达或过旧、唯一 owner revision 变化、普通 `changeMember`/`removeMember`
试图暂停/移除 owner，以及 closing 后清理。pending 请求必须拒绝且不留自动
执行占位；active 后 owner 显式新请求可关闭。未完成 Account active 证明与
Tenant/Admission 同门组合实验前，不声称个人关闭或管理入口实现符合。
每项记录输入版本、writer/Admission generation、原操作、目标、批次
水位与观察结果。验证同时覆盖 Records 结构门、JSONL writer、Tenant 业务门与
完整耐久 publication；本候选仅定义应验边界，不声称已执行。Account/CC 导入
接口、DR/CC 统一许可的真实 provider 和 TenantHost 未完成前，该纵切不可宣称
实现符合或开放注册入口；DR/CC 候选条款存在不替代这些验证。
