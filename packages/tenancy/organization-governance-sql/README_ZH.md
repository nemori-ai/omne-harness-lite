# @omne-harness-lite/organization-governance-sql

[English](README.md)

SQL 组织治理提供者。四个服务面共享准入与完成拥有者，并保持组织、邀约、成员关系与清除语义。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/organization-governance-sql": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                                              | 用途                           |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `createOrganizationGovernance`, `OrganizationGovernanceDependencies`, `OrganizationGovernanceInstance`            | 共享关闭的四个公共服务面       |
| `createOrganizationsService`, `createMembershipsService`, `createOffersService`, `createOrganizationPurgeService` | 可单独使用的底层工厂           |
| `OrganizationGovernanceConfigSchema`, `ResolvedOrganizationGovernanceConfig`                                      | 绑定校验与工厂已解析配置       |
| `organizationGovernanceMigrations`, `OG_TABLES`, snapshot exports                                                 | 迁移合成与维护检查             |
| `OrganizationGovernanceStopped`, `StoredRecordMalformed`, `ParentChainCycle`                                      | 生命周期使用错误及存储数据缺陷 |
| `./cordis`: `organizationGovernancePlugin`, `managedOrganizationGovernancePlugin`                                 | 独立与装配管理绑定             |

## 示例

```ts
import {
  createOrganizationGovernance,
  type OrganizationGovernanceDependencies,
} from '@omne-harness-lite/organization-governance-sql'

export async function readOrganization(
  dependencies: OrganizationGovernanceDependencies,
  organizationId: unknown,
) {
  const governance = createOrganizationGovernance(dependencies)
  try {
    return await governance.organizations.read(organizationId)
  } finally {
    await governance.close()
  }
}
```

须提供已迁移存储、时钟、账号／登录参与方，以及包含有效签名密钥的已解析配置。工厂借入这些依赖，不关闭它们。

## 边界与生命周期

账号、登录与组织参与须使用同一 `AtomicStorage` 实例及 `StorageUnit`。同提交失败须向事务拥有者传播，不能把失败的参与检查降级成分立事务。

关闭会停止四个服务面的普通准入，并排空已准入的完整 Promise。已交出的参与对象仍受原单元寿命约束。单独使用底层工厂时，完成协调归调用方负责。

提交后通知尽力发送，不携带凭据。替换保留持久事实。畸形存储数据与层级循环属于缺陷，不是不可用结果。

SQLite 是当前已验证的宿主组合。本包不据此声称 PostgreSQL 恢复、分布式原子性或后续 OG3 资产操作已完成。精确范围归 [SPEC.md](SPEC.md)。

纯策略消费私有具名记录操作，装配选择 SQL 后端并绑定原共同事务单元。记录解码、授权和失败次序仍在原策略观察位置。理由见[策略与记录后端](adr/policy-persistence.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/organization-governance-sql run build
pnpm --filter @omne-harness-lite/organization-governance-sql run typecheck
pnpm --filter @omne-harness-lite/organization-governance-sql run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

测试使用真实临时 SQLite 文件，覆盖业务失败、回滚与提供者集成。其他数据库组合需要独立证据。

## 相关包

- [公共治理定义](../../core/organization-governance/README.md)
- [账号提供者](../account-identity-sql/README.md)
