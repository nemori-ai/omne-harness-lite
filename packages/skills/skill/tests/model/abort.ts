// S6, an abort gives nothing partial. Each run is first made without an abort, which gives its
// port calls `n` and its answer. Then the signal aborts as the port gives answer number `k`, for
// every `k` from 0 (aborted before the operation) to `n + 1`. For `k <= n` the run must stop
// right there: exactly `k` port calls, and the answer `aborted` with nothing beside it (an
// operation that needs no port at all, such as step 1, keeps its answer). For `k > n` the
// abort never happens and the answer is the plain one. No port is ever called on an aborted
// signal.
import { isDeepStrictEqual } from 'node:util'
import { accessRequests, Ledger, perform, type AccessRequest, type Report } from './explore.ts'
import { runOf, type FaultPoint, type Held, type Schedule, type WorldSpec } from './world.ts'

const HELDS: readonly Held[] = [0, 1, 'none']
const ABORTED = { outcome: { failure: { kind: 'aborted' } } }

const FAULTS: readonly (FaultPoint | undefined)[] = [
  undefined,
  { site: { port: 'snapshot' }, fault: 'reject' },
  { site: { port: 'open' }, fault: 'throw' },
  { site: { port: 'open', path: 'docs/guide.md' }, fault: 'bytes-mismatch' },
]

function requests(): AccessRequest[] {
  const bases = [
    undefined,
    { name: 'alpha', index: 0 },
    { name: 'alpha', index: 1 },
    { name: 'beta', index: 0 },
  ] as const
  return accessRequests(['alpha'], bases, ['body', 'guide', 'new', 'bad']).filter(
    item => item.op !== 'describe',
  )
}

export async function exploreAbort(): Promise<Report> {
  const ledger = new Ledger('S6 abort gives nothing partial')
  for (const current of [0, 1] as const)
    for (const held of HELDS)
      for (const addressing of ['digest', 'locator'] as const)
        for (const point of FAULTS) {
          const world: WorldSpec = {
            alpha: {
              state: { kind: 'adopted', current },
              readers: ['alice'],
              knownTo: ['alice'],
              held,
            },
            beta: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
            gamma: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
          }
          const base: Schedule = { addressing, ...(point === undefined ? {} : { faults: [point] }) }
          for (const request of requests()) {
            const plainRun = runOf(world, base)
            const plain = await perform(plainRun, 'alice', request)
            const n = plainRun.trace().length
            for (let k = 0; k <= n + 1; k += 1) {
              const schedule: Schedule = { ...base, abortAfter: k }
              const run = runOf(world, schedule)
              const observation = await perform(run, 'alice', request)
              const trace = run.trace()
              ledger.count()
              const fail = (detail: string) =>
                ledger.break({ world, schedule, who: 'alice', request, detail })
              if (trace.some(call => call.afterAbort))
                fail('a port was called on an aborted signal')
              if (k > n || n === 0) {
                if (!isDeepStrictEqual(observation, plain))
                  fail(
                    `answered ${JSON.stringify(observation)}, without the abort ${JSON.stringify(plain)}`,
                  )
              } else {
                if (trace.length !== k)
                  fail(`${trace.length} port calls, the abort came after ${k}`)
                if (!isDeepStrictEqual(observation, ABORTED))
                  fail(`answered ${JSON.stringify(observation)} after the abort`)
              }
            }
          }
        }
  return ledger.report()
}
