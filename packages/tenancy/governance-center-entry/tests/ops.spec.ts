// 运维面（入口契约 S-25、S-26；https-json/1 S-20、S-21）与两张面之间的四条通知（入口节点 T-9 运维面那一半、T-18；绑定 V-8）。
// 真实组合（tests/support/composition.ts）；钟是按调用次序可编排的替身，存储可整体不可用。
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  GovernanceCenterOpsConfigSchema,
  OPS_SOCKET_NAME,
  OpsSocketError,
  governanceCenterEntryPlugin,
} from '../src/index.ts'
import { conformsTo } from '../src/routing/schema.ts'
import {
  type Center,
  type CenterOptions,
  HEALTH,
  OPS_HEALTH,
  OG,
  ScriptedClock,
  bodyOf,
  bootCenter,
  envelopeOf,
  loadPlugin,
  registerAndLogin,
  tempDirectory,
  waitUntil,
} from './support/composition.ts'
import { httpRequest, sleep, splitReply, tlsExchange, unixExchange } from './support/wire.ts'

const centers: Center[] = []
afterEach(async () => {
  for (const c of centers.splice(0)) await c.dispose()
})

async function boot(options: CenterOptions = {}): Promise<Center> {
  const c = await bootCenter(options)
  centers.push(c)
  return c
}

async function fullHealth(c: Center, request?: Buffer): Promise<Record<string, unknown>> {
  const reply = await c.ops(request)
  const value = bodyOf(reply.bytes)
  if (typeof value !== 'object' || value === null) throw new Error('not an object')
  return { ...value }
}

describe('V-8 运维面的承载（S-20）', () => {
  it('套接字文件恰为目录下的 governance-center-ops.sock；运维面 config 没有网络地址一项（不经网络可达）', async () => {
    const c = await boot()
    expect(c.socketPath).toBe(join(c.socketDirectory, OPS_SOCKET_NAME))
    expect(lstatSync(c.socketPath).isSocket()).toBe(true)
    expect(
      GovernanceCenterOpsConfigSchema.safeParse({ ...c.opsConfig, host: '0.0.0.0', port: 9000 })
        .success,
    ).toBe(false)
  })

  it('目录权限含组或其他用户的位 ⇒ 起不来；目录不存在 ⇒ 起不来', async () => {
    const loose = tempDirectory('loose')
    chmodSync(loose, 0o750)
    const c = await boot({ withOps: false })
    await expect(c.loadOps({ ...c.opsConfig, socketDirectory: loose })).rejects.toMatchObject({
      failure: 'directory-permissions',
    })
    await expect(
      c.loadOps({ ...c.opsConfig, socketDirectory: join(loose, 'missing') }),
    ).rejects.toBeInstanceOf(OpsSocketError)
  })

  it('有人在听的残留套接字 ⇒ 起不来，那个文件还在；不是套接字的文件 ⇒ 起不来、不删；没人听的残留 ⇒ 被替换、起得来', async () => {
    const directory = tempDirectory('residual')
    const path = join(directory, OPS_SOCKET_NAME)
    const holder = createServer()
    await new Promise<void>(resolve => holder.listen(path, resolve))
    const c = await boot({ withOps: false, socketDirectory: directory })
    await expect(c.loadOps()).rejects.toMatchObject({ failure: 'socket-in-use' })
    expect(existsSync(path)).toBe(true)
    await new Promise<void>(resolve => holder.close(() => resolve()))

    const other = tempDirectory('not-socket')
    writeFileSync(join(other, OPS_SOCKET_NAME), 'keep me')
    await expect(c.loadOps({ ...c.opsConfig, socketDirectory: other })).rejects.toMatchObject({
      failure: 'not-a-socket',
    })
    expect(existsSync(join(other, OPS_SOCKET_NAME))).toBe(true)

    // 没人听的残留：另一个进程在那里监听、随后被 SIGKILL，文件留下、没人在听（上次崩溃留下的样子）
    const stale = tempDirectory('stale')
    const stalePath = join(stale, OPS_SOCKET_NAME)
    const child = spawn(process.execPath, [
      '-e',
      `require('node:net').createServer().listen(${JSON.stringify(stalePath)}, () => console.log('up')); setInterval(() => {}, 1000)`,
    ])
    await new Promise<void>(resolve => child.stdout.once('data', () => resolve()))
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    child.kill('SIGKILL')
    await exited
    expect(lstatSync(stalePath).isSocket()).toBe(true)
    await c.loadOps({ ...c.opsConfig, socketDirectory: stale })
    await c.open()
    const reply = await unixExchange(stalePath, httpRequest(OPS_HEALTH))
    expect(bodyOf(reply.bytes)).toMatchObject({ reachable: true })
  })
})

describe('T-9、V-8 运维面的答复（S-21、S-26）', () => {
  it('HT3同一合法full-health不因方法或路径变化：保留原FullHealthReply成员与字节外形', async () => {
    const c = await boot()
    await c.open()
    const requests = [
      httpRequest(OPS_HEALTH),
      httpRequest(OPS_HEALTH, { method: 'GET', path: '/anything' }),
      httpRequest(OPS_HEALTH, { method: 'DELETE' }),
      httpRequest(OPS_HEALTH, { method: 'HEAD' }),
    ]
    for (const request of requests) {
      const reply = await c.ops(request)
      const { head, body } = splitReply(reply.bytes)
      expect(head).toBe(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\nConnection: close`,
      )
      const value: unknown = JSON.parse(body)
      expect(conformsTo('FullHealthReply', value)).toBe(true)
      expect(Object.keys(value as object)).toEqual([
        'reachable',
        'centerId',
        'version',
        'startedAt',
        'storageReachable',
        'deploymentKeyPresent',
        'deploymentKeyComplete',
        'clockSane',
        'defectCount',
        'deploymentParameters',
      ])
    }
  })

  it('HT3坏表示不调用health，深度和成员数超界仍零响应', async () => {
    const c = await boot()
    await c.open()
    const ada = await registerAndLogin(c, 'ada@example.invalid')
    const reads = c.storage.reads
    for (const body of [
      '{}',
      '',
      'not json',
      JSON.stringify(envelopeOf(OG(27), {}, ada.presentation)),
      JSON.stringify({ operation: HEALTH }),
    ])
      expect(bodyOf((await c.ops(httpRequest(body))).bytes)).toEqual({ status: 'invalid-input' })
    for (const body of [
      `${'['.repeat(200)}${']'.repeat(200)}`,
      `{${Array.from({ length: 3000 }, (_, i) => `"m${String(i)}":0`).join(',')}}`,
    ])
      expect((await c.ops(httpRequest(body))).bytes.length).toBe(0)
    expect(c.storage.reads).toBe(reads)
  })

  it('storageReachable、clockSane 每次读都现探；体检里没有治理事实', async () => {
    const c = await boot()
    await c.open()
    const ada = await registerAndLogin(c, 'ada@example.invalid')
    expect(await fullHealth(c)).toMatchObject({ storageReachable: true, clockSane: true })
    c.storage.down = true
    expect(await fullHealth(c)).toMatchObject({ storageReachable: false, clockSane: true })
    c.storage.down = false
    c.clock.unavailable = true
    expect(await fullHealth(c)).toMatchObject({ storageReachable: true, clockSane: false })
    c.clock.unavailable = false
    const text = JSON.stringify(await fullHealth(c))
    expect(text).not.toContain('ada@example.invalid')
    expect(text).not.toContain(ada.handle)
    expect(text).not.toContain(ada.presentation)
  })
})

describe('T-18 两张面同起同停与十项的来源', () => {
  it('serving 之前运维面关闭连接不答；开门后三样齐全，startedAt 是开门那一刻读到的时刻（晚于插件体里等钟那一次）', async () => {
    const clock = new ScriptedClock()
    clock.step = 1_000
    clock.label = 'body'
    const c = await boot({ clock })
    expect((await c.ops()).bytes.length).toBe(0)
    const bodyRead = clock.reads.find(read => read.label === 'body' && read.value !== 'unavailable')
    clock.label = 'open'
    const notice = await c.open()
    const openRead = clock.reads.find(read => read.label === 'open')
    expect(openRead?.value).toBe(notice.startedAt)
    expect(typeof bodyRead?.value === 'number' && notice.startedAt > bodyRead.value).toBe(true)
    const health = await fullHealth(c)
    expect(health).toMatchObject({ centerId: notice.centerId, version: '0.1.0', defectCount: 0 })
    expect(health['startedAt']).toBe(new Date(notice.startedAt).toISOString().replace('.000Z', 'Z'))
  })

  it('入口层撤除（stopped）之后运维面停答；入口层重跑见到已兑现的 openSignal 即开门，startedAt 与 defectCount 不变，门关本身不加缺陷', async () => {
    const clock = new ScriptedClock()
    clock.step = 1_000
    const c = await boot({ clock })
    const first = await c.open()
    const before = await fullHealth(c)
    await c.entryFiber?.dispose()
    expect(c.events.stopped).toBe(1)
    expect((await c.ops()).bytes.length).toBe(0)
    expect(
      (await tlsExchange(c.port, httpRequest(JSON.stringify({ operation: HEALTH })))).bytes.length,
    ).toBe(0)
    const servingBefore = c.serving.length
    await c.loadEntry()
    await waitUntil(() => c.serving.length > servingBefore)
    const after = await fullHealth(c)
    expect(after['centerId']).toBe(first.centerId)
    expect(after['startedAt']).toBe(before['startedAt'])
    expect(after['defectCount']).toBe(0)
    expect(c.events.defect).toBe(0)
  })

  it('普通重启：那一行早已铸好，运维面在入口层开门之前不答；运维面插件体不读 governance_center（装载期间没有任何存储读）', async () => {
    const c = await boot({ withOps: false })
    await c.open()
    await c.entryFiber?.dispose()
    const readsBefore = c.storage.reads + c.storage.writes
    await c.loadOps()
    expect(c.storage.reads + c.storage.writes).toBe(readsBefore)
    expect(c.events.listening).toBe(1)
    expect((await c.ops()).bytes.length).toBe(0)
    const servingBefore = c.serving.length
    await c.loadEntry()
    await waitUntil(() => c.serving.length > servingBefore)
    expect(await fullHealth(c)).toMatchObject({ reachable: true })
  })

  it('插件体里等钟：先若干次 unavailable、在上界内转为可读 ⇒ 插件体等到之后才返回', async () => {
    const clock = new ScriptedClock()
    clock.script.push('unavailable', 'unavailable', 'unavailable')
    const c = await boot({ clock, skipCenterPlugins: true })
    const started = performance.now()
    await c.loadEntry()
    expect(performance.now() - started).toBeGreaterThanOrEqual(250)
    expect(clock.reads.slice(0, 4).map(read => read.value)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      clock.reads[3]?.value,
    ])
    expect(c.entryFiber?.state).toBe(FIBER_STATE.ACTIVE)
  })

  it('插件体里等钟一直读不到 ⇒ 启动失败、说明点名是钟、监听已关、没有 serving、运维面始终不答', async () => {
    const clock = new ScriptedClock()
    clock.unavailable = true
    const c = await boot({ clock, skipCenterPlugins: true, clockReadyTimeoutMs: 300 })
    await c.loadOps()
    const error = await c.loadEntry().then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(String(error instanceof Error ? error.message : '')).toMatch(/clock/)
    const reply = await tlsExchange(c.port, httpRequest('{}'))
    expect(reply.handshake).toBe(false)
    expect(c.serving).toHaveLength(0)
    expect((await c.ops()).bytes.length).toBe(0)
  })

  it('插件体里等钟期间撤掉入口层 ⇒ 轮询停止、不抛出', async () => {
    const clock = new ScriptedClock()
    clock.unavailable = true
    const c = await boot({ clock, skipCenterPlugins: true, clockReadyTimeoutMs: 5_000 })
    const fiber = c.ctx.plugin(governanceCenterEntryPlugin, c.entryConfig as never)
    await waitUntil(() => clock.reads.length >= 2)
    await fiber.dispose()
    const reads = clock.reads.length
    await sleep(350)
    expect(clock.reads.length).toBeLessThanOrEqual(reads + 1)
    expect(c.serving).toHaveLength(0)
  })

  it('开门那一刻等钟：兑现时读不到、在上界内转为可读 ⇒ 等到才开门', async () => {
    const clock = new ScriptedClock()
    const c = await boot({ clock })
    clock.unavailable = true
    c.openSignal.resolve()
    await sleep(250)
    expect(c.serving).toHaveLength(0)
    expect(
      (await tlsExchange(c.port, httpRequest(JSON.stringify({ operation: HEALTH })))).bytes.length,
    ).toBe(0)
    clock.unavailable = false
    await waitUntil(() => c.serving.length === 1)
    expect(
      bodyOf((await tlsExchange(c.port, httpRequest(JSON.stringify({ operation: HEALTH })))).bytes),
    ).toMatchObject({ reachable: true })
  })

  it('开门那一刻钟一直读不到 ⇒ 不开门、端口释放、一条原因为钟的 error 记录、没有 serving', async () => {
    const clock = new ScriptedClock()
    const c = await boot({ clock, clockReadyTimeoutMs: 300 })
    clock.unavailable = true
    c.openSignal.resolve()
    await waitUntil(() =>
      c.messages.some(m => m.name === 'governance-center-entry' && m.type === 'error'),
    )
    const errors = c.messages.filter(
      m => m.name === 'governance-center-entry' && m.type === 'error',
    )
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.args[0])).toMatch(/cause: clock/)
    await waitUntil(() => true)
    await sleep(50)
    const reply = await tlsExchange(c.port, httpRequest('{}'))
    expect(reply.handshake).toBe(false)
    expect(c.serving).toHaveLength(0)
    expect((await c.ops()).bytes.length).toBe(0)
  })

  it('开门那一刻等钟期间撤掉入口层 ⇒ 下一拍停止、不开门、不发任何通知', async () => {
    const clock = new ScriptedClock()
    const c = await boot({ clock, clockReadyTimeoutMs: 5_000 })
    clock.unavailable = true
    c.openSignal.resolve()
    await sleep(150)
    await c.entryFiber?.dispose()
    const reads = clock.reads.length
    clock.unavailable = false
    await sleep(300)
    expect(clock.reads.length).toBe(reads)
    expect(c.serving).toHaveLength(0)
    expect(c.events.stopped).toBe(0)
  })

  it.each([
    ['入口层先重跑完、运维面后到', 'entry-first'],
    ['运维面先重跑完、入口层后到', 'ops-first'],
  ] as const)(
    'storage 换代演练（%s）：两张面都恢复应答，centerId 不变且只来自 serving',
    async (_name, order) => {
      const c = await boot()
      const first = await c.open()
      await c.unloadStorage()
      expect(c.entryFiber?.state).toBe(FIBER_STATE.PENDING)
      expect(c.opsFiber?.state).toBe(FIBER_STATE.PENDING)
      expect(c.events.stopped).toBe(1)
      const listeningBefore = c.events.listening
      const servingBefore = c.serving.length
      if (order === 'entry-first') {
        await c.opsFiber?.dispose()
        await c.reloadStorage()
        await waitUntil(() => c.serving.length === servingBefore + 1)
        await c.loadOps()
        // 运维面后到：是它的 listening 让入口层重发了 serving
        await waitUntil(() => c.serving.length === servingBefore + 2)
        expect(c.events.listening).toBe(listeningBefore + 1)
      } else {
        await c.entryFiber?.dispose()
        await c.reloadStorage()
        await waitUntil(() => c.events.listening === listeningBefore + 1)
        expect(c.serving.length).toBe(servingBefore)
        expect((await c.ops()).bytes.length).toBe(0)
        await c.loadEntry()
        // 入口层后到：是它开门那一次 serving
        await waitUntil(() => c.serving.length === servingBefore + 1)
      }
      for (const notice of c.serving) expect(notice.centerId).toBe(first.centerId)
      expect(await fullHealth(c)).toMatchObject({ centerId: first.centerId, reachable: true })
      expect(
        bodyOf(
          (await tlsExchange(c.port, httpRequest(JSON.stringify({ operation: HEALTH })))).bytes,
        ),
      ).toMatchObject({
        centerId: first.centerId,
      })
    },
  )

  it('运维面装载时的握手处理者抛出只记 error，不改变入口层的行为', async () => {
    const c = await boot({ withOps: false })
    await c.open()
    c.ctx.on('governance-center-entry/serving', () => {
      throw new Error('listener failure')
    })
    await c.loadOps()
    await waitUntil(() =>
      c.messages.some(m => m.name === 'governance-center-entry' && m.type === 'error'),
    )
    expect(
      bodyOf((await tlsExchange(c.port, httpRequest(JSON.stringify({ operation: HEALTH })))).bytes),
    ).toMatchObject({ reachable: true })
    // 运维面这一次收没收到 serving 取决于监听者次序：Cordis 的 emit 不隔离监听者，排在它前面的那个抛出就轮不到它
    // （basis emit-listener-throw-propagates）。这里只断言入口层自己的行为不变。
  })
})

describe('loadPlugin 夹具自检', () => {
  it('入口层 config 里 openSignal 是同一个引用（z.custom，不重建）', async () => {
    const c = await boot({ skipCenterPlugins: true })
    const fiber = await loadPlugin(c.ctx, governanceCenterEntryPlugin, c.entryConfig)
    expect(fiber.state).toBe(FIBER_STATE.ACTIVE)
    const servingBefore = c.serving.length
    c.openSignal.resolve()
    await waitUntil(() => c.serving.length > servingBefore)
    await fiber.dispose()
  })
})
