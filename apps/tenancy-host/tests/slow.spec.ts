// @module-tag slow
// 归慢层：真实等待＋整套装配：按真实时长等时钟租约与撤除总超时，每条都起完整中心（SQLite 文件库、本地 TLS 入口）。
// 按真实时长跑的几条（时钟租约宽度 10 s、撤除总超时 30 s 都是真常量）：
// assembly.clock-ready-timeout ②③、assembly.clock-rollback-fails-boot 的反向（快速重启）、
// assembly.no-commit-before-open ⑤（U-4：确认之后等不到 serving）、assembly.dispose-timeout。
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { DISPOSE_TIMEOUT_MS, SERVING_GRACE_MS } from '../src/index.ts'
import {
  CLOCK_READY_TIMEOUT_MS,
  centerIdOf,
  deployment,
  dumpDatabase,
  execute,
  query,
  sidecarsOf,
  tablesOf,
} from './support/deployment.ts'
import { fragment } from './support/fragments.ts'
import { Hosts, allDisposed } from './support/host.ts'
import { PUBLIC_HEALTH_BODY, bodyOf, tlsExchange } from './support/wire.ts'

const hosts = new Hosts()
afterEach(() => hosts.stopAll())

async function seeded(label: string) {
  const d = await deployment(label)
  const { host } = await hosts.start(d)
  await hosts.stop(host)
  return { d, centerId: host.serving.centerId }
}

describe('assembly.clock-ready-timeout ②③ 与快速重启', () => {
  it('② 钟在界内一直读不到（lease_until 推到界之外）⇒ 入口层超界、boot() 拒绝于「钟读不到」、其余已撤、升级快照已恢复', async () => {
    const { d } = await seeded('clock-unreadable')
    const before = dumpDatabase(d.file)
    const now = Date.now()
    execute(
      d.file,
      'UPDATE clock_lease SET written_at = ?, lease_until = ?',
      now - 1_000,
      now + CLOCK_READY_TIMEOUT_MS + 30_000,
    )
    const expected = dumpDatabase(d.file)
    const started = performance.now()
    const refused = await hosts.refuse(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(performance.now() - started).toBeGreaterThanOrEqual(CLOCK_READY_TIMEOUT_MS - 200)
    expect(refused.failure).toMatchObject({
      stage: 'clock-unreadable',
      item: 'governance-center-entry',
    })
    expect(allDisposed(refused.fibers)).toBe(true)
    expect(tablesOf(d.file)).not.toContain('upgrade_probe')
    expect(sidecarsOf(d.file).snapshot).toBe(false)
    expect(dumpDatabase(d.file)).toEqual(expected)
    expect(before.rows['governance_center']).toEqual(expected.rows['governance_center'])
  }, 60_000)

  it('③／快速重启：written_at ≤ 墙钟 < lease_until ⇒ 入口层等钟可读之后成功（至多一个租约宽度），startedAt 不早于 lease_until', async () => {
    const { d, centerId } = await seeded('quick-restart')
    const now = Date.now()
    const leaseUntil = now + 3_000
    execute(
      d.file,
      'UPDATE clock_lease SET written_at = ?, lease_until = ?',
      now - 1_000,
      leaseUntil,
    )
    const { host } = await hosts.start(d)
    expect(host.serving.centerId).toBe(centerId)
    expect(host.serving.startedAt).toBeGreaterThanOrEqual(leaseUntil)
  }, 60_000)
})

describe('assembly.no-commit-before-open ⑤：确认之后等不到 serving（已接受的残余情形 U-4）', () => {
  it('开闸那一刻钟读不到 ⇒ 等 clockReadyTimeoutMs + 1 s 之后拒绝「钟读不到或回拨：重启前先核钟」、逆序撤完、端口已放；快照已确认、不恢复；恢复钟后同一版本照常起；钟往回拨则在只读核对上拒绝', async () => {
    const { d, centerId } = await seeded('u4')
    // 另一个连接持住写锁：clock 续约写不进去，租约过期后 now() 答 'unavailable'
    let blocker: DatabaseSync | undefined
    const refused = await hosts.refuse(d, {
      extraMigrations: [fragment('upgrade_probe')],
      beforeConfirm: async context => {
        blocker = new DatabaseSync(d.file, { timeout: 0 })
        blocker.exec('BEGIN IMMEDIATE')
        const clock = context.get('clock') as Clock
        await expect.poll(() => clock.now(), { timeout: 30_000, interval: 200 }).toBe('unavailable')
      },
    })
    const released = performance.now()
    blocker?.exec('ROLLBACK')
    blocker?.close()
    expect(refused.failure.stage).toBe('serving-timeout')
    expect(refused.failure.message).toContain('钟读不到或回拨：重启前先核钟')
    expect(refused.log.events('upgrade-confirmed')).toHaveLength(1)
    expect(refused.log.events('serving')).toEqual([])
    expect(allDisposed(refused.fibers)).toBe(true)
    expect(released).toBeGreaterThan(0)
    // 快照在兑现之前已确认：没有恢复，库是新版本的完整数据
    expect(sidecarsOf(d.file).snapshot).toBe(false)
    expect(tablesOf(d.file)).toContain('upgrade_probe')
    // 恢复钟之后用同一版本再起：无遗留快照、无待跑迁移、中心标识不变
    const again = await hosts.start(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(again.host.serving.centerId).toBe(centerId)
    expect(again.host.confirmation).toEqual({
      migrated: false,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    expect(bodyOf(await tlsExchange(d.port, PUBLIC_HEALTH_BODY))).toMatchObject({ centerId })
    await hosts.stop(again.host)
    // 反向：钟往回拨到 written_at 之前再原样重启 ⇒ 迁移前的只读核对拒绝（所以说明写「重启前先核钟」）
    const future = Date.now() + 3_600_000
    execute(d.file, 'UPDATE clock_lease SET written_at = ?, lease_until = ?', future, future)
    const rolledBack = await hosts.refuse(d, { extraMigrations: [fragment('upgrade_probe')] })
    expect(rolledBack.failure.stage).toBe('preflight')
    expect(rolledBack.failure.message).toContain('clock-rolled-back')
    expect(centerIdOf(d.file)).toBe(centerId)
    expect(CLOCK_READY_TIMEOUT_MS + SERVING_GRACE_MS).toBeLessThan(60_000)
  }, 120_000)
})

describe('assembly.dispose-real-completion', () => {
  it('30秒只报告still-stopping，保持真实等待与源owner直到disposer结束', async () => {
    const d = await deployment('dispose-pending')
    const { host, log } = await hosts.start(d)
    const registration = host.fibers['account-registration']
    if (registration === undefined) throw new Error('no AR fiber')
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    registration.ctx.effect(() => () => gate, 'test: delayed disposer')
    let settled = false
    const disposing = hosts.stop(host).then(result => {
      settled = true
      return result
    })
    try {
      await new Promise<void>(resolve => setTimeout(resolve, DISPOSE_TIMEOUT_MS + 200))
      expect(settled).toBe(false)
      expect(log.events('still-stopping')).toHaveLength(1)
      expect(log.events('fiber-disposed').map(line => line['plugin'])).toEqual([
        'governance-center-entry',
        'governance-center-ops',
      ])
      const { openStorage, createUpgradeGuard } = await import('@omne-harness-lite/storage-sql')
      const { composeMigrations } = await import('@omne-harness-lite/storage')
      const { hostMigrationFragments } = await import('../src/index.ts')
      await expect(
        openStorage({
          dialect: 'sqlite',
          file: d.file,
          migrations: composeMigrations(hostMigrationFragments),
          upgrade: { guard: createUpgradeGuard(), checks: [] },
        }),
      ).rejects.toMatchObject({ stage: 'occupied' })
    } finally {
      release()
    }
    expect(await disposing).toEqual({ complete: true, unfinished: [] })
    expect(query(d.file, 'SELECT count(*) AS n FROM governance_center')).toEqual([{ n: 1 }])
  }, 90_000)
})
