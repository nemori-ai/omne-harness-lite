import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { rowDeclarationOf } from '../../../src/row.ts'
import { goalAccessRow } from '../../../src/rows/goal-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { answeringDecisions } from '../../support/decisions-script.ts'
import { until } from '../../support/listening.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, pollUntil, toolCallsByRequest } from '../../support/release-tree.ts'
import { DRAFT } from '../goal/journey.ts'
import { treeOf } from '../media-intake/support.ts'

const BUDGET = {
  statement: '预算用尽',
  kind: 'budget',
  limits: [{ amount: 12, unit: 'rounds' }],
  deliver: '当前的改动',
  counts: 'failure',
}
const SET = { kind: 'set', draft: treeOf({ ...DRAFT, exits: [BUDGET] }) } as const
const RAISED = [
  { op: 'replace', id: 'X1', entry: { ...BUDGET, limits: [{ amount: 30, unit: 'rounds' }] } },
]
const plainOf = (value: JsonValue): any => JSON.parse(writeJsonText(value))

describe('goal-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(goalAccessRow)
    expect(declared?.row).toBe('goal-access')
    expect(declared?.manifest.injects).toEqual(['accessRegistry', 'principalIssuer'])
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it(
    'a person sets a goal over goal/v1, reads it paused once the judge saw no progress, raises the budget, has that write recalled, resumes it, and reads it achieved; each change is told',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = answeringDecisions(
        toolCallsByRequest(() => []),
        (_ask, nth) => ({ criterion: nth < 4 ? 'fails' : 'holds' }),
      )
      const exitCode = await onReleaseTree(
        { script, permission: 'bypass-permissions' },
        async tree => {
          const { goal } = tree.clients
          const text = savedTenant(tree.home)
          const session = await settledSession(tree, 'hello')
          const where = { tenant: tenantOf(text), session: sessionRef(session) }
          const read = async () => {
            const answer = await goal['read-goal'](where as never)
            if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
            return answer.body.goal
          }
          const write = (operation: string, proposal: object, words: string | null = null) =>
            goal['write-goal']({ ...where, operation, proposal, words } as never)
          const command = (generation: number, kind: string) =>
            goal['command-goal']({ ...where, generation, command: { kind } } as never)

          const controller = new AbortController()
          const frames: unknown[] = []
          const stream = goal.observe['observe-goal'](where as never, { signal: controller.signal })
          const pumping = (async () => {
            for (;;) {
              const next = await stream.next()
              if (next.done === true) return next.value
              frames.push(next.value)
            }
          })()
          try {
            await until(() => frames.length >= 1, 'the first frame', 10_000)
            expect(await read()).toBeNull()

            const set = await write('op-set-1', SET, '把改动说明写下来')
            expect(set).toMatchObject({
              outcome: 'succeeded',
              body: {
                goal: {
                  state: { status: 'active', attendance: 'attended', generation: 1, revision: 1 },
                  history: [
                    {
                      revision: 1,
                      via: 'direct',
                      words: '把改动说明写下来',
                      draftedBy: 'person',
                      confirmedBy: (JSON.parse(text) as { account: string }).account,
                      operation: 'op-set-1',
                    },
                  ],
                },
              },
            })

            const paused = await pollUntil(
              'the goal to pause',
              read,
              found => found?.state.status === 'paused',
            )
            expect(paused?.state).toMatchObject({ pause: { by: 'verdict', row: 7 }, outcome: null })
            expect(paused?.gap).toContainEqual(
              expect.objectContaining({ id: 'A1', open: true, reading: '证据显示没做到' }),
            )
            expect(paused?.rendered).toContain('## 目的\n把改动说明写进 CHANGELOG')

            expect(await command(9, 'resume')).toEqual({
              outcome: 'conflict',
              body: { reason: 'another-goal' },
            })
            const none = { kind: 'revise', changes: treeOf([{ op: 'remove', id: 'A9' }]) }
            expect(await write('op-bad-1', none)).toEqual({
              outcome: 'invalid',
              body: { issues: [{ entry: 'A9', field: 'id', problem: 'no such entry' }] },
            })

            const raise = { kind: 'revise', changes: treeOf(RAISED) }
            const raised = await write('op-budget-1', raise)
            if (raised.outcome !== 'succeeded') throw new Error(raised.outcome)
            expect(raised.body.goal.state).toMatchObject({ status: 'paused', revision: 2 })
            expect(plainOf(raised.body.goal.body).exits[0].limits).toEqual([
              { amount: 30, unit: 'rounds' },
            ])
            expect(raised.body.goal.gap).toContainEqual(
              expect.objectContaining({ id: '预算', ought: '30 轮' }),
            )
            const query = (operation: string) =>
              goal['query-write-goal']({
                ...where,
                operation,
                proposal: raise,
                words: null,
              } as never)
            expect(await query('op-budget-1')).toMatchObject({
              outcome: 'succeeded',
              body: { goal: { state: { revision: 2 } } },
            })
            expect(await query('op-never')).toEqual({ outcome: 'not-committed', body: {} })

            expect(await command(1, 'resume')).toMatchObject({
              outcome: 'succeeded',
              body: { goal: { state: { status: 'active' } } },
            })
            const settled = await pollUntil(
              'the goal to settle',
              read,
              found => found?.state.status === 'settled',
            )
            expect(settled?.state).toMatchObject({ outcome: { kind: 'achieved' }, pause: null })
            expect(await command(1, 'pause')).toMatchObject({ outcome: 'conflict' })
            await until(() => frames.length >= 4, 'a frame for each change', 10_000)
            for (const frame of frames) expect(frame).toEqual({ kind: 'changed' })

            const other = JSON.parse(text) as { organization: string; account: string }
            const last = other.account.at(-1) === 'a' ? 'b' : 'a'
            const foreign = JSON.stringify({
              ...other,
              account: `${other.account.slice(0, -1)}${last}`,
            })
            expect(
              await goal['read-goal']({ ...where, tenant: tenantOf(foreign) } as never),
            ).toMatchObject({ outcome: 'denied' })
          } finally {
            controller.abort()
            await pumping
          }
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
