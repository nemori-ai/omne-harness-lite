# 租户契约候选

状态：**in-review**。本目录承接旧 DDD 模型中的租户、自然人身份和成员关系语义，供逐项 review；它不是正式 `spec/` 契约，也不定义服务、存储或执行边界。

权威候选正文是 [v1/contract.md](v1/contract.md)。原件及 SHA-256 在 [DDD 模型归档](../../../spec/archive/ddd-models/README.md)；迁移组织与“不因 `current` 推断接受”的依据在[迁移提案](../documentation-system/v1/migration.md#九项旧模型的语义去向)。

| 旧定义 | 候选中的单义引用 |
|---|---|
| `domain.aggregate.Tenant@1` | [租户](v1/contract.md#租户) |
| `domain.entity.UserAccount@1` | [自然人账户](v1/contract.md#自然人账户) |
| `domain.entity.Membership@1` | [成员关系](v1/contract.md#成员关系) |

未决事项列在正文末尾。任何被接受的部分须进入正式分类和 catalog，并附接受依据；本提案不自行登记。

## 当前需求对应与缺口

需求依据为 [SYS-TENANT](../../requirements/system/constraints.md#sys-tenant) 与
[PF-001](../../requirements/product/user/PF-001-tenant-organization-context.md)。现有候选提供
自然人、租户和成员关系的表示输入，尚不能据此声称覆盖组织上下文确定、切换及
数据、权限、行动空间、流程规范的全部效用。精确 effect 含义仍待展开。

2026-09-12 按 D-004 补充本入口的当前关系，使用本轮需求工作区快照；
这不是对旧版本的历史追溯声明，也不改变 in-review 状态。接受具体设计前再固定
所采用的确认条款与 Git 基线。

[PF-010](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)
进一步要求组织/个人资产与权限分别生效，成员按角色共享组织资产与权益，并
区分 official/customized 来源、定义所有权、获权及选用版本。现有身份与成员
候选不足以表达这些完整关系，仍需资产权限及运行准入的专项设计；本次对应说明
不将源资产表、自动 overlay 或三角色枚举直接接受为本项目契约。

[PF-002.C3/C7](../../requirements/product/environment/PF-002-external-change-response.md#已确认要求)
补充 Connector 的用户安装归属、个人/组织信源准入及组织要求成员安装。当前
候选尚未表达这些政策、同意依据和撤回后果；组织要求下的成员安装及内容仍
独立，不能从共享资产权益推导合并私人账号或代替个人外部授权。

同日 [PF-010.C8–C10](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md#已确认要求)
进一步确认个人用户与组织超级管理员对相应范围资产、设置和权限的管理。
当前候选仍缺管理动作与角色矩阵、最后最高管理者保护和变更影响规则；本轮
用户的“超级管理员”不能未经映射就套成源 admin 或平台管理员。管理目录归
PF-010，配置/授权如何生效归 [PF-006](../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)，
需求分篇不预先划分服务、界面或存储。

后续 [PF-019](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md)
扩展租户管理至订阅、额度/用量、账单与预算，要求逐 Agent Step 的金额统计。
当前候选未定义财务管理资格、订阅/使用权益/预算分工、计量归因与迟到结算；
成员身份或资产权益不能代替这些语义，也不因可看租户账目就授予私人会话正文读取权。

本批当前接受范围现从 [D-008 核心能力](../core-capabilities/README.md)进入；
本页历史候选仍保持原来源身份，未覆盖部分不随新决定自动接受。
