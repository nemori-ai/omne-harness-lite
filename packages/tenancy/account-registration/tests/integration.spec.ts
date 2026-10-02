// 架构评审点名的其余集成点（I-6、I-7、I-8、I-10）与本插件自己的装载面（config、inject、换代时在途调用的收场）。
// I-7、I-8、I-10 用真实 clock 插件；I-6 用时间替身。真实组合，含真实 credential-verification。
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LEASE_WIDTH_MS } from '@omne-harness-lite/clock'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import {
  AccountRegistrationConfigSchema,
  TERMINAL_OUTCOMES,
  registrationPlugin,
} from '../src/index.ts'
import {
  type Composition,
  type CompositionOptions,
  HOUR,
  NO_VIOLATIONS,
  OTHER_PASSWORD,
  PASSWORD,
  accountIdOf,
  accountsOf,
  bootComposition,
  committed,
  invariantViolations,
  personalOrganizationsOf,
  stmt,
} from './support.ts'

const compositions: Composition[] = []
afterEach(async () => {
  for (const c of compositions.splice(0).reverse()) await c.dispose()
})
async function boot(options: CompositionOptions = {}): Promise<Composition> {
  const c = await bootComposition(options)
  compositions.push(c)
  return c
}

describe('I-6 清除完成之前同一标识重新注册', () => {
  it('清除链停在两步之间时：AI S-13 按契约答 identifier-held-by-expired-record（不是存储缺陷）；经本组合注册则就地续完清除链、得到新账号；随后那条清扫的 ② 幂等收场', async () => {
    const c = await boot({ clock: 'test', retention: HOUR })
    c.storage.failCommit(committed(stmt.on('update', 'account', { column: 'activated' })))
    expect(await c.service().register('ivy', PASSWORD)).toBe('interrupted')
    const old = await accountIdOf(c, 'ivy')
    c.clock!.advance(HOUR + 1)
    const between = c.storage.pauseAfterCommit(committed(stmt.on('delete', 'organization')))
    const sweep = c.service().purgeExpired(old)
    await between.reached

    expect(await c.accounts.produce('ivy', OTHER_PASSWORD)).toEqual({
      failure: 'identifier-held-by-expired-record',
      expiredRecord: old,
    })
    expect(await c.service().register('ivy', OTHER_PASSWORD)).toBe('registered')
    between.release()
    expect(await sweep).toBe('ok')
    expect(await accountIdOf(c, 'ivy')).not.toBe(old)
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    // 清除完成之后再用同一标识注册：此时已被新账号占用 ⇒ identifier-taken（AI 契约的失败值）
    expect(await c.service().register('ivy', PASSWORD)).toBe('identifier-taken')
  })

  it.skip('I-6 撞 account_login_identifier_unique 那一支——sqlite 下到不了：写事务 BEGIN IMMEDIATE 串行，AI 在写事务里按标识重读（current），先成者的行总被看见，走的是「不同类 ⇒ 重来」而不是插入撞唯一索引；那一支只在 pg 上走，归 W3-A（pg 首跑，AI verification 已登记同一条）', () => {})
})

describe('I-7 单一共享 storage 上三方写并发', () => {
  // 归慢层：真实等待＋真库：按真实时钟压满一个以上的续约周期，期间在 SQLite 文件库上并发写。
  it(
    '真实 clock 定时续约写 ＋ AI accounts.read 落盘写 ＋ OG／AR 写，跨过至少一次续约：没有「nested storage call」缺陷，每次调用都落在自己的结果集合里，不变量成立',
    { tags: ['slow'] },
    async () => {
      // 留存期限 1 ms：几乎每一次 ② 的账号读面都要把过期落盘（AI 的读面里的写），重来的注册又要就地跑清除链
      const c = await boot({ retention: 1 })
      const expiryWitness = await c.accounts.produce('expiry-witness', PASSWORD)
      if (!('ok' in expiryWitness)) throw new Error('expiry witness was not produced')
      await new Promise(resolve => setTimeout(resolve, 5))
      const mark = c.storage.statements.length
      // Ensure the expiry-write path is exercised even if fast registrations finish within 1 ms.
      expect(await c.accounts.read(expiryWitness.ok)).toEqual({
        ok: { activated: false, retentionExpired: true },
      })
      const outcomes: string[] = []
      const deadline = performance.now() + 4_000 // > 续约周期（LEASE_WIDTH_MS / 3 ≈ 3.3 s）
      let round = 0
      while (performance.now() < deadline) {
        const identifier = `load-${round % 5}`
        round += 1
        const batch = await Promise.all([
          c.service().register(identifier, PASSWORD),
          c.service().register(identifier, OTHER_PASSWORD),
          c.service().register(`${identifier}-x`, PASSWORD),
          (async () => {
            const [row] = await accountsOf(c, identifier)
            if (row === undefined) return 'no-row'
            const read = await c.accounts.read(row.account_id)
            return 'ok' in read ? 'read' : read.failure
          })(),
        ])
        outcomes.push(...batch)
        // node:sqlite 是同步驱动，一整轮调用可以只靠微任务走完；不让出宏任务，定时续约就永远排不上（真实请求经 I/O 到达，天然让出）
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      const written = c.storage.statements.slice(mark).filter(s => s.inWrite)
      expect(written.filter(s => s.tables.has('clock_lease')).length).toBeGreaterThan(0) // 续约真的发生在窗口里
      expect(
        written.filter(s => s.tables.has('account') && s.columns.has('expired_at')).length,
      ).toBeGreaterThan(0)
      expect(written.filter(s => s.tables.has('organization')).length).toBeGreaterThan(0)
      for (const outcome of outcomes)
        expect([...TERMINAL_OUTCOMES, 'read', 'no-row', 'account-not-found']).toContain(outcome)
      const logged = c
        .messages()
        .map(m => m.args.map(String).join(' '))
        .filter(text => /nested storage call|StorageDefect/.test(text))
      expect(logged).toEqual([])
      expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    },
  )
})

describe('I-8 同一库文件整装配重启（同进程 dispose 再 boot，不是 OS 进程重启）', () => {
  it('S-32／S-47 的重启一支：签发 → 整个装配撤掉 → 同一库文件、同一组部署密钥再装 ⇒ 出示物仍换得同一个 LoginStateId；撤销之后再重启仍无效', async () => {
    const first = await bootComposition({ label: 'restart' })
    let second: Composition | undefined
    let third: Composition | undefined
    try {
      expect(await first.service().register('rita', PASSWORD)).toBe('registered')
      const accountId = await accountIdOf(first, 'rita')
      const a = await first.logins().issue('rita', PASSWORD)
      const b = await first.logins().issue('rita', PASSWORD)
      if (!('ok' in a) || !('ok' in b)) throw new Error('issue failed')
      await first.dispose()

      second = await bootComposition({ file: first.file, keys: first.keys })
      expect(await second.logins().exchange(a.ok.presentation)).toEqual({
        ok: { loginStateId: a.ok.loginStateId, accountId },
      })
      expect(await second.logins().revoke(a.ok.loginStateId, b.ok.loginStateId)).toBe('ok')
      // 重启之后账号仍是注册成立的形态
      expect(await personalOrganizationsOf(second, accountId)).toHaveLength(1)
      await second.dispose()
      second = undefined

      third = await bootComposition({ file: first.file, keys: first.keys })
      expect(await third.logins().exchange(a.ok.presentation)).toEqual({
        failure: 'login-state-rejected',
      })
      expect(await third.logins().exchange(b.ok.presentation)).toEqual({
        ok: { loginStateId: b.ok.loginStateId, accountId },
      })
    } finally {
      await second?.dispose()
      await third?.dispose()
    }
  }, 30_000)
})

describe('I-10 storage 先于 clock 撤除', () => {
  // 归慢层：真实等待＋真库：重启后按真实时钟等旧租约到期、钟才可读（真 clock 插件、SQLite 文件库）。
  it(
    '存储先关、再撤 clock：clock 记一条 warn、撤除不抛；同一库文件下一次启动 clock 不报回拨',
    { tags: ['slow'] },
    async () => {
      const c = await bootComposition({ label: 'clock-order' })
      const clockFiber = c.assembly.fibers[1]
      if (clockFiber === undefined) throw new Error('no clock fiber')
      await c.raw.close()
      await expect(clockFiber.dispose()).resolves.toBeUndefined()
      const warns = c
        .messages()
        .filter(m => m.type === 'warn')
        .map(m => m.args.map(String).join(' '))
        .filter(text => text.includes('reclaiming the lease on dispose failed'))
      expect(warns).toHaveLength(1)
      await c.assembly.dispose()

      // 租约没收回：下一次启动不报回拨（boot 不抛 ClockRollbackDetected）；接手旧行后 hw 起于旧 lease_until，
      // 在那之前答 'unavailable'（等至多一个租约宽度），之后照常取时、注册走得通
      const next = await boot({ file: c.file, keys: c.keys })
      const clock = next.ctx.get('clock') as { now(): number | 'unavailable' }
      const waitedFrom = performance.now()
      while (clock.now() === 'unavailable') {
        expect(performance.now() - waitedFrom).toBeLessThan(LEASE_WIDTH_MS + 2_000)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      expect(await next.service().register('after-restart', PASSWORD)).toBe('registered')
    },
  )
})

describe('插件装载面', () => {
  it('config：缺私钥、给的是公钥、多余成员 ⇒ 启动失败（不 provide）', () => {
    const keys = generateHandoffKeyPair()
    expect(
      AccountRegistrationConfigSchema.safeParse({ activationSigningKeyPem: keys.privateKeyPem })
        .success,
    ).toBe(true)
    for (const bad of [
      {},
      { activationSigningKeyPem: keys.publicKeyPem },
      { activationSigningKeyPem: '' },
      { activationSigningKeyPem: keys.privateKeyPem, extra: 1 },
    ]) {
      expect(AccountRegistrationConfigSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('三个参与方都是必需 inject：一个都不在时 PENDING，registration 解析不到', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(registrationPlugin, {
      activationSigningKeyPem: generateHandoffKeyPair().privateKeyPem,
    })
    expect(fiber.state as number).toBe(FIBER_STATE.PENDING)
    expect(ctx.get('registration')).toBeUndefined()
    await fiber.dispose()
  })

  it('config 校验失败 ⇒ fiber FAILED、不 provide', async () => {
    const c = await boot()
    await c.fibers.registration.dispose()
    const fiber = c.ctx.plugin(registrationPlugin, { activationSigningKeyPem: 'nope' } as never)
    await expect(Promise.resolve(fiber)).rejects.toThrow()
    expect(fiber.state as number).toBe(FIBER_STATE.FAILED)
    expect(c.registration()).toBeUndefined()
    await fiber.dispose()
  })

  it('依赖换代等待旧尝试静止，新代只在旧交接结束后接纳工作', async () => {
    const c = await boot()
    const gate = c.storage.pauseAfterCommit(committed(stmt.on('insert', 'account')))
    const old = c.service()
    const running = old.register('rerun', PASSWORD)
    await gate.reached
    let stopped = false
    const stopping = c.fibers.organizationGovernance.dispose().then(() => {
      stopped = true
    })
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(stopped).toBe(false)
    } finally {
      gate.release()
    }
    expect(await running).toBe('interrupted')
    await stopping
    await c.reload('organizationGovernance')
    expect(c.fibers.registration.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(await old.register('old-reference', PASSWORD)).toBe('interrupted')
    const [account] = await accountsOf(c, 'rerun')
    expect(account?.activated).toBe(0)
    expect(await personalOrganizationsOf(c)).toEqual([])
    expect(await c.service().register('rerun', PASSWORD)).toBe('registered')
  })
})
