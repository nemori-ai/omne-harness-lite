# 模型请求验收应用

`@omne-harness-lite/model-request-acceptance` 提供模型请求验收中的本机真实认证、模型凭据与显式请求准备阶段。它通过各包公开 API 组合账号注册、密码校验、登录、组织成员关系、模型目录和模型副本能力，使用一个 SQLite 存储所有者和 Cordis Context。

公共根入口导出 `createAcceptanceApplication`、配置与结果类型、固定基础与完整阶段 fiber 名称。应用句柄提供 `ready`、`register`、`authenticate`、`publishCredential`、`verifyCredential`、`readOfficialProfiles`、`prepareSession`、`status` 和 `close`；存储、凭据 reader、副本所有者和服务 Context 由应用内部持有。`AcceptanceHooks` 是可信故障测试端口，不得交给租户输入控制。

启动先完成本阶段全部迁移，等待固定六个基础 fiber 和真实 clock 就绪，再确认同一存储升级 guard。确认成功后才加载目录管理和唯一模型副本所有者。默认 `authentication` 阶段在固定八个 `STAGE_FIBERS` 全部 ACTIVE 后开放准入。第二个参数显式传 `{ stage: 'requestPreparation' }` 时使用固定九个 `REQUEST_PREPARATION_FIBERS`；会话归属迁移在确认前追加，真实 `sessionTenancy` 插件在目录及 lookup 就绪后加载。每次操作重新核对所选完整集合和关闭门。启动失败通过 `AcceptanceStartupFailure` 拒绝 `ready`，其中 `cleanup` 保留未完成清理项和剩余升级 marker。确认后的启动失败保留已提交的迁移与清单事实。

认证返回真实账号、登录态和当前租户；每次凭据或准备操作重新核对该登录态和有效成员关系。可信来源回调同时提供账号、租户、reference 和 body，作用域不符时拒绝。提供者的失败值和 `stored: false` 原样可见。`close()` 停止新准入、等待在途操作、先撤除 lookup 再关闭其借用的副本，最后关闭实际存储；重复调用共享同一个关闭 Promise。

此阶段不发送模型 HTTP 请求，也不提供完整 Session/Inbound 产品、模型 runtime 十三操作 API、Agent Loop、OAuth、资产注册表或完整 credential custodian。示例的空清单是明确的验收输入，不代表已经提供模型目录。诊断事件携带操作分类和关联，不包含密码、密钥材料、凭据 reference 或 body；同步诊断回调不承担耐久审计存储。

`readOfficialProfiles(actor)` 用现核租户调用真实目录，只返回 official 行，完整保留 `profile`、`updatedAt` 与 `adaptation`；确定空清单与具名提供者失败分开。`prepareSession(actor, session)` 校验共享 SessionRef 表示、先读持久归属，仅在无记录时由受限 bootstrap 入口在同一实际 storage atomic 中 seed，然后真实读回核租户，返回 `{ session, tenant }`。同租户重复保持原映射，异租户收到裁剪后的 `UniqueViolation`；归属不可读不授权 seed。默认认证阶段不准入这两个操作。seed 成功后的读若失败，已提交映射仍保留；身份现核与 seed 是分别提交。

`close()` 等待已准入的目录读、归属读与 seed 实际结束，再撤除会话 reader 和既有提供者，最后关闭存储。同一部署重开时须保持阶段与迁移前缀一致。

## 从公共 API 运行

使用 Node 24 系列的 24.18 或更新版本。传入已经存在的绝对部署目录，目录须属于当前 OS 用户且权限为 `0700`。预置匹配的 Ed25519 PKCS8/SPKI 密钥对 `activation-private.pem`/`activation-public.pem` 和 `purge-private.pem`/`purge-public.pem`，以及恰好 32 字节的 `model-key`。这五个文件须为当前用户的普通文件，权限为 `0600`。应用校验输入，不生成或替换密钥。已存在的 `db.sqlite` 同样须为当前用户的 `0600` 普通文件。

为本机示例在目录中预置仅所有者可读写的 `password` 和 `model-credential` 文件。将部署目录作为第一个参数运行以下代码一次。重复注册由提供者返回结果；另一个场景请显式选用另一个 identifier。以下 scrypt 成本、保留期、治理时长和 clock 等待策略都是可调整的明确示例配置。

```ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import { createAcceptanceApplication } from '@omne-harness-lite/model-request-acceptance'

const argument = process.argv[2]
if (argument === undefined) throw new Error('deployment directory argument required')
const directory = resolve(argument)
const ttl = parseOfferTtl(60_000)
const sourceRef = parseOpaqueIdentifier('local-readme-source', 'CredentialRef')
if (!isOk(ttl) || !isOk(sourceRef)) throw new Error('example configuration invalid')
const events: string[] = []
const app = createAcceptanceApplication(
  {
    runId: 'readme-local',
    databaseFile: join(directory, 'db.sqlite'),
    keys: {
      activationSigning: join(directory, 'activation-private.pem'),
      activationVerification: join(directory, 'activation-public.pem'),
      purgeSigning: join(directory, 'purge-private.pem'),
      purgeVerification: join(directory, 'purge-public.pem'),
      modelReplica: join(directory, 'model-key'),
    },
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: ttl.ok },
    governance: {
      invitationTtlDefault: ttl.ok,
      affiliationRequestTtlDefault: ttl.ok,
      teamCreationKeyRetention: ttl.ok,
    },
    officialManifest: { ordinal: 1, entries: [] },
    wait: { clockTimeoutMs: 15_000, pollMs: 10, monotonicNow: () => performance.now(), sleep },
  },
  {
    stage: 'requestPreparation',
    diagnostics: { record: event => events.push(`${event.event}:${event.phase}:${event.outcome}`) },
  },
)
let body: Buffer | undefined
try {
  await app.ready
  const password = (await readFile(join(directory, 'password'), 'utf8')).trimEnd()
  assert.equal(await app.register('readme-account', password), 'registered')
  const actor = await app.authenticate('readme-account', password)
  if (!('account' in actor)) throw new Error('actual authentication rejected')
  assert.deepEqual(await app.readOfficialProfiles(actor), [])
  assert.deepEqual(await app.prepareSession(actor, 'readme-session'), {
    session: 'readme-session', tenant: actor.tenant,
  })
  body = await readFile(join(directory, 'model-credential'))
  const pair = { account: actor.account, tenant: actor.tenant, sourceRef: sourceRef.ok, body }
  assert.deepEqual(await app.publishCredential(actor, async () => pair), { stored: true })
  assert.deepEqual(await app.verifyCredential(actor, body), { matches: true })
  assert.equal(app.status().diagnosticFailures, 0)
  console.log(
    JSON.stringify({ authenticated: true, stored: true, matched: true, events: events.length }),
  )
} finally {
  body?.fill(0)
  const closed = await app.close()
  assert.equal(closed.complete, true)
  assert.deepEqual(closed.unfinished, [])
}
```

调用者拥有来源回调和诊断 sink，应确保回调能终结、处理被拒绝的 Promise，并核对每个返回的拒绝结果。一般操作缺陷抛出 `AcceptanceOperationDefect`；已识别的存储缺陷保留存储错误类型，并使用裁剪后的消息。`verifyCredential` 只返回当前 body 是否匹配，在完成前清除读取的副本字节。

## 开发与验证

先构建依赖包的公开入口，再在仓库根执行：

```sh
pnpm --filter @omne-harness-lite/model-request-acceptance build
pnpm --filter @omne-harness-lite/model-request-acceptance typecheck
pnpm --filter @omne-harness-lite/model-request-acceptance test
```

测试使用真实 SQLite、Cordis fiber、scrypt、签名密钥和部署密钥文件，覆盖启动次序、受控旧次序负例、真实确认删除/fsync 故障、身份与来源拒绝、迟到写入、关闭交错、进程崩溃重开与 clock 截止失败。准备阶段还覆盖真实完整 official 行、持久租户归属、身份拒绝、提供者不可用、九 fiber 失败与关闭交错。作者证据不等于独立验收，也不关闭单独的符号权限门或整条模型请求 runtime 的交付。

采用范围为 D074/D075/D076 及 D092 精确采用的 app auth-bootstrap revision。维护者可导航到权威的[应用 realization](../../.meta_harness/design/realization/apps/model-request-acceptance/README.md)及其 verification 义务；本 README 说明如何消费实现，语义由已接受的设计输入维护。
