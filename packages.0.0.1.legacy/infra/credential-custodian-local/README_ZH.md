# credential-custodian-local

本包为单个账号在一台机器上的据点保管加密模型凭据副本，实施 D075 的 model-only 投影：两个受限技术动作和一个组件生命周期。采用 [CCL rev2](SPEC.md) 与 D075，验证义务见 [MCR-V1～V8](SPEC.md)。本包没有注册完整 credentialCustodian 服务，没有 OAuth/MCP 装配或清扫。通用六操作仍待其真实提供者实施。

公开根入口只有 `sealBody`、`openBody` 及其数据类型，纯计算不依赖 Cordis 或存储。`./migrations` 导出 `replicaMigrations` 两个片段：副本表/登录状态索引，以及可空 `source_ref` 增列。旧行的密文、登录归属、时间都不改变，来源只增 NULL，不从当前目录猜来源。装配经公开 `composeMigrations` 与目录片段共同迁入同一个真实 AtomicStorage；生产升级确认归存储 owner。

`./model-replica` 导出异步 `createModelReplicaCustodian(options)` 和类型。必需构造输入是同一 AtomicStorage、借用 Clock、绝对 keyFile 路径、真实目录 `createCredentialBindingReader(storage)` 闭包、同步 ReplicaDiagnostics。钥文件必须预先存在，是普通文件、32 字节、严格 `0600`；启动和每次操作均用同一句柄 stat/read 核对。缺钥即启动失败，绝不生成。构造返回前还检查副本迁移就绪。

装配构造唯一组件并拥有 close 权。可信 bootstrap 持实际登录/租户及可信 `(sourceRef,body)` 对执行 storeBoundReplica；目录 P-1r 只借 readBoundReplicaIn，在共同单元中执行。runtime 经目录取值，不直接接组件。子入口与调用点守卫不是同进程恶意代码隔离。

本体是自有非空 Uint8Array，本包不猜编码或 OpenRouter key。封存为 AES-256-GCM，nonce 12 字节，格式 `版本[1] | nonce[12] | 密文 | tag[16]`；版本 1 对应原 tenant-only，版本 2 认证 tenant/sourceRef。AAD 每段以四字节大端字节长度开头，内容为 UTF-16LE，精确保留现有不透明标识，包括单独代理码元。跨租户移动、只改来源、给旧密文贴新标签都打不开；同时取得钥和密文不在其保护范围。

下面的纯构件示例只使用公开入口：

```ts
import { randomBytes } from 'node:crypto'
import { sealBody, openBody } from '@omne-harness-lite/credential-custodian-local'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'

const tenant = unwrap(parseTenantId({ organization: 'example-org', account: 'example-account' }))
const key = randomBytes(32)
const context = { kind: 'replica', tenant, sourceRef: 'example-source' } as const
const body = Uint8Array.of(0, 255, 128, 42)
const sealed = sealBody(key, context, body, randomBytes(12))
const opened = openBody(key, context, sealed)
if ('unopenable' in opened) throw new Error('example authentication failed')
if (!opened.body.every((byte, i) => byte === body[i])) throw new Error('example body changed')
key.fill(0)
opened.body.fill(0)
```

下面的 owner 级示例收已由可信装配准备的依赖，发布来源对并关自己的组件；P-1r 已运行时，真实调用必须借装配的唯一共享实例。

```ts
import {
  createModelReplicaCustodian,
  type ModelReplicaOptions,
  type StoreBoundReplicaInput,
} from '@omne-harness-lite/credential-custodian-local/model-replica'

export async function publishOnce(options: ModelReplicaOptions, input: StoreBoundReplicaInput) {
  const owner = await createModelReplicaCustodian(options)
  try {
    return await owner.storeBoundReplica(input)
  } finally {
    await owner.close()
  }
}
```

写结果闭合为 `{stored:true,tenant}`、`{stored:false}` 或 `{failure:'invalidInput'|'custodianWithdrawn'|'unavailable'}`；仅无绑定/漂移答 false，真实 atomic 提交后才答 true。唯一/引用/缺陷异常先退出事务，再剥动态值与 cause，保持四型类别，不重试或降格。

参与读仅正常返回 `{body}` 或 `{absent:true}`，先核有效 unit 与同 storage，当前绑定/expectedRef/副本来源三者相等才开封，不取 clock。内部坏参数/单位误用抛 StorageDefect，组件关闭/钥或存储不可读抛 StorageUnavailable，必须逃出 run；caller catch 不能让污染单元提交。外层 owner 在 atomic 实际结束后才裁剪异常或把 body 交消费者。absence 与 unavailable 不混同，不回退 factory。

close 先关准入，再等自己的实际在途工作；重复调用共享同一次排空。不删钥、副本或目录绑定，不关闭借来的 storage/clock。参与方法返回不等于外层 unit 结束，外层 owner 仍负责终结。诊断只含有界阶段、结果、租户及 sourceMatch，无本体、钥、引用、密文、cause；关联、留存及 sinkFailure 的收场由装配给。清除可控临时字节不等于证明 JS/系统内存完全抹除。

P-1r 借用者在同一 atomic 单元选择并读取，下面示例等单元提交后才交结果；reader 必须来自真实共享装配。

```ts
import type {
  ReadCredentialBindingIn,
  ReadBoundReplicaIn,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'

export async function readInP1r(
  storage: AtomicStorage,
  readBinding: ReadCredentialBindingIn,
  readReplica: ReadBoundReplicaIn,
  tenant: TenantId,
) {
  return storage.atomic(async unit => {
    const selected = await readBinding(unit, tenant)
    if ('absent' in selected) return { absent: true } as const
    return readReplica(unit, tenant, selected.binding.credentialRef)
  })
}
```

在 workspace 执行 `pnpm --filter @omne-harness-lite/credential-custodian-local run build`、`run typecheck`、`run test`。本包测试使用真实临时 SQLite 文件库/钥文件与明确 reader fixture，覆盖格式迁移、篡改、文件异常、四型分类、被 catch 后真实回滚、clock 独立、同文件两连接与实际排空。真实 auth/directory/bootstrap/runtime、symbol 守卫归装配联合验证；PostgreSQL、进程崩溃/回执丢失和完整 generic/OAuth 操作尚未由本包关闭。参见 [English documentation](README.md)。
