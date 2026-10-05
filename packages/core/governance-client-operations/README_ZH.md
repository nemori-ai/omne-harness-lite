# @omne-harness-lite/governance-client-operations

[English](README.md)

CLI、客户端及其他消费者共享的公共操作契约。它定义不含秘密的预备输入、分类报告及退出状态映射。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/governance-client-operations": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                             | 用途                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ActionInput`, `ActionIntent`, `ActionPreview`, `InputPrompt`, `PromptResult`    | 直接输入与分阶段秘密收集                                                                                  |
| `GovernanceClientOperations`, `GovernanceUse`, `OpenUseOutcome`                  | 单次操作与绑定身份的使用期                                                                                |
| `ActionReport`, `exitStatus`                                                     | 分类报告与 CLI 退出状态                                                                                   |
| `ClientUseUsageDefect`, `ClientCloseObservation`                                 | 使用错误与原始关闭观察                                                                                    |
| `./cordis`: `GovernanceClientOperationsService`, `GovernanceClientCloseObserver` | 共享 Service 及 `GOVERNANCE_CLIENT_OPERATIONS_SERVICE`、`GOVERNANCE_CLIENT_CLOSE_OBSERVER_SERVICE` 服务键 |
| `./schema`, `./schema/v2`                                                        | 操作／报告及预备输入 Schema                                                                               |

## 示例

```ts
import {
  exitStatus,
  type GovernanceClientOperations,
} from '@omne-harness-lite/governance-client-operations'

export async function healthAction(client: GovernanceClientOperations) {
  const report = await client.runAction({ action: 'health' })
  return { report, status: exitStatus(report) }
}
```

调用方拥有客户端寿命。须读取报告中独立的远端与本地结果；一个退出状态不能替代完整报告。

## 边界与生命周期

预备输入省略指定凭据字段，由运行时 Schema 约束精确秘密槽位。提示函数收到取消信号，但该信号不表示动作实际完成。

使用期固定身份，允许一个活跃动作。选择变更与比较后替换冲突须按契约恢复。本地选择不等于租户授权。

公共报告排除原始秘密材料。远端成功与本地安装可能不同。客户端关闭完成前须保留调用方拥有的状态与传输依赖。

不得在活跃提示函数内部等待客户端关闭，否则会形成完成依赖环。精确义务归 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/governance-client-operations run build
pnpm --filter @omne-harness-lite/governance-client-operations run typecheck
pnpm --filter @omne-harness-lite/governance-client-operations run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [本地客户端协调提供者](../../frontend/governance-client-operations-local/README.md)
