import {
  NO_PROGRESS,
  NO_READINGS,
  validateDraft,
  type GoalRecord,
} from '@omne-harness/goal-contract'
import type { GoalStore, StoreAnswer, StoreRead } from '../store.ts'
import type { CommitResult } from '../txn.ts'

export type StoreConformanceCase = Readonly<{
  name: string
  /** Runs the case against a store of its own; rejects with what did not hold. */
  run(open: () => Promise<GoalStore>): Promise<void>
}>

const T1 = 'conformance-tenant-1'
const T2 = 'conformance-tenant-2'
const S1 = 'conformance-session-1'

function hold(condition: boolean, what: string): asserts condition {
  if (!condition) throw new Error(what)
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** A goal as the first write of a session leaves it, in the generation and state asked for. */
export function conformanceGoal(change: Partial<GoalRecord> = {}, generation = 1): GoalRecord {
  const checked = validateDraft(
    { purpose: '把事做完', criteria: [{ statement: '做完了', evidence: { kind: 'person' } }] },
    { attendance: 'attended' },
  )
  if (checked.kind !== 'valid') throw new Error('conformance fixture')
  return {
    session: S1,
    version: 1,
    state: {
      status: 'active',
      attendance: 'attended',
      generation,
      revision: 1,
      rounds: 0,
      stalled: 0,
      gap: null,
    },
    body: checked.body,
    history: [
      {
        revision: 1,
        via: 'direct',
        words: '把事做完',
        draftedBy: 'person',
        confirmedBy: 'acc-1',
        operation: `op-${String(generation)}`,
        at: '2026-11-25T00:00:00.000Z',
      },
    ],
    readings: NO_READINGS,
    progress: NO_PROGRESS,
    since: '0',
    wake: null,
    ...change,
  }
}

function committed(answer: StoreAnswer<CommitResult>): CommitResult {
  hold(answer.kind === 'committed', `the commit answered ${answer.kind}`)
  return answer.value
}
function read<T>(answer: StoreRead<T>): T {
  hold(answer.kind === 'read', 'the read was unavailable')
  return answer.value
}
const settled = (record: GoalRecord): GoalRecord => {
  const { attendance, generation, revision, rounds } = record.state as Extract<
    GoalRecord['state'],
    { status: 'active' }
  >
  const state = { status: 'settled', attendance, generation, revision, rounds } as const
  return { ...record, state: { ...state, outcome: { kind: 'cancelled' } } }
}

/** What every goal store holds, whatever keeps the rows. The memory store and the SQL store both run it. */
export const storeConformance: readonly StoreConformanceCase[] = [
  {
    name: 'a session without a goal reads as null, and its first write stands on version zero',
    async run(open) {
      const store = await open()
      hold(read(await store.latest(T1, S1)) === null, 'a goal nobody wrote was read')
      const goal = conformanceGoal()
      const result = committed(await store.commit(T1, { session: S1, expected: 0, next: goal }))
      hold(result.kind === 'written' && result.record.version === 1, 'the first write is version 1')
      hold(same(read(await store.latest(T1, S1)), goal), 'what was written is not what is read')
    },
  },
  {
    name: 'a write stands only on the version it was decided on',
    async run(open) {
      const store = await open()
      const goal = conformanceGoal()
      committed(await store.commit(T1, { session: S1, expected: 0, next: goal }))
      const again = committed(await store.commit(T1, { session: S1, expected: 0, next: goal }))
      hold(
        again.kind === 'stale' && same(again.current, goal),
        'a write on version zero stood twice',
      )
      const ahead = committed(await store.commit(T1, { session: S1, expected: 5, next: goal }))
      hold(ahead.kind === 'stale', 'a write on a version nobody wrote stood')
      hold(same(read(await store.latest(T1, S1)), goal), 'a stale write changed the goal')
    },
  },
  {
    name: 'a write takes the next version, whatever version the record handed in carries',
    async run(open) {
      const store = await open()
      const goal = conformanceGoal()
      committed(await store.commit(T1, { session: S1, expected: 0, next: goal }))
      const next = { ...goal, version: 40, wake: { kind: 'start', request: 'start/1/2' } } as const
      const result = committed(await store.commit(T1, { session: S1, expected: 1, next }))
      hold(
        result.kind === 'written' && result.record.version === 2,
        'the second write is version 2',
      )
      hold(
        read(await store.latest(T1, S1))?.version === 2,
        'the version read is not the one written',
      )
    },
  },
  {
    name: 'the next goal of a session is a row of its own; the latest is the one read',
    async run(open) {
      const store = await open()
      const first = conformanceGoal()
      committed(await store.commit(T1, { session: S1, expected: 0, next: first }))
      committed(await store.commit(T1, { session: S1, expected: 1, next: settled(first) }))
      const second = conformanceGoal({}, 2)
      const result = committed(await store.commit(T1, { session: S1, expected: 2, next: second }))
      hold(result.kind === 'written' && result.record.version === 3, 'the version goes on counting')
      const latest = read(await store.latest(T1, S1))
      hold(
        latest?.state.generation === 2 && latest.state.status === 'active',
        'the latest is the new goal',
      )
    },
  },
  {
    name: 'a session has one live goal at most: a second live row is not kept',
    async run(open) {
      const store = await open()
      committed(await store.commit(T1, { session: S1, expected: 0, next: conformanceGoal() }))
      const second = conformanceGoal({}, 2)
      const answer = await store.commit(T1, { session: S1, expected: 1, next: second })
      hold(answer.kind !== 'committed', 'a second live goal of the session was kept')
      hold(read(await store.latest(T1, S1))?.state.generation === 1, 'the first goal was replaced')
    },
  },
  {
    name: 'the goals that owe a reminder are listed until the debt is cleared',
    async run(open) {
      const store = await open()
      const owing = conformanceGoal({ wake: { kind: 'start', request: 'start/1/1' } })
      committed(await store.commit(T1, { session: S1, expected: 0, next: owing }))
      const other = { ...conformanceGoal(), session: 'conformance-session-2' }
      committed(await store.commit(T1, { session: other.session, expected: 0, next: other }))
      hold(
        same(
          read(await store.owing(T1)).map(row => row.session),
          [S1],
        ),
        'the owing goal is listed',
      )
      committed(
        await store.commit(T1, { session: S1, expected: 1, next: { ...owing, wake: null } }),
      )
      hold(read(await store.owing(T1)).length === 0, 'a cleared debt is still listed')
    },
  },
  {
    name: 'one tenant does not read or write the goals of another',
    async run(open) {
      const store = await open()
      committed(await store.commit(T1, { session: S1, expected: 0, next: conformanceGoal() }))
      hold(read(await store.latest(T2, S1)) === null, 'another tenant read the goal')
      const theirs = committed(
        await store.commit(T2, { session: S1, expected: 0, next: conformanceGoal() }),
      )
      hold(theirs.kind === 'written', 'another tenant could not write its own goal')
      hold(read(await store.owing(T2)).length === 0, 'another tenant owes nothing')
    },
  },
]
