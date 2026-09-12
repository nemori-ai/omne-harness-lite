# UserAccount @ 1

限定名：`domain.entity.UserAccount@1`

UserAccount 表示自然人身份，身份为 `user_id`。它可以属于一个 personal Tenant，并作为成员加入多个 organization Tenant。认证凭证不属于此模型；边界层只向领域提供已验证的 `user_id`。

该实体不携带单一 `tenant_id`，因为一个自然人可以同时属于多个租户；租户关系由 `domain.entity.Membership@1` 持有。
