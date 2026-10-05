# @omne-harness-lite/organization-governance

[English](README.md)

组织、成员关系、邀约与清除的公共契约。它定义操作、类型化事件与显式事务参与，不提供 SQL 实现。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/organization-governance": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                      | 用途                                                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `OrganizationsService`, `MembershipsService`                              | 组织层级、成员关系与租户选择                                                                                          |
| `OffersService`, `OrganizationPurgeService`                               | 邀请、隶属申请与个人组织清除                                                                                          |
| `OrganizationGovernanceConfig`, `OrganizationGovernanceEvents`            | 配置与类型化事件定义                                                                                                  |
| `AFFILIATION_DIRECTIONS`, 读取与失败类型                                  | 共享取值与操作结果                                                                                                    |
| `./cordis`: `Organizations`, `Offers`, `Memberships`, `OrganizationPurge` | 共享 Service 及 `ORGANIZATIONS_SERVICE`、`OFFERS_SERVICE`、`MEMBERSHIPS_SERVICE`、`ORGANIZATION_PURGE_SERVICE` 服务键 |

## 示例

```ts
import type { MembershipsService } from '@omne-harness-lite/organization-governance'

export async function readCurrentTenant(
  memberships: MembershipsService,
  loginStateId: Parameters<MembershipsService['currentTenant']>[0],
) {
  return memberships.currentTenant(loginStateId)
}
```

调用方提供存活的提供者及已解析的登录状态标识。须保留登录拒绝与不可用结果。读到选择不授予后续操作权限。

## 边界与生命周期

自然人身份与租户成员关系保持分离。跨租户访问须明确授权，隔离标签不能授予权限。

账号、登录与组织的同提交参与须使用同一存储单元。参与方须向事务拥有者传播失败。通知在提交后发送，不保证可靠送达。

当前已实现业务范围为 OG2，不据这些定义声称后续资产操作或跨存储原子性已交付。替换提供者保留持久业务事实。精确承诺与剩余义务归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/organization-governance run build
pnpm --filter @omne-harness-lite/organization-governance run typecheck
pnpm --filter @omne-harness-lite/organization-governance run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [SQL 组织提供者](../../tenancy/organization-governance-sql/README.md)
