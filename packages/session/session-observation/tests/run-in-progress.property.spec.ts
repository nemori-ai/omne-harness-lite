import fc from 'fast-check'
import { expect, it } from 'vitest'
import { createSessionObservation, type SessionObservationFrame } from '../src/index.ts'
import { ACCESS, FakeLog, ended, mainCall, otherCall, started, world } from './ports.ts'

type Planned = Readonly<{ kind: string; payload: unknown }>
type Turn = Readonly<{ calls: readonly ('main' | 'tool')[]; settled: boolean }>

const turns: fc.Arbitrary<Turn[]> = fc.array(
  fc.record({
    calls: fc.array(fc.constantFrom('main' as const, 'tool' as const), { maxLength: 14 }),
    settled: fc.boolean(),
  }),
  { maxLength: 5 },
)

function entriesOf(plan: readonly Turn[]): Planned[] {
  return plan.flatMap(({ calls, settled }, at) => {
    const run = `run_${String(at)}`
    const bound = calls.map((kind, n) =>
      kind === 'main'
        ? mainCall(`m-${String(at)}-${String(n)}`)
        : otherCall('tool', `t-${String(at)}-${String(n)}`, 'action'),
    )
    const last = at === plan.length - 1
    return [started(run), ...bound, ...(last && !settled ? [] : [ended(run)])]
  })
}

function unsettledRun(entries: readonly Planned[]): string | null {
  let run: string | null = null
  for (const { kind, payload } of entries) {
    if (kind === 'run.started') run = (payload as { run: string }).run
    if (kind === 'run.terminal') run = null
  }
  return run
}

it('the state frame names a run exactly when the log leaves its latest run unsettled, however many calls it bound', async () => {
  await fc.assert(
    fc.asyncProperty(
      turns,
      fc.array(fc.nat(), { minLength: 2, maxLength: 2 }),
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 4 }),
      async (plan, cuts, pageSize, pages) => {
        const all = entriesOf(plan)
        const [first, second] = cuts.map(cut => cut % (all.length + 1)).sort((a, b) => a - b) as [
          number,
          number,
        ]
        const log = new FakeLog(...all.slice(0, first))
        log.pageSize = pageSize
        const w = world(log, {}, pages)
        const abort = new AbortController()
        const opened = await createSessionObservation(w.ports).open({
          access: ACCESS,
          signal: abort.signal,
        })
        if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
        const stateAt = async (count: number): Promise<SessionObservationFrame> => {
          for (;;) {
            const step = await opened.frames.next()
            if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
            if (step.value.kind === 'state' && step.value.revision === String(count))
              return step.value
          }
        }
        expect(await stateAt(first)).toMatchObject({ run: unsettledRun(all.slice(0, first)) })
        for (const [from, to] of [
          [first, second],
          [second, all.length],
        ] as const) {
          if (from === to) continue
          log.append(...all.slice(from, to))
          w.notices.commit('run.started')
          expect(await stateAt(to)).toMatchObject({ run: unsettledRun(all.slice(0, to)) })
        }
        abort.abort()
        await opened.frames.return(undefined)
      },
    ),
    { numRuns: 300 },
  )
})
