// @module-tag slow
import { describe, expect, it } from 'vitest'
import { bodyOf } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const DEFINITION = {
  label: '交月报',
  recurrence: {
    kind: 'position',
    period: 'month',
    interval: 1,
    begin: '2026-11-01T00:00:00',
    until: null,
    ordinal: 'last',
    selector: { kind: 'workingDay' },
    times: ['17:00:00'],
  },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  purpose: {
    kind: 'reminder',
    content: { title: '月报', body: '交本月的月报' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
}
const create = (label: string) =>
  JSON.stringify({
    command: 'create',
    params: { definition: { ...DEFINITION, label }, state: 'active' },
  })

async function settled(tree: ReleaseTree, session: string, what: string) {
  const entries = await pollUntil(
    `the Run of ${what} to end`,
    () => historyOf(tree, session),
    value => value.some(entry => entry.kind === 'run.terminal'),
  )
  return toolResults(entries).join('\n')
}

const scheduleOf = (result: string) => {
  const line = result.split('\n').find(text => text.startsWith('{'))
  return (JSON.parse(line ?? '{}') as { schedule?: string }).schedule ?? ''
}

describe('the Schedules tool on the release tree', () => {
  it(
    'takes effect on the standing consent by default; after the owner asks to confirm, an inquiry card waits and the answer becomes the consent',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = toolCallsThenText(body => {
        if (body.includes('schedules: first'))
          return [{ id: 'call_first', tool: 'Schedules', arguments: create('月报一') }]
        if (body.includes('schedules: second'))
          return [{ id: 'call_second', tool: 'Schedules', arguments: create('月报二') }]
        if (body.includes('schedules: third'))
          return [{ id: 'call_third', tool: 'Schedules', arguments: create('月报三') }]
        return []
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const auto = await settled(tree, await tree.startSession('schedules: first'), 'first')
        expect(auto).toContain('done Schedules create')
        expect(auto).toContain('"basis":"blanket generation=')
        const first = scheduleOf(auto)

        const set = await tree.cli([
          'setting',
          'set',
          '--independent',
          'schedule/agent-authoring',
          'agentScheduleConsent',
          '--value',
          '"draft"',
        ])
        expect(set.status, set.stdout + set.stderr).toBe(0)

        const asking = await tree.startSession('schedules: second')
        const [card] = await pollUntil(
          'the inquiry card',
          () => tree.cards({ sessionRef: asking }),
          items => items.length === 1,
        )
        expect(card?.card).toMatchObject({ kind: 'pending' })
        expect(card?.card.ref.cardId).toMatch(/^schedule-consent-[0-9a-f]{64}$/)
        const question = card!.card.question as unknown as {
          title: string
          options: { id: string }[]
        }
        expect(question.title).toContain('月报二')
        expect(question.options.map(option => option.id)).toEqual(['activate', 'draft', 'none'])
        const reply = await tree.cli([
          'submit-reply',
          '--request',
          card!.card.ref.request.requestId,
          '--card',
          card!.card.ref.cardId,
          '--revision',
          card!.card.revision,
          '--option',
          'activate',
        ])
        expect(reply.status, reply.stdout + reply.stderr).toBe(0)
        const confirmed = await settled(tree, asking, 'second')
        expect(confirmed).toContain('done Schedules create')
        expect(confirmed).toContain('"basis":"granular decision=tool-call/')

        const declining = await tree.startSession('schedules: third')
        const [other] = await pollUntil(
          'the second card',
          () => tree.cards({ sessionRef: declining }),
          items => items.length === 1,
        )
        await tree.cli([
          'submit-reply',
          '--request',
          other!.card.ref.request.requestId,
          '--card',
          other!.card.ref.cardId,
          '--revision',
          other!.card.revision,
          '--option',
          'none',
        ])
        expect(await settled(tree, declining, 'third')).toMatch(/owner_declined/)

        const listed = bodyOf(await tree.cli(['schedule', 'list'])) as {
          items: { schedule: string; label: string }[]
        }
        expect(listed.items.map(item => item.label).sort()).toEqual(['月报一', '月报二'])
        const before = bodyOf(await tree.cli(['schedule', 'show', '--schedule', first]))
        expect(before).toMatchObject({ control: 'active', basis: { kind: 'blanket' } })
      })
      expect(exitCode).toBe(0)
    },
  )
})
