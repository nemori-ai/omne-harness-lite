# 统一 personal creation 的候选设计

## 已有承载与缺口

[PF-026.C1/C3/C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)要求同部署自助注册、不同账号个人范围隔离和可辨失败。[D-016](../../decisions/account-identity/decision.md)已接受账号身份能力与 Tenant 治理分离；Account 的 [AI-01/02/04/05](../../spec/capabilities/account-identity/v1/contract.md)候选固定不复用 `UserRef`、pending 状态与 personal target，[ACR-03～06](../../spec/compositions/account-registration/v1/contract.md)候选要求 Tenant 唯一 claim、同绑定可消费回执和跨 owner 恢复。当前 HUB 的 [TG-01](../../spec/capabilities/tenant-governance/v1/contract.md)仅描述首次三流 bootstrap；后续二流创建见待整合增量 `b47cd0e` 的 TG-01a，尚非 HUB 已有条款。[DR-01](../../spec/capabilities/durable-records/v1/contract.md)与 [CC-03](../../spec/compositions/core-work-coordination/v1/contract.md)只授权首次 bootstrap，DR 的 conflict target 编码也特设为 `bootstrapTargetTenantId`；不能通过重命名凭据开放后续注册。[CC-06](../../spec/compositions/core-work-coordination/v1/contract.md)要求全 owner 基线原子恢复，历史 blocked completion 不可改写。

[D-017](../../decisions/personal-tenant-creation/decision.md)已接受一套创建语义；本稿继续比较其内部存储与受限许可，不重选账号/租户所有权或认证 provider。统一方案仍给 `init` 和注册两个**不同的受信消费入口**，满足 ACR-03 的防冒充边界；它们共用 Tenant 的 claim、排位、提交、lookup 和恢复状态机。来源是受信颁发者固定的封闭变体 `deployment_init | account_registration`，不是请求体可自报的授权字段。

## 状态、动作与保护点

| 性质与时点 | 保护者及可观察结果 |
|---|---|
| 每个 `UserRef` 最多一个有效 personal tenant；目标 tenantId 不复用 | Tenant 在 CC 短门读取同操作占位、system personal-index 与目标 tenant head，原子排位并以 CAS 封闭竞争。不同现实人账号不合并 claim。 |
| 同操作同冻结输入认回同 target、异输入冲突 | 先查原 operation/摘要/user/target/origin 的占位或耐久 outcome，再作新的首次准入；重试不重新抽 target。 |
| claim、personal tenant、creator 和唯一 active owner 同批成立 | DR 在同协调域单 envelope 中提交 personal-index 与目标 `tenant:<id>`；`init` 同批另含 `tenant-bootstrap`。Tenant 核对业务关系，DR 核对授权、结构、CAS、顺序与完整性。 |
| 排位后竞争被封闭，正向资格未提前开放 | `reserved -> pending_durability -> committed_consumable` 是正常路径；fsync/回执未知进入 `unknown`，owner publication 失败形成 `committed_blocked`。逻辑占位不授予新成员、管理资格或 ACR 激活证明。 |
| unknown 和重启认回原批次 | 完整前缀由独占 writer 核实；仅在旧 writer 未提交、所有占位安全解除后用同操作/输入/target 重备。暂时 `not_seen`、坏前缀或 writer 未隔离均保持 unknown/blocked。 |
| 历史完成与当前资格分离 | committed 后 publication blocked 的历史 completion 保持 blocked；CC-06 受信恢复宿主一次安装全部 owner roots，本代查询另给覆盖原位置的可消费证明。已 closing/closed 的旧租户只认回历史创建，当前 TG-03 仍拒绝业务。 |

`init` 的新操作必须证明 Tenant 权威尚未建立、受信 seed 与独占初始化资格；target 由受信 Tenant 初始化准备者首次分配，在排位前固定。注册的新操作使用 Account 在凭据唯一绑定耐久确认后产生的**不可撤销一次创建后果**，绑定同一 `registrationOperation`、摘要、`UserRef` 和 target；较早的 pending 身份不自带此授权。候选以 CC-05 从受信来源核实并耐久导入该后果，短门只纯检查已可消费的导入事实、Tenant 当前 claim/target 与运行代际，不再查询 Account 当下是否 pending。Account 后来 active、logout 或换代不撤销历史授权；旧实例的写入权仍由代际隔离。**可信导入、代际隔离和真实提供者符合性尚未闭合，继续阻断实施。** 进程缓存、TTL 或客户端字段不能代替权威证明。已有操作认回只核历史绑定和结果，不重跑首次前态，否则已 active 账号或已初始化部署会错误拒绝历史结果。

## 受限混合批次和跨 owner 交接

推荐的统一 DR/CC 凭据只授权一笔已冻结 personal creation：绑定原操作、摘要、`UserRef`、target、来源、精确流集合、期望修订和 Tenant Host/Admission/writer generation。`account_registration` 恰可写 system personal-index 与一条目标 tenant 流；`deployment_init` 恰再加 system tenant-bootstrap。其他 null-tenant tenant 流、任意 system stream 与不同目标均拒绝。凭据由受信装配颁发，不从 `operationKind`、owner 字符串或反序列化 envelope 取得。DR 的 durable conflict outcome 即使只因 system 索引 revision 冲突也必须保留目标与原绑定；`currents` 仍只列真实不匹配 stream，不伪造目标 current。格式/codec/replay 必须严格版本化，不能重释已有字节；本项目无生产存量，不为旧开发格式设计兼容层。

Account 与 Tenant 的写入仍是两个权威步骤。[ACR-04](../../spec/compositions/account-registration/v1/contract.md)只允许在 Account 身份/凭据映射耐久且 Tenant 同绑定结果耐久并可消费后激活账号；[ACR-05/06](../../spec/compositions/account-registration/v1/contract.md)令协调者在 pending、unknown 或 blocked 时保留查询责任，重启从耐久意图与权威回执认回。Tenant committed 不自动代表账号 active，账号 active 也不代表当前 Tenant 业务资格。关闭后同 `UserRef` 的**新**个人创建政策未决，首版候选不开放该入口；旧操作仍认回历史创建结果，不能把 closed 当成自动删除索引或自动赋予新资格。

## 证据与实施阻断

必须有覆盖两种来源及其交错的行为模型、严格格式和完整前缀检查，以及真实组合故障实验：并发争 user/target、同键异输入、仅 system revision 冲突、延迟 fsync、回执丢失、writer unknown/截回、错批/错 owner、publication blocked、新代全 owner 恢复、旧来源凭据互冒、已 active/closed 后历史认回。TenantHost、Account 创建后果的可信导入、DR writer/codec/replay、CC Admission/恢复宿主须真实组合；任何一项缺席后续混合写保持 unavailable。候选文本和有限模型均不证明 provider 符合。
