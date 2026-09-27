import { existsSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { createUpgradeGuard, openStorage } from '@omne-harness-lite/storage-sql'
import { OnlineMaintenance } from '../src/maintenance/online.ts'
import * as health from '../src/ops/health.ts'
import { bootCenter, bodyOf, composedMigrations, type Center } from './support/composition.ts'
import { httpRequest } from './support/wire.ts'

const centers: Center[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const center of centers.splice(0)) await center.dispose()
})
async function boot() {
  const center = await bootCenter()
  centers.push(center)
  await center.open()
  return center
}
function request(operation: string, payload: unknown = {}) {
  return httpRequest(JSON.stringify({ opsVersion: '1', operation, payload }))
}

it('dispatches actual online backup and status through the original Unix socket', async () => {
  const center = await boot()
  expect(bodyOf((await center.ops(request('backup-status'))).bytes)).toMatchObject({
    status: 'observed',
    health: 'missing',
  })
  const backup = bodyOf((await center.ops(request('backup', { onlyIfDue: true }))).bytes)
  expect(backup).toMatchObject({
    status: 'completed',
    backup: { metadata: { centerId: center.serving[0]?.centerId } },
  })
  expect(bodyOf((await center.ops(request('backup-status'))).bytes)).toMatchObject({
    status: 'observed',
    health: 'current',
    invalidCount: 0,
  })
  expect(bodyOf((await center.ops(request('backup', { onlyIfDue: true }))).bytes)).toMatchObject({
    status: 'not-due',
  })
  expect(
    bodyOf((await center.ops(request('verify', { sourceLocation: '/tmp/never-read' }))).bytes),
  ).toEqual({ status: 'invalid-input' })
})

it.each(['full-health', 'backup', 'backup-status'] as const)(
  'closes with zero bytes and fixed diagnostics on %s internal defect',
  async operation => {
    const center = await boot()
    const secret = 'must-not-appear-in-ops-diagnostic'
    const failure = new Error(secret)
    if (operation === 'full-health')
      vi.spyOn(health, 'fullHealthBody').mockRejectedValueOnce(failure)
    else
      vi.spyOn(
        OnlineMaintenance.prototype,
        operation === 'backup' ? 'backup' : 'backupStatus',
      ).mockRejectedValueOnce(failure)
    const reply = await center.ops(
      request(operation, operation === 'backup' ? { onlyIfDue: false } : {}),
    )
    expect(reply.bytes.length).toBe(0)
    expect(center.logText()).toContain('ops-internal-defect')
    expect(center.logText()).not.toContain(secret)
  },
)

it('network drain finishes before a blocked owned run, without releasing the source or replaying it', async () => {
  const center = await boot()
  const source = center.raw.maintenance
  if (source === undefined) throw new Error('missing source maintenance')
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const ready = new Promise<void>(resolve => {
    entered = resolve
  })
  const run = source.run.bind(source)
  const admitted = vi.spyOn(source, 'run').mockImplementation((fn, options) =>
    run(async session => {
      entered()
      await gate
      return fn(session)
    }, options),
  )
  const response = center.ops(request('backup-status'), { timeoutMs: 10_000 })
  await ready
  let disposed = false
  const disposing = center.opsFiber!.dispose().then(() => {
    disposed = true
  })
  let sourceClosed = false
  const closingSource = center.raw.close().then(() => {
    sourceClosed = true
  })
  try {
    expect((await response).bytes.length).toBe(0)
    expect(disposed).toBe(false)
    expect(sourceClosed).toBe(false)
    await expect(
      openStorage({
        dialect: 'sqlite',
        file: center.file,
        migrations: composedMigrations(),
        upgrade: { guard: createUpgradeGuard(), checks: [] },
      }),
    ).rejects.toMatchObject({ stage: 'occupied' })
    expect(admitted).toHaveBeenCalledTimes(1)
  } finally {
    release()
    await disposing
    await closingSource
  }
}, 15_000)

it('refuses a missing maintenance facet or config before creating the ops socket', async () => {
  const center = await bootCenter({ withOps: false })
  centers.push(center)
  const { maintenance: _maintenance, ...withoutMaintenance } = center.opsConfig
  await expect(center.loadOps(withoutMaintenance)).rejects.toThrow()
  expect(existsSync(center.socketPath)).toBe(false)
  vi.spyOn(center.storage, 'maintenance', 'get').mockReturnValue(undefined)
  await expect(center.loadOps()).rejects.toThrow('owned snapshot maintenance is required')
  expect(existsSync(center.socketPath)).toBe(false)
})
