// @module-tag slow
import { describe, expect, it } from 'vitest'
import { bodyOf } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  startAcceptances,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { answerCard, pendingCard, setGate } from '../authorization/release-flow-support.ts'

const SCHEDULES = { kind: 'asset', category: 'tool', name: 'Schedules' } as const
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
const definition = (label: string) => ({ ...DEFINITION, label })
const create = (label: string) =>
  JSON.stringify({ command: 'create', params: { definition: definition(label) } })
const forward = (label: string) =>
  JSON.stringify({
    command: 'execute',
    intent: 'make a schedule',
    params: { name: 'Schedules', command: 'create', arguments: { definition: definition(label) } },
  })

const script = toolCallsThenText(body => {
  const label = /schedules: ([a-z]+)/.exec(body)?.[1]
  if (label === undefined) return []
  return label === 'forwarded'
    ? [{ id: `call_${label}`, tool: 'Tools', arguments: forward(label) }]
    : [{ id: `call_${label}`, tool: 'Schedules', arguments: create(label) }]
})

async function settled(tree: ReleaseTree, session: string, what: string) {
  const entries = await pollUntil(
    `the Run of ${what} to end`,
    () => historyOf(tree, session),
    value => value.some(entry => entry.kind === 'run.terminal'),
  )
  return toolResults(entries).join('\n')
}

async function basisOf(tree: ReleaseTree, label: string) {
  const listed = bodyOf(await tree.cli(['schedule', 'list'])) as {
    items: { schedule: string; label: string }[]
  }
  const found = listed.items.find(item => item.label === label)
  if (found === undefined) return undefined
  const shown = bodyOf(await tree.cli(['schedule', 'show', '--schedule', found.schedule])) as {
    control: string
    basis: unknown
  }
  return { control: shown.control, basis: shown.basis }
}

describe('the Schedules tool on the release tree', () => {
  it(
    'a call forwarded through Tools takes effect on its own release, not on the carrier',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree({ script, nonresident: ['Schedules'] }, async tree => {
        await settled(tree, await tree.startSession('schedules: forwarded'), 'it')
        const shown = await pollUntil(
          'the forwarded schedule',
          () => basisOf(tree, 'forwarded'),
          value => value !== undefined,
        )
        expect(shown).toEqual({ control: 'active', basis: { kind: 'blanket', scope: 'standing' } })
        const releases = startAcceptances(tree.storageRoot).map(row => row['release'])
        expect(releases).toEqual(
          expect.arrayContaining([
            { by: 'carrier', grant: null },
            { by: 'verdict', grant: expect.stringContaining('"layer":"tenant"') },
          ]),
        )
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'takes effect on the standing permission; once the activate gate asks, the answer to the release card is the consent',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree({ script, permission: 'auto_permission' }, async tree => {
        await settled(tree, await tree.startSession('schedules: standing'), 'standing')
        expect(await basisOf(tree, 'standing')).toEqual({
          control: 'active',
          basis: { kind: 'blanket', scope: 'standing' },
        })

        await setGate(tree, SCHEDULES, 'activate', 'ask', 'schedules-activate-asks')
        const once = await tree.startSession('schedules: once')
        const card = await pendingCard(tree, once, 'once')
        expect(card.question).toMatchObject({
          kind: 'release',
          target: { tool: 'Schedules', command: 'create' },
          gateTitle: '让安排生效',
        })
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-once')
        await settled(tree, once, 'once')
        expect(await basisOf(tree, 'once')).toEqual({
          control: 'active',
          basis: { kind: 'granular' },
        })

        const session = await tree.startSession('schedules: session')
        await answerCard(
          tree,
          await pendingCard(tree, session, 'session'),
          ['--option', 'allow-session'],
          'reply-session',
        )
        await settled(tree, session, 'session')
        expect(await basisOf(tree, 'session')).toEqual({
          control: 'active',
          basis: { kind: 'blanket', scope: 'session' },
        })

        const denied = await tree.startSession('schedules: denied')
        await answerCard(
          tree,
          await pendingCard(tree, denied, 'denied'),
          ['--option', 'deny-once'],
          'reply-denied',
        )
        await settled(tree, denied, 'denied')
        expect(await basisOf(tree, 'denied')).toBeUndefined()
      })
      expect(exit).toBe(0)
    },
  )
})
