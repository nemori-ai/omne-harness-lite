# Model 实现的消费与构造

本包面向选择默认领域算法的独立程序及运行宿主，凭据切片已有实现，托管运行工厂尚未实现。普通调用者消费 [model-contract](../../model-contract/docs/context.md) 并取得注入的操作能力，不必安装本实现。

独立程序以固定请求、显式传输和 signal 调用 executeModel。宿主将 Commands、发送围栏、重试策略、实例宿主和时钟注入 createModelRuntime，并显式传入配置。精确构造形状归 [public-api](public-api.md)，独立执行及配置行为归 [SPEC](../SPEC.md)。

model 的生产安装不得带入 Cordis 或固定单机存储，也不自动安装全部厂商或 tokenizer。当前凭据切片尚未满足此要求，其类型、服务定义、本地存储与插件按[组架构](../../docs/architecture.md#凭据切片的现有装配边界)迁到对应成员。应用选择适配器并拥有资源；单机框架装配设计暂见 [cordis](cordis.md)，model-host-local 尚未初始化。

以下本地保管示例说明当前源码入口。迁移后，本地工厂由 model-host-local 根入口发布，凭据值由 model-contract 发布。选择本地宿主会安装其 Cordis 与文件锁依赖，但直接使用本地工厂不启动 Cordis；纯领域实现消费者不必选择该宿主。

## 独立消费入口

根入口导出两个管理函数，用途不同：

- `createLocalCustodian(path, factorySecret)`：在 `path` 处新建本地保管库。如果 `path` 已存在文件，它会覆盖该文件。只用于初始化。
- `openLocalCustodian(path)`：按 `path` 打开已有保管库。文件缺失、损坏或含冲突行时返回 `{ kind: 'unavailable' }`，不会创建文件。

```ts
import { createLocalCustodian, openLocalCustodian } from '@omne-harness/model'
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
  const decision = reopened.resolve({ id, tenant: tenant(org, acc), purpose: MODEL_SEND }, { authorized: true, official: false })
}
```

`present` 和 `resolve` 每次从磁盘读取当前状态，因此保留的句柄和已注入的 Cordis 服务都能观察到后续轮换、撤销或损坏。管理操作写盘前也会先刷新，持有文件锁完成“读当前状态—修改—发布”；文件锁不按时间过期，持锁进程崩溃后需手工清理 `${path}.lock`。写入采用唯一临时文件 + `fsync` + 重命名的方式原子写入。发布前失败时抛出异常，不发布新状态，原快照保持不变；重命名成功后的确认失败（如父目录 `fsync`）可能已发布新状态，异常提示 `confirmation incomplete; verify state before retry`，调用方需先核实文件状态。
