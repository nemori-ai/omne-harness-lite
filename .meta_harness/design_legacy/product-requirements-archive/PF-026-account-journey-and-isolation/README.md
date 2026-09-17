# PF-026：账号旅程与独立身份

本信息包拥有用户直接确认的注册、登录、注销和多账号隔离结果。一个产品账号就是一个系统自然人身份；现实中同一人是否持有多个账号，不是产品需要识别或合并的事实。

- 来源基线：2026-09-16 用户直接澄清，见[来源与变化](changes.md)。
- 本次范围：完整账号旅程、同一部署内多个账号及个人范围隔离；不预选认证提供者、注册政策或插件边界。
- 下游入口：尚无专项提案或采用规格；[PF-001](../PF-001-tenant-organization-context/README.md)拥有一个账号加入多个组织的语义，[PF-019](../PF-019-tenant-subscription-usage-billing-and-budget/README.md)拥有租户账目与额度语义。

## 设计覆盖状态

- 需求确认状态：`PF-026.C1`–`C4` 的产品结果已由用户直接确认；`C5` 是从完整旅程推导的验收边界，具体交互待设计。
- 设计覆盖状态：`正式设计完成`（2026-09-17）。完整实施入口见[设计投影 v1](design/v1/projection.md)。
- 规格采用状态：[账号身份 v1](../../../spec/capabilities/account-identity/README.md)、[注册组合 v1](../../../spec/compositions/account-registration/README.md) 均为 **candidate**，尚无接受决定。
- Realization 与实现验证：三个提供者节点[设计完成未实现](../../../realization/README.md#当前主题)；注册组合的三个形式检查已实际执行并通过，其余条款证据待实现。
- 当前可复用设计落点：[账号身份契约](../../../spec/capabilities/account-identity/README.md)拥有身份与登录态；[租户治理契约](../../../spec/capabilities/tenant-governance/README.md)拥有成员关系与个人租户；[注册组合](../../../spec/compositions/account-registration/README.md)以激活为单一提交点承担两者的联合结果。
- 覆盖边界与主要缺口：撤销作用范围、注册准入与限流、新账号初始权益、账号终止语义四项**未经需求方确认**，在契约中以显式 gap 存在（见投影视图第 7 节），不得由实施方填默认值。

## 准入核对

用户直接说明观察者、场景及隔离结果；交接文档提供 CLI 现状与待选机制。未定注册政策和认证手段留在正文待设计，不冒充已确认要求。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| **要实施本需求，当前该怎么做** | [设计投影视图 v1](design/v1/projection.md)：一页给全不变量、业务规则、Cordis 建模与未决 gap |
| 产品必须兑现什么 | [需求正文](requirements.md) |
| 哪些来自用户直接确认，哪些来自交接 | [来源与变化](changes.md) |
| 当时如何澄清多账号与多组织 | [访谈语境](../../interviews/cli-account-flow-2026-09-16/README.md) |

能力划分和 Cordis 投影由后续提案承担；本包不把账号旅程的名称直接当成插件名。
