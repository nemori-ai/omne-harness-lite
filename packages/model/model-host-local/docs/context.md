# 使用与定位

本文件说明消费侧怎样使用本包，以及它在 Model 能力组中的位置。

## 使用方式

根入口导出两个保管库函数，用途不同：

- `createLocalCustodian({ path, factorySecret })`：`path` 上没有文件时新建保管库；已有可读文件时直接采用它，不覆盖。
- `openLocalCustodian({ path })`：打开已有保管库，返回 `{ kind: 'open', custodian }`；文件缺失、损坏或含冲突行时返回 `{ kind: 'unavailable', cause }`，不创建文件。

```ts
import { createLocalCustodian, openLocalCustodian } from '@omne-harness/model-host-local'
import { MODEL_SEND, decodeCredentialId } from '@omne-harness/model-contract'
import { tenant } from '@omne-harness/legal-identity'

const decoded = decodeCredentialId('my-key')
if (!('ok' in decoded)) throw new Error(`credential id rejected: ${decoded.failure.reason}`)
const id = decoded.ok

const custodian = createLocalCustodian({
  path: '/var/lib/omne/credentials.json',
  factorySecret: 'factory-secret',
})
custodian.put({ id, tenant: tenant(org, acc), purpose: MODEL_SEND }, 'tenant-secret')

// 另一个进程或同一进程稍后重开
const reopened = openLocalCustodian({ path: '/var/lib/omne/credentials.json' })
if (reopened.kind === 'open') {
  reopened.custodian.resolve(
    { id, tenant: tenant(org, acc), purpose: MODEL_SEND },
    { authorized: true, official: false },
  )
}
```

Cordis 宿主用 `LocalCredentialPlugin` 装载同一保管库，配置 `{ path, factorySecret }`。装载与撤除的行为见 [Cordis 集成](cordis.md)。

### 本地发送路径

`assembleLocalModel` 把保管库接到 model 的发送边界与 pi 传输，并在同一组家族与 `ModelCommands` 上给出计量准备资源。调用方组合家族（含计量余量），给出 `ModelCommands` 与 `SendCoordinator`，并给出全部路由、限额与准备选项。

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
  preparation: { maxCitedCalls: 64, supplierOf }, // supplierOf：为档案供应商补上凭据引用
})
// local.send 交给 createModelRuntime 的 dependencies.send
const lease = await local.preparation.acquire({ ...access, profile, lineage }) // lineage 可省略
// 用 lease.bindings 的 rules.plan 与 meter.measure 计量，结束后 await lease.release()
await local.close()
```

示例里的数值只说明形状，不是默认值。`local.close()` 不关闭 `commands`、`coordinator`、家族与保管库，也不改变 `local.preparation`。

选择本包会安装 Cordis、model-cordis-contract、pi-ai-transport 与 proper-lockfile。只消费 model 或契约包的程序不需要它。

## 消费者与定位

本包是应用装配者选择的单机宿主提供者。model 的发送接缝 `deliver` 与判定不依赖它；它依赖 model 取得判定。组内位置见[组架构](../../docs/architecture.md#凭据的现有装配边界)。当前没有应用或包在源码中消费本包；本地发送路径只由本包测试消费。
