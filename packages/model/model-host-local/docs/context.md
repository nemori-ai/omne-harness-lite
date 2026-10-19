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

选择本包会安装 Cordis、model-cordis-contract 与 proper-lockfile。只消费 model 或契约包的程序不需要它。

## 消费者与定位

本包是应用装配者选择的单机宿主提供者。model 的发送接缝 `deliver` 与判定不依赖它；它依赖 model 取得判定。组内位置见[组架构](../../docs/architecture.md#凭据的现有装配边界)。当前没有应用或包在源码中消费本包。
