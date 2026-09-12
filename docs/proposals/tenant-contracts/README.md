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
