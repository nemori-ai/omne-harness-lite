// 包内测试夹具：真实 storage-sql（临时文件库，无 in-memory）+ 真实 credential-verification + 包内 Clock 替身。
// 服务实现类在这里直接构造，以便注入随机源、故障与记录诊断／事件；插件级的装载另在 plugin.spec.ts。
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CREDENTIALS_SERVICE } from '@omne-harness-lite/account-identity/cordis'
import { type CredentialsService } from '@omne-harness-lite/account-identity'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification-scrypt/cordis'
import {
  type AccountId,
  type LoginStateId,
  type SigningKey,
  generateHandoffKeyPair,
  issueHandoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { type Assembly, bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import type { Clock, Duration, Instant } from '@omne-harness-lite/offer-expiry'
import {
  type ReadTx,
  type AtomicStorage,
  type StorageUnit,
  StorageDefect,
  type StorageInstance,
  StorageUnavailable,
  type WriteTx,
  composeMigrations,
} from '@omne-harness-lite/storage'
import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { storageSqlPlugin } from '@omne-harness-lite/storage-sql/cordis'
import { AccountsImpl } from '../src/accounts.ts'
import { type Diagnostics, type Notifier, loggerDiagnostics } from '../src/diagnostics.ts'
import { LoginsImpl } from '../src/logins.ts'
import { type RandomSource, cryptoRandomSource } from '../src/presentation.ts'
import { accountIdentityMigrations } from '../src/schema.ts'
import type { IssuedLoginState } from '@omne-harness-lite/account-identity'

export const HOUR_MS = 3_600_000
export const RETENTION = HOUR_MS as Duration
export const POLICY = { minLength: 8 }
/** 测试用低代价 scrypt 参数：只为跑得快。 */
export const FAST_CREDENTIALS = {
  cost: 1024,
  blockSize: 8,
  parallelization: 1,
  saltBytes: 16,
  keyBytes: 32,
}
export const START = Date.UTC(2026, 8, 23, 12, 0, 0) as Instant

/** 每个夹具一个临时文件库，不共享；无 in-memory（D-026）。 */
export function tempSqliteFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-account-identity-${label}-`)), 'db.sqlite')
}

/** storage-sql 插件的夹具 config：带 `migrations` 就写 `upgrade: false`（阶段 2 施工计划：合回后 upgrade 必填）。 */
export function storageConfig(file: string): unknown {
  return {
    dialect: 'sqlite',
    file,
    migrations: composeMigrations(accountIdentityMigrations),
    upgrade: false,
  }
}

// ---- Clock 替身：服从 offer-expiry `Clock` 形状；可前推、可回拨、可答 'unavailable' ----

export interface TestClock extends Clock {
  /** 当前时刻（不管是否被切成不可用），测试断言用。 */
  readonly current: Instant
  advance(ms: number): void
  set(instant: Instant): void
  setUnavailable(unavailable: boolean): void
}

export function testClock(start: Instant = START): TestClock {
  let current = start
  let unavailable = false
  return {
    get current() {
      return current
    },
    now: () => (unavailable ? 'unavailable' : current),
    advance(ms) {
      current = (current + ms) as Instant
    },
    set(instant) {
      current = instant
    },
    setUnavailable(value) {
      unavailable = value
    },
  }
}

// ---- 故障注入的 storage 包装：读／写不可用、提交失败；并标出「正在写事务回调里」的异步范围 ----

export class FaultyStorage implements AtomicStorage {
  readUnavailable = false
  writeUnavailable = false
  /** 事务函数跑完之后以 StorageUnavailable 回滚：模拟提交失败（事务中途存储没了）。 */
  failCommit = false
  readonly #writeScope = new AsyncLocalStorage<true>()

  constructor(readonly inner: StorageInstance & AtomicStorage) {}

  /** 当前异步上下文是否在某个 write 的回调里（R-8 的测试形式用它）。 */
  inWriteCallback(): boolean {
    return this.#writeScope.getStore() === true
  }

  atomic<T>(fn: (unit: StorageUnit) => Promise<T>): Promise<T> {
    if (this.readUnavailable || this.writeUnavailable)
      return Promise.reject(new StorageUnavailable('injected atomic failure'))
    return this.inner.atomic(unit =>
      this.#writeScope.run(true, async () => {
        const scope: StorageUnit = {
          assertStorage: expected => {
            if (expected !== this) throw new StorageDefect('test storage instance mismatch')
            unit.assertStorage(this.inner)
          },
          run: callback => unit.run(callback),
          query: callback => unit.query(callback),
          mutate: callback => unit.mutate(callback),
          afterCommit: callback => unit.afterCommit(callback),
        }
        const result = await fn(scope)
        if (this.failCommit) throw new StorageUnavailable('injected commit failure')
        return result
      }),
    )
  }

  read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    if (this.readUnavailable) return Promise.reject(new StorageUnavailable('injected read failure'))
    return this.inner.read(fn)
  }

  write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    if (this.writeUnavailable)
      return Promise.reject(new StorageUnavailable('injected write failure'))
    return this.inner.write(tx =>
      this.#writeScope.run(true, async () => {
        const result = await fn(tx)
        if (this.failCommit) throw new StorageUnavailable('injected commit failure')
        return result
      }),
    )
  }
}

// ---- 凭据服务的插桩：记录写事务回调里的调用（R-8），并能在 verify／derive 返回前停下等测试改库 ----

export interface CredentialProbe {
  readonly callsInsideWrite: string[]
  /** 设了就在下一次 verify 返回前等它；测试在等待期间改库，然后放行。 */
  pauseVerify: (() => Promise<void>) | undefined
  pauseDerive: (() => Promise<void>) | undefined
  /** 置真则 resolveCredentials 返回 undefined（提供者缺席）。 */
  absent: boolean
}

function instrument(
  real: CredentialsService,
  probe: CredentialProbe,
  storage: FaultyStorage,
): CredentialsService {
  const mark = (method: string) => {
    if (storage.inWriteCallback()) probe.callsInsideWrite.push(method)
  }
  return {
    parse(raw) {
      mark('parse')
      return real.parse(raw)
    },
    checkPolicy(policy, presented) {
      mark('checkPolicy')
      return real.checkPolicy(policy, presented)
    },
    async verify(material, presented) {
      mark('verify')
      const result = await real.verify(material, presented)
      const pause = probe.pauseVerify
      probe.pauseVerify = undefined
      if (pause !== undefined) await pause()
      return result
    },
    async derive(presented) {
      mark('derive')
      const result = await real.derive(presented)
      const pause = probe.pauseDerive
      probe.pauseDerive = undefined
      if (pause !== undefined) await pause()
      return result
    },
  }
}

// ---- 随机源：缺省 node:crypto；可切成抛出或定值（故障注入） ----

export interface RandomControl {
  mode: 'crypto' | 'throw' | 'constant'
}

function controllableRandom(control: RandomControl): RandomSource {
  return size => {
    if (control.mode === 'throw') throw new Error('injected: random source unavailable')
    if (control.mode === 'constant') return new Uint8Array(size).fill(7)
    return cryptoRandomSource(size)
  }
}

// ---- 签发交接凭证用的两对密钥（本包只持公钥；私钥在测试里扮演注册组合） ----

export interface WarrantKeys {
  readonly activationPublicPem: string
  readonly purgePublicPem: string
  readonly activationSigning: SigningKey
  readonly purgeSigning: SigningKey
}

export function warrantKeys(): WarrantKeys {
  const activation = generateHandoffKeyPair()
  const purge = generateHandoffKeyPair()
  return {
    activationPublicPem: activation.publicKeyPem,
    purgePublicPem: purge.publicKeyPem,
    activationSigning: unwrap(loadSigningKey(activation.privateKeyPem)),
    purgeSigning: unwrap(loadSigningKey(purge.privateKeyPem)),
  }
}

export const activationWarrant = (keys: WarrantKeys, accountId: AccountId): string =>
  issueHandoffWarrant(keys.activationSigning, 'activation', accountId)
export const purgeWarrant = (keys: WarrantKeys, accountId: AccountId): string =>
  issueHandoffWarrant(keys.purgeSigning, 'purge', accountId)

// ---- 夹具 ----

export interface RecordedEvent {
  readonly name: string
  readonly payload: unknown
}

export interface Harness {
  readonly accounts: AccountsImpl
  readonly logins: LoginsImpl
  readonly clock: TestClock
  readonly storage: FaultyStorage
  readonly probe: CredentialProbe
  /** 插过桩的 `credentials`（服务实现类解析到的就是它）。 */
  readonly credentials: CredentialsService
  readonly random: RandomControl
  readonly keys: WarrantKeys
  readonly events: RecordedEvent[]
  /** 诊断外观的全部输出（格式化前的实参，JSON 化）。 */
  readonly diagnosticsOutput: string[]
  readonly file: string
  dispose(): Promise<void>
}

export interface HarnessOptions {
  readonly label?: string
  readonly credentialPolicy?: unknown
  readonly file?: string
  readonly keys?: WarrantKeys
}

export async function openHarness(options: HarnessOptions = {}): Promise<Harness> {
  const file = options.file ?? tempSqliteFile(options.label ?? 'harness')
  const assembly: Assembly = await bootAssembly({
    plugins: [
      { plugin: storageSqlPlugin, config: storageConfig(file) },
      { plugin: credentialsPlugin, config: FAST_CREDENTIALS },
    ],
  })
  const storage = new FaultyStorage(
    assembly.ctx.get(STORAGE_SERVICE) as StorageService & StorageInstance & AtomicStorage,
  )
  const realCredentials = assembly.ctx.get(CREDENTIALS_SERVICE) as CredentialsService
  const probe: CredentialProbe = {
    callsInsideWrite: [],
    pauseVerify: undefined,
    pauseDerive: undefined,
    absent: false,
  }
  const credentials = instrument(realCredentials, probe, storage)
  const clock = testClock()
  const random: RandomControl = { mode: 'crypto' }
  const keys = options.keys ?? warrantKeys()
  const events: RecordedEvent[] = []
  const diagnosticsOutput: string[] = []
  const record = (...args: unknown[]) => diagnosticsOutput.push(JSON.stringify(args))
  const diagnostics: Diagnostics = loggerDiagnostics({ warn: record, error: record })
  const notifier: Notifier = {
    accountActivated: payload =>
      events.push({ name: 'account-identity/account-activated', payload }),
    loginRevoked: payload => events.push({ name: 'account-identity/login-revoked', payload }),
    accountExpired: payload => events.push({ name: 'account-identity/account-expired', payload }),
  }
  const deps = {
    storage,
    clock,
    resolveCredentials: () => (probe.absent ? undefined : credentials),
    credentialPolicy: 'credentialPolicy' in options ? options.credentialPolicy : POLICY,
    unactivatedRetention: RETENTION,
    activationKey: unwrap(loadVerificationKey(keys.activationPublicPem)),
    purgeKey: unwrap(loadVerificationKey(keys.purgePublicPem)),
    notifier,
    diagnostics,
    random: controllableRandom(random),
  }
  return {
    accounts: new AccountsImpl(deps),
    logins: new LoginsImpl(deps),
    clock,
    storage,
    probe,
    credentials,
    random,
    keys,
    events,
    diagnosticsOutput,
    file,
    dispose: () => assembly.dispose(),
  }
}

// ---- 常用步骤 ----

export async function produceOk(h: Harness, identifier: string, password: string) {
  const produced = await h.accounts.produce(identifier, password)
  if (!('ok' in produced)) throw new Error(`fixture produce failed: ${JSON.stringify(produced)}`)
  return produced.ok
}

export async function registerActivated(
  h: Harness,
  identifier: string,
  password: string,
): Promise<AccountId> {
  const accountId = await produceOk(h, identifier, password)
  const activated = await h.accounts.activate(accountId, activationWarrant(h.keys, accountId))
  if (activated !== 'ok') throw new Error(`fixture activate failed: ${JSON.stringify(activated)}`)
  return accountId
}

export async function loginOk(
  h: Harness,
  identifier: string,
  password: string,
): Promise<IssuedLoginState> {
  const issued = await h.logins.issue(identifier, password)
  if (!('ok' in issued)) throw new Error(`fixture issue failed: ${JSON.stringify(issued)}`)
  return issued.ok
}

/** 直接读库的行（测试断言用）：绕过服务面，看存储里到底有什么。 */
export async function rows(h: Harness, table: 'account' | 'login_state') {
  return h.storage.inner.read(
    async tx => (await tx.db.selectFrom(table).selectAll().execute()) as Record<string, unknown>[],
  )
}

export function asLoginStateId(value: string): LoginStateId {
  // 测试模拟「未标类型的调用方」：品牌只在编译期，运行期照样过表示层
  return value as LoginStateId
}

/** 一个可以由测试手动放行的等待点。 */
export function gate(): {
  readonly wait: () => Promise<void>
  readonly release: () => void
  readonly reached: Promise<void>
} {
  let release!: () => void
  let reached!: () => void
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  const reachedPromise = new Promise<void>(resolve => {
    reached = resolve
  })
  return {
    wait: async () => {
      reached()
      await released
    },
    release,
    reached: reachedPromise,
  }
}
