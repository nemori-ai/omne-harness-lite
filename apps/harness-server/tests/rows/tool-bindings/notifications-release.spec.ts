// @module-tag slow
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const person = { kind: 'person' }
const post = (params: Record<string, unknown>) => JSON.stringify({ command: 'send', params })
const BRIEF = { title: '周报', body: '本周合入三项。', replace: 'weekly' }

/** The tool results of a session once it has ended the given number of Runs. */
async function settled(tree: ReleaseTree, session: string, what: string, runs = 1) {
  const entries = await pollUntil(
    `the Run of ${what} to end`,
    () => historyOf(tree, session),
    value => value.filter(entry => entry.kind === 'run.terminal').length >= runs,
  )
  return toolResults(entries).join('\n')
}

/** The owner's side: notification/v2 over HTTP with the login the tree saved. */
async function asOwner(tree: ReleaseTree, operation: string, body: Record<string, unknown>) {
  const response = await fetch(
    `http://127.0.0.1:${String(tree.port)}/api/notification/v2/${operation}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${savedLoginProof(tree.home)}`,
        'omne-message-id': 'm-owner',
      },
      body: JSON.stringify({ tenant: savedTenant(tree.home), ...body }),
    },
  )
  return (await response.json()) as { outcome: string; body: Record<string, any> }
}
const unresolved = async (tree: ReleaseTree) =>
  (
    await asOwner(tree, 'list-inbox', {
      recipient: person,
      filter: 'unresolved',
      after: null,
      limit: 20,
    })
  ).body['entries'] as Record<string, any>[]

describe('the Notifications tool on the release tree', () => {
  it(
    'posts for the owner as the agent of its session, keeps the newest under one replace key of one agent, and takes no identity from the model',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const scripted = [
        ['notifications: first', 'call_first', post({ id: 'w47', ...BRIEF })],
        [
          'notifications: second',
          'call_second',
          post({ id: 'w48', ...BRIEF, body: '本周合入五项。' }),
        ],
        ['notifications: other session', 'call_other', post({ id: 'o1', ...BRIEF })],
        [
          'notifications: forged',
          'call_forged',
          post({ id: 'f1', title: '冒充', source: 'owner.posts', depth: 0 }),
        ],
        [
          'notifications: inbox',
          'call_inbox',
          JSON.stringify({ command: 'inbox', params: { filter: 'all' } }),
        ],
      ] as const
      /** Each input asks for one call; a call the conversation already holds is not made again. */
      let declared = false
      const script = toolCallsByRequest(body => {
        declared ||= body.includes('"name":"Notifications"')
        return scripted
          .filter(([asked, id]) => body.includes(asked) && !body.includes(id))
          .map(([, id, args]) => ({ id, tool: 'Notifications', arguments: args }))
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('notifications: first')
        const first = await settled(tree, session, 'first')
        expect(first).toContain('done Notifications send')
        expect(declared).toBe(true)

        const [entry, ...rest] = await unresolved(tree)
        expect(rest).toEqual([])
        expect(entry).toMatchObject({
          source: 'agent.posts',
          type: 'post',
          title: '周报',
          level: 'weak',
          cause: { kind: 'named' },
          recipient: person,
        })
        expect(entry?.['event']).toMatch(/^[0-9a-f]{24}\.w47$/)
        const read = await asOwner(tree, 'read-notification', {
          recipient: person,
          source: 'agent.posts',
          event: entry?.['event'],
        })
        expect(read.body).toMatchObject({ subject: session, body: '本周合入三项。' })

        const again = await tree.cli([
          'send-input',
          '--session',
          session,
          '--text',
          'notifications: second',
        ])
        expect(again.status, again.stdout + again.stderr).toBe(0)
        expect(await settled(tree, session, 'second', 2)).toContain('w48')
        const newest = await unresolved(tree)
        expect(newest.map(item => String(item['event']).split('.')[1])).toEqual(['w48'])
        const superseded = await asOwner(tree, 'read-notification', {
          recipient: person,
          source: 'agent.posts',
          event: entry?.['event'],
        })
        expect(superseded.body['marks']['supersededBy']).toEqual({
          source: 'agent.posts',
          event: newest[0]?.['event'],
        })

        const other = await tree.startSession('notifications: other session')
        expect(await settled(tree, other, 'the other session')).toContain('done Notifications send')
        const both = await unresolved(tree)
        expect(both.map(item => String(item['event']).split('.')[1])).toEqual(['w48', 'o1'])
        expect(new Set(both.map(item => String(item['event']).split('.')[0])).size).toBe(2)

        const forged = await settled(
          tree,
          await tree.startSession('notifications: forged'),
          'forged',
        )
        expect(forged).not.toContain('done Notifications send')
        expect(await unresolved(tree)).toHaveLength(2)

        const own = await settled(tree, await tree.startSession('notifications: inbox'), 'inbox')
        expect(own).toContain('done Notifications inbox')
        expect(own).not.toContain('周报')
      })
      expect(exitCode).toBe(0)
    },
  )
})
