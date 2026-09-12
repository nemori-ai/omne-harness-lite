# 租户契约候选

状态：**in-review**。本目录承接旧 DDD 模型中的租户、自然人身份和成员关系语义，供逐项 review；它不是正式 `spec/` 契约，也不定义服务、存储或执行边界。

权威候选正文是 [v1/contract.md](v1/contract.md)。原件及 SHA-256 在 [DDD 模型归档](../../../spec/archive/ddd-models/README.md)；迁移组织与“不因 `current` 推断接受”的依据在[迁移提案](../documentation-system/v1/migration.md#九项旧模型的语义去向)。

| 旧定义 | 候选中的单义引用 |
|---|---|
| `domain.aggregate.Tenant@1` | [租户](v1/contract.md#租户) |
| `domain.entity.UserAccount@1` | [自然人账户](v1/contract.md#自然人账户) |
| `domain.entity.Membership@1` | [成员关系](v1/contract.md#成员关系) |

未决事项列在正文末尾。任何被接受的部分须进入正式分类和 catalog，并附接受依据；本提案不自行登记。
