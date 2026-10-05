# @omne-harness-lite/account-registration

[English](README.md)

注册与未激活到期清除的公共契约。本包定义结果与 Cordis 服务绑定，由独立提供者协调参与方。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/account-registration": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                      | 用途                                  |
| ------------------------------------------------------------------------- | ------------------------------------- |
| `RegistrationService`                                                     | `register` 与 `purgeExpired` 消费接口 |
| `TERMINAL_OUTCOMES`, `TerminalOutcome`                                    | 已注册、标识被占用、凭据被拒绝或中断  |
| `PurgeExpiredResult`, `PURGE_FAILURE_CLASSES`, `RegistrationDefectRecord` | 清除结果分类与缺陷记录                |
| `RegistrationStopped`                                                     | 清除动作在步骤之间停止                |
| `./cordis`: `Registration`, `REGISTRATION_SERVICE`                        | 公共 Service 定义及服务键             |

## 示例

```ts
import type { RegistrationService } from '@omne-harness-lite/account-registration'

export async function registerAccount(
  service: RegistrationService,
  loginIdentifier: unknown,
  credential: unknown,
) {
  return service.register(loginIdentifier, credential)
}
```

调用方提供存活的提供者，并保留四种终态结果。不得把出示凭据写进日志或报告。

## 边界与生命周期

注册包含账号产生、个人组织创建、账号激活三次独立提交，不承诺单次事务或自动补偿。

停止会阻止下一步，不会取消已交给参与方的工作。注册报告中断；清除在规定的停止边界使用 `RegistrationStopped`。

本定义不调度后台清除。提供者及调用方须保留依赖，直到已准入工作完成。精确行为归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/account-registration run build
pnpm --filter @omne-harness-lite/account-registration run typecheck
pnpm --filter @omne-harness-lite/account-registration run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [顺序注册提供者](../../tenancy/account-registration-sequential/README.md)
