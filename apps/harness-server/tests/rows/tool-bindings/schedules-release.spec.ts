// @module-tag slow
import { describe, expect, it } from 'vitest'
import { bodyOf } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  startAcceptances,
  toolCalls,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  admittedReleases,
  answerCard,
  holdStart,
  pendingCard,
  setGate,
} from '../authorization/release-flow-support.ts'

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

/** A schedule as the owner sees it: its state, who created it, and whether a consent column is there. */
async function shownOf(tree: ReleaseTree, label: string) {
  const listed = bodyOf(await tree.cli(['schedule', 'list'])) as {
    items: { schedule: string; label: string }[]
  }
  const found = listed.items.find(item => item.label === label)
  if (found === undefined) return undefined
  const shown = bodyOf(await tree.cli(['schedule', 'show', '--schedule', found.schedule])) as {
    control: string
    author: unknown
  }
  return { control: shown.control, author: shown.author, consent: Object.hasOwn(shown, 'basis') }
}
const byAgentOf = (session: string) => ({
  control: 'active',
  author: { kind: 'agent', session },
  consent: false,
})

/** Who created the schedule, as the result of the create call shows it to the agent. */
function authorIn(result: string): unknown {
  const [head, body] = result.split('\n')
  if (head !== 'done Schedules create' || body === undefined) return result
  return (JSON.parse(body) as { author: unknown }).author
}

describe('the Schedules tool on the release tree', () => {
  it(
    'names the agent, its session and the call that created a schedule',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree({ script, permission: 'auto_permission' }, async tree => {
        const session = await tree.startSession('schedules: traced')
        const result = await settled(tree, session, 'traced')
        const calls = toolCalls(tree.storageRoot).filter(row => row.tool === 'Schedules')
        expect(calls).toHaveLength(1)
        expect(authorIn(result)).toBe(`agent session=${session} call=${calls[0]?.call}`)
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'a call forwarded through Tools takes effect on its own release, not on the carrier',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree({ script, nonresident: ['Schedules'] }, async tree => {
        const hold = holdStart(tree, 'Schedules')
        const forwarded = await tree.startSession('schedules: forwarded')
        await pollUntil(
          'the Tool to reach the start',
          async () => hold.held(),
          n => n > 0,
        )
        const releases = admittedReleases(tree.storageRoot)
        hold.go()
        await settled(tree, forwarded, 'it')
        const shown = await pollUntil(
          'the forwarded schedule',
          () => shownOf(tree, 'forwarded'),
          value => value !== undefined,
        )
        expect(shown).toEqual(byAgentOf(forwarded))
        expect(startAcceptances(tree.storageRoot).filter(row => 'release' in row)).toEqual([])
        expect(releases).toContainEqual({
          by: 'verdict',
          grant: expect.objectContaining({ layer: 'tenant' }),
        })
        expect(releases).not.toContainEqual(expect.objectContaining({ by: 'carrier' }))
      })
      expect(exit).toBe(0)
    },
  )

  it(
    'takes effect on the standing permission; once the activate gate asks, the answer to the release card lets it through',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree({ script, permission: 'auto_permission' }, async tree => {
        const standing = await tree.startSession('schedules: standing')
        await settled(tree, standing, 'standing')
        expect(await shownOf(tree, 'standing')).toEqual(byAgentOf(standing))

        await setGate(tree, SCHEDULES, 'activate', 'ask', 'schedules-activate-asks')
        const once = await tree.startSession('schedules: once')
        const card = await pendingCard(tree, once, 'once')
        expect(card.question).toMatchObject({
          kind: 'release',
          target: { tool: 'Schedules', command: 'create' },
          gateTitle: '让安排生效',
          detail: {
            state: 'given',
            rows: expect.arrayContaining([
              { label: '动作', value: '新建并生效' },
              { label: '日程', value: 'once' },
              { label: '规则', value: '每月最后一个工作日，17:00' },
            ]),
            typed: { kind: 'schedule.activation@1' },
          },
        })
        const { detail } = card.question as unknown as {
          detail: { rows: { label: string; value: unknown }[]; typed: { value: string } }
        }
        const times = detail.rows.find(row => row.label === '接下来三次')?.value
        expect(Array.isArray(times) && times.length === 3).toBe(true)
        expect(JSON.parse(detail.typed.value)).toMatchObject({
          action: 'create',
          name: 'once',
          next: { kind: 'times', times },
        })
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-once')
        await settled(tree, once, 'once')
        expect(await shownOf(tree, 'once')).toEqual(byAgentOf(once))

        const session = await tree.startSession('schedules: session')
        await answerCard(
          tree,
          await pendingCard(tree, session, 'session'),
          ['--option', 'allow-session'],
          'reply-session',
        )
        await settled(tree, session, 'session')
        expect(await shownOf(tree, 'session')).toEqual(byAgentOf(session))

        const denied = await tree.startSession('schedules: denied')
        await answerCard(
          tree,
          await pendingCard(tree, denied, 'denied'),
          ['--option', 'deny-once'],
          'reply-denied',
        )
        await settled(tree, denied, 'denied')
        expect(await shownOf(tree, 'denied')).toBeUndefined()
      })
      expect(exit).toBe(0)
    },
  )
})
