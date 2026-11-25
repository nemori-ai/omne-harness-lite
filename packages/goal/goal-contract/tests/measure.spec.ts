import { describe, expect, it } from 'vitest'
import { measuredOf, type ObservedCall } from '@omne-harness/goal-contract'

const metric = (id: 'M1' | 'M2', command: string, path: string) =>
  ({ id, statement: 's', measure: { command, path }, direction: 'lower', target: 1 }) as never
const run = (order: number, command: string, output: string, exit = 0): ObservedCall => ({
  ref: `call-${String(order)}`,
  order,
  tool: 'Shell',
  command,
  path: null,
  exit,
  output,
  writes: false,
})
const BENCH = 'pnpm bench:home --json'
const body = { metrics: [metric('M1', BENCH, '.p95_ms')] }

describe('the number of a metric, read from what its command printed', () => {
  it('is taken at the path from the latest run of the command, with the call it came from', () => {
    const calls = [run(1, BENCH, '{"p95_ms": 930}'), run(4, `  ${BENCH} `, '{"p95_ms": 780}')]
    expect(measuredOf(body, calls)).toEqual({ M1: { value: 780, ref: 'call-4' } })
  })

  it('is read from the last JSON line when the command prints other lines too', () => {
    const output = 'building…\n{"p95_ms": 1010}\n{"p95_ms": 812, "runs": 5}\ndone in 3s'
    expect(measuredOf(body, [run(2, BENCH, output)])).toEqual({ M1: { value: 812, ref: 'call-2' } })
  })

  it('follows keys and indexes of a path', () => {
    const deep = { metrics: [metric('M2', 'bench', '.runs[1].ms')] }
    const output = JSON.stringify({ runs: [{ ms: 5 }, { ms: 7 }] })
    expect(measuredOf(deep, [run(1, 'bench', output)])).toEqual({
      M2: { value: 7, ref: 'call-1' },
    })
  })

  it.each([
    ['the command did not run', [run(1, 'another', '{"p95_ms": 1}')]],
    ['its latest run failed', [run(1, BENCH, '{"p95_ms": 1}'), run(2, BENCH, '{"p95_ms": 2}', 1)]],
    ['it printed no JSON', [run(1, BENCH, 'p95 780 ms')]],
    ['the path leads to no number', [run(1, BENCH, '{"p95_ms": "780"}')]],
    ['the path leads nowhere', [run(1, BENCH, '{"p50_ms": 5}')]],
    ['the number is not finite', [run(1, BENCH, '{"p95_ms": 1e999}')]],
  ])('is not read when %s', (_, calls) => {
    expect(measuredOf(body, calls)).toEqual({})
  })

  it('is not read by a path that is no path', () => {
    for (const path of ['p95_ms', '.a..b', '.a[x]', ''])
      expect(
        measuredOf({ metrics: [metric('M1', BENCH, path)] }, [run(1, BENCH, '{"a":1}')]),
      ).toEqual({})
  })
})
