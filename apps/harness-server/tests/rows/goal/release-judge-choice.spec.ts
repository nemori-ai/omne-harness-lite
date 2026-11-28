// @module-tag slow
import { describe, expect, it } from 'vitest'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, pollUntil, toolCallsByRequest } from '../../support/release-tree.ts'
import { treeOf } from '../media-intake/support.ts'
import { DRAFT, goalsOf, judgingRecords, WRITE } from './journey.ts'

const DEFAULT = 'openai/gpt-6-luna-decisions'
const OF_THE_SESSION = 'typesafe/jev-1.13'
const OF_THE_TENANT = 'typesafe/jev-1.14'

describe('the decision model a session chose for itself, on the release tree', () => {
  it(
    'judges from the next judging on, stands over what the tenant set, and gives the tenant its say back once it is taken away',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const judged: AskedDecision[] = []
      const during: (() => Promise<void>)[] = []
      const chat = toolCallsByRequest(body =>
        body.includes('A goal was set') && !body.includes(WRITE.id) ? [WRITE] : [],
      )
      const script = answeringDecisions(
        chat,
        async (_ask, nth) => {
          await during[nth]?.()
          return { criterion: nth < 2 ? 'fails' : 'holds' }
        },
        judged,
      )
      await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
        const session = await settledSession(tree, 'hello')
        const where = { tenant: tenantOf(savedTenant(tree.home)), session: sessionRef(session) }
        const { goal } = tree.clients
        const choose = (model: string | null) => goal['choose-judge']({ ...where, model } as never)
        expect(await goal['read-judge'](where as never)).toMatchObject({
          outcome: 'succeeded',
          body: { model: null, models: [DEFAULT, OF_THE_TENANT, OF_THE_SESSION] },
        })
        expect(await choose('openai/gpt-9')).toMatchObject({
          outcome: 'invalid',
          body: { issues: [{ entry: null, field: 'model' }] },
        })
        during.push(async () => {
          expect(await choose(OF_THE_SESSION)).toMatchObject({
            outcome: 'succeeded',
            body: { model: OF_THE_SESSION },
          })
          const set = ['setting', 'set', '--independent', 'goal/judge', 'model']
          const changed = await tree.cli([...set, '--value', JSON.stringify(OF_THE_TENANT)])
          expect(changed.status, changed.stderr).toBe(0)
        })
        during.push(async () => {
          expect(await goal['read-judge'](where as never)).toMatchObject({
            body: { model: OF_THE_SESSION },
          })
          expect(await choose(null)).toMatchObject({ outcome: 'succeeded', body: { model: null } })
        })
        const proposal = { kind: 'set', draft: treeOf(DRAFT) }
        const set = await goal['write-goal']({
          ...where,
          operation: 'op-set-1',
          proposal,
          words: null,
        } as never)
        expect(set).toMatchObject({ outcome: 'succeeded' })
        const { goals, agent } = await goalsOf(tree, session)
        await pollUntil(
          'the goal to settle',
          () => goals.read(agent, session),
          read => read.kind === 'done' && read.value?.state.status === 'settled',
        )
        expect(judged.map(ask => ask.model)).toEqual([DEFAULT, OF_THE_SESSION, OF_THE_TENANT])
        const records = await judgingRecords(tree)
        expect(records.map(record => record.labels.model)).toEqual(judged.map(ask => ask.model))
      })
    },
  )
})
