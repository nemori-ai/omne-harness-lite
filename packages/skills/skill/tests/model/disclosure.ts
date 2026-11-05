// S1, no disclosure, by self-composition. For an observer and a hidden identity `alpha`, each
// world runs next to its twin in which `alpha` was deleted (`twinWorld`). The two runs share the
// request and the schedule (the port faults, which never touch `alpha`, and a pre-aborted signal
// or none), so the only difference is the hidden identity. The observer must get deeply equal
// answers from both. Three ways of hiding are compared with the deletion: the read check refuses
// and the resolution hides `alpha`; the read check refuses and the resolution answers for it (so
// Skill's own read check is the guard); the read check grants and the resolution does not know
// it (the "checked-only" path). A request whose basis names another identity (step 1) is also
// compared with the same request without a basis.
import { isDeepStrictEqual } from 'node:util'
import {
  accessRequests,
  Ledger,
  perform,
  type BasisRef,
  type Report,
  type Request,
} from './explore.ts'
import {
  otherPrincipal,
  PRINCIPALS,
  runOf,
  twinWorld,
  type FaultPoint,
  type IdentitySpec,
  type IdentityState,
  type Principal,
  type Schedule,
  type WorldSpec,
} from './world.ts'

const HIDDEN = 'alpha'

/** How `alpha` is unavailable to the observer `who`; `owner` may read it. */
const HIDINGS = {
  'refused-hides': (who: Principal, owner: Principal) => ({ readers: [owner], knownTo: [owner] }),
  'refused-shows': (who: Principal, owner: Principal) => ({
    readers: [owner],
    knownTo: [owner, who],
  }),
  'checked-only': (who: Principal, owner: Principal) => ({
    readers: [owner, who],
    knownTo: [owner],
  }),
} as const

const HIDDEN_STATES: readonly IdentityState[] = [
  { kind: 'adopted', current: 0 },
  { kind: 'adopted', current: 1 },
  { kind: 'no-digest' },
  { kind: 'stand-in' },
]
const OTHER_STATES: readonly IdentityState[] = [
  { kind: 'adopted', current: 0 },
  { kind: 'stand-in' },
]

/** Faults shared by both runs. None is about `alpha`: the premise is that the ports answer the
 * observer the same for an existing and a missing identity (PC3, PR5). */
const FAULTS: readonly (FaultPoint | undefined)[] = [
  undefined,
  { site: { port: 'check', name: 'beta' }, fault: 'unknown' },
  { site: { port: 'check', name: 'beta' }, fault: 'reject' },
  { site: { port: 'resolve', name: 'beta' }, fault: 'unknown' },
  { site: { port: 'resolve', name: 'beta' }, fault: 'throw' },
  { site: { port: 'adopted' }, fault: 'unknown' },
  { site: { port: 'adopted' }, fault: 'proxy' },
  { site: { port: 'item', name: 'beta' }, fault: 'malformed' },
  { site: { port: 'snapshot' }, fault: 'unavailable' },
  { site: { port: 'snapshot' }, fault: 'package-not-found' },
  { site: { port: 'snapshot' }, fault: 'malformed' },
  { site: { port: 'open' }, fault: 'entry-not-found' },
  { site: { port: 'open' }, fault: 'throw' },
]

const BASES: readonly (BasisRef | undefined)[] = [
  undefined,
  { name: 'alpha', index: 0 },
  { name: 'alpha', index: 1 },
  { name: 'beta', index: 0 },
  { name: 'gamma', index: 0 },
]

const CATALOG: readonly Request[] = [
  { op: 'summaries' },
  { op: 'summaries', names: [] },
  { op: 'summaries', names: ['alpha'] },
  { op: 'summaries', names: ['beta'] },
  { op: 'summaries', names: ['gamma'] },
  { op: 'summaries', names: ['alpha', 'beta'] },
  { op: 'summaries', names: ['alpha', 'gamma'] },
  { op: 'search', text: '' },
  { op: 'search', text: 'alpha' },
  { op: 'search', text: 'Reviews' },
  { op: 'search', text: 'beta' },
  { op: 'search', text: 'Translates' },
]

export const REQUESTS: readonly Request[] = [
  ...accessRequests(['alpha', 'beta', 'gamma'], BASES, ['body', 'guide']),
  ...CATALOG,
]

function worldOf(
  hidden: IdentitySpec,
  other: IdentityState,
  otherReaders: readonly Principal[],
  owner: Principal,
  who: Principal,
): WorldSpec {
  return {
    alpha: hidden,
    beta: { state: other, readers: otherReaders, knownTo: [owner, who], held: 0 },
    gamma: { state: { kind: 'absent' }, readers: [], knownTo: [], held: 'none' },
  }
}

const ABORTABLE = new Set(['read', 'list', 'export'])

export async function exploreDisclosure(): Promise<Report> {
  const ledger = new Ledger('S1 no disclosure')
  for (const who of PRINCIPALS) {
    const owner = otherPrincipal(who)
    for (const state of HIDDEN_STATES)
      for (const other of OTHER_STATES)
        for (const otherReaders of [[owner, who], [owner]])
          for (const point of FAULTS)
            for (const [how, hide] of Object.entries(HIDINGS)) {
              const held = state.kind === 'adopted' ? state.current : 0
              const world = worldOf(
                { state, ...hide(who, owner), held },
                other,
                otherReaders,
                owner,
                who,
              )
              const twin = twinWorld(world, HIDDEN)
              for (const request of REQUESTS)
                for (const abortAfter of ABORTABLE.has(request.op) ? [undefined, 0] : [undefined]) {
                  const schedule: Schedule = {
                    addressing: 'digest',
                    ...(point === undefined ? {} : { faults: [point] }),
                    ...(abortAfter === undefined ? {} : { abortAfter }),
                  }
                  const seen = await perform(runOf(world, schedule), who, request)
                  const unseen = await perform(runOf(twin, schedule), who, request)
                  ledger.count()
                  if (!isDeepStrictEqual(seen, unseen))
                    ledger.break({
                      world,
                      schedule,
                      who,
                      request,
                      detail: `${how}: ${JSON.stringify(seen)} differs from the twin's ${JSON.stringify(unseen)}`,
                    })
                  // Step 1 and step 2 give the same answer: a basis of another identity is not
                  // told apart from a refused read.
                  if (
                    abortAfter === undefined &&
                    'basis' in request &&
                    request.basis?.name === 'beta' &&
                    request.name === HIDDEN &&
                    request.op !== 'export'
                  ) {
                    const { basis: _named, ...plain } = request
                    const without = await perform(runOf(world, schedule), who, plain)
                    ledger.count()
                    if (!isDeepStrictEqual(seen, without))
                      ledger.break({
                        world,
                        schedule,
                        who,
                        request,
                        detail: `${how}: a basis of beta answers ${JSON.stringify(seen)}, no basis ${JSON.stringify(without)}`,
                      })
                  }
                }
            }
  }
  return ledger.report()
}
