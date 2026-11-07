import { expect, it, vi } from 'vitest'
import { createLocalToolMaterialClock } from '@omne-harness/tool-host-local'

it('continues through a wall-clock rollback and anchors a later forward jump', async () => {
  let wall = 10_000
  let monotonic = 1_000
  const clock = createLocalToolMaterialClock({ wallMs: () => wall, monotonicMs: () => monotonic })
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:10.000Z' })
  wall = 5_000
  monotonic = 1_250
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:10.250Z' })
  wall = 30_000
  monotonic = 1_500
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:30.000Z' })
  wall = 1_000
  monotonic = 1_510
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:30.010Z' })
})

it('does not adopt a bad monotonic sample and resumes from its last valid anchor', async () => {
  let wall = 10_000
  let monotonic = 1_000
  const clock = createLocalToolMaterialClock({ wallMs: () => wall, monotonicMs: () => monotonic })
  expect(await clock.sample()).toHaveProperty('ok')
  wall = 50_000
  monotonic = 999
  expect(await clock.sample()).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'material-clock' },
  })
  wall = 0
  monotonic = 1_100
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:10.100Z' })
})

it.each([NaN, Infinity, -Infinity, 8_640_000_000_000_001, -8_640_000_000_000_001])(
  'reports unavailable for an invalid source reading %s',
  async bad => {
    for (const source of ['wall', 'monotonic'] as const) {
      let reading = bad
      const clock = createLocalToolMaterialClock({
        wallMs: () => (source === 'wall' ? reading : 1_000),
        monotonicMs: () => (source === 'monotonic' ? reading : 1_000),
      })
      expect(await clock.sample()).toMatchObject({ failure: { kind: 'unavailable' } })
      reading = 1_000
      expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:01.000Z' })
    }
  },
)

it('refuses an effective time outside the date range without losing its last anchor', async () => {
  let wall = 8_640_000_000_000_000
  let monotonic = 0
  const clock = createLocalToolMaterialClock({ wallMs: () => wall, monotonicMs: () => monotonic })
  const last = await clock.sample()
  expect(last).toEqual({ ok: '+275760-09-13T00:00:00.000Z' })
  monotonic = 1
  wall = 0
  expect(await clock.sample()).toHaveProperty('failure')
  monotonic = 0
  expect(await clock.sample()).toEqual(last)
})

it('keeps sub-millisecond progression in the anchor and serializes synchronous samples', async () => {
  let monotonic = 0
  const clock = createLocalToolMaterialClock({ wallMs: () => 1_000, monotonicMs: () => monotonic })
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:01.000Z' })
  const answers = [0.25, 0.5, 0.75, 1].map(value => {
    monotonic = value
    return clock.sample()
  })
  expect(await Promise.all(answers)).toEqual([
    { ok: '1970-01-01T00:00:01.000Z' },
    { ok: '1970-01-01T00:00:01.000Z' },
    { ok: '1970-01-01T00:00:01.000Z' },
    { ok: '1970-01-01T00:00:01.001Z' },
  ])
})

it('reports source exceptions without exposing their messages or substituting the wall clock', async () => {
  const source = vi.fn((): number => {
    throw new Error('secret time service details')
  })
  const clock = createLocalToolMaterialClock({ wallMs: source, monotonicMs: () => 0 })
  expect(await clock.sample()).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'material-clock',
      diagnostic: 'time source failed',
    },
  })
  source.mockReturnValueOnce(1_000)
  expect(await clock.sample()).toEqual({ ok: '1970-01-01T00:00:01.000Z' })
})
