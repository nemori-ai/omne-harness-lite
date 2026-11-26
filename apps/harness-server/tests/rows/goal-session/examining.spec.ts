import { describe, expect, it } from 'vitest'
import type { BatchToHand } from '@omne-harness/goal'
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
    async unexamined(caller: unknown, input: unknown) {
      calls.push(['unexamined', caller, input])
      return { kind: 'done', value: null, recalled: false }
    },
  } as unknown as GoalChecking
  const mounted = { checking: checking as GoalChecking | undefined }
  const reported: unknown[] = []
  const examining = createExamining({
    rerun: { runner, timeoutMs: 1000 },
    system: SYSTEM,
    checking: () => mounted.checking,
    report: error => void reported.push(error),
  })
  return { examining, calls, hold, release, mounted, reported }
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

  it('with nobody to examine what is left after the commands passed, says so: the rest cannot be told', async () => {
    const w = world(['A2'])
    await w.examining.hand('t-1', batchOf({ criteria: [RERUN, EXAMINED] }))
    await w.examining.idle()
    expect(w.calls.map(([name]) => name)).toEqual(['reran', 'unexamined'])
    expect(w.calls[1]?.[2]).toEqual({ session: 's-1', request: 'examine/1/1/call-1' })
  })

  it('refuses a batch with nothing to run again: nobody here examines by hand', async () => {
    const w = world()
    expect(await w.examining.hand('t-1', batchOf({ criteria: [EXAMINED] }))).toEqual({
      kind: 'refused',
    })
    expect(await w.examining.cited('t-1', 'x', 'examine/1/1/call-1', ['x-1'])).toEqual({
      kind: 'unavailable',
    })
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
