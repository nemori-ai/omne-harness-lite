// 装载、开门、撤除与配置错误（入口节点 T-12 包内各支、T-14、T-8 经插件的各支、T-19 的启动失败一支）。
// T-12 按任务拆分：包内用 kernel-basis 的 bootAssembly 装配可演练的各支在这里；「崩溃落在开闸之前、恢复快照后没有客户端见过的写丢失」
// 要 apps/tenancy-host 的 boot() 与升级快照，归 W3-A（写成带指向的 it.skip）。
import { chmodSync } from 'node:fs'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import type { Plugin } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  GOVERNANCE_CENTER_TABLE,
  GovernanceCenterClockTimeoutError,
  GovernanceCenterIdentityError,
  TlsMaterialError,
  governanceCenterEntryPlugin,
  governanceCenterOpsPlugin,
} from '../src/index.ts'
import { entryAnswerBytes } from '../src/routing/answers.ts'
import {
  type Center,
  type CenterOptions,
  DEPLOYMENT_PARAMETERS,
  HEALTH,
  OG,
  ScriptedClock,
  bodyOf,
  bootCenter,
  composedMigrations,
  deferred,
  envelopeOf,
  registerAndLogin,
  renderMessage,
  tempDirectory,
  tempSqliteFile,
  waitUntil,
} from './support/composition.ts'
import { StubParticipants } from './support/stubs.ts'
import { TLS_FIXTURES, freePort, httpRequest, sleep, tlsExchange } from './support/wire.ts'

const centers: Center[] = []
afterEach(async () => {
  for (const c of centers.splice(0)) await c.dispose()
})

async function boot(options: CenterOptions = {}): Promise<Center> {
  const c = await bootCenter(options)
  centers.push(c)
  return c
}

/** 装一个插件，期待它启动失败；交回错误与 fiber 的状态。 */
async function failedLoad(
  c: Center,
  plugin: Plugin,
  config: unknown,
): Promise<{ error: unknown; state: number }> {
  const fiber = c.ctx.plugin(plugin as Plugin.Object, config as never)
  const error = await Promise.resolve(fiber).then(
    () => undefined,
    (e: unknown) => e,
  )
  const state = fiber.state as number
  await fiber.dispose()
  return { error, state }
}

async function portIsFree(port: number): Promise<boolean> {
  const server = createNetServer()
  return new Promise(resolve => {
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

const health = () => httpRequest(JSON.stringify({ operation: HEALTH }))

describe('T-12 inject 缺一即 PENDING ⇒ 装配启动失败', () => {
  const SERVICES = [
    'storage',
    'clock',
    'credentials',
    'logins',
    'registration',
    'organizations',
    'memberships',
    'offers',
  ]

  it.each(SERVICES.map(name => [name]))(
    '拿掉 %s ⇒ 入口层 PENDING，bootAssembly 抛出',
    async missing => {
      const file = tempSqliteFile('pending')
      const storage = await openStorage({
        dialect: 'sqlite',
        file,
        migrations: composedMigrations(),
        upgrade: false,
      })
      try {
        const stubs = new StubParticipants().provided()
        const services = [
          { name: 'storage', value: storage },
          { name: 'clock', value: new ScriptedClock() },
          ...stubs,
        ].filter(service => service.name !== missing)
        const config = {
          listen: { host: '127.0.0.1', port: await freePort() },
          tls: {
            certificateChainPem: TLS_FIXTURES.chainPem,
            privateKeyPem: TLS_FIXTURES.leafKeyPem,
          },
          version: '0.1.0',
          drainTimeoutMs: 1_000,
          clockReadyTimeoutMs: 1_000,
          openSignal: deferred().promise,
        }
        await expect(
          bootAssembly({ services, plugins: [{ plugin: governanceCenterEntryPlugin, config }] }),
        ).rejects.toThrow(/PENDING/)
      } finally {
        await storage.close()
      }
    },
  )

  it('不 inject accounts：只有 accounts 缺席时入口层照常 ACTIVE', async () => {
    const file = tempSqliteFile('no-accounts')
    const storage = await openStorage({
      dialect: 'sqlite',
      file,
      migrations: composedMigrations(),
      upgrade: false,
    })
    const assembly = await bootAssembly({
      services: [
        { name: 'storage', value: storage },
        { name: 'clock', value: new ScriptedClock() },
        ...new StubParticipants().provided(),
      ],
      plugins: [
        {
          plugin: governanceCenterEntryPlugin,
          config: {
            listen: { host: '127.0.0.1', port: await freePort() },
            tls: {
              certificateChainPem: TLS_FIXTURES.chainPem,
              privateKeyPem: TLS_FIXTURES.leafKeyPem,
            },
            version: '0.1.0',
            drainTimeoutMs: 1_000,
            clockReadyTimeoutMs: 1_000,
            openSignal: deferred().promise,
          },
        },
      ],
    })
    expect(assembly.fibers.at(-1)?.state).toBe(FIBER_STATE.ACTIVE)
    await assembly.dispose()
    await storage.close()
  })
})

describe('T-12 插件体抛出 ⇒ 启动失败且监听已关', () => {
  it('端口被占 ⇒ 启动失败', async () => {
    const holder = createNetServer()
    const port = await freePort()
    await new Promise<void>(resolve => holder.listen(port, '127.0.0.1', resolve))
    const c = await boot({ skipCenterPlugins: true, port })
    const { error, state } = await failedLoad(c, governanceCenterEntryPlugin, c.entryConfig)
    expect(error).toMatchObject({ code: 'EADDRINUSE' })
    expect(state).toBe(FIBER_STATE.FAILED)
    await new Promise<void>(resolve => holder.close(() => resolve()))
  })

  it('等钟超界 ⇒ 启动失败、端口已释放（插件体里的另两支见 ops.spec.ts）', async () => {
    const clock = new ScriptedClock()
    clock.unavailable = true
    const c = await boot({ skipCenterPlugins: true, clock, clockReadyTimeoutMs: 200 })
    const { error, state } = await failedLoad(c, governanceCenterEntryPlugin, c.entryConfig)
    expect(error).toBeInstanceOf(GovernanceCenterClockTimeoutError)
    expect(state).toBe(FIBER_STATE.FAILED)
    expect(await portIsFree(c.port)).toBe(true)
  })
})

describe('T-8 经插件：中心标识的读或铸', () => {
  it('两次从零首启得不同标识；同一份数据重启、换监听地址后得同一标识', async () => {
    const a = await boot()
    const b = await boot()
    const first = await a.open()
    const other = await b.open()
    expect(first.centerId).not.toBe(other.centerId)
    const file = a.file
    centers.splice(centers.indexOf(a), 1)
    await a.dispose()
    const again = await boot({ file, port: await freePort() })
    expect((await again.open()).centerId).toBe(first.centerId)
    expect(bodyOf((await tlsExchange(again.port, health())).bytes)).toMatchObject({
      centerId: first.centerId,
    })
  })

  it('启动时那一格读不出 ⇒ 起不来、点名「读不到」、没有铸出新的；修好后是原来那个', async () => {
    const a = await boot()
    const original = (await a.open()).centerId
    centers.splice(centers.indexOf(a), 1)
    await a.dispose()
    const b = await boot({ file: a.file, skipCenterPlugins: true })
    b.storage.failNextWrite()
    const { error, state } = await failedLoad(b, governanceCenterEntryPlugin, b.entryConfig)
    expect(error).toBeInstanceOf(GovernanceCenterIdentityError)
    expect(error).toMatchObject({ failure: 'unreadable' })
    expect(String(error instanceof Error ? error.message : '')).toContain('读不到')
    expect(state).toBe(FIBER_STATE.FAILED)
    expect(await portIsFree(b.port)).toBe(true)
    await b.loadEntry()
    expect((await b.open()).centerId).toBe(original)
  })

  it('首启时铸的那次提交失败 ⇒ 起不来、点名「写不进」，那一行仍是 NULL；修好后再启动按第一次铸', async () => {
    const c = await boot({ skipCenterPlugins: true })
    c.storage.failNextCommit()
    const { error } = await failedLoad(c, governanceCenterEntryPlugin, c.entryConfig)
    expect(error).toMatchObject({ failure: 'unwritable' })
    expect(String(error instanceof Error ? error.message : '')).toContain('写不进')
    expect(
      await c.raw.read(async tx => tx.db.selectFrom(GOVERNANCE_CENTER_TABLE).selectAll().execute()),
    ).toEqual([{ slot: 'center', center_id: null }])
    await c.loadEntry()
    const notice = await c.open()
    expect(
      await c.raw.read(async tx => tx.db.selectFrom(GOVERNANCE_CENTER_TABLE).selectAll().execute()),
    ).toEqual([{ slot: 'center', center_id: notice.centerId }])
  })

  it('那一格不存在（表在）⇒ 起不来、点名「那一格不存在」、没有铸出新的', async () => {
    const a = await boot()
    await a.open()
    centers.splice(centers.indexOf(a), 1)
    await a.dispose()
    tamper(a.file, `DELETE FROM ${GOVERNANCE_CENTER_TABLE}`)
    const b = await boot({ file: a.file, skipCenterPlugins: true })
    const { error } = await failedLoad(b, governanceCenterEntryPlugin, b.entryConfig)
    expect(error).toMatchObject({ failure: 'missing' })
    expect(String(error instanceof Error ? error.message : '')).toContain('那一格不存在')
    expect(
      await b.raw.read(async tx => tx.db.selectFrom(GOVERNANCE_CENTER_TABLE).selectAll().execute()),
    ).toEqual([])
  })

  it('值不合 S-27 ⇒ 起不来、点名「值不合 S-27」、不修不重铸；公开体检启动之前与失败之后都问不到那个值', async () => {
    const a = await boot()
    await a.open()
    centers.splice(centers.indexOf(a), 1)
    await a.dispose()
    tamper(a.file, `UPDATE ${GOVERNANCE_CENTER_TABLE} SET center_id = 'ABCDEF'`)
    const b = await boot({ file: a.file, skipCenterPlugins: true })
    const before = await tlsExchange(b.port, health())
    expect(before.bytes.length).toBe(0)
    const { error } = await failedLoad(b, governanceCenterEntryPlugin, b.entryConfig)
    expect(error).toMatchObject({ failure: 'malformed' })
    expect(String(error instanceof Error ? error.message : '')).toContain('值不合 S-27')
    expect(String(error instanceof Error ? error.message : '')).not.toContain('ABCDEF')
    const after = await tlsExchange(b.port, health())
    expect(after.bytes.toString('latin1')).not.toContain('ABCDEF')
    expect(after.handshake).toBe(false)
    expect(
      await b.raw.read(async tx => tx.db.selectFrom(GOVERNANCE_CENTER_TABLE).selectAll().execute()),
    ).toEqual([{ slot: 'center', center_id: 'ABCDEF' }])
  })

  it('存储中途不可用时公开体检照样答出三样', async () => {
    const c = await boot()
    const notice = await c.open()
    c.storage.down = true
    expect(bodyOf((await tlsExchange(c.port, health())).bytes)).toEqual({
      reachable: true,
      centerId: notice.centerId,
      version: '0.1.0',
    })
  })
})

function tamper(file: string, statement: string): void {
  const db = new DatabaseSync(file)
  try {
    db.exec(statement)
  } finally {
    db.close()
  }
}

describe('T-12 openSignal：就绪与开门分两步', () => {
  it('兑现之前：入口层 ACTIVE、端口已绑，连接一律被关闭没有答复，运维面也不答，没有 serving；兑现之后才开门并发 serving', async () => {
    const c = await boot()
    expect(c.entryFiber?.state).toBe(FIBER_STATE.ACTIVE)
    expect(await portIsFree(c.port)).toBe(false)
    const early = await tlsExchange(c.port, health())
    expect(early.handshake).toBe(true)
    expect(early.bytes.length).toBe(0)
    expect((await c.ops()).bytes.length).toBe(0)
    expect(c.serving).toHaveLength(0)
    await c.open()
    expect(bodyOf((await tlsExchange(c.port, health())).bytes)).toMatchObject({ reachable: true })
  })

  it('兑现之前撤除 ⇒ 端口立即释放、不发 stopped；其后再兑现也不开门', async () => {
    const c = await boot()
    await c.entryFiber?.dispose()
    expect(await portIsFree(c.port)).toBe(true)
    expect(c.events.stopped).toBe(0)
    c.openSignal.resolve()
    await sleep(200)
    expect(c.serving).toHaveLength(0)
  })

  it('被拒绝 ⇒ 闸不开，没有未处理的 Promise 拒绝', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const c = await boot()
      c.openSignal.reject(new Error('upgrade snapshot not confirmed'))
      await sleep(200)
      expect(c.serving).toHaveLength(0)
      expect((await tlsExchange(c.port, health())).bytes.length).toBe(0)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it.skip('崩溃落在开闸之前：恢复升级快照后没有任何客户端见过的写丢失——要 apps/tenancy-host 的 boot() 与升级快照，与 U-1 一起归 W3-A', () => {})
})

describe('T-12 两张面同起同停；存储不可用时不卸载', () => {
  it('入口层撤除 ⇒ 两张面同时停答；存储不可用时两个插件都不卸载、只以返回值收场', async () => {
    const c = await boot()
    await c.open()
    const ada = await registerAndLogin(c, 'ada@example.invalid')
    c.storage.down = true
    expect(
      (
        await tlsExchange(
          c.port,
          httpRequest(JSON.stringify(envelopeOf(OG(27), {}, ada.presentation))),
        )
      ).bytes,
    ).toEqual(entryAnswerBytes('unavailable'))
    expect(bodyOf((await c.ops()).bytes)).toMatchObject({ storageReachable: false })
    expect(c.entryFiber?.state).toBe(FIBER_STATE.ACTIVE)
    expect(c.opsFiber?.state).toBe(FIBER_STATE.ACTIVE)
    c.storage.down = false
    await c.entryFiber?.dispose()
    expect(c.events.stopped).toBe(1)
    expect((await c.ops()).bytes.length).toBe(0)
    expect(await portIsFree(c.port)).toBe(true)
  })

  it('撤除有界：握手没完成就一直不说话的连接也不挡端口释放', async () => {
    const c = await boot({ drainTimeoutMs: 300 })
    await c.open()
    const socket = netConnect(c.port, '127.0.0.1')
    await new Promise<void>(resolve => socket.once('connect', () => resolve()))
    socket.on('error', () => undefined)
    const started = performance.now()
    await c.entryFiber?.dispose()
    expect(performance.now() - started).toBeLessThan(2_000)
    socket.destroy()
  })
})

describe('T-12 停机时的在途请求（S-34）', () => {
  it('drainTimeoutMs 内答完的照常答；报文只收了一半的被关闭、收不到字节；停机开始后的新连接被拒', async () => {
    const c = await boot({ drainTimeoutMs: 2_000 })
    await c.open()
    const ada = await registerAndLogin(c, 'ada@example.invalid')
    const paused = c.storage.pauseNextCommit()
    const inFlight = tlsExchange(
      c.port,
      httpRequest(JSON.stringify(envelopeOf(OG(21), {}, ada.presentation))),
    )
    await paused.reached
    const half = tlsExchange(
      c.port,
      Buffer.from('POST / HTTP/1.1\r\nContent-Length: 100\r\n\r\n{"op'),
      { endAfterWrite: false },
    )
    await sleep(100)
    const disposing = c.entryFiber?.dispose()
    await waitUntil(() => c.events.stopped === 1)
    expect((await half).bytes.length).toBe(0)
    setTimeout(() => paused.release(), 200)
    const reply = await inFlight
    expect(bodyOf(reply.bytes)).toMatchObject({ result: expect.any(String) })
    await disposing
    expect((await tlsExchange(c.port, health())).handshake).toBe(false)
  })

  it('超过 drainTimeoutMs 连接销毁，但撤除仍等待完整业务结束才释放依赖', async () => {
    const c = await boot({ drainTimeoutMs: 300 })
    await c.open()
    const ada = await registerAndLogin(c, 'ada@example.invalid')
    const teamsBefore = await teams(c)
    const paused = c.storage.pauseNextCommit()
    const inFlight = tlsExchange(
      c.port,
      httpRequest(JSON.stringify(envelopeOf(OG(21), {}, ada.presentation))),
    )
    await paused.reached
    const started = performance.now()
    let disposed = false
    const disposing = c.entryFiber?.dispose().then(() => {
      disposed = true
    })
    const reply = await inFlight
    expect(performance.now() - started).toBeLessThan(1_500)
    expect(disposed).toBe(false)
    expect(reply.bytes.length).toBe(0)
    paused.release()
    await disposing
    expect(disposed).toBe(true)
    // 放行并等完整工作结束：组织与它的成员关系成对出现
    const after = await teams(c)
    expect(after.organizations - teamsBefore.organizations).toBe(
      after.memberships - teamsBefore.memberships,
    )
    expect(after.organizations - teamsBefore.organizations).toBeLessThanOrEqual(1)
  })
})

async function teams(c: Center): Promise<{ organizations: number; memberships: number }> {
  return c.raw.read(async tx => {
    const organizations = await tx.db
      .selectFrom('organization')
      .select('organization_id')
      .where('kind', '=', 'team')
      .execute()
    const memberships = await tx.db
      .selectFrom('membership')
      .innerJoin('organization', 'organization.organization_id', 'membership.organization_id')
      .select('membership.organization_id')
      .where('organization.kind', '=', 'team')
      .execute()
    return { organizations: organizations.length, memberships: memberships.length }
  })
}

describe('T-14 配置错误一个政策：各自 FAILED，没有运行期具名拒绝', () => {
  const entryCases: [string, (config: Record<string, unknown>) => Record<string, unknown>][] = [
    ['缺证书链', config => ({ ...config, tls: { privateKeyPem: TLS_FIXTURES.leafKeyPem } })],
    ['缺私钥', config => ({ ...config, tls: { certificateChainPem: TLS_FIXTURES.chainPem } })],
    [
      '私钥为空',
      config => ({
        ...config,
        tls: { certificateChainPem: TLS_FIXTURES.chainPem, privateKeyPem: '' },
      }),
    ],
    [
      'PEM 不合',
      config => ({
        ...config,
        tls: { certificateChainPem: 'not a pem', privateKeyPem: TLS_FIXTURES.leafKeyPem },
      }),
    ],
    [
      '私钥与证书链不配',
      config => ({
        ...config,
        tls: {
          certificateChainPem: TLS_FIXTURES.chainPem,
          privateKeyPem: TLS_FIXTURES.strayKeyPem,
        },
      }),
    ],
    ['drainTimeoutMs 缺席', ({ drainTimeoutMs: _, ...config }) => config],
    ['drainTimeoutMs 非正', config => ({ ...config, drainTimeoutMs: 0 })],
    ['clockReadyTimeoutMs 缺席', ({ clockReadyTimeoutMs: _, ...config }) => config],
    ['clockReadyTimeoutMs 非正', config => ({ ...config, clockReadyTimeoutMs: -1 })],
    ['openSignal 缺席', ({ openSignal: _, ...config }) => config],
    ['openSignal 不是 thenable', config => ({ ...config, openSignal: { then: 1 } })],
    ['监听端口越界', config => ({ ...config, listen: { host: '127.0.0.1', port: 70000 } })],
  ]

  it.each(entryCases)('入口层：%s ⇒ FAILED', async (_name, mutate) => {
    const c = await boot({ skipCenterPlugins: true })
    const { error, state } = await failedLoad(c, governanceCenterEntryPlugin, mutate(c.entryConfig))
    expect(error).toBeDefined()
    expect(state).toBe(FIBER_STATE.FAILED)
    // 启动失败说明里没有私钥（T-19、T-11）
    const text = `${String(error instanceof Error ? error.message : error)} ${error instanceof Error ? (error.stack ?? '') : ''}`
    for (const line of TLS_FIXTURES.leafKeyPem
      .split('\n')
      .filter(l => l.length > 20 && !l.startsWith('-----'))) {
      expect(text).not.toContain(line)
    }
    for (const line of TLS_FIXTURES.strayKeyPem
      .split('\n')
      .filter(l => l.length > 20 && !l.startsWith('-----'))) {
      expect(text).not.toContain(line)
    }
    expect(c.logText()).not.toContain(TLS_FIXTURES.leafKeyPem.split('\n')[1] ?? '---')
  })

  it('私钥与证书链不配 ⇒ TlsMaterialError，说明只带 OpenSSL 错误码', async () => {
    const c = await boot({ skipCenterPlugins: true })
    const { error } = await failedLoad(c, governanceCenterEntryPlugin, {
      ...c.entryConfig,
      tls: { certificateChainPem: TLS_FIXTURES.chainPem, privateKeyPem: TLS_FIXTURES.strayKeyPem },
    })
    expect(error).toBeInstanceOf(TlsMaterialError)
    expect(String(error instanceof Error ? error.message : '')).toMatch(/\(ERR_[A-Z0-9_]+\)$/)
  })

  const opsCases: [string, (config: Record<string, unknown>) => Record<string, unknown>][] = [
    ['socketDirectory 不是绝对路径', config => ({ ...config, socketDirectory: 'relative/dir' })],
    [
      'deploymentKey 不是两个 true',
      config => ({ ...config, deploymentKey: { present: true, complete: false } }),
    ],
    ['deploymentKey 缺席', ({ deploymentKey: _, ...config }) => config],
    [
      '部署参数缺一',
      config => {
        const { sharingInvitationTtlDefault: _, ...rest } = DEPLOYMENT_PARAMETERS
        return { ...config, deploymentParameters: rest }
      },
    ],
    [
      '部署参数非正',
      config => ({
        ...config,
        deploymentParameters: { ...DEPLOYMENT_PARAMETERS, copyNoticeTtlDefault: 0 },
      }),
    ],
    [
      '套接字目录权限过宽',
      config => {
        const directory = tempDirectory('wide')
        chmodSync(directory, 0o755)
        return { ...config, socketDirectory: directory }
      },
    ],
  ]

  it.each(opsCases)('运维面：%s ⇒ FAILED', async (_name, mutate) => {
    const c = await boot({ withOps: false })
    const { error, state } = await failedLoad(c, governanceCenterOpsPlugin, mutate(c.opsConfig))
    expect(error).toBeDefined()
    expect(state).toBe(FIBER_STATE.FAILED)
  })

  it('全部日志与启动失败说明里没有私钥、没有 config 的值（目录路径）', async () => {
    const c = await boot({ withOps: false })
    const directory = tempDirectory('wide-2')
    chmodSync(directory, 0o777)
    const { error } = await failedLoad(c, governanceCenterOpsPlugin, {
      ...c.opsConfig,
      socketDirectory: directory,
    })
    expect(String(error instanceof Error ? error.message : '')).not.toContain(directory)
    expect(c.messages.map(renderMessage).join('\n')).not.toContain(directory)
  })
})
