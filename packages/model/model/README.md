本成员已按 RFC-0003 初始化。凭据引用、存在性查询、解析和本地保管库从根入口导出。`source` 条件指向本包源码。发布时去掉它。其余行为仍以 SPEC 为准。凭据引用与解析切片已由 D-04 接受并写入 SPEC。

# model 文档目标

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。其余候选、生产实现及运行验证的状态分别保留。

## 责任与使用

本成员沿[SPEC](SPEC.md)承担完整行为。凭据的独立消费走根入口，不要求启动 Cordis。系统集成走 `src/cordis.ts` 的 `modelCredential`。档案选择、结果保管和费用的公开形状仍待设计。

### 独立消费入口

根入口导出两个管理函数，用途不同：

- `createLocalCustodian(path, factorySecret)`：在 `path` 处新建本地保管库。如果 `path` 已存在文件，它会覆盖该文件。只用于初始化。
- `openLocalCustodian(path)`：按 `path` 打开已有保管库。文件缺失、损坏或含冲突行时返回 `{ kind: 'unavailable' }`，不会创建文件。

```ts
import { createLocalCustodian, openLocalCustodian, credentialId, MODEL_SEND } from '@omne-harness/model'
import { tenant } from '@omne-harness/legal-identity'

const custodian = createLocalCustodian('/var/lib/omne/credentials.json', 'factory-secret')
custodian.put({ id: credentialId('my-key')!, tenant: tenant(org, acc), purpose: MODEL_SEND }, 'tenant-secret')

// 另一个进程或同一进程稍后重开
const reopened = openLocalCustodian('/var/lib/omne/credentials.json')
if (!('kind' in reopened)) {
  const decision = reopened.resolve({ id: credentialId('my-key')!, tenant: tenant(org, acc), purpose: MODEL_SEND }, { authorized: true, official: false })
}
```

`present` 和 `resolve` 每次从磁盘读取当前状态，因此保留的句柄和已注入的 Cordis 服务都能观察到后续轮换、撤销或损坏。管理操作写盘前也会先刷新，持有文件锁完成“读当前状态—修改—发布”；文件锁不按时间过期，持锁进程崩溃后需手工清理 `${path}.lock`。写入采用唯一临时文件 + `fsync` + 重命名的方式原子写入。发布前失败时抛出异常，不发布新状态，原快照保持不变；重命名成功后的确认失败（如父目录 `fsync`）可能已发布新状态，异常提示 `confirmation incomplete; verify state before retry`，调用方需先核实文件状态。

## 契约与设计

- [行为入口](SPEC.md)与原专题共同保持完整承诺。
- [抽象与建模](docs/model.md)、[Cordis 接缝](docs/cordis.md)、[包内架构](docs/architecture.md)、[关键流程](docs/key-flow.md) 是本包 `docs/` 的四块。
- [档案与模态](docs/profile-and-modality.md) 和 [消费与费用](docs/consumption-and-cost.md) 保持行为正文。未闭合项见 [open-questions](docs/open-questions.md)。
- [原具名专题 profile-and-modality.md](docs/profile-and-modality.md)保持唯一行为正文。
- [原具名专题 consumption-and-cost.md](docs/consumption-and-cost.md)保持唯一行为正文。

## 验证与维护

SPEC及专题维护持续验证义务。凭据解析有成员测试。模型执行器、真实提供者和完整装配仍缺。修改时同步公开消费者和组导航。未决按[产品第四块](../../../.meta_harness/design/product/model-invocation/design.md#未决问题与待定事项)及技术拥有者闭合。
默认测试责任是单元和契约。`tests/credential.spec.ts` 覆盖解析、拒绝、轮换、重启和 Cordis 关闭。`tests/public-entry.spec.ts` 从包名核对根入口导出。
