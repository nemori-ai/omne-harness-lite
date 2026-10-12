# @omne-harness-lite/account-registration-sequential

[English](README.md)

顺序注册提供者，协调账号创建、个人组织创建与激活，并公开未激活到期清除链。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/account-registration-sequential": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                    | 用途                             |
| ----------------------------------------------------------------------- | -------------------------------- |
| `createRegistrationService`, `RegistrationDeps`, `RegistrationInstance` | 具有注册、清除与关闭的独立协调者 |
| `AccountRegistrationConfigSchema`                                       | Cordis 配置校验                  |
| `./cordis`: `registrationPlugin`, `managedRegistrationPlugin`           | 独立与装配管理绑定               |

## 示例

```ts
import {
  createRegistrationService,
  type RegistrationDeps,
} from '@omne-harness-lite/account-registration-sequential'

export async function registerAccount(
  dependencies: RegistrationDeps,
  loginIdentifier: unknown,
  credential: unknown,
) {
  const registration = createRegistrationService(dependencies)
  try {
    return await registration.register(loginIdentifier, credential)
  } finally {
    await registration.close()
  }
}
```

须提供公共参与方服务、有效激活签名密钥、本代状态回调及安全的缺陷记录器，不得记录出示凭据。

## 边界与生命周期

动作链执行三次分立提交，不开启共享事务、不补偿之前的提交，也不调度后台恢复。幂等性与凭证所有权遵循[公共契约](../../core/account-registration/SPEC.md)。

协调者在进入每个下一步前检查本代资格。关闭会阻止新工作并等待当前参与方调用，不取消已交出的步骤，也不关闭借入服务。

清除区分终态、缺陷与暂态失败，未预期异常继续传播。管理绑定使用装配 lifetime 端口。精确停止与结果行为归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/account-registration-sequential run build
pnpm --filter @omne-harness-lite/account-registration-sequential run typecheck
pnpm --filter @omne-harness-lite/account-registration-sequential run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [注册定义](../../core/account-registration/README.md)
- [账号提供者](../account-identity-sql/README.md)
