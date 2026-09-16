# Tenant 治理提供者验证边界

来源设计固定为 `packages/governance/tenant/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `5dc39f429f3decbfe9f32a93f5a5bffd034faea1bd87b319643b3b2a1ffe4f55`）。当前结论：共同值声明、bootstrap/personal-index/tenant/member 严格 decoder 与纯 fold 已实现；TenantHost、插件、身份适配和运行资格门未实现。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。

统一 personal creation 须按 [TG-01 规范场景](../../spec/capabilities/tenant-governance/v1/scenarios.md)
验收两个来源：受信 init 的 Account 一次性资格与已核实空 Tenant 根，以及已建立部署
内后续注册的 Account F。两者都经当前同进程受信读面取得完整 F，按 UserRef 重算
注入式目标、按 F.sourceRef 派生 T、按公开 F 字段生成 C，并仅向目标租户流一个
append 写个人租户与唯一 active owner。拒绝客户端 origin、旧 bootstrap 诊断字段、
旧代 F/历史记录冒充新代资格及跨 scope 混写；严格 codec/replay 验字段缺失/错配、
完整前缀和新格式读取边界，不能重新解释旧字节。

真实故障实验还须覆盖：init 资格与 Account 初始 `UserRef` 错绑、空 Tenant 根未证实、
唯一凭据绑定或 F 缺失、初始 target unknown 后认回、较早 pending 分配或凭据碰撞
不得发 F、Account 暂缺席时新操作停在 pending、同代已冻结 F 后 Account 失联、
新代须重读 F、同 ref 异内容拒绝、旧 provider generation 冒充、重复 F 同 T/C 认回、
不同 F 同 UserRef 时第一 T 未决而第二 T `target_occupied_pending`、第一 T 耐久后
第二 T 终局 `personal_target_conflict` 且 Account 原 A 查询 `blocked_personal_target_conflict`、
第一 T 经独占恢复证明未提交并安全释放后第二 T 才能用原 T/C 继续、
Account 缺席后恢复补记阻断、不同 UserRef 不撞目标、延迟 fsync 的资格读取负例、sync
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
每项记录输入版本、writer/Admission generation、F/T/C、目标、占位/冲突证明与批次
水位与观察结果。验证同时覆盖 Records 结构门、JSONL writer、Tenant 业务门与
完整耐久 publication；本候选仅定义应验边界，不声称已执行。Account 受信 F 读面、
DR/CC 当前代准入与恢复的真实 provider 和 TenantHost 未完成前，该纵切不可宣称
实现符合或开放注册入口；DR/CC 候选条款存在不替代这些验证。

非个人路径另须验证：两账号同组织成员资格不混同；两个 super_admin 竞争移除
最后最高管理员时仅一个合法状态可成立；官方种入不可由公开编辑冒充；源资产
签发资格撤回后不能自授 Entitlement。SR/TL 在 TG 准备撤选后新增引用、来源
装载仅 held、突然失联、报告 `complete=false`、旧 disposer 晚到及恢复重连时，
discard/retire/disable/remove 不得把未知引用当空；停用只封闭后续使用，不
抹已准入工作。治理资格、Session 正文和资源动作权限分别检查。
