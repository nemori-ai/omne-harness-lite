import { describe, expect, it } from 'vitest'
import { createCalendarSupplyApplication } from '../../src/supply-application/index.ts'
import { context, intent, world } from './fixture.ts'

const dueInput = { ...intent, sourceId: 'federal-register-eo-feed', operationKey: 'due-2026-01-01' }
describe('explicit supply runner', () => {
  it('initializes source plans with observable failure and a next due time', async () => {
    const w = world()
    w.flags.adapterFails = true
    const result = await w.app().initialize(context, { operationKey: 'bootstrap-1' })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') throw new Error('Initialization failed')
    expect(result.value).toHaveLength(8)
    expect(
      result.value.every(
        item =>
          item.result.kind === 'ok' &&
          item.result.value.observation.kind === 'failed' &&
          item.result.value.nextDue > item.result.value.observation.observedAt,
      ),
    ).toBe(true)
    expect(w.calls.commit).toBe(0)
    const count = w.calls.probe
    await w.app().initialize(context, { operationKey: 'bootstrap-1' })
    expect(w.calls.probe).toBe(count)
  })
  it('refreshes the due source calendar before advancing its next due time', async () => {
    const w = world()
    const app = createCalendarSupplyApplication({
      ...w.deps,
      journal: {
        ...w.deps.journal,
        async due() {
          return { kind: 'ok', value: [dueInput] }
        },
      },
    })
    const result = await app.runDue(context, { limit: 10 })
    expect(result).toMatchObject({
      kind: 'ok',
      value: [
        {
          refresh: {
            kind: 'ok',
            value: { kind: 'recorded', receipt: { disposition: 'published' } },
          },
          probe: { kind: 'ok' },
        },
      ],
    })
    expect(w.current()).not.toBeNull()
    expect(w.calls.probe).toBe(1)
  })
  it('keeps the due identity when refresh is unknown', async () => {
    const w = world()
    w.flags.unknown = true
    const app = createCalendarSupplyApplication({
      ...w.deps,
      journal: {
        ...w.deps.journal,
        async due() {
          return { kind: 'ok', value: [dueInput] }
        },
      },
    })
    const first = await app.runDue(context, { limit: 10 })
    const repeated = await app.runDue(context, { limit: 10 })
    expect(first).toEqual(repeated)
    expect(first).toMatchObject({
      kind: 'ok',
      value: [{ refresh: { kind: 'ok', value: { kind: 'unknown' } }, probe: null }],
    })
    expect(w.calls).toMatchObject({ probe: 0, acquire: 0, commit: 0 })
  })
  it('recovers an interruption after refresh and before probe without reacquiring or republishing', async () => {
    const w = world()
    let failProbeRead = true
    const deps = {
      ...w.deps,
      journal: {
        ...w.deps.journal,
        async due() {
          return { kind: 'ok' as const, value: [dueInput] }
        },
        async readProbe(input: Parameters<typeof w.deps.journal.readProbe>[0]) {
          if (failProbeRead) throw new Error('interrupted before probe')
          return w.deps.journal.readProbe(input)
        },
      },
    }
    await createCalendarSupplyApplication(deps).runDue(context, { limit: 10 })
    expect(w.current()).not.toBeNull()
    expect(w.calls.probe).toBe(0)
    const acquisitions = w.calls.acquire
    failProbeRead = false
    expect(
      await createCalendarSupplyApplication(deps).runDue(context, { limit: 10 }),
    ).toMatchObject({
      kind: 'ok',
      value: [
        {
          refresh: { kind: 'ok', value: { kind: 'recorded', replayed: true } },
          probe: { kind: 'ok' },
        },
      ],
    })
    expect(w.calls.acquire).toBe(acquisitions)
    expect(w.calls.commit).toBe(1)
  })
})
