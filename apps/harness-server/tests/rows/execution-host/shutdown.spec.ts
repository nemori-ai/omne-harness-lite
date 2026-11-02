import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import { createHostFilesRuntime } from '../../../src/host-files.ts'
import { disposeRow } from '../../../src/loader.ts'
import { LifecycleRegistry } from '../../../src/lifecycle.ts'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { runShutdown, monotonicClock, type ShutdownRecord } from '../../../src/shutdown.ts'
import type { LifecyclePhase, RowId } from '../../../src/types.ts'

afterEach(() => vi.useRealTimers())

function id(value: string): RowId {
  const declared = rowDeclarationOf(
    defineRow({
      row: value,
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: [], sameProviderGroup: null },
      plugin: { apply() {} },
    }),
  )
  if (declared === undefined) throw new Error('missing row declaration')
  return declared.row
}

it('runs the loader maintenance callback only after the real fiber disposer settles', async () => {
  const root = new Context()
  const retirement = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const afterDispose = vi.fn(async () => undefined)
  const fiber = await root.plugin({
    apply(ctx: Context) {
      ctx.effect(
        () => async () => {
          entered.resolve()
          await retirement.promise
        },
        'held-retirement',
      )
    },
  })
  const pending = disposeRow(
    {
      id: id('execution-host'),
      ctx: root,
      fiber,
      visible: [],
      manifest: { provides: [], injects: [], phase: null, sameProviderGroup: null },
    },
    afterDispose,
  )
  await entered.promise
  expect(afterDispose).not.toHaveBeenCalled()
  retirement.resolve()
  await pending
  expect(afterDispose).toHaveBeenCalledTimes(1)
  await root.fiber.dispose()
})

function setup() {
  const events: string[] = []
  const records: ShutdownRecord[] = []
  const expected = new Map<RowId, LifecyclePhase>([
    [id('business'), 'business'],
    [id('storage'), 'storage'],
  ])
  const registry = new LifecycleRegistry({ expected, clock: monotonicClock, requestStop() {} })
  for (const [row, phase] of expected)
    registry.add({
      row,
      phase,
      stop: async () => {
        events.push(phase)
        return { kind: 'settled' }
      },
      ...(phase === 'storage'
        ? {
            assemblyReportSettled: () => {
              events.push('confirmed')
            },
          }
        : {}),
    })
  const log = (record: ShutdownRecord) => {
    records.push(record)
    if (record.action === 'report-fixed') events.push('fixed')
  }
  return { events, records, expected, registry, log }
}

it('waits for queued work and retirement, reports final remaining count, and keeps the original overall result', async () => {
  const { events, registry, expected, log } = setup()
  const queued = Promise.withResolvers<Readonly<{ pending: number }>>()
  const entered = Promise.withResolvers<void>()
  const retirement = Promise.withResolvers<void>()
  const maintain = vi
    .fn(async () => {
      events.push('maintain')
      return { pending: 2 }
    })
    .mockReturnValueOnce(queued.promise)
  const runtime = createHostFilesRuntime({
    domain: { ...createHostFilesDomain(), maintain },
    diagnose: vi.fn(),
  })
  const first = runtime.request()
  const reportTask = runShutdown(registry, expected, 1000, monotonicClock, {
    log,
    afterBusiness: () =>
      runtime.finish(async () => {
        events.push('retire')
        entered.resolve()
        await retirement.promise
        events.push('retired')
        await runtime.request()
      }),
    disposeRoot: () => {
      events.push('root')
    },
  })
  await Promise.resolve()
  expect(events).not.toContain('retire')
  queued.resolve({ pending: 5 })
  await first
  await entered.promise
  expect(maintain).toHaveBeenCalledTimes(1)
  retirement.resolve()
  const report = await reportTask
  expect(report).toMatchObject({
    overall: 'settled',
    hostFiles: { kind: 'host-files-unsettled', count: 2 },
  })
  expect(events).toEqual([
    'business',
    'retire',
    'retired',
    'maintain',
    'maintain',
    'storage',
    'fixed',
    'confirmed',
    'root',
  ])
  expect(await runtime.request()).toEqual({ kind: 'unavailable' })
})

it('fixes an unavailable report at D, diagnoses a late result, and still waits for cleanup', async () => {
  vi.useFakeTimers()
  const { events, records, registry, expected, log } = setup()
  const maintained = Promise.withResolvers<Readonly<{ pending: number }>>()
  const runtime = createHostFilesRuntime({
    domain: { ...createHostFilesDomain(), maintain: () => maintained.promise },
    diagnose: vi.fn(),
  })
  const finish = () => runtime.finish(async () => undefined)
  let returned = false
  const task = runShutdown(registry, expected, 50, monotonicClock, {
    log,
    afterBusiness: finish,
    disposeRoot: async () => {
      await finish()
      events.push('root')
    },
  })
  void task.then(() => {
    returned = true
  })
  await vi.advanceTimersByTimeAsync(51)
  expect(events).toContain('fixed')
  expect(events).toContain('confirmed')
  expect(returned).toBe(false)
  maintained.resolve({ pending: 0 })
  const report = await task
  expect(report).toMatchObject({
    overall: 'settled',
    hostFiles: { kind: 'unavailable', diagnostic: 'deadline' },
  })
  expect(records).toContainEqual(
    expect.objectContaining({
      action: 'late-result',
      detail: 'host-files maintenance completed after deadline',
    }),
  )
  expect(events.at(-1)).toBe('root')
  expect(vi.getTimerCount()).toBe(0)
})

it('reports unknown maintenance without a zero count or an error payload', async () => {
  const { registry, expected, log, records } = setup()
  const diagnose = vi.fn()
  const runtime = createHostFilesRuntime({
    domain: {
      ...createHostFilesDomain(),
      maintain: async () => {
        throw new Error('private-file-content')
      },
    },
    diagnose,
  })
  const report = await runShutdown(registry, expected, 1000, monotonicClock, {
    log,
    afterBusiness: () => runtime.finish(async () => undefined),
  })
  expect(report).toMatchObject({
    overall: 'settled',
    hostFiles: { kind: 'unavailable', diagnostic: 'maintenance-failed' },
  })
  expect(report.hostFiles).not.toHaveProperty('count')
  expect(JSON.stringify({ report, records, calls: diagnose.mock.calls })).not.toContain(
    'private-file-content',
  )
})

it('keeps a failed retirement unknown and does not claim it has no responsibility', async () => {
  const maintain = vi.fn(async () => ({ pending: 0 }))
  const diagnose = vi.fn()
  const runtime = createHostFilesRuntime({
    domain: { ...createHostFilesDomain(), maintain },
    diagnose,
  })
  expect(
    await runtime.finish(async () => {
      throw new Error('private-retirement')
    }),
  ).toEqual({ kind: 'unavailable', diagnostic: 'retirement-failed' })
  expect(maintain).not.toHaveBeenCalled()
  expect(diagnose.mock.calls).toEqual([[{ kind: 'host-files-retirement-failed' }]])
})
