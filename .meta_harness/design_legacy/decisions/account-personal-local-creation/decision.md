# D-021：直接受信读取来源、单目标流创建个人租户

- 状态：以下架构选择及列明的规格语义已接受；catalog 发布、真实提供者与装配符合性另行验证。
- 来源：[三候选提案](../../proposals/account-personal-local-creation/README.md)，固定于 HUB `b502fac`；需求为 [PF-026.C1/C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、单机首版约束及 [D-016](../account-identity/decision.md)、[D-017](../personal-tenant-creation/decision.md)。
- 接受依据：产品用户在 2026-09-16 本会话授权按 harness-design-handbook 完成架构与规格设计并通过评审后直接正式化。独立架构评审对提案和 HUB `bd0474d` 的规格增量均未发现结构性阻断；独立 spec-reviewer 对 `24ac29e` 的两项 P1、两项 P2 经 `bd0474d` 复修确认闭合。接受对象为 `bd0474d` 的下列精确语义，而非五份契约的所有无关条款。

## 接受的选择

首版单机采用提案 B。Account 先耐久固定原操作 A、不可复用身份与规范标识；认证适配器用同 A 原子且幂等地绑定唯一凭据与 subject，并可按 A 权威查询崩溃后的结果。只有绑定和 Account 映射均耐久核实，Account 才发行不可变、无秘密的个人创建来源事实 F。凭据确定冲突、结果未知和可继续 pending 各有不同的原操作结果；确定拒绝保留不复用墓碑。

Tenant 在本代门外从 Account 受信服务读取 F，由完整 `UserRef` 注入式确定唯一目标，由 F 的 `sourceRef` 确定自己的原操作 T 与规范输入 C；T 的记录摘要只对 C 计算，不等于 Account 私有摘要。Tenant 在目标 tenant 流的一次 append 中共同创建 personal tenant 与唯一 active owner。目标流首个创建事实保护同一 `UserRef` 的唯一性；第二 T 在胜者未决时等待核实，胜者耐久后给确定冲突，不认回别人的成功。不同账号不争全局个人索引。Account 拥有受信 init 的一次性资格；初始账号 active、部署建立后才开放 signup，两入口共用这套 Tenant 机制。

Account 的 pending/F 枚举与 Tenant 的 T 查询保留恢复责任；unknown 不换键或目标，已提交但发布受阻不重提 T。对外成功必须有本代可消费的个人范围证明和可再读的 Account active；历史创建不授当前业务资格。Account 暂不可用时不能开始新的 F 核验，本代已核实 F 的在途准备可按同代资格收口，换代必须重读。

## 精确范围与证据

本决定接受 [AI-02a/04/05/08](../../spec/capabilities/account-identity/v1/contract.md) 的 A→F、凭据认回、冲突与 init 语义，[TG-01](../../spec/capabilities/tenant-governance/v1/contract.md) 的个人目标/T/C 与单流竞争语义，[CC-03/05/06](../../spec/compositions/core-work-coordination/v1/contract.md) 的本地受信读取、准入与恢复交接，[DR-01/02](../../spec/capabilities/durable-records/v1/contract.md) 被消费的普通单 tenant 流提交与认回语义，以及 [ACR-01～06](../../spec/compositions/account-registration/v1/contract.md) 的共同成功和恢复屏障。相应 F、DR Schema 与规范场景随 `bd0474d` 的这些条款解释；未被本决定逐项覆盖的其他能力条款仍按其自身接受依据处理。

[ACR 模型](../../spec/compositions/account-registration/v1/formal/README.md)在 `6c780b4` 的四项有限 TLC 配置通过；它抽象认证适配器的原键认回、真实空根、字节编码与 fencing，也未证明 Account 冲突分类的实际实现。Schema 正负例及文档链接的定向检查通过。接受的是设计和规范语义，不是 provider、CLI 或产品旅程的符合性；全坐标 catalog 接受、依赖闭包和冻结仍由规格发布流程处理。

## 取代与保留

保留 D-016 的 Account/Tenant 独立 owner 与 D-017 的两入口统一 Tenant 机制。取代 D-017 下游清单中“必须补个人混合流许可”的候选工作，以及旧个人创建候选的 Account→CC 耐久导入 I、global personal-index、init bootstrap system 流和二/三流 envelope。通用 CC-05 交付协议仍服务其他确有耐久交接需要的能力；此决定不为个人创建建立第三份持久权威，也不让旧开发字节获得兼容承诺。
