# Tenant @ 1

限定名：`domain.aggregate.Tenant@1`

Tenant 是治理域聚合根，身份为 `tenant_id`。`type` 为不可变闭集：`personal`、`organization`、`platform`。它是计费、配额、资产所有权和成员关系的隔离单元，内部包含 `domain.entity.Membership@1`。

## 不变量

- personal Tenant 恰有一个 Membership。
- organization Tenant 至少有一个 owner Membership。
- Membership 的 `(tenant_id, user_id)` 唯一。
- tenant-owned 聚合以 `owner_tenant_id` 标识所有权。
- 成员之间的认知、会话、消息和事件数据绝对隔离。

## 命令与事件

命令：`CreateTenant`、`AddMembership`、`ChangeMembershipRole`、`RemoveMembership`、`ResolveActiveTenant`、`CloseTenant`。

事件：`TenantCreated`、`MembershipAdded`、`MembershipRoleChanged`、`MembershipRemoved`、`TenantActiveSelectionResolved`、`TenantClosed`。

所有 tenant-owned 命令必须先验证 `user_id → active tenant → membership`，缺失或不匹配即拒绝。
