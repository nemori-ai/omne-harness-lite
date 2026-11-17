import { describe, expect, it } from 'vitest'
import { cpuSecondsOf, cpuTimeSeconds } from '../support/matrix/cpu-time.ts'

describe('the CPU time the matrix reads for a server process', () => {
  it.each([
    ['0:00.75', 0.75],
    ['  12:03.50\n', 723.5],
    ['01:02:03', 3723],
    ['2-01:00:00', 176_400],
  ])('reads %j as %d seconds', (text, seconds) => {
    expect(cpuTimeSeconds(text)).toBeCloseTo(seconds, 6)
  })

  it.each(['', 'n/a', '12', ':30', '1:2:3:4'])('reads %j as not a number', text => {
    expect(cpuTimeSeconds(text)).toBeNaN()
  })

  it('grows with the work this process does on its own host', () => {
    const before = cpuSecondsOf(process.pid)
    const until = Date.now() + 300
    while (Date.now() < until);
    const used = cpuSecondsOf(process.pid) - before
    expect(used).toBeGreaterThan(0.1)
    expect(used).toBeLessThan(5)
  })
})
