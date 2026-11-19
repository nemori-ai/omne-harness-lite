// What the memory transactions keep of the calls that left the work snapshot, and how they lend them back.
import {
  callKeysIn,
  callNamed,
  callOf,
  callWithLate,
  lendCalls,
  type SessionCall,
  type SessionLateCallFact,
  type SettledCallLookup,
} from './call-settlement.ts'
import type { ConsumptionId } from './identity.ts'
import { judgeIdle } from './judgments.ts'
import type { WorkSnapshot } from './values.ts'

export type CallsLeft = Readonly<{
  settled: readonly SessionCall[]
  late: readonly SessionLateCallFact[]
}>
const NONE_LEFT: CallsLeft = { settled: [], late: [] }

type Held = Readonly<{ snapshot: WorkSnapshot; left: CallsLeft }>

export const lookupOf =
  (store: Held | undefined): SettledCallLookup =>
  keys => {
    const { settled, late } = store?.left ?? NONE_LEFT
    return settled.filter(call => callNamed(call, keys)).map(call => callWithLate(call, late))
  }

export const leftAfter = (store: Held | undefined, reduced: CallsLeft): CallsLeft => ({
  settled: [...(store?.left ?? NONE_LEFT).settled, ...reduced.settled],
  late: [...(store?.left ?? NONE_LEFT).late, ...reduced.late],
})

/** The snapshot with the calls that `named` names and that left it, for one decision. */
export const lentFor = <T extends WorkSnapshot | null>(
  store: Held | undefined,
  snapshot: T,
  named: unknown,
): T =>
  snapshot === null ? snapshot : (lendCalls(snapshot, lookupOf(store)(callKeysIn(named))) as T)

/** One call by its consumption, in the snapshot or after it left; null when there never was one. */
export function callIn(store: Held | undefined, consumption: string): SessionCall | null {
  if (store === undefined) return null
  const id = consumption as ConsumptionId
  return (
    callOf(store.snapshot, id) ?? lookupOf(store)({ consumptions: [id], producers: [] })[0] ?? null
  )
}

export function autoArchiveVerdict(snapshot: WorkSnapshot) {
  const observation = snapshot.idle?.observation
  if (snapshot.autoArchive?.kind !== 'enabled') return 'disabled'
  if (snapshot.relation?.kind === 'main' && snapshot.relation.resident) return 'exempt'
  if (observation === undefined) return 'not-due'
  const idle =
    observation.kind === 'interval'
      ? observation.coverage
      : {
          own: observation.source,
          relations: observation.source,
          calls: [],
          children: [],
          completeScope: observation.source,
        }
  return judgeIdle(snapshot, { observation, policy: snapshot.autoArchive, coverage: idle }).kind
}
