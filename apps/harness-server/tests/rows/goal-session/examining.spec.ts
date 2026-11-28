import { describe, expect, it } from 'vitest'
import type { BatchToHand, GoalExamining } from '@omne-harness/goal'
import type { GoalChecking } from '@omne-harness/goal-contract'
import { createExamining } from '../../../src/rows/goal-session/examining.ts'
import type { Runner } from '../../../src/rows/goal-session/rerun.ts'

const SYSTEM = { kind: 'system', component: 'goal' }
const RERUN = { id: 'A1', evidence: { kind: 'rerun', command: 'node accept.js' } } as const
const EXAMINED = { id: 'A2', evidence: { kind: 'examination', method: '走一局' } } as const
const batchOf = (change: Partial<BatchToHand> = {}): BatchToHand => ({
  session: 's-1',
  request: 'examine/1/1/call-1',
  examiner: null,
  where: null,
  brief: 'Batch: examine/1/1/call-1',
  criteria: [RERUN],
  ...change,
})

function world(left: readonly string[] = []) {
  const calls: unknown[][] = []
  const asked: unknown[][] = []
  const sessions: GoalExamining = {
    async hand(...input) {
      asked.push(['hand', ...input])
      return { kind: 'handed', examiner: 'examiner-1' }
    },
    async calls(...input) {
      asked.push(['calls', ...input])
      return { kind: 'read', value: [] }
    },
    async ended(...input) {
      asked.push(['ended', ...input])
      return 'going'
    },
    async cancel(...input) {
      asked.push(['cancel', ...input])
    },
    async close(...input) {
      asked.push(['close', ...input])
    },
  }
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  const hold = { on: false }
  const runner: Runner = async () => {
    if (hold.on) await held
    return { exit: 0, tail: 'ok' }
  }
  const checking = {
    async reran(caller: unknown, input: unknown) {
      calls.push(['reran', caller, input])
      return { kind: 'done', value: { examine: left }, recalled: false }
    },
  } as unknown as GoalChecking
  const mounted = { checking: checking as GoalChecking | undefined }
  const reported: unknown[] = []
  const examining = createExamining({
    rerun: { runner, timeoutMs: 1000 },
    system: SYSTEM,
    checking: () => mounted.checking,
    report: error => void reported.push(error),
    sessions,
  })
  return { examining, calls, asked, hold, release, mounted, reported }
}

describe('the examining side of goals on the release', () => {
  it('takes a batch of commands, runs them again, and hands the exit codes in as the system principal of goals', async () => {
    const w = world()
    expect(await w.examining.hand('t-1', batchOf())).toEqual({ kind: 'taking' })
    await w.examining.idle()
    expect(w.calls).toEqual([
      [
        'reran',
        { tenant: 't-1', subject: SYSTEM },
        {
          session: 's-1',
          request: 'examine/1/1/call-1',
          results: [
            {
              criterion: 'A1',
              exit: null,
              note: 'the session has no working directory to run it in',
            },
          ],
        },
      ],
    ])
  })

  it('takes the same batch once while it is at it; when it is done the batch can be taken again', async () => {
    const w = world()
    w.hold.on = true
    const batch = batchOf({ where: process.cwd() })
    expect(await w.examining.hand('t-1', batch)).toEqual({ kind: 'taking' })
    expect(await w.examining.hand('t-1', batch)).toEqual({ kind: 'taking' })
    w.release()
    await w.examining.idle()
    expect(w.calls.filter(([name]) => name === 'reran')).toHaveLength(1)
    await w.examining.hand('t-1', batch)
    await w.examining.idle()
    expect(w.calls.filter(([name]) => name === 'reran')).toHaveLength(2)
  })

  it('runs the commands of a mixed batch itself and leaves the rest to the goal: what is left comes back as a batch without commands', async () => {
    const w = world(['A2'])
    const mixed = batchOf({ criteria: [RERUN, EXAMINED] })
    expect(await w.examining.hand('t-1', mixed)).toEqual({ kind: 'taking' })
    await w.examining.idle()
    expect(w.calls.map(([name]) => name)).toEqual(['reran'])
    expect(w.asked).toEqual([])
  })

  it('hands a batch with no command to the session that examines, and answers what it answers; while its commands run, that same batch without them is handed on all the same', async () => {
    const w = world()
    const rest = batchOf({ criteria: [EXAMINED] })
    expect(await w.examining.hand('t-1', rest)).toEqual({ kind: 'handed', examiner: 'examiner-1' })
    expect(w.asked).toEqual([['hand', 't-1', rest]])
    w.hold.on = true
    await w.examining.hand('t-1', batchOf({ where: process.cwd(), criteria: [RERUN, EXAMINED] }))
    expect(await w.examining.hand('t-1', rest)).toEqual({ kind: 'handed', examiner: 'examiner-1' })
    w.release()
    await w.examining.idle()
  })

  it('asks the session that examines for the calls of its round, whether its round is over, to stop, and to let go', async () => {
    const w = world()
    const out = { session: 's-1', examiner: 'examiner-1', request: 'examine/1/1/call-1' }
    expect(await w.examining.calls('t-1', 'examiner-1', out.request)).toEqual({
      kind: 'read',
      value: [],
    })
    expect(await w.examining.ended('t-1', out)).toBe('going')
    await w.examining.cancel('t-1', out)
    await w.examining.close('t-1', { session: 's-1', examiner: 'examiner-1' })
    expect(w.asked).toEqual([
      ['calls', 't-1', 'examiner-1', out.request],
      ['ended', 't-1', out],
      ['cancel', 't-1', out],
      ['close', 't-1', { session: 's-1', examiner: 'examiner-1' }],
    ])
  })

  it('hands nothing in while the goal services are not there, and reports it; the batch stays owed', async () => {
    const w = world()
    w.mounted.checking = undefined
    await w.examining.hand('t-1', batchOf())
    await w.examining.idle()
    expect(w.calls).toEqual([])
    expect(w.reported).toHaveLength(1)
  })
})
