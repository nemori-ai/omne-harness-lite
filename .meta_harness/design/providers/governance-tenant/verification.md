# Tenant 治理提供者验证边界

来源设计固定为 `packages/governance/tenant/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `5dc39f429f3decbfe9f32a93f5a5bffd034faea1bd87b319643b3b2a1ffe4f55`）。当前结论：共同值声明、bootstrap/personal-index/tenant/member 严格 decoder 与纯 fold 已实现；TenantHost、插件、身份适配和运行资格门未实现。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。

个人 bootstrap 须补真实 Admission 与延迟 fsync 下的资格读取负例，以及成功/重启、
重复原操作认回、异输入冲突、任意 null-tenant 跨 scope 冒充、错 tenantId、既有
Tenant 初始化、三事实错批/错 user/错 owner、撕裂或坏前缀、仅 system stream
revision 冲突且 `currents` 无目标 tenant 引用时经 `bootstrapTargetTenantId` 的
lookup/recovery、该字段缺失/错配、旧 v1 codec 拒绝例外及 v2 读取旧 v1 完整前缀。
已取得逻辑位置未耐久的操作还须覆盖同 key 同/异输入认回、崩溃后 unknown 与
安全截回释放占位的证据边界。验证同时覆盖 Records 结构门、JSONL writer、
Tenant 业务门与完整耐久 publication；本候选仅定义应验边界，不声称已执行。
