# 覆盖、性质与完整动作链

## S1–S3：由需求找现有能力

PF-026.C1/C5 要求已建立部署中的新账号能自助注册，成功时恰有一个个人租户；pending、未知和重试不冒充成功或再造账号/租户。受信部署 init 是已接受 D-017 的另一个入口，二者共用 Tenant 创建机制。系统首版单机；未来可扩展边界不要求今天实现远程消息或多库分布式事务。

| 所需结果 | 已有语义 owner | 剩余责任 |
|---|---|---|
| 唯一凭据绑定、稳定且不复用的账号身份、pending/active | Account Identity，D-016 | 账号私有请求 A 如何产生无秘密的耐久创建依据 F，以及 provider 结果未知时怎样认回 |
| 每个 UserRef 最多一个个人租户，唯一 owner 成员 | Tenant Governance，D-017 | 如何不用额外全局索引也独立保护唯一性，如何从 F 得到目标和本地原操作 |
| 单次提交、原操作认回、完整前缀与当前代发布 | Durable Records 与 Core Coordination | T 的规范输入及摘要不能混同 A；单租户写入、恢复与当前代资格 |
| 注册对外成功和未完成责任 | Account Registration composition | 只在 Account active 且同一 user/target 的 Tenant 结果可消费时完成；失败与宕机后持续推进 |

上述剩余责任分别属于已有能力及其组合，不长出新的能力维度或持久“交付插件”。能力到 Cordis 的投影保持 Account 与 Tenant 独立插件；装配消费它们的受信服务，Records 管理本地写入。物理存储边界由提供者选择，不改变账号、租户和注册结果的语义所有权。

## S4：要保护的性质

| 性质 | 保护点 | 必要证据 |
|---|---|---|
| 一个账号、一个固定来源 F 和固定个人目标；F 仅在凭据唯一绑定耐久核实后存在 | Account 对 A 的唯一认回、不可变 F 与不复用 UserRef | provider 崩溃/冲突/重启实验；规范场景 |
| 同一 UserRef 不可能得到两个个人租户，不同 UserRef 不撞目标 | Tenant 校验注入式 personalTarget(UserRef)、个人 ID 空间和目标流原创建事实 | 字节映射正反例、两来源竞争的有限模型 |
| 同一 F 只对应一个 Tenant T 和一份规范输入 C；A 的私有摘要不进入 T/DR | Tenant 从 F.sourceRef 生成 T，从公开 F 字段生成 C；DR 仅计算 SHA-256(C) | Schema/编码检查、同 ref 异内容拒绝场景 |
| 未证实的 Account/Tenant 结果不能报注册成功，历史创建不授当前业务权 | ACR 成功屏障、Account active、Tenant 当前资格和 CC 当前代 publication | init、signup、unknown、失联与恢复交错模型 |
| 首次启动不能把存储丢失当合法空根 | Account 对自身空状态、Records/CC 对完整空前缀与 writer/owner 基线分别核实 | fresh/缺失/损坏、提交前后崩溃的实际故障实验 |

## S5：一条本地动作链

Account 受信 init 在核实部署初态后分配首个账号身份；init active、部署建立后才开放后续自助注册。各自原请求 A 的凭据唯一绑定耐久后，Account 产生同形状、无秘密且内容不可变的 F。当前装配经 Account 受信读面取得 F，Tenant 核 F 的版本、UserRef 和注入式个人目标，生成自己的 T/C；它不接受客户端自填 F，也不耐久导入第二份 F。

Tenant 先查询 T 的耐久或在途结果；新 T 在本代准入门保护下仅向目标个人 tenant 流写一次个人租户与唯一 active owner 成员。目标 tenantId 由 UserRef 唯一决定，故该流的首个个人创建事实就是此 UserRef 的唯一 claim，不另写 global index 或 bootstrap marker。不同账号不争同一 stream CAS；两个不同 F 声称同一 UserRef 时只允许其中一个 T 创建，另一 T 冲突且不能认回别人的结果。受信 init 的一次性资格由 Account 而不是 Tenant bootstrap stream 拥有。

F 后宕机、Account 暂不可用或 Tenant 暂不可用，Account 的 pending/F 列表保留待推进责任；恢复执行者按 F 读取/重算同 T/C，查询 Tenant 原结果后继续。T 提交未知不能用临时 not_seen 换键/目标；必须等独占 writer 完整前缀核实。Tenant 已耐久但 publication blocked 时不重提 T；当前代完整 owner 根可消费后，Account 核同 F/user/target/owner 再转 active。对外成功只在 active 可再读后成立。当前业务授权仍另验登录态与 Tenant 当前成员资格。

## S6–S8：运行时投影与证据边界

Account 插件提供凭据/身份、原 A 查询、不可变 F 的受信读取及 pending 枚举；Tenant 插件提供目标推导、当前代创建、T 查询和成员资格；Records/CC 提供普通 tenant-scope 原子 append、原操作认回、writer 独占与共同根恢复。应用装配可以驱动 pending 继续，但不保存第三份业务权威或复用旧实例资格。Account 缺席时不能发起新的 F 核验；缺席前已核实、内容不可撤销的 F 在同一 Tenant/host/writer 资格内可完成既有提交，换代后须重新核实。已提交的 Tenant 历史事实保留，待 Account 恢复后才激活。卸载 Tenant 时 Account 保持 pending。

具体 provider 仍须验证：认证组件提交凭据后、Account A/UserRef/F 绑定前宕机能否同原请求认回；Records 单租户写入及 CC-06 首次空根/当前代安装是否兑现契约。形式模型只验证有限状态和声明的公平前提，不能代替真实 provider/装配故障结果。规格、当前能力地图、提供者及消费者差异沿[取舍](alternatives.md)和后续决定传播，不能继续引用旧个人混合流为现行保证。
