# @omne-harness-lite/governance-client-operations-local

[English](README.md)

公共治理操作的本地协调者。它组合客户端状态与传输，并分别保留远端效果与本地落定结果。

公开形状归 [src/index.ts](src/index.ts)，行为与集成承诺归 [SPEC.md](SPEC.md)。

## 工作区使用

这是实验性的私有 ESM 工作区包，尚未发布到 npm。先按[开发指南](../../../docs/development.md)准备环境，在消费成员中声明 `"@omne-harness-lite/governance-client-operations-local": "workspace:*"`。示例导入的其他工作区包也须声明为直接依赖。通过公开导出消费，不穿透兄弟包的 `src/`。

## 公开 API

| 导出                                                                                      | 用途                                   |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| `createGovernanceClient`, `CreateGovernanceClientOptions`                                 | 用公共状态与传输依赖创建客户端         |
| 返回的 `GovernanceClientOperations`                                                       | 操作、预备提示、绑定身份的使用期及关闭 |
| `./cordis`: `governanceClientOperationsPlugin`, `managedGovernanceClientOperationsPlugin` | 独立与装配管理绑定                     |

## 示例

```ts
import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import type { GovernanceTransport } from '@omne-harness-lite/governance-center-entry-https-json'
import { exitStatus } from '@omne-harness-lite/governance-client-operations'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'

export async function runHealth(state: ClientLocalState, transport: GovernanceTransport) {
  const client = createGovernanceClient({ state, transport })
  try {
    const report = await client.runAction({ action: 'health' })
    return { report, status: exitStatus(report) }
  } finally {
    await client.close()
  }
}
```

调用方提供已配置的状态及存活传输。客户端关闭会等待自己的工作，调用方须保留借入依赖并在其后关闭。

## 边界与生命周期

操作类型、Schema、报告与退出映射归[公共操作包](../../core/governance-client-operations/README.md)。本提供者不渲染 CLI 或终端 UI。

一个使用期固定其来源身份，允许一个活跃动作。选择变更、远端成功、本地冲突与安装未确认须保持区分。读取副本保留身份与租户范围。

预备提示使用精确秘密槽位。取消不能在实际完成前释放依赖；不得在活跃提示内部等待客户端关闭。报告排除原始凭据。详见 [SPEC.md](SPEC.md)。

## 开发验证

```sh
pnpm --filter @omne-harness-lite/governance-client-operations-local run build
pnpm --filter @omne-harness-lite/governance-client-operations-local run typecheck
pnpm --filter @omne-harness-lite/governance-client-operations-local run test
```

先构建工作区依赖。这些命令只覆盖本包；真实提供者与消费者的行为还须通过集成验证。

## 相关包

- [SQLite 状态提供者](../client-local-state-sqlite/README.md)
- [HTTPS 传输提供者](../governance-center-client-https/README.md)
