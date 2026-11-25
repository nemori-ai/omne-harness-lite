// @module-tag slow
import { describe, expect, it } from 'vitest'
import { readConfirmOption } from '@omne-harness/goal-contract'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import { historyOf, onReleaseTree, toolCallsByRequest } from '../../support/release-tree.ts'
import {
  ASKED,
  confirmedToTheEnd,
  count,
  judgingRecords,
  proposed,
  PROPOSE,
  reminders,
  SENT_ON,
  TYPED,
  WRITE,
} from './journey.ts'

/** The scripted agent: it proposes the goal when asked for one, writes the change note once the goal stands, then stops. */
function agentScript(requests: string[]) {
  return toolCallsByRequest(body => {
    requests.push(body)
    if (!body.includes(ASKED)) return []
    if (!body.includes(PROPOSE.id)) return [PROPOSE]
    return body.includes(WRITE.id) ? [] : [WRITE]
  })
}

const OPTIONS = {
  permission: 'bypass-permissions',
  extraHistoryKinds: ['message.system_reminder'],
} as const

describe('/goal on the release tree', () => {
  it(
    'the model reads the typed line and the prompt as two blocks, its proposal puts up a card; once the person confirms, the goal stands, the same run is sent on twice while the judge reads it as not met, and ends when it is; a judge model the tenant sets meanwhile is used from the next judging',
    { timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const judged: AskedDecision[] = []
      const during = { firstJudging: async () => {} }
      const script = answeringDecisions(
        agentScript(requests),
        async (_ask, nth) => {
          if (nth === 0) await during.firstJudging()
          return { criterion: nth < 2 ? 'fails' : 'holds' }
        },
        judged,
      )
      await onReleaseTree({ ...OPTIONS, script }, async tree => {
        during.firstJudging = async () => {
          const set = ['setting', 'set', '--independent', 'goal/judge', 'model']
          const changed = await tree.cli([...set, '--value', '"typesafe/jev-1.14"'])
          expect(changed.status, changed.stderr).toBe(0)
        }
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

        expect(judged.map(ask => ask.model)).toEqual([
          'openai/gpt-6-luna-decisions',
          'typesafe/jev-1.14',
          'typesafe/jev-1.14',
        ])
        expect(judged.map(ask => Object.keys(ask.questions))).toEqual(Array(3).fill(['A1', 'N1']))
        expect(JSON.stringify(judged[0]?.state)).toContain('- 首页提速')
        const records = await judgingRecords(tree)
        expect(records.map(record => record.consumer.position)).toEqual([
          '1.1.0/0/0/0',
          '1.1.1/0/0/0',
          '1.1.2/0/0/0',
        ])
        expect(records.map(record => record.labels.model)).toEqual(judged.map(ask => ask.model))
        for (const record of records)
          expect(record).toMatchObject({
            outcome: 'completed',
            accounted: true,
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
