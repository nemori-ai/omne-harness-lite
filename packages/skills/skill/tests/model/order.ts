// S5, the catalog answer does not depend on the order in which the read checks complete. The
// read check answers are held back and let out one by one, in every order of the checks that
// the catalog issued (at most 3! = 6 orders). Every order must give a deeply equal answer, and
// the first one must be the answer that the contract gives (the oracle of S2), so the property
// is not met by a catalog that answers the same wrong thing every time.
import { isDeepStrictEqual } from 'node:util'
import {
  Ledger,
  perform,
  permutations,
  settle,
  type Observation,
  type Report,
  type Request,
} from './explore.ts'
import { catalogOracle, catalogSeen } from './whole-unknown.ts'
import {
  NAMES,
  runOf,
  type CheckGate,
  type FaultPoint,
  type IdentityState,
  type Name,
  type Principal,
  type Schedule,
  type WorldSpec,
} from './world.ts'

type Verdict = 'granted' | 'refused' | 'unknown' | 'malformed' | 'reject' | 'throw'
const VERDICTS: readonly Verdict[] = [
  'granted',
  'refused',
  'unknown',
  'malformed',
  'reject',
  'throw',
]

const REQUESTS: readonly Request[] = [
  { op: 'summaries' },
  { op: 'summaries', names: ['gamma', 'alpha'] },
  { op: 'search', text: '' },
]

const STATE_SETS: readonly (readonly [IdentityState, IdentityState, IdentityState])[] = [
  [
    { kind: 'adopted', current: 0 },
    { kind: 'adopted', current: 0 },
    { kind: 'adopted', current: 0 },
  ],
  [{ kind: 'stand-in' }, { kind: 'adopted', current: 0 }, { kind: 'stand-in' }],
]

/** One run in which the read check answers come out in `order` (names); the issue order when absent. */
async function heldRun(
  world: WorldSpec,
  schedule: Schedule,
  request: Request,
  order?: readonly Name[],
): Promise<Readonly<{ observation: Observation; issued: readonly Name[] }>> {
  const pending: { name: Name; release: () => void }[] = []
  const issued: Name[] = []
  const gate: CheckGate = (name, answer) =>
    new Promise((resolve, reject) => {
      issued.push(name)
      pending.push({ name, release: () => void answer().then(resolve, reject) })
    })
  const result = perform(runOf(world, schedule, gate), 'alice', request)
  await settle()
  for (const name of order ?? [...issued]) {
    const index = pending.findIndex(item => item.name === name)
    const [item] = index === -1 ? [] : pending.splice(index, 1)
    item?.release()
    await settle()
  }
  while (pending.length > 0) {
    pending.shift()?.release()
    await settle()
  }
  return { observation: await result, issued }
}

function worldOf(states: readonly IdentityState[], verdicts: readonly Verdict[]): WorldSpec {
  const spec = (index: number) => {
    const readers: readonly Principal[] = verdicts[index] === 'refused' ? [] : ['alice']
    return {
      state: states[index] ?? { kind: 'absent' },
      readers,
      knownTo: ['alice'],
      held: 0,
    } as const
  }
  return { alpha: spec(0), beta: spec(1), gamma: spec(2) }
}

function faultsOf(verdicts: readonly Verdict[]): FaultPoint[] {
  return NAMES.flatMap((name, index) => {
    const verdict = verdicts[index]
    return verdict === undefined || verdict === 'granted' || verdict === 'refused'
      ? []
      : [{ site: { port: 'check', name }, fault: verdict } as const]
  })
}

export async function exploreOrder(): Promise<Report> {
  const ledger = new Ledger('S5 order independence')
  for (const states of STATE_SETS)
    for (const a of VERDICTS)
      for (const b of VERDICTS)
        for (const c of VERDICTS) {
          const verdicts = [a, b, c]
          const world = worldOf(states, verdicts)
          const faults = faultsOf(verdicts)
          const schedule: Schedule = { addressing: 'digest', faults }
          for (const request of REQUESTS) {
            const first = await heldRun(world, schedule, request)
            ledger.count()
            const expected = catalogOracle(world, faults, request)
            if (!isDeepStrictEqual(catalogSeen(first.observation), expected))
              ledger.break({
                world,
                schedule,
                request,
                detail: `answered ${JSON.stringify(first.observation)}, the contract gives ${JSON.stringify(expected)}`,
              })
            for (const order of permutations(first.issued).slice(1)) {
              const other = await heldRun(world, schedule, request, order)
              ledger.count()
              if (!isDeepStrictEqual(other.observation, first.observation))
                ledger.break({
                  world,
                  schedule,
                  request,
                  detail: `completion order ${order.join(',')} answered ${JSON.stringify(other.observation)}, order ${first.issued.join(',')} answered ${JSON.stringify(first.observation)}`,
                })
            }
          }
        }
  return ledger.report()
}
