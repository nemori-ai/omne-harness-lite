// @module-tag slow
import { describe, expect, it } from 'vitest'
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

const NOTIFICATIONS = { kind: 'asset', category: 'tool', name: 'Notifications' } as const

const subscribe = (label: string) =>
  JSON.stringify({
    command: 'subscribe',
    params: {
      source: 'agent.posts',
      type: 'post',
      level: 'weak',
      scope: { kind: 'subject', equals: label },
      note: `看 ${label} 写的`,
    },
  })

const script = toolCallsThenText(body => {
  const label = /notifications: ([a-z]+)/.exec(body)?.[1]
  return label === undefined
    ? []
    : [{ id: `call_${label}`, tool: 'Notifications', arguments: subscribe(label) }]
})

async function settled(tree: ReleaseTree, session: string, what: string) {
  const entries = await pollUntil(
    `the Run of ${what} to end`,
    () => historyOf(tree, session),
    value => value.some(entry => entry.kind === 'run.terminal'),
  )
  return toolResults(entries).join('\n')
}

/** The calls of the Notifications tool the tool host recorded, in the order they were queued. */
const callsOf = (tree: ReleaseTree) =>
  toolCalls(tree.storageRoot)
    .filter(row => row.tool === 'Notifications')
    .map(row => row.call)

/** Who created the subscription, as the tool's result shows it to the agent. */
function creatorIn(result: string): unknown {
  const [head, body] = result.split('\n')
  if (head !== 'done Notifications subscribe' || body === undefined) return result
  return (JSON.parse(body) as { creator: unknown }).creator
}

describe('a subscription of the Notifications tool on the release tree', () => {
  it(
    'is made on the standing permission; once the subscribe gate asks, the answer to the release card lets it through',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exit = await onReleaseTree({ script, permission: 'auto_permission' }, async tree => {
        const hold = holdStart(tree, 'Notifications')
        const session = await tree.startSession('notifications: standing')
        await pollUntil('the Tool to reach the start', async () => hold.held(), n => n > 0)
        const releases = admittedReleases(tree.storageRoot)
        hold.go()
        const standing = await settled(tree, session, 'standing')
        const [standingCall, ...others] = callsOf(tree)
        expect(others).toEqual([])
        expect(creatorIn(standing)).toEqual({
          kind: 'agent',
          actorRef: expect.any(String),
          originatingSessionRef: session,
          originatingCallRef: standingCall,
        })
        expect(startAcceptances(tree.storageRoot).filter(row => 'release' in row)).toEqual([])
        expect(releases).toContainEqual({
          by: 'verdict',
          grant: expect.objectContaining({
            gate: expect.objectContaining({ key: 'tool.subscribe' }),
          }),
        })

        await setGate(tree, NOTIFICATIONS, 'subscribe', 'ask', 'notifications-subscribe-asks')
        const once = await tree.startSession('notifications: once')
        const card = await pendingCard(tree, once, 'once')
        expect(card.question).toMatchObject({
          kind: 'release',
          target: { tool: 'Notifications', command: 'subscribe' },
          gateTitle: '订阅',
          detail: {
            state: 'given',
            rows: [
              { label: '来源', value: 'agent.posts' },
              { label: '事件类型', value: 'post' },
              { label: '范围', value: '对象是「once」' },
              { label: '强弱', value: '弱提醒' },
              { label: '期限', value: '一直有效' },
              { label: '备注（agent 填的）', value: '看 once 写的' },
            ],
          },
        })
        await answerCard(tree, card, ['--option', 'allow-once'], 'reply-once')
        const settledOnce = await settled(tree, once, 'once')
        const onceCalls = callsOf(tree).filter(call => call !== standingCall)
        expect(onceCalls).toHaveLength(1)
        expect(creatorIn(settledOnce)).toEqual({
          kind: 'agent',
          actorRef: expect.any(String),
          originatingSessionRef: once,
          originatingCallRef: onceCalls[0],
        })

        const denied = await tree.startSession('notifications: denied')
        await answerCard(
          tree,
          await pendingCard(tree, denied, 'denied'),
          ['--option', 'deny-once'],
          'reply-denied',
        )
        expect(await settled(tree, denied, 'denied')).not.toContain('done Notifications subscribe')
      })
      expect(exit).toBe(0)
    },
  )
})
