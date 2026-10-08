import { governanceCenterEntryPlugin, governanceCenterOpsPlugin } from '../../src/cordis.ts'
// 真实组合夹具：真实 Cordis Context 里装 credential-verification、account-identity、organization-governance、
// account-registration 四个真实参与方，再装本包两个插件；存储是真实 storage-sql（临时 sqlite 文件），
// 迁移用 `composeMigrations` 把 AI、OG、本包三家的片段合成，带 `migrations` 一律 `upgrade: false`。
// - 基础部分（存储宿主、钟、四个参与方）经 kernel-basis 的 `bootAssembly` 装载；日志导出器装好之后再装本包两个插件，
//   这样启动失败时的日志也被收下（T-11 要在全部输出里搜）。
// - 存储由一个单独的宿主插件 provide，测试可以撤掉它再装回（storage 换代演练，T-18）。
// - 钟是服从 offer-expiry `Clock` 形状的包内替身：可前推、可答 'unavailable'、可按调用次序给脚本里的值，记下每一次读。
// - 故障：`FaultyStorage` 包在真实存储外面——整体不可用、下一次写在开始前失败、下一次写在提交前失败（回滚）、
//   下一次写停在提交前等放行。
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format, inspect } from 'node:util'
import { type Context, type Fiber, type Message, type Plugin } from '@deepseek-ai/cordis'
import {
  ACCOUNT_ID_COLUMN,
  ACCOUNT_TABLE,
  accountIdentityMigrations,
} from '@omne-harness-lite/account-identity-sql'
import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { type LoginsService } from '@omne-harness-lite/account-identity'
import { accountIdentityPlugin } from '@omne-harness-lite/account-identity-sql/cordis'
import { registrationPlugin } from '@omne-harness-lite/account-registration-sequential/cordis'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification-scrypt/cordis'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { type Assembly, bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { organizationGovernanceMigrations } from '@omne-harness-lite/organization-governance-sql'
import { organizationGovernancePlugin } from '@omne-harness-lite/organization-governance-sql/cordis'
import {
  type ReadTx,
  type Storage,
  type AtomicStorage,
  type StorageUnit,
  StorageDefect,
  StorageUnavailable,
  type WriteTx,
  composeMigrations,
} from '@omne-harness-lite/storage'
import { type SqlStorage, openStorage, createUpgradeGuard } from '@omne-harness-lite/storage-sql'
import {
  type GovernanceCenterEntryConfig,
  type GovernanceCenterOpsConfig,
  governanceCenterMigrations,
  governanceCenterSnapshotCheck,
} from '../../src/index.ts'
import {
  DEFECT_EVENT,
  LISTENING_EVENT,
  SERVING_EVENT,
  STOPPED_EVENT,
  type ServingNotice,
} from '@omne-harness-lite/governance-center-entry'
import { EntryMaintenance } from '@omne-harness-lite/governance-center-entry/cordis'

class TestMaintenance extends EntryMaintenance {
  readonly snapshotChecks = [governanceCenterSnapshotCheck]
  closed = (): void => {}
}
import {
  type Exchange,
  TLS_FIXTURES,
  type TlsClientOptions,
  freePort,
  httpRequest,
  tlsExchange,
  unixExchange,
  type ClientOptions,
} from './wire.ts'

export const START = Date.UTC(2026, 8, 23, 8, 0, 0)
export const PASSWORD = 'correct horse battery'
export const VERSION = '0.1.0'
export const OWNER_ACCOUNT_FK = 'organization_owner_account_fk'
export const DEPLOYMENT_PARAMETERS = {
  unactivatedRetention: 604800000,
  invitationTtlDefault: 1209600000,
  affiliationRequestTtlDefault: 1209600000,
  copyNoticeTtlDefault: 604800000,
  sharingInvitationTtlDefault: 604800000,
} as const
export const FAST_CREDENTIALS = {
  cost: 1024,
  blockSize: 8,
  parallelization: 1,
  saltBytes: 16,
  keyBytes: 32,
}

export const OPS_HEALTH = '{"opsVersion":"1","operation":"full-health","payload":{}}'

export function tempDirectory(label: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `omne-gce-${label}-`)))
}

export function tempSqliteFile(label: string): string {
  return join(tempDirectory(label), 'db.sqlite')
}

/** 三家片段合成一份迁移：AI 在前（OG 外键的目标先存在），OG 的外键目标从 AI 常量取，本包在后。 */
export function composedMigrations() {
  return composeMigrations([
    ...accountIdentityMigrations,
    ...organizationGovernanceMigrations({
      ownerAccountReference: { table: ACCOUNT_TABLE, column: ACCOUNT_ID_COLUMN },
      ownerAccountForeignKey: OWNER_ACCOUNT_FK,
    }),
    ...governanceCenterMigrations,
  ])
}

// ---- 钟 ----

export interface ClockRead {
  readonly value: number | 'unavailable'
  readonly label: string
}

export class ScriptedClock {
  current = START
  unavailable = false
  /** 先按次序消费这里的值，空了才看 `unavailable`／`current`。 */
  readonly script: (number | 'unavailable')[] = []
  readonly reads: ClockRead[] = []
  /** 记在每一次读上的标签：测试据它区分「插件体里那次」与「开门那一刻那次」。 */
  label = ''
  /** 每读一次自动前推的毫秒数（让相继的读各得不同时刻）。 */
  step = 0

  now(): number | 'unavailable' {
    const scripted = this.script.shift()
    let value: number | 'unavailable'
    if (scripted !== undefined) value = scripted
    else if (this.unavailable) value = 'unavailable'
    else {
      value = this.current
      this.current += this.step
    }
    this.reads.push({ value, label: this.label })
    return value
  }

  advance(ms: number): void {
    this.current += ms
  }
}

// ---- 等待点 ----

export interface Gate {
  readonly reached: Promise<void>
  readonly wait: () => Promise<void>
  readonly release: () => void
}

export function gate(): Gate {
  let release: () => void = () => undefined
  let reach: () => void = () => undefined
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  const reached = new Promise<void>(resolve => {
    reach = resolve
  })
  return {
    reached,
    wait: async () => {
      reach()
      await released
    },
    release,
  }
}

export interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

export function deferred<T = void>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ---- 故障存储 ----

/** 包在真实存储外面；故障以 `StorageUnavailable` 到达参与方，与真实的「存储不可用」走同一条映射。 */
export class FaultyStorage implements AtomicStorage {
  /** 整体不可用：每一次 read／write 在开始前失败。 */
  down = false
  reads = 0
  writes = 0
  #failNextWrite = false
  #failNextCommit = false
  readonly #pauseBeforeCommit: Gate[] = []

  constructor(readonly inner: SqlStorage) {}
  get maintenance() {
    return this.inner.maintenance
  }

  /** 下一次写事务在开始前失败（锁与读都没发生）。 */
  failNextWrite(): void {
    this.#failNextWrite = true
  }

  /** 下一次写事务：函数跑完之后回滚（提交失败）。 */
  failNextCommit(): void {
    this.#failNextCommit = true
  }

  /** 下一次写事务：函数跑完、提交之前停住，直到放行。 */
  pauseNextCommit(): Gate {
    const g = gate()
    this.#pauseBeforeCommit.push(g)
    return g
  }

  async atomic<T>(fn: (unit: StorageUnit) => Promise<T>): Promise<T> {
    this.writes += 1
    if (this.down) throw new StorageUnavailable('injected: storage down')
    if (this.#failNextWrite) {
      this.#failNextWrite = false
      throw new StorageUnavailable('injected: write failed before it began')
    }
    const failCommit = this.#failNextCommit
    this.#failNextCommit = false
    const pause = this.#pauseBeforeCommit.shift()
    return this.inner.atomic(async unit => {
      const wrapped: StorageUnit = {
        assertStorage: expected => {
          if (expected !== this) throw new StorageDefect('faulty storage mismatch')
          unit.assertStorage(this.inner)
        },
        run: callback => unit.run(callback),
        query: callback => unit.query(callback),
        mutate: callback => unit.mutate(callback),
        observeCompletion: () => unit.observeCompletion(),
        afterCommit: callback => unit.afterCommit(callback),
      }
      const value = await fn(wrapped)
      if (pause !== undefined) await pause.wait()
      if (failCommit) throw new StorageUnavailable('injected: commit failed')
      return value
    })
  }

  async read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    this.reads += 1
    if (this.down) throw new StorageUnavailable('injected: storage down')
    return this.inner.read(fn)
  }

  async write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    this.writes += 1
    if (this.down) throw new StorageUnavailable('injected: storage down')
    if (this.#failNextWrite) {
      this.#failNextWrite = false
      throw new StorageUnavailable('injected: write failed before it began')
    }
    const failCommit = this.#failNextCommit
    this.#failNextCommit = false
    const pause = this.#pauseBeforeCommit.shift()
    return this.inner.write(async tx => {
      const value = await fn(tx)
      if (pause !== undefined) await pause.wait()
      if (failCommit) throw new StorageUnavailable('injected: commit failed')
      return value
    })
  }
}

// ---- 日志 ----

/** 一条导出的日志消息按 printf 展开成文本，另附参数的完整展开（搜秘密时两者都搜）。 */
export function renderMessage(message: Message): string {
  const [first, ...rest] = message.args
  return `${message.name} ${message.type} ${format(first, ...rest)} ${inspect(message.args, { depth: null })}`
}

// ---- 中心 ----

export interface CenterOptions {
  readonly label?: string
  /** 打开一份已有的库文件（重启）；缺省新建。 */
  readonly file?: string
  readonly port?: number
  readonly socketDirectory?: string
  readonly clock?: ScriptedClock
  readonly withOps?: boolean
  readonly opsFirst?: boolean
  readonly drainTimeoutMs?: number
  readonly clockReadyTimeoutMs?: number
  /** 覆盖入口层 config 的若干项（T-14 的坏 config）。 */
  readonly entryConfig?: Partial<Record<keyof GovernanceCenterEntryConfig, unknown>>
  readonly opsConfig?: Partial<Record<keyof GovernanceCenterOpsConfig, unknown>>
  /** 不在 boot 里装本包插件（测试自己装）。 */
  readonly skipCenterPlugins?: boolean
}

export interface Center {
  readonly file: string
  readonly raw: SqlStorage
  readonly storage: FaultyStorage
  readonly clock: ScriptedClock
  readonly ctx: Context
  readonly base: Assembly
  readonly port: number
  readonly socketDirectory: string
  readonly socketPath: string
  readonly openSignal: Deferred<void>
  readonly entryConfig: Record<string, unknown>
  readonly opsConfig: Record<string, unknown>
  /** 两把部署签名私钥（激活、清除）：T-11 在全部输出里搜它们。 */
  readonly deploymentSecrets: readonly string[]
  readonly serving: ServingNotice[]
  readonly events: { stopped: number; defect: number; listening: number }
  readonly messages: Message[]
  entryFiber: Fiber | undefined
  opsFiber: Fiber | undefined
  /** 兑现 openSignal 并等到 `serving`。 */
  open(): Promise<ServingNotice>
  loadEntry(config?: Record<string, unknown>): Promise<Fiber>
  loadOps(config?: Record<string, unknown>): Promise<Fiber>
  /** 撤掉存储宿主插件、再装回（同一个 FaultyStorage）。 */
  unloadStorage(): Promise<void>
  reloadStorage(): Promise<void>
  logins(): LoginsService
  tls(
    request: Buffer,
    options?: TlsClientOptions,
  ): Promise<Exchange & { readonly handshake: boolean }>
  /** 发一个信封（POST /，Content-Length 成帧）。 */
  call(envelope: Record<string, unknown>): Promise<Buffer>
  ops(request?: Buffer, options?: ClientOptions): Promise<Exchange>
  /** 全部日志的渲染文本。 */
  logText(): string
  dispose(): Promise<void>
}

const storageHost = (storage: Storage): Plugin.Object => ({
  name: 'test-storage-host',
  apply(ctx: Context) {
    ctx.provide('storage', storage)
  },
})

/** 装一个插件并等它 settle；PENDING 即抛出（与 bootAssembly 同一判断）。 */
export async function loadPlugin(ctx: Context, plugin: Plugin, config: unknown): Promise<Fiber> {
  const fiber = ctx.plugin(plugin as Plugin.Object, config as never)
  if ((fiber.state as number) === FIBER_STATE.PENDING) {
    await fiber.dispose()
    throw new Error(
      `plugin "${String(plugin.name)}" is PENDING: a required service is not provided`,
    )
  }
  await fiber
  return fiber
}

export async function bootCenter(options: CenterOptions = {}): Promise<Center> {
  const file = options.file ?? tempSqliteFile(options.label ?? 'center')
  const backupDirectory = tempDirectory('backups')
  const guard = createUpgradeGuard()
  const raw = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: composedMigrations(),
    upgrade: { guard, checks: [] },
    maintenance: { workDirectory: join(backupDirectory, '.quarantine'), onClosed() {} },
  })
  await guard.confirm()
  const storage = new FaultyStorage(raw)
  const clock = options.clock ?? new ScriptedClock()
  const activation = generateHandoffKeyPair()
  const purge = generateHandoffKeyPair()
  let base: Assembly
  try {
    base = await bootAssembly({
      services: [{ name: 'clock', value: clock }],
      plugins: [
        { plugin: storageHost(storage) },
        { plugin: credentialsPlugin, config: FAST_CREDENTIALS },
        {
          plugin: accountIdentityPlugin,
          config: {
            credentialPolicy: { minLength: 8 },
            unactivatedRetention: DEPLOYMENT_PARAMETERS.unactivatedRetention,
            activationVerificationKeyPem: activation.publicKeyPem,
            purgeVerificationKeyPem: purge.publicKeyPem,
          },
        },
        {
          plugin: organizationGovernancePlugin,
          config: {
            invitationTtlDefault: DEPLOYMENT_PARAMETERS.invitationTtlDefault,
            affiliationRequestTtlDefault: DEPLOYMENT_PARAMETERS.affiliationRequestTtlDefault,
            teamCreationKeyRetention: 86_400_000,
            purgeSigningKeyPem: purge.privateKeyPem,
          },
        },
        {
          plugin: registrationPlugin,
          config: { activationSigningKeyPem: activation.privateKeyPem },
        },
      ],
    })
  } catch (error) {
    await raw.close()
    throw error
  }
  const ctx = base.ctx
  const messages: Message[] = []
  ctx.logger.exporter({ levels: { default: 3 }, export: message => messages.push(message) })
  const serving: ServingNotice[] = []
  const events = { stopped: 0, defect: 0, listening: 0 }
  ctx.on(SERVING_EVENT, notice => {
    serving.push(notice)
  })
  ctx.on(STOPPED_EVENT, () => {
    events.stopped += 1
  })
  ctx.on(DEFECT_EVENT, () => {
    events.defect += 1
  })
  ctx.on(LISTENING_EVENT, () => {
    events.listening += 1
  })

  const port = options.port ?? (await freePort())
  const socketDirectory = options.socketDirectory ?? tempDirectory('ops')
  const openSignal = deferred<void>()
  let confirmed = false
  void openSignal.promise.then(
    () => {
      confirmed = true
    },
    () => undefined,
  )
  const openingFiber = await ctx.plugin(inner => {
    inner.provide('entryOpening', { wait: () => openSignal.promise, isOpen: () => confirmed })
  })
  const maintenanceFiber = await ctx.plugin(inner => {
    new TestMaintenance(inner)
  })
  const entryConfig: Record<string, unknown> = {
    listen: { host: '127.0.0.1', port },
    tls: { certificateChainPem: TLS_FIXTURES.chainPem, privateKeyPem: TLS_FIXTURES.leafKeyPem },
    version: VERSION,
    drainTimeoutMs: options.drainTimeoutMs ?? 2_000,
    clockReadyTimeoutMs: options.clockReadyTimeoutMs ?? 1_000,
    ...options.entryConfig,
  }
  const opsConfig: Record<string, unknown> = {
    socketDirectory,
    deploymentKey: { present: true, complete: true },
    deploymentParameters: { ...DEPLOYMENT_PARAMETERS },
    maintenance: {
      backupDirectory,
      sourceBuildId: null,
      migrationNames: Object.keys(await composedMigrations().getMigrations()),
    },
    ...options.opsConfig,
  }
  let storageFiber: Fiber | undefined = base.fibers[1]
  const extra: Fiber[] = [openingFiber, maintenanceFiber]

  const center: Center = {
    file,
    raw,
    storage,
    clock,
    ctx,
    base,
    port,
    socketDirectory,
    socketPath: join(socketDirectory, 'governance-center-ops.sock'),
    openSignal,
    entryConfig,
    opsConfig,
    deploymentSecrets: [activation.privateKeyPem, purge.privateKeyPem],
    serving,
    events,
    messages,
    entryFiber: undefined,
    opsFiber: undefined,
    async open() {
      const before = serving.length
      openSignal.resolve()
      await waitUntil(() => serving.length > before)
      const notice = serving[serving.length - 1]
      if (notice === undefined) throw new Error('no serving notice')
      return notice
    },
    async loadEntry(config = entryConfig) {
      const fiber = await loadPlugin(ctx, governanceCenterEntryPlugin, config)
      extra.push(fiber)
      center.entryFiber = fiber
      return fiber
    },
    async loadOps(config = opsConfig) {
      const fiber = await loadPlugin(ctx, governanceCenterOpsPlugin, config)
      extra.push(fiber)
      center.opsFiber = fiber
      return fiber
    },
    async unloadStorage() {
      await storageFiber?.dispose()
      storageFiber = undefined
    },
    async reloadStorage() {
      storageFiber = await loadPlugin(ctx, storageHost(storage), undefined)
      extra.push(storageFiber)
    },
    logins: () => {
      const logins: LoginsService | undefined = ctx.get(LOGINS_SERVICE)
      if (logins === undefined) throw new Error('logins is not resolvable')
      return logins
    },
    tls: (request, clientOptions) => tlsExchange(port, request, clientOptions),
    async call(envelope) {
      const reply = await tlsExchange(port, httpRequest(JSON.stringify(envelope)))
      return reply.bytes
    },
    ops: (request = httpRequest(OPS_HEALTH), clientOptions) =>
      unixExchange(center.socketPath, request, clientOptions),
    logText: () => messages.map(renderMessage).join('\n'),
    async dispose() {
      for (const fiber of extra.reverse()) await fiber.dispose()
      await base.dispose()
      await raw.close()
    },
  }
  if (options.skipCenterPlugins !== true) {
    if (options.opsFirst === true && options.withOps !== false) await center.loadOps()
    await center.loadEntry()
    if (options.opsFirst !== true && options.withOps !== false) await center.loadOps()
  }
  return center
}

/** 轮询到条件成立（上界 `timeoutMs`）。 */
export async function waitUntil(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('waitUntil: condition not reached')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

// ---- 线上的账号 ----

export const REGISTER = 'composition.account-registration/v2#S-8'
export const LOGIN = 'capability.account-identity/v3#S-15'
export const REVOKE = 'capability.account-identity/v3#S-16'
export const LIST_LOGINS = 'capability.account-identity/v3#S-37'
export const OG = (clause: number) => `capability.organization-governance/v2#S-${String(clause)}`
export const HEALTH = 'composition.governance-center-entry/v1#S-18'

export function envelopeOf(
  operation: string,
  payload: Record<string, unknown>,
  presentation?: string,
): Record<string, unknown> {
  return presentation === undefined
    ? { protocolVersion: '3', operation, payload }
    : { protocolVersion: '3', presentedLoginState: presentation, operation, payload }
}

/** 答复的体（按 JSON 读）。 */
export function bodyOf(bytes: Buffer): unknown {
  const index = bytes.indexOf('\r\n\r\n')
  if (index < 0) throw new Error(`no HTTP reply: ${bytes.length} bytes`)
  return JSON.parse(bytes.subarray(index + 4).toString('utf8'))
}

export interface Session {
  readonly identifier: string
  readonly presentation: string
  readonly handle: string
}

/** 经线上注册并登录。 */
export async function registerAndLogin(center: Center, identifier: string): Promise<Session> {
  const registered = bodyOf(
    await center.call(envelopeOf(REGISTER, { loginIdentifier: identifier, credential: PASSWORD })),
  )
  if (JSON.stringify(registered) !== '{"result":"registered"}') {
    throw new Error(`register failed: ${JSON.stringify(registered)}`)
  }
  return login(center, identifier)
}

export async function login(center: Center, identifier: string): Promise<Session> {
  const reply = bodyOf(
    await center.call(envelopeOf(LOGIN, { loginIdentifier: identifier, credential: PASSWORD })),
  )
  if (
    typeof reply !== 'object' ||
    reply === null ||
    !('result' in reply) ||
    typeof reply.result !== 'object' ||
    reply.result === null ||
    !('loginState' in reply.result) ||
    !('loginStateHandle' in reply.result) ||
    typeof reply.result.loginState !== 'string' ||
    typeof reply.result.loginStateHandle !== 'string'
  ) {
    throw new Error(`login failed: ${JSON.stringify(reply)}`)
  }
  return {
    identifier,
    presentation: reply.result.loginState,
    handle: reply.result.loginStateHandle,
  }
}
