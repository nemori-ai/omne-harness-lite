# @omne-harness-lite/account-identity

[English](README.md)

全局账号、登录状态与凭据验证的公共定义。本包提供类型及表示层校验，不存储账号，也不派生密码材料。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/account-identity": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                              | 用途                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AccountsService`, `LoginsService`                                | 账号、登录操作、结果与事务参与接口                                                     |
| `CredentialsService`, `PresentedCredential`, `CredentialMaterial` | 凭据解析、派生、验证与政策检查                                                         |
| `parseLoginStatePresentation`, `MAX_PRESENTATION_SCALAR_VALUES`   | 校验不透明的登录表示                                                                   |
| `./cordis`: `Accounts`, `Logins`, `Credentials`                   | 共享 Service 定义及 `ACCOUNTS_SERVICE`、`LOGINS_SERVICE`、`CREDENTIALS_SERVICE` 服务键 |

## 示例

```ts
import assert from 'node:assert/strict'
import { parseLoginStatePresentation } from '@omne-harness-lite/account-identity'
import { isOk } from '@omne-harness-lite/identity-values'

const parsed = parseLoginStatePresentation('opaque-example')
assert.ok(isOk(parsed))
assert.equal(isOk(parseLoginStatePresentation('')), false)
```

解析只检查表示层。解析成功不表示登录已认证，也不授予租户访问权。不要输出真实的登录表示。

## 边界与生命周期

提供者须保持 [SPEC.md](SPEC.md) 所接续的账号与登录行为。账号读取可以持久记录单调过期事实。账号拥有者把凭据材料当作不透明值；凭据提供者不可用不能折成密码不匹配。

跨拥有者原子操作须使用同一 `StorageUnit`。数据库文件名相同不满足此条件。通知在提交后尽力发送。

预备的凭据变更票据归一个提供者实例，只允许一次尝试，失败也消耗票据。替换提供者不能复活票据。运行时隔离不能替代租户授权。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/account-identity run build
pnpm --filter @omne-harness-lite/account-identity run typecheck
pnpm --filter @omne-harness-lite/account-identity run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [SQL 账号提供者](../../tenancy/account-identity-sql/README.md)
- [scrypt 凭据提供者](../../tenancy/credential-verification-scrypt/README.md)
