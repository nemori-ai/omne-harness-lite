import { expect, it } from 'vitest'
import { simulatedTime } from '../src/simulated.ts'

it('records one line per registration, firing, cancel and wall change, with both readings (TS-2)', () => {
  const time = simulatedTime({ wall: 1_000, record: true })
  time.source.after(10, () => undefined)
  const cancel = time.source.at(1_500, () => undefined)
  time.advance(10)
  time.setWall(2_000)
  cancel()
  time.source.after(5, () => undefined)()
  expect(time.timeline()).toEqual([
    { event: 'wait', wait: 1, elapsed: 0, now: 1_000 },
    { event: 'wait', wait: 2, elapsed: 0, now: 1_000 },
    { event: 'fire', wait: 1, elapsed: 10, now: 1_010 },
    { event: 'wall', wait: null, elapsed: 10, now: 2_000 },
    { event: 'fire', wait: 2, elapsed: 10, now: 2_000 },
    { event: 'wait', wait: 3, elapsed: 10, now: 2_000 },
    { event: 'cancel', wait: 3, elapsed: 10, now: 2_000 },
  ])
})

it('records nothing unless asked', () => {
  const time = simulatedTime()
  time.source.after(10, () => undefined)
  time.advance(10)
  expect(time.timeline()).toEqual([])
})
