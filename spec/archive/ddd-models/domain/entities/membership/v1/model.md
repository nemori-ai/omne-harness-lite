# Membership @ 1

限定名：`domain.entity.Membership@1`

Membership 是 Tenant 内实体，身份坐标为 `(tenant_id, user_id)`，并包含角色、席位和生命周期状态。它不能脱离 `domain.aggregate.Tenant@1` 独立存在。
