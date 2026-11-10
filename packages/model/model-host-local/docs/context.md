# 使用与定位

本文件说明消费侧怎样使用本包，以及它在 Model 能力组中的位置。

## 使用方式

根入口导出 `createSecretCredentialPort`。它在设置域的秘密保管之上建 model-contract 的 `CredentialPort`，只读不写：

- `custody` 是秘密保管的读面 `describe` 与使用面 `use`，例如 settings-local 的保管库。
- `providers` 按供应商名给出它声明的凭据项、发行是否持有它，以及一项在一个层的绑定键 `keyOf(scope, item)`。装配从供应商资产取得前两项，绑定键的形状归装配。

```ts
import { createSecretCredentialPort } from '@omne-harness/model-host-local'
import { decodeProviderName } from '@omne-harness/model-contract'
import { MODEL_SEND } from '@omne-harness/model-contract/provider'

const named = decodeProviderName('openrouter')
if (!('ok' in named)) throw new Error(`provider name rejected: ${named.failure.reason}`)
const openrouter = named.ok

const credentials = createSecretCredentialPort({
  custody: vault, // settings-local 的保管库，或另一个秘密保管提供者
  providers: new Map([[openrouter, { items: ['apiKey'], official: true, keyOf }]]),
})
const layer = credentials.layerOf({ provider: openrouter, official: true, access })
if ('ok' in layer) {
  const secrets = credentials.resolve({ provider: openrouter, layer: layer.ok, purpose: MODEL_SEND, access })
  // secrets.ok 是项到秘密的映射，例如 apiKey
}
```

Cordis 宿主用 `./cordis` 的 `serveModelCredential(ctx, port)` 把同一端口提供为 `modelCredential`。行为见 [Cordis 集成](cordis.md)。

### 宿主上的密钥

模型供应商的凭据是其资产的秘密设置项。部署密钥是官方层，由人在每台要发真实请求的宿主上经 `harness-server setup` 写入一次，命令从关闭回显的终端读密钥。租户用 `omne setting set openrouter apiKey` 设置自己的密钥。路径规则、失败原因表与权限做法见 [settings-local 的秘密保管](../../../assets/settings-local/SPEC.md#secret-custody)。运行责任在持有密钥的人，agent 不取密钥值。

### 本地发送路径

`assembleLocalModel` 把凭据端口接到 model 的发送边界与 pi 传输，并在同一组家族与 `ModelCommands` 上给出计量准备资源。调用方组合家族（含计量余量），给出 `ModelCommands` 与 `SendCoordinator`，并给出全部路由、限额、物化与准备选项。

下例的 `channel` 由入口从同次 records 激活的 `initial.openHost` 取得。命令、协调器和当前 execution 核验均取自这个真实通道，不能用恒成功函数代替核验。入口取得通道及关闭责任见[首次执行与公共观察接线](../SPEC.md#首次执行与公共观察接线)。

```ts
import { assembleLocalModel } from '@omne-harness/model-host-local'
import { composeFamilies } from '@omne-harness/pi-ai-transport'

if (channel.coordinator === null) throw new Error('send coordinator unavailable')
const local = assembleLocalModel({
  credentials, // 上例的凭据端口
  commands: channel.commands,
  coordinator: channel.coordinator,
  families: composeFamilies([openAiFamily, anthropicFamily]),
  network: { maxConnections: 4, idleConnectionTimeoutMs: 30_000, proxy },
  routes: { openrouter: { url: openRouterUrl, endMarker: '[DONE]', auth: { kind: 'bearer', item: 'apiKey' } } },
  transportLimits,
  maxRetainedAttempts: 8,
  materialization: { maxRecords: 8, execution: channel.qualifyExecution },
  preparation: { maxCitedCalls: 64, supplierOf }, // supplierOf：为档案供应商补上供应商与是否官方
})
// local.send 交给 createModelRuntime 的 dependencies.send
const lease = await local.preparation.acquire({ ...access, profile, lineage }) // lineage 可省略
// 用 lease.bindings 的 rules.plan 与 meter.measure 计量，结束后 await lease.release()
await local.close()
```

示例里的数值只说明形状，不是生产默认值。`materialization.maxRecords` 必须是正安全整数，且不小于 `maxRetainedAttempts`。`local.materialization` 是真实成功产出处所建的只读证据 reader，入口证据适配器使用它验真；描述摘要或同形回执本身不证明来源。发送阶段插件可通过 `installMaterialization` 安装这个 reader，见[发送资源](../SPEC.md#发送资源)。

`local.close()` 不关闭 `commands`、`coordinator`、家族与凭据端口背后的保管。`close()` 开始后，`local.preparation.acquire` 返回 `unavailable`（`model-host-local`，`assembly-closed`）。关闭前取得的租约仍可计量，调用方照常调用 `release`。

选择本包会安装 Cordis、model-cordis-contract 与 pi-ai-transport。只消费 model 或契约包的程序不需要它。

## 消费者与定位

本包是应用装配者选择的单机宿主提供者。model 的发送边界不依赖它；它依赖 model 取得发送边界。组内位置见[组架构](../../docs/architecture.md#凭据的现有装配边界)。当前没有应用或包在源码中消费本包；本地发送路径只由本包测试消费。
