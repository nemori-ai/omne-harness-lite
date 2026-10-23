# 使用与定位

本文件说明消费侧怎样使用本包，以及它在 Model 能力组中的位置。

## 使用方式

根入口导出两个函数，用途不同：

- `createLocalCustodian(path, factorySecret)`：在 `path` 处新建保管库；`path` 已有文件时覆盖。只用于初始化。
- `openLocalCustodian(path)`：打开已有保管库；文件缺失、损坏或含冲突行时返回 `{ kind: 'unavailable' }`，不创建文件。

```ts
import { createLocalCustodian, openLocalCustodian } from '@omne-harness/model-host-local'
import { MODEL_SEND, decodeCredentialId } from '@omne-harness/model-contract'
import { tenant } from '@omne-harness/legal-identity'

const decoded = decodeCredentialId('my-key')
if (!('ok' in decoded)) throw new Error(`credential id rejected: ${decoded.failure.reason}`)
const id = decoded.ok

const custodian = createLocalCustodian('/var/lib/omne/credentials.json', 'factory-secret')
custodian.put({ id, tenant: tenant(org, acc), purpose: MODEL_SEND }, 'tenant-secret')

// 另一个进程或同一进程稍后重开
const reopened = openLocalCustodian('/var/lib/omne/credentials.json')
if (!('kind' in reopened)) {
  reopened.resolve(
    { id, tenant: tenant(org, acc), purpose: MODEL_SEND },
    { authorized: true, official: false },
  )
}
```

Cordis 宿主用 `LocalCredentialPlugin` 装载同一保管库，配置 `{ path, factorySecret }`。装载与撤除的行为见 [Cordis 集成](cordis.md)。

### 本地发送路径

`assembleLocalModel` 把保管库接到 model 的发送边界与 pi 传输。调用方组合家族，给出 `ModelCommands` 与 `SendCoordinator`，并给出全部路由与限额。

```ts
import { assembleLocalModel, openLocalCustodian } from '@omne-harness/model-host-local'
import { composeFamilies } from '@omne-harness/pi-ai-transport'

const opened = openLocalCustodian({ path: '/var/lib/omne/credentials.json' })
if (opened.kind !== 'open') throw new Error(`vault unavailable: ${opened.cause}`)
const local = assembleLocalModel({
  credentials: opened.custodian,
  commands, // ModelCommands：本卡用内存版，耐久版由后续提供者给出
  coordinator, // SendCoordinator：与 commands 共用同一资格权威
  families: composeFamilies([openAiFamily, anthropicFamily]),
  network: { maxConnections: 4, idleConnectionTimeoutMs: 30_000, proxy },
  routes: { openrouter: { url: openRouterUrl, endMarker: '[DONE]' } },
  transportLimits,
  maxRetainedAttempts: 8,
})
// local.send 交给 createModelRuntime 的 dependencies.send
await local.close()
```

示例里的数值只说明形状，不是默认值。`local.close()` 不关闭 `commands`、`coordinator` 与保管库。

选择本包会安装 Cordis、model-cordis-contract、pi-ai-transport 与 proper-lockfile。只消费 model 或契约包的程序不需要它。

## 消费者与定位

本包是应用装配者选择的单机宿主提供者。model 的发送接缝 `deliver` 与判定不依赖它；它依赖 model 取得判定。组内位置见[组架构](../../docs/architecture.md#凭据的现有装配边界)。当前没有应用或包在源码中消费本包；本地发送路径只由本包测试消费。
