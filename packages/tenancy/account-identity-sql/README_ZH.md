# @omne-harness-lite/account-identity-sql

[English](README.md)

SQL 账号与登录提供者。独立工厂与 Cordis 绑定共享公共账号身份接口及生命周期拥有者。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/account-identity-sql": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                 | 用途                           |
| ------------------------------------------------------------------------------------ | ------------------------------ |
| `createAccountIdentity`, `AccountIdentityDependencies`, `AccountIdentityInstance`    | 账号／登录服务面与共享关闭     |
| `AccountIdentityConfigSchema`, `AccountIdentityStopped`                              | 配置校验与已停止实例的使用错误 |
| `accountIdentityMigrations`, `ACCOUNT_TABLE`, `ACCOUNT_ID_COLUMN`                    | 调用方合成的迁移及共享表定义   |
| `accountIdentitySnapshotCheck`, `ACCOUNT_SNAPSHOT_TABLES`, `Diagnostics`, `Notifier` | 维护检查及通知／诊断依赖       |
| `./cordis`: `accountIdentityPlugin`, `managedAccountIdentityPlugin`                  | 独立与装配管理绑定             |

## 示例

```ts
import type { AccountIdentityConfig } from '@omne-harness-lite/account-identity'
import {
  createAccountIdentity,
  type AccountIdentityDependencies,
} from '@omne-harness-lite/account-identity-sql'

export async function readAccount(
  config: AccountIdentityConfig,
  dependencies: AccountIdentityDependencies,
  accountId: unknown,
) {
  const identity = createAccountIdentity(config, dependencies)
  try {
    return await identity.accounts.read(accountId)
  } finally {
    await identity.close()
  }
}
```

须提供已迁移存储、存活时钟、凭据解析依赖及有效验证密钥。函数返回公共读取结果，不暴露凭据材料。

## 边界与生命周期

存储、时钟与凭据提供者归调用方所有，须保留到已准入账号／登录工作完成。`close()` 停止新普通操作、排空已准入工作并清除预备票据，不关闭借入依赖。

参与对象继续受原存储单元约束。账号与组织的同提交工作须使用同一存储实例，不能替换成分立事务。

凭据材料保持不透明。提交后通知尽力发送。非法配置拒绝启动；管理绑定另需装配 lifetime 端口。精确保持行为归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/account-identity-sql run build
pnpm --filter @omne-harness-lite/account-identity-sql run typecheck
pnpm --filter @omne-harness-lite/account-identity-sql run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

测试使用真实临时 SQLite 文件，不据本包检查关闭 PostgreSQL 或分布式部署义务。

## 相关包

- [公共账号定义](../../core/account-identity/README.md)
- [组织提供者](../organization-governance-sql/README.md)
