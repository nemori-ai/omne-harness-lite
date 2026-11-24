import { describe, expect, it } from 'vitest'
import { createLabClock } from '../../src/lab/clock.ts'
import { answer, parseCommand, parseDuration } from '../../src/lab/control.ts'

const DAY = 86_400_000
const START = Date.parse('2027-01-15T01:00:00.000Z')

describe('lab control lines', () => {
  it('read the four commands and refuse anything else with a reason', () => {
    expect(parseCommand('read')).toEqual({ kind: 'read' })
    expect(parseCommand(' skip 3d ')).toEqual({ kind: 'skip', ms: 3 * DAY })
    expect(parseCommand('set 2027-01-31T08:59:00Z')).toEqual({
      kind: 'set',
      wall: Date.parse('2027-01-31T08:59:00Z'),
    })
    expect(parseCommand('speed 60')).toEqual({ kind: 'speed', factor: 60 })
    for (const line of [
      '',
      'skip',
      'skip 0',
      'skip -1h',
      'set tomorrow',
      'set 2027-01-31T08:59:00+08:00',
      'speed 0',
      'read now',
      'jump 1d',
    ])
      expect(typeof parseCommand(line)).toBe('string')
    expect(parseDuration('90s')).toBe(90_000)
    expect(parseDuration('15m')).toBe(900_000)
    expect(parseDuration('250')).toBe(250)
  })

  it('a skip moves the wall clock only, and counts the waits it brings due; a set does the same to an instant', () => {
    const clock = createLabClock({ wall: START, speed: 1 })
    clock.time.run('manual')
    const fired: string[] = []
    clock.source.at(START + DAY, () => void fired.push('at a day'))
    clock.source.after(1000, () => void fired.push('after a second'))
    const elapsed = clock.time.source.elapsed()
    const skipped = answer(clock, 'skip 1d')
    expect(skipped).toMatchObject({
      ok: true,
      command: 'skip',
      fired: 1,
      wall: '2027-01-16T01:00:00.000Z',
    })
    expect(clock.time.source.elapsed()).toBe(elapsed)
    expect(fired).toEqual(['at a day'])
    const set = answer(clock, 'set 2027-01-31T08:59:00Z')
    expect(set).toMatchObject({ ok: true, fired: 0, wall: '2027-01-31T08:59:00.000Z', pending: 1 })
    expect(answer(clock, 'skip soon')).toEqual({
      ok: false,
      error: 'skip takes a duration such as 90s, 15m, 3h or 2d',
    })
  })

  it('a speed makes the simulated time follow the host at that factor', () => {
    const clock = createLabClock({ wall: START, speed: 1 })
    expect(answer(clock, 'speed 3600')).toMatchObject({ ok: true, speed: 3600 })
    const before = clock.time.source.now()
    const until = performance.now() + 20
    while (performance.now() < until) {
      /* let the host clock move */
    }
    expect(clock.time.source.now() - before).toBeGreaterThanOrEqual(20 * 3600)
    clock.time.run('manual')
  })
})
