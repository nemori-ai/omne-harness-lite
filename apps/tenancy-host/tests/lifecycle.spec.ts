// 装载、开闸与撤除（verification：assembly.manifest-shape、assembly.pending-is-manifest-error、assembly.entry-loads-last、
// assembly.no-commit-before-open ①③④、assembly.dispose-reverse-order、assembly.dispose-with-inflight、
// assembly.keys-only-in-owner-config、assembly.credentials-swap-no-rerun、assembly.clock-write-failure-fails-boot、
// assembly.boot-failure-log、AI S-32「完整重启」支（同进程两次 boot）、真实 clock 插件的组合）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { symbols, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountsService, LoginsService } from '@omne-harness-lite/account-identity'
import { LEASE_WIDTH_MS, clockPlugin } from '@omne-harness-lite/clock'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import { GovernanceCenterClockTimeoutError } from '@omne-harness-lite/governance-center-entry'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import { storageSqlPlugin } from '@omne-harness-lite/storage-sql'
import {
  HOST_PLUGIN_NAMES,
  type HostPluginName,
  type ManifestEntry,
  buildManifest,
  readHostConfig,
} from '../src/index.ts'
import { type Deployment, asEnv, deployment, execute, query } from './support/deployment.ts'
import { Hosts, allDisposed, failureRecords } from './support/host.ts'
import {
  LOGIN,
  PUBLIC_HEALTH_BODY,
  REGISTER,
  bodyOf,
  envelope,
  portAccepting,
  tlsExchange,
  unixExchange,
} from './support/wire.ts'

const hosts = new Hosts()
afterEach(() => hosts.stopAll())

const PEM_HEADER = '-----BEGIN'
const PASSWORD = 'correct horse battery'

async function registerOverWire(d: Deployment, identifier: string) {
  const reply = await tlsExchange(
    d.port,
    envelope(REGISTER, { loginIdentifier: identifier, credential: PASSWORD }),
  )
  expect(bodyOf(reply)).toEqual({ result: 'registered' })
}

async function loginOverWire(d: Deployment, identifier: string) {
  const reply = bodyOf(
    await tlsExchange(
      d.port,
      envelope(LOGIN, { loginIdentifier: identifier, credential: PASSWORD }),
    ),
  ) as { result: { loginState: string; loginStateHandle: string } }
  return reply.result
}

describe('assembly.manifest-shape', () => {
  it('rejects PostgreSQL before opening a provider instead of falling back to an unproven bounded composition', async () => {
    const d = await deployment('postgres-refused')
    const config = await readHostConfig(asEnv(d))
    const guard = (await import('@omne-harness-lite/storage-sql')).createUpgradeGuard()
    expect(() =>
      buildManifest(
        {
          ...config,
          storage: { dialect: 'postgres', connectionString: 'postgresql://unused.invalid/test' },
        },
        {
          migrations: { getMigrations: async () => ({}) },
          checks: [],
          guard,
          openSignal: Promise.resolve(),
          maintenance: {
            backupDirectory: join(d.root, 'backups'),
            sourceBuildId: null,
            migrationNames: ['test'],
            storageClosed() {},
            controllerClosed() {},
          },
        },
      ),
    ).toThrow('currently requires SQLite')
  })

  it('清单：恰一个 storageSqlPlugin、恰一个 clockPlugin；inject organizationPurge 的恰为 AR；运维面与入口层是最后两项且运维面在前；运维面 config 里没有服务句柄', async () => {
    const d = await deployment('manifest')
    const config = await readHostConfig(asEnv(d))
    const entries = buildManifest(config, {
      migrations: { getMigrations: async () => ({}) },
      checks: [],
      guard: (await import('@omne-harness-lite/storage-sql')).createUpgradeGuard(),
      openSignal: Promise.resolve(),
      maintenance: {
        backupDirectory: join(d.root, 'backups'),
        sourceBuildId: null,
        migrationNames: ['test'],
        storageClosed() {},
        controllerClosed() {},
      },
    })
    expect(entries.map(e => e.name)).toEqual([...HOST_PLUGIN_NAMES])
    expect(entries.filter(e => e.plugin === storageSqlPlugin)).toHaveLength(1)
    expect(entries.find(e => e.plugin === storageSqlPlugin)?.config).toMatchObject({
      dialect: 'sqlite',
      synchronous: 'full',
    })
    expect(entries.filter(e => e.plugin === clockPlugin)).toHaveLength(1)
    const injecting = entries.filter(e => {
      const inject = (e.plugin as { inject?: unknown }).inject
      return Array.isArray(inject) && inject.includes('organizationPurge')
    })
    expect(injecting.map(e => e.name)).toEqual(['account-registration'])
    expect(entries.slice(-2).map(e => e.name)).toEqual([
      'governance-center-ops',
      'governance-center-entry',
    ])
    const ops = entries.find(e => e.name === 'governance-center-ops')?.config
    // 运维参数为数据；D055新增owner只读检查与收场观察回调，不传治理服务句柄或PEM
    const plainData = (value: unknown): boolean =>
      value === null ||
      ['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'object' &&
        Object.getPrototypeOf(value) === Object.prototype &&
        Object.values(value as object).every(plainData))
    const opsConfig = ops as {
      maintenance: { snapshotChecks: unknown; onClosed: unknown }
      deploymentKey: unknown
      deploymentParameters: unknown
    }
    expect(plainData(opsConfig.deploymentKey)).toBe(true)
    expect(plainData(opsConfig.deploymentParameters)).toBe(true)
    expect(Array.isArray(opsConfig.maintenance.snapshotChecks)).toBe(true)
    expect(typeof opsConfig.maintenance.onClosed).toBe('function')
    expect(JSON.stringify(ops)).not.toContain(PEM_HEADER)
  })

  it('运行中：五个消费 storage 的插件解析到同一个实例，consumers of clock 同一个实例；governance_center 与治理事实同库', async () => {
    const d = await deployment('same-storage')
    const { host } = await hosts.start(d)
    const storage = host.context.get('storage')
    const clock = host.context.get('clock')
    for (const name of [
      'clock',
      'account-identity',
      'organization-governance',
      'governance-center-ops',
      'governance-center-entry',
    ] as const)
      expect(host.fibers[name]?.ctx.get('storage'), name).toBe(storage)
    for (const name of [
      'account-identity',
      'organization-governance',
      'governance-center-ops',
      'governance-center-entry',
    ] as const)
      expect(host.fibers[name]?.ctx.get('clock'), name).toBe(clock)
    const tables = query<{ name: string }>(
      d.file,
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    )
    expect(tables.map(t => t.name)).toEqual(
      expect.arrayContaining(['governance_center', 'account', 'organization']),
    )
  })
})

describe('assembly.clock-failure-classification：N-18 按错误类型点名', () => {
  it.each(['typed-with-changed-message', 'plain-with-old-message'] as const)(
    '%s：说明文字不决定启动失败阶段',
    async variant => {
      const d = await deployment(variant)
      const cause =
        variant === 'typed-with-changed-message'
          ? new GovernanceCenterClockTimeoutError()
          : new Error('unrelated plugin failure (cause: clock)')
      if (variant === 'typed-with-changed-message') cause.message = 'diagnostic wording changed'
      const refused = await hosts.refuse(d, {
        manifest: entries =>
          entries.map(entry =>
            entry.name === 'governance-center-entry'
              ? {
                  ...entry,
                  plugin: () => {
                    throw cause
                  },
                }
              : entry,
          ),
      })
      expect(refused.failure).toMatchObject({
        stage: variant === 'typed-with-changed-message' ? 'clock-unreadable' : 'plugin',
        item: 'governance-center-entry',
        cause,
      })
      expect(allDisposed(refused.fibers)).toBe(true)
    },
  )
})

describe('assembly.pending-is-manifest-error：PENDING 是清单错误，同步判定、不等待', () => {
  const reorder =
    (change: (entries: ManifestEntry[]) => ManifestEntry[]) =>
    (entries: readonly ManifestEntry[]) =>
      change([...entries])

  it('AR 排到 AI 之前 ⇒ 装 AR 那一步即拒绝、点名缺的服务；已装的 storage／clock／credentials 已撤', async () => {
    const d = await deployment('pending-ar')
    const started = performance.now()
    const refused = await hosts.refuse(d, {
      manifest: reorder(entries => {
        const ar = entries.findIndex(e => e.name === 'account-registration')
        const [moved] = entries.splice(ar, 1)
        if (moved === undefined) throw new Error('no AR')
        entries.splice(3, 0, moved)
        return entries
      }),
    })
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(refused.failure).toMatchObject({ stage: 'manifest', item: 'account-registration' })
    expect(refused.failure.message).toContain('accounts')
    expect(refused.fibers.map(f => f.name)).toEqual([
      'storage-sql',
      'clock',
      'credential-verification',
      'account-registration',
    ])
    expect(allDisposed(refused.fibers)).toBe(true)
  })

  it('入口层支：清单里拿掉 credentials ⇒ 入口层装上即 PENDING ⇒ 同步拒绝，入口层的监听从未打开', async () => {
    const d = await deployment('pending-entry')
    const refused = await hosts.refuse(d, {
      manifest: reorder(entries => entries.filter(e => e.name !== 'credential-verification')),
    })
    expect(refused.failure).toMatchObject({ stage: 'manifest', item: 'governance-center-entry' })
    expect(refused.failure.message).toContain('credentials')
    expect(await portAccepting(d.port)).toBe(false)
    expect(allDisposed(refused.fibers)).toBe(true)
  })
})

describe('assembly.no-commit-before-open 与 assembly.entry-loads-last', () => {
  it('① 停在确认处：八条 fiber 都已 ACTIVE；公开体检、注册、运维面请求一律关闭不答，库里没有新行，serving 尚未发出', async () => {
    const d = await deployment('closed-gate')
    const fibers: { name: HostPluginName; fiber: Fiber }[] = []
    let checked = false
    const { log } = await hosts.start(d, {
      observeFiber: (name, fiber) => fibers.push({ name, fiber }),
      beforeConfirm: async () => {
        expect(fibers.map(f => f.name)).toEqual([...HOST_PLUGIN_NAMES])
        for (const { fiber } of fibers) expect(fiber.state as number).toBe(FIBER_STATE.ACTIVE)
        const health = await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 3_000)
        const register = await tlsExchange(
          d.port,
          envelope(REGISTER, { loginIdentifier: 'early@example.invalid', credential: PASSWORD }),
          3_000,
        )
        const ops = await unixExchange(d.socketPath, 3_000)
        expect(health.bytes.length).toBe(0)
        expect(register.bytes.length).toBe(0)
        expect(ops.bytes.length).toBe(0)
        expect(query(d.file, 'SELECT * FROM account')).toEqual([])
        expect(query(d.file, 'SELECT * FROM organization')).toEqual([])
        checked = true
      },
    })
    expect(checked).toBe(true)
    // 开闸之后同样的请求才得到答复
    expect(bodyOf(await tlsExchange(d.port, PUBLIC_HEALTH_BODY))).toMatchObject({ reachable: true })
    expect(log.events('serving')).toHaveLength(1)
  })

  it('④ 正常路径的事件次序：全部 ACTIVE → 确认 → 兑现 → serving → 第一条答复；boot() 在 serving 之后才返回', async () => {
    const d = await deployment('order')
    const answers: number[] = []
    let polling = true
    const logRef: { lines: () => { event?: unknown; name: string }[] } = { lines: () => [] }
    const poll = (async () => {
      while (polling) {
        const reply = await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 1_000).catch(() => undefined)
        if (reply !== undefined && reply.bytes.length > 0) answers.push(logRef.lines().length)
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    })()
    const started = hosts.start(d)
    const { log } = await started
    logRef.lines = () => log.lines as { event?: unknown; name: string }[]
    const servedAt = log.lines.findIndex(l => l['event'] === 'serving')
    await expect.poll(() => answers.length, { timeout: 10_000 }).toBeGreaterThan(0)
    polling = false
    await poll
    const events = log.lines
      .map(l =>
        l.name === 'tenancy-host'
          ? String(l['event'])
          : l.name === 'governance-center-entry'
            ? 'answer'
            : '',
      )
      .filter(e =>
        ['manifest-active', 'upgrade-confirmed', 'open-signal', 'serving', 'answer'].includes(e),
      )
    expect(events.slice(0, 4)).toEqual([
      'manifest-active',
      'upgrade-confirmed',
      'open-signal',
      'serving',
    ])
    expect(servedAt).toBeGreaterThan(-1)
    // 入口层的每一条答复都有一条请求记录；第一条出现在 serving 之后
    const firstAnswer = log.lines.findIndex(
      l => l.name === 'governance-center-entry' && String(l.message).startsWith('request'),
    )
    expect(firstAnswer).toBeGreaterThan(servedAt)
    expect(answers.length).toBeGreaterThan(0)
  })

  it('运维面只在 serving 与 stopped 之间作答：入口层撤完（发了 stopped）运维面还在但不答；入口层先于运维面撤', async () => {
    const d = await deployment('ops-window')
    const { host, log } = await hosts.start(d)
    expect(bodyOf(await unixExchange(d.socketPath))).toMatchObject({ reachable: true })
    await host.fibers['governance-center-entry']?.dispose()
    expect(await portAccepting(d.port)).toBe(false)
    expect(existsSync(d.socketPath)).toBe(true)
    const ops = await unixExchange(d.socketPath, 3_000)
    expect(ops.bytes.length).toBe(0)
    await hosts.stop(host)
    expect(existsSync(d.socketPath)).toBe(false)
    const order = log.events('fiber-disposed').map(l => l['plugin'])
    expect(order).toEqual([...HOST_PLUGIN_NAMES].reverse())
  })
})

describe('assembly.dispose-reverse-order 与 assembly.dispose-with-inflight', () => {
  it('正常 dispose：逆序撤；clock 收回了租约（lease_until 是撤除时刻而不是 +L）——它的撤除写找到了活的 storage；句柄已关、套接字文件已删、端口已放', async () => {
    const d = await deployment('dispose-order')
    const { host, log } = await hosts.start(d)
    const before = Date.now()
    const disposal = await hosts.stop(host)
    const after = Date.now()
    expect(disposal).toEqual({ complete: true, unfinished: [] })
    expect(log.events('fiber-disposed').map(l => l['plugin'])).toEqual(
      [...HOST_PLUGIN_NAMES].reverse(),
    )
    const [lease] = query<{ lease_until: number }>(d.file, 'SELECT lease_until FROM clock_lease')
    expect(lease?.lease_until).toBeGreaterThanOrEqual(before - 1)
    expect(lease?.lease_until).toBeLessThanOrEqual(after)
    expect(lease?.lease_until).toBeLessThan(before + LEASE_WIDTH_MS)
    expect(existsSync(d.socketPath)).toBe(false)
    expect(await portAccepting(d.port)).toBe(false)
    // 库的独占已放：同一文件马上能再起
    const again = await hosts.start(d)
    expect(again.host.serving.centerId).toBe(host.serving.centerId)
  })

  it('撤除时在途的一次注册：排空上界内答完的照常答、按自己那一次提交收场；撤除开始后新到的连接得不到答复', async () => {
    const d = await deployment('inflight')
    const { host } = await hosts.start(d)
    const inflight = tlsExchange(
      d.port,
      envelope(REGISTER, { loginIdentifier: 'late@example.invalid', credential: PASSWORD }),
      15_000,
    )
    // 缺省 scrypt 参数下一次派生需要数百毫秒：等请求确实到达、正在执行
    await new Promise(resolve => setTimeout(resolve, 120))
    const disposing = hosts.stop(host)
    const newcomer = await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 3_000)
    expect(newcomer.bytes.length).toBe(0)
    const reply = await inflight
    const disposal = await disposing
    expect(disposal.complete).toBe(true)
    const rows = query<{ activated: number }>(
      d.file,
      "SELECT activated FROM account WHERE login_identifier = 'late@example.invalid'",
    )
    // 排空上界 10 s 内这次注册跑得完：照常答复，且它的提交都在
    expect(bodyOf(reply)).toEqual({ result: 'registered' })
    expect(rows).toEqual([{ activated: 1 }])
  })
})

describe('assembly.keys-only-in-owner-config（窄形式：它不证同进程别的代码读不到）', () => {
  function pemPaths(value: unknown, path: string, seen = new Set<unknown>()): string[] {
    if (typeof value === 'string') return value.includes(PEM_HEADER) ? [path] : []
    if (typeof value !== 'object' || value === null || seen.has(value)) return []
    seen.add(value)
    if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return []
    return Object.entries(value).flatMap(([key, inner]) =>
      pemPaths(inner, path === '' ? key : `${path}.${key}`, seen),
    )
  }

  it('PEM 字段恰为 AR←activation 私钥、OG←purge 私钥、AI←两把公钥、入口层←TLS 证书链与私钥；服务里、日志里、完整体检里都没有 PEM', async () => {
    const d = await deployment('keys-placement')
    const { host, log } = await hosts.start(d)
    const placement: Record<string, string[]> = {}
    for (const name of HOST_PLUGIN_NAMES) {
      const fiber = host.fibers[name]
      placement[name] = [
        ...new Set([...pemPaths(fiber?.config, ''), ...pemPaths(fiber?._config, '')]),
      ].sort()
    }
    expect(placement).toEqual({
      'storage-sql': [],
      clock: [],
      'credential-verification': [],
      'account-identity': ['activationVerificationKeyPem', 'purgeVerificationKeyPem'],
      'organization-governance': ['purgeSigningKeyPem'],
      'account-registration': ['activationSigningKeyPem'],
      'governance-center-ops': [],
      'governance-center-entry': ['tls.certificateChainPem', 'tls.privateKeyPem'],
    })
    const store = host.context.reflect.store
    const services = Reflect.ownKeys(store).map(key => store[key as symbol])
    expect(services.length).toBeGreaterThan(5)
    for (const impl of services)
      expect(
        inspect(impl?.value, { depth: 6, showHidden: true }),
        String(impl?.name),
      ).not.toContain(PEM_HEADER)
    await registerOverWire(d, 'keys@example.invalid')
    expect(JSON.stringify(bodyOf(await unixExchange(d.socketPath)))).not.toContain(PEM_HEADER)
    await hosts.stop(host)
    expect(log.text()).not.toContain(PEM_HEADER)
  })
})

describe('assembly.credentials-swap-no-rerun（CV 换代演练）', () => {
  it('撤掉 credentials 的 fiber、装另一实现：AI 与 OG 的插件体不重跑（服务实例不变、fiber 一直 ACTIVE）；期间 logins.issue 得 storage-unavailable、accounts.read 照常；入口层随之关门再开门', async () => {
    const d = await deployment('cv-swap')
    const { host, log } = await hosts.start(d)
    await registerOverWire(d, 'swap@example.invalid')
    const accounts = host.context.get('accounts') as AccountsService
    const logins = host.context.get('logins') as LoginsService
    // Cordis creates a caller-context proxy on each get. Compare the underlying instance.
    const organizations = Reflect.get(host.context.get('organizations')!, symbols.original)
    const [row] = query<{ account_id: string }>(d.file, 'SELECT account_id FROM account')

    await host.fibers['credential-verification']?.dispose()
    expect(host.fibers['account-identity']?.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(host.fibers['organization-governance']?.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(await logins.issue('swap@example.invalid', PASSWORD)).toEqual({
      failure: 'storage-unavailable',
    })
    expect(await accounts.read(row?.account_id)).toEqual({
      ok: { activated: true, retentionExpired: false },
    })
    // 入口层必需 inject credentials：关门
    expect((await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 3_000)).bytes.length).toBe(0)

    // 另一实现：同一插件、另一组派生参数
    const replacement = host.context.plugin(credentialsPlugin, {
      cost: 2 ** 14,
      blockSize: 8,
      parallelization: 1,
      saltBytes: 16,
      keyBytes: 32,
    })
    await replacement
    try {
      expect(host.context.get('accounts')).toBe(accounts)
      expect(host.context.get('logins')).toBe(logins)
      expect(Reflect.get(host.context.get('organizations')!, symbols.original)).toBe(organizations)
      expect(await logins.issue('swap@example.invalid', PASSWORD)).toHaveProperty('ok')
      // 入口层重跑后就绪即开门（openSignal 早已兑现，快照早已确认）
      await expect
        .poll(async () => bodyOf(await tlsExchange(d.port, PUBLIC_HEALTH_BODY, 2_000)), {
          timeout: 15_000,
        })
        .toMatchObject({ centerId: host.serving.centerId })
      expect(log.events('serving').length).toBeGreaterThanOrEqual(2)
    } finally {
      await replacement.dispose()
    }
  })
})

describe('assembly.clock-write-failure-fails-boot', () => {
  it('clock 启动判定那次写失败 ⇒ boot() 拒绝于 clock，storage 已撤', async () => {
    const d = await deployment('clock-write')
    const first = await hosts.start(d)
    await hosts.stop(first.host)
    execute(
      d.file,
      "CREATE TRIGGER block_lease BEFORE UPDATE ON clock_lease BEGIN SELECT RAISE(ABORT, 'injected lease write failure'); END",
    )
    const refused = await hosts.refuse(d)
    expect(refused.failure).toMatchObject({ stage: 'plugin', item: 'clock' })
    expect(refused.fibers.map(f => f.name)).toEqual(['storage-sql', 'clock'])
    expect(allDisposed(refused.fibers)).toBe(true)
  })
})

describe('真实 clock 插件的组合（入口层包内用的是替身）', () => {
  it('开闸时刻 startedAt 来自真实时钟，完整体检里的 startedAt／clockSane 与它一致', async () => {
    const d = await deployment('real-clock')
    const before = Date.now()
    const { host } = await hosts.start(d)
    const after = Date.now()
    expect(host.serving.startedAt).toBeGreaterThanOrEqual(before)
    expect(host.serving.startedAt).toBeLessThanOrEqual(after)
    const full = bodyOf(await unixExchange(d.socketPath)) as {
      startedAt: string
      clockSane: boolean
      storageReachable: boolean
    }
    expect(Date.parse(full.startedAt)).toBe(host.serving.startedAt)
    expect(full.clockSane).toBe(true)
    expect(full.storageReachable).toBe(true)
  })
})

describe('AI S-32「完整重启」支：boot() 可重入同一文件', () => {
  it('第一次签发并撤销一个登录状态、dispose；第二次 logins.verify 得 login-state-rejected，出示物换不出身份', async () => {
    const d = await deployment('s32')
    const first = await hosts.start(d)
    await registerOverWire(d, 'restart@example.invalid')
    const session = await loginOverWire(d, 'restart@example.invalid')
    const revoke = await tlsExchange(
      d.port,
      JSON.stringify({
        protocolVersion: '2',
        presentedLoginState: session.loginState,
        operation: 'capability.account-identity/v3#S-16',
        payload: { loginStateHandle: session.loginStateHandle },
      }),
    )
    expect(bodyOf(revoke)).toEqual({ result: 'ok' })
    await hosts.stop(first.host)

    const second = await hosts.start(d)
    const logins = second.host.context.get('logins') as LoginsService
    expect(await logins.verify(session.loginStateHandle as never)).toEqual({
      failure: 'login-state-rejected',
    })
    expect(await logins.exchange(session.loginState)).toEqual({ failure: 'login-state-rejected' })
  })
})

describe('assembly.boot-failure-log：每种启动失败落恰一条结构化记录，不含 PEM 与 config 值', () => {
  it('config、密钥配对、清单、插件、只读核对各一次', async () => {
    const kinds: { label: string; mutate: (d: Deployment) => void; stage: string }[] = [
      {
        label: 'config',
        mutate: d => void (d.env['OMNE_TENANCY_ENTRY_LISTEN'] = 'not-an-address'),
        stage: 'config',
      },
      {
        label: 'pairing',
        mutate: d => {
          const a = d.env['OMNE_TENANCY_PURGE_VERIFICATION_KEY_PEM_FILE']
          d.env['OMNE_TENANCY_PURGE_VERIFICATION_KEY_PEM_FILE'] =
            d.env['OMNE_TENANCY_ACTIVATION_VERIFICATION_KEY_PEM_FILE']
          d.env['OMNE_TENANCY_ACTIVATION_VERIFICATION_KEY_PEM_FILE'] = a
        },
        stage: 'key-pairing',
      },
      {
        label: 'plugin',
        mutate: d => void (d.env['OMNE_TENANCY_STORAGE_FILE'] = ':memory:'),
        stage: 'plugin',
      },
    ]
    for (const kind of kinds) {
      const d = await deployment(`log-${kind.label}`)
      kind.mutate(d)
      const refused = await hosts.refuse(d)
      const records = failureRecords(refused.log)
      expect(records, kind.label).toHaveLength(1)
      expect(records[0]).toMatchObject({ level: 'error', name: 'tenancy-host', stage: kind.stage })
      expect(typeof records[0]?.['errorType']).toBe('string')
      expect(typeof records[0]?.['message']).toBe('string')
      const text = refused.log.text()
      expect(text).not.toContain(PEM_HEADER)
      expect(text).not.toContain('not-an-address')
      expect(text).not.toContain(d.root)
    }
  })
})
