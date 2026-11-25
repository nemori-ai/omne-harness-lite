// @module-tag slow
import { describe, expect, it } from 'vitest'
import { goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import { readConfirmOption, type GoalCaller } from '@omne-harness/goal-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { treeOf } from '../media-intake/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import {
  type Entry,
  historyOf,
  onReleaseTree,
  pollUntil,
  type ReleaseTree,
  textsOf,
  toolCallsByRequest,
} from '../../support/release-tree.ts'

type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]
type Card = Readonly<{
  ref: { request: { requestId: string }; cardId: string }
  revision: string
  question: { title: string; description: string; options: { id: string; label: string }[] }
}>

const TYPED = '/goal 把改动说明写进 CHANGELOG'
const ASKED = 'The person asks for a goal for this session.'
const DRAFT = {
  purpose: '把改动说明写进 CHANGELOG',
  criteria: [
    {
      statement: '改动说明写进了 CHANGELOG',
      evidence: { kind: 'file', path: 'CHANGELOG.md' },
      pass: { kind: 'shows', text: '有一条讲这次改动的新条目' },
    },
  ],
  rules: [{ statement: '不改公共接口。' }],
}
const PROPOSE = {
  id: 'call-propose-1',
  tool: 'Goal',
  arguments: JSON.stringify({ command: 'propose', params: { body: DRAFT } }),
}
const WRITE = {
  id: 'call-write-1',
  tool: 'Files',
  arguments: JSON.stringify({
    command: 'write',
    intent: 'note the change',
    params: { path: 'CHANGELOG.md', mode: 'create', text: '- 首页提速' },
  }),
}
const SENT_ON = 'You were about to stop, but the goal of this session is not met yet'
const SINCE = new Date(Date.now() - 3_600_000).toISOString()
const BEFORE = new Date(Date.now() + 7_200_000).toISOString()
const reminders = (entries: readonly Entry[]) =>
  entries
    .filter(entry => entry.kind === 'message.system_reminder')
    .map(entry => textsOf(entry.payload).join('\n'))
const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length

/** The scripted agent: it proposes the goal when asked for one, writes the change note once the goal stands, then stops. */
function agentScript(requests: string[]) {
  return toolCallsByRequest(body => {
    requests.push(body)
    if (!body.includes(ASKED)) return []
    if (!body.includes(PROPOSE.id)) return [PROPOSE]
    return body.includes(WRITE.id) ? [] : [WRITE]
  })
}

type UsageRecord = Readonly<{
  consumer: { purpose: string; position: string }
  outcome: string
  accounted: boolean
}>
/** The usage records of the decision calls of this tenant, in the order they were asked. */
async function judgingRecords(tree: ReleaseTree): Promise<readonly UsageRecord[]> {
  const listed = await tree.cli(['list-usage-records', '--since', SINCE, '--before', BEFORE])
  expect(listed.status, listed.stderr).toBe(0)
  const { body } = JSON.parse(listed.stdout) as { body: { entries: UsageRecord[] } }
  return body.entries
    .filter(entry => entry.consumer.purpose === 'judge')
    .toSorted((a, b) => a.consumer.position.localeCompare(b.consumer.position))
}

/** A person types /goal in a settled session, the agent proposes, and the card of the proposal is up. */
async function proposed(tree: ReleaseTree) {
  const session = await settledSession(tree, 'hello')
  const sent = await tree.clients.session['send-input']({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
    acceptId: 'accept-goal-1',
    inputId: 'in-goal-1',
    message: treeOf({
      id: await userMessageId('in-goal-1'),
      role: 'user',
      blocks: [
        { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true }, text: TYPED },
      ],
    }),
  } as unknown as Send)
  expect(sent).toMatchObject({ outcome: 'succeeded' })
  const [item] = await pollUntil(
    'the confirmation card',
    () => tree.cards({ sessionRef: session }),
    cards => cards.length === 1,
  )
  const card = (item as unknown as { card: Card }).card
  const text = tenantCodec.encode(tree.registrar().tenant)
  if (!text.ok) throw new Error('the tenant has no text')
  const issued = await toolRuntimeHolder(tree.scope)
    .workPrincipals()
    ?.forSession({
      actor: 'coordinator',
      tenant: tree.registrar().tenant,
      session: session as never,
    })
  if (issued === undefined || !('ok' in issued)) throw new Error(JSON.stringify(issued))
  const agent: GoalCaller = { tenant: text.value, subject: issued.ok }
  const goals = tree.scope.get(goalsKey)
  if (goals === undefined) throw new Error('no goal service')
  return { session, card, agent, goals }
}

/** The person confirms the card, and the run the goal stood in comes to its end. */
async function confirmedToTheEnd(tree: ReleaseTree, session: string, card: Card) {
  const answered = await tree.cli([
    'submit-reply',
    '--request',
    card.ref.request.requestId,
    '--card',
    card.ref.cardId,
    '--revision',
    card.revision,
    '--option',
    card.question.options[0]!.id,
    '--reply-id',
    'reply-goal-1',
  ])
  expect(answered.status, answered.stderr).toBe(0)
  const entries = await pollUntil(
    'the run of the goal to end',
    () => historyOf(tree, session),
    found => count(found, 'run.terminal') === 2,
  )
  expect(count(entries, 'run.started')).toBe(2)
  return entries
}

const OPTIONS = {
  permission: 'bypass-permissions',
  extraHistoryKinds: ['message.system_reminder'],
} as const

describe('/goal on the release tree', () => {
  it(
    'the model reads the typed line and the prompt as two blocks, its proposal puts up a card; once the person confirms, the goal stands, the same run is sent on twice while the judge reads it as not met, and ends when it is',
    { timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const judged: AskedDecision[] = []
      const script = answeringDecisions(
        agentScript(requests),
        (_ask, nth) => ({ criterion: nth < 2 ? 'fails' : 'holds' }),
        judged,
      )
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const { session, card, agent, goals } = await proposed(tree)
        expect(card.question.title).toBe('确认这个目标')
        expect(card.question.description).toContain('## 目的\n把改动说明写进 CHANGELOG')
        expect(card.question.description).toContain('- [A1] 改动说明写进了 CHANGELOG')
        expect(card.question.options.map(option => option.label)).toEqual(['确认', '不设了'])
        expect(readConfirmOption(card.question.options[0]!.id)?.base).toEqual({
          generation: 0,
          revision: 0,
          live: false,
        })
        expect(await goals.read(agent, session)).toMatchObject({ kind: 'done', value: null })
        const waiting = await historyOf(tree, session)
        expect(count(waiting, 'run.started') - count(waiting, 'run.terminal')).toBe(1)

        const entries = await confirmedToTheEnd(tree, session, card)
        expect(await goals.read(agent, session)).toMatchObject({
          kind: 'done',
          value: {
            state: {
              status: 'settled',
              outcome: { kind: 'achieved' },
              rounds: 2,
              revision: 1,
              attendance: 'attended',
            },
            body: { purpose: '把改动说明写进 CHANGELOG' },
            history: [{ via: 'card', draftedBy: 'agent', revision: 1 }],
            readings: { criteria: { A1: { value: 'holds', source: 'judge' } } },
            wake: null,
          },
        })

        const asking = requests.find(body => body.includes(ASKED)) ?? ''
        expect(asking).toContain(TYPED)
        expect(asking).toContain('goal:goal (layer official, version 1), named by the person.')
        expect(asking.indexOf(TYPED)).toBeLessThan(asking.indexOf('named by the person'))
        const person = entries.filter(entry => entry.kind === 'message.user').at(-1)
        if (person === undefined) throw new Error('the typed line is not in the history')
        type Blocks = { text: string; origin?: object }[]
        const { blocks } = (person.payload as { message: { blocks: Blocks } }).message
        expect(blocks).toHaveLength(2)
        expect(blocks[0]).toMatchObject({ text: TYPED })
        expect(blocks[0]?.origin).toBeUndefined()
        expect(blocks[1]?.origin).toMatchObject({ name: 'goal:goal', layer: 'official' })

        expect(requests).toHaveLength(6)
        expect(requests[2]).toContain('The person confirmed. The goal stands as revision 1.')
        const sentOn = reminders(entries).filter(text => text.includes(SENT_ON))
        expect(sentOn).toHaveLength(2)
        expect(sentOn[0]).toContain(
          'Still open:\n- [A1] 改动说明写进了 CHANGELOG：证据显示没做到（判定）',
        )
        expect(reminders(waiting).filter(text => text.includes(SENT_ON))).toEqual([])
        expect(requests[3]).not.toContain(SENT_ON)
        expect(requests[4]?.split(SENT_ON)).toHaveLength(2)
        expect(requests[5]?.split(SENT_ON)).toHaveLength(3)

        expect(judged.map(ask => ask.model)).toEqual(Array(3).fill('openai/gpt-6-luna-decisions'))
        expect(judged.map(ask => Object.keys(ask.questions))).toEqual(Array(3).fill(['A1', 'N1']))
        expect(JSON.stringify(judged[0]?.state)).toContain('- 首页提速')
        const records = await judgingRecords(tree)
        expect(records.map(record => record.consumer.position)).toEqual([
          '1.1.0/0/0/0',
          '1.1.1/0/0/0',
          '1.1.2/0/0/0',
        ])
        for (const record of records)
          expect(record).toMatchObject({
            outcome: 'completed',
            accounted: true,
            labels: { model: 'openai/gpt-6-luna-decisions' },
            usage: [
              { name: 'input', state: 'known', lexeme: '120' },
              { name: 'output', state: 'known', lexeme: '8' },
            ],
            cost: { state: 'known', lexeme: '0.0004' },
            connectRetries: 0,
          })
      })
    },
  )

  it(
    'a judge that fails is not sent the same call again: it is asked anew twice at most, then the goal pauses and the person is told in the conversation',
    { timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const judged: AskedDecision[] = []
      const script = answeringDecisions(agentScript(requests), () => ({ refused: 500 }), judged)
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        const { session, card, agent, goals } = await proposed(tree)
        const entries = await confirmedToTheEnd(tree, session, card)
        expect(await goals.read(agent, session)).toMatchObject({
          kind: 'done',
          value: {
            state: { status: 'paused', rounds: 0, pause: { by: 'verdict', row: 8, exit: null } },
            readings: { criteria: {} },
            wake: null,
          },
        })
        expect(judged).toHaveLength(3)
        const records = await judgingRecords(tree)
        expect(records.map(record => [record.consumer.position, record.outcome])).toEqual([
          ['1.1.0/0/0/0', 'failed'],
          ['1.1.0/0/0/1', 'failed'],
          ['1.1.0/0/0/2', 'failed'],
        ])
        const told = reminders(entries).filter(text => text.includes('目标暂停了，交给你定。'))
        expect(told).toHaveLength(1)
        expect(told[0]).toContain('这一次判定答不出，没法核对做没做到。')
        expect(told[0]).toContain('- [A1] 改动说明写进了 CHANGELOG：没读过')
        expect(told[0]).toContain('你可以恢复、修订或取消这个目标。')
        expect(reminders(entries).filter(text => text.includes(SENT_ON))).toEqual([])
        expect(requests).toHaveLength(4)
        expect(requests.join('\n')).not.toContain('目标暂停了')
        for (const kind of ['pause', 'resume', 'cancel'] as const)
          expect(await goals.command(agent, { session, command: { kind } })).toEqual({
            kind: 'refused',
            reason: { kind: 'denied' },
          })
      })
    },
  )
})
