# 租户、自然人账户与成员关系候选契约（v1）

状态：**in-review**。这是从历史模型逐项转录的候选语义，采用中性概念组织。它不批准旧的聚合分类，也不规定组件、服务、表或事务切分。

## 租户

租户由 `tenant_id` 识别，是计费、配额、资产所有权和成员关系的隔离单元。`type` 是不可变闭集：`personal`、`organization`、`platform`。受租户所有权约束的对象以 `owner_tenant_id` 表示所有权。

候选不变量：

- `personal` 租户恰有一个成员关系；
- `organization` 租户至少有一个 owner 成员关系；
- 租户成员之间的认知、会话、消息和事件数据绝对隔离；
- 每个租户所有命令在执行前都验证 `user_id → active tenant → membership`。任一缺失或不匹配必须拒绝。

候选命令为 `CreateTenant`、`AddMembership`、`ChangeMembershipRole`、`RemoveMembership`、`ResolveActiveTenant`、`CloseTenant`。候选事件为 `TenantCreated`、`MembershipAdded`、`MembershipRoleChanged`、`MembershipRemoved`、`TenantActiveSelectionResolved`、`TenantClosed`。

## 自然人账户

自然人账户由 `user_id` 识别。一个自然人可以拥有一个 personal 租户，也可以成为多个 organization 租户的成员。认证凭证不属于本候选定义；输入边界只提供已验证的 `user_id`。自然人账户不携带单一 `tenant_id`，因为租户关系由成员关系表达。

本节没有从历史原件增加命令或事件；认证与可信身份输入的行为边界仍待 review。

## 成员关系

成员关系由坐标 `(tenant_id, user_id)` 识别，包含角色、席位和生命周期状态，并且不能脱离其租户关系存在。`(tenant_id, user_id)` 必须唯一。新增、角色变更和移除分别由上列候选命令和事件保留，不能在只保留数据字段时丢失。

## 旧定义到候选的映射

| 旧定义 | 数据承接 | 行为/不变量承接 | 原件 |
|---|---|---|---|
| `domain.aggregate.Tenant@1` | `tenant_id`、`type`、`owner_tenant_id` 所表达的所有权 | 租户隔离、成员约束、六个命令和六个事件 | [model](../../../../spec/archive/ddd-models/domain/aggregates/tenant/v1/model.md) |
| `domain.entity.UserAccount@1` | `user_id`、personal/organization 关系 | 已验证身份输入边界；认证细节未定义 | [model](../../../../spec/archive/ddd-models/domain/entities/user-account/v1/model.md) |
| `domain.entity.Membership@1` | `(tenant_id, user_id)`、角色、席位、生命周期状态 | 唯一性、不可脱离租户、成员变更操作 | [model](../../../../spec/archive/ddd-models/domain/entities/membership/v1/model.md) |

## 未决事项

- owner 的角色词表、席位和生命周期状态的具体字段与转换尚未在历史原件定义。
- `platform` 类型的成员和关闭规则未定义。
- 命令的授权主体、幂等键、并发/原子性和事件载荷未定义。
- “绝对隔离”需要在正式契约中给出跨边界读取、引用和执行的可验证规则。
