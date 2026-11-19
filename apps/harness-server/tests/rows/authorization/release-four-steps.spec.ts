// @module-tag slow
import { describe, expect, it } from 'vitest'
import { bodyOf } from '../../r9/support.ts'
import {
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { answerCard, endedRuns, pendingCard, sendInput, setGate } from './release-flow-support.ts'

const SCHEDULES = { kind: 'asset', category: 'tool', name: 'Schedules' } as const
const definition = (label: string) => ({
  label,
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
    content: { title: label, body: label },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
})
const ASK = {
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use.',
        options: [
          { label: '8081', description: 'The next free port.' },
          { label: '3000', description: 'The default port.' },
        ],
      },
    ],
  },
}

/** Each input asks for one call; a call the conversation already holds is not made again. */
const STEPS = [
  ['four: search', 'call_search', 'Tools', { command: 'search', params: { query: 'schedule' } }],
  ['four: ask', 'call_ask', 'Ask', ASK],
  [
    'four: once',
    'call_once',
    'Schedules',
    { command: 'create', params: { definition: definition('once') } },
  ],
  [
    'four: bypass',
    'call_bypass',
    'Schedules',
    { command: 'create', params: { definition: definition('bypass') } },
  ],
] as const
const script = toolCallsByRequest(body =>
  STEPS.filter(([asked, id]) => body.includes(asked) && !body.includes(id)).map(
    ([, id, tool, call]) => ({ id, tool, arguments: JSON.stringify(call) }),
  ),
)

async function basisOf(tree: ReleaseTree, label: string) {
  const listed = bodyOf(await tree.cli(['schedule', 'list'])) as {
    items: { schedule: string; label: string }[]
  }
  const found = listed.items.find(item => item.label === label)
  if (found === undefined) return undefined
  return (
    bodyOf(await tree.cli(['schedule', 'show', '--schedule', found.schedule])) as {
      basis: unknown
    }
  ).basis
}

async function changeMode(tree: ReleaseTree, session: string, mode: string) {
  const read = bodyOf(await tree.cli(['read-permission-mode', '--session', session])) as {
    revision: string
  }
  const changed = await tree.cli([
    'change-permission-mode',
    '--session',
    session,
    '--mode',
    mode,
    '--expected-revision',
    read.revision,
  ])
  expect(changed.status, changed.stderr).toBe(0)
}

describe('one session in auto_permission, step by step', () => {
  it(
    'search asks nobody, Ask raises only its question, an asking gate raises one release card with the detail, and bypass asks nobody',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const exit = await onReleaseTree({ script, permission: 'auto_permission' }, async tree => {
        const session = await tree.startSession('four: search')
        const searched = await endedRuns(tree, session, 1)
        expect(searched.some(entry => entry.kind === 'message.tool')).toBe(true)
        expect(await tree.cards({ sessionRef: session })).toEqual([])

        await sendInput(tree, session, 'four: ask')
        const asked = await pollUntil(
          'the question of Ask',
          () => tree.cards({ sessionRef: session, states: ['pending'] }),
          cards => cards.length > 0,
        )
        expect(asked.map(item => item.card.question.kind)).toEqual(['question'])
        expect(asked[0]?.card.question.title).toBe('Which port should the dev server use?')

        await setGate(tree, SCHEDULES, 'activate', 'ask', 'four-activate-asks')
        const other = await tree.startSession('four: once')
        const card = await pendingCard(tree, other, 'once')
        expect(card.question).toMatchObject({
          kind: 'release',
          target: { tool: 'Schedules', command: 'create' },
          gateTitle: '让安排生效',
          detail: {
            state: 'given',
            rows: expect.arrayContaining([{ label: '动作', value: '新建并生效' }]),
            typed: { kind: 'schedule.activation@1' },
          },
        })
        await answerCard(tree, card, ['--option', 'allow-once'], 'four-once')
        await endedRuns(tree, other, 1)
        expect(await basisOf(tree, 'once')).toEqual({ kind: 'granular' })

        await changeMode(tree, other, 'bypass-permissions')
        await sendInput(tree, other, 'four: bypass')
        await endedRuns(tree, other, 2)
        expect(await tree.cards({ sessionRef: other, states: ['pending'] })).toEqual([])
        expect(await basisOf(tree, 'bypass')).toEqual({ kind: 'blanket', scope: 'session' })
      })
      expect(exit).toBe(0)
    },
  )
})
