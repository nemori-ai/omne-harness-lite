// @module-tag slow
import { describe, expect, it } from 'vitest'
import { partInput, sessionNamed, systemPart } from '../../support/system-part.ts'
import { setGate } from '../authorization/release-flow-support.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const NOTIFICATIONS = { kind: 'asset', category: 'tool', name: 'Notifications' } as const

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [{ title: 'Which port?', options: [{ label: '8081' }, { label: '3000' }] }],
  },
})
const SEND = JSON.stringify({
  command: 'send',
  intent: 'tell the owner the build passed',
  params: { id: 'build-1', title: 'done', body: 'the build passed' },
})
const SUBSCRIBE = JSON.stringify({
  command: 'subscribe',
  params: {
    source: 'agent.posts',
    type: 'post',
    level: 'weak',
    scope: { kind: 'subject', equals: 'build' },
    note: 'watch the build',
  },
})

type Declared = Readonly<{ name: string; description: string }>

/** The tools one model request declares, from the body the gateway received. */
function declared(body: string): readonly Declared[] {
  const tools = (JSON.parse(body) as { tools?: readonly Record<string, unknown>[] }).tools ?? []
  return tools.map(tool => {
    const fn = (tool['function'] ?? tool) as { name?: unknown; description?: unknown }
    return { name: String(fn.name), description: String(fn.description) }
  })
}

const menuOf = (tools: readonly Declared[], name: string) =>
  tools.find(tool => tool.name === name)?.description

/** A session with nobody at its other end, created and started as a part of another domain does it. */
async function startUnattended(tree: ReleaseTree, name: string): Promise<string> {
  const part = systemPart(tree)
  const session = sessionNamed(name)
  const created = await part.create(session, { attendance: 'unattended', initial: null })
  if (!('ok' in created)) throw new Error(JSON.stringify(created))
  expect(created.ok.state.attendance).toBe('unattended')
  expect(await part.accept(session, partInput(`${name}-start`, 'start'))).toHaveProperty('ok')
  return session
}

const ended = (tree: ReleaseTree, session: string) =>
  pollUntil(
    'the Run to end',
    () => historyOf(tree, session),
    seen => seen.some(entry => entry.kind === 'run.terminal'),
  )

describe('the commands a session is given follow the conditions they declare (TL-62)', () => {
  it(
    'an attended auto-drive session is not given Ask, and keeps the send of Notifications',
    { timeout: 240_000 },
    async () => {
      const bodies: string[] = []
      const script = toolCallsThenText(body => (bodies.push(body), []))
      await onReleaseTree(
        { script, permission: 'bypass-permissions', collaboration: 'auto-drive' },
        async tree => {
          await tree.startSession('start')
          const [first] = await pollUntil(
            'the first model request',
            async () => bodies,
            seen => seen.length > 0,
          )
          const tools = declared(first ?? '{}')
          expect(tools.map(tool => tool.name)).not.toContain('Ask')
          expect(menuOf(tools, 'Notifications')).toMatch(/^send \{/mu)
          expect(tools.map(tool => tool.name)).toContain('Shell')
        },
      )
    },
  )

  it(
    'an unattended session is given neither Ask nor the send of Notifications, and reads why when it calls them',
    { timeout: 240_000 },
    async () => {
      const bodies: string[] = []
      const script = toolCallsThenText(body => {
        bodies.push(body)
        return [
          { id: 'call_ask', tool: 'Ask', arguments: ASK },
          { id: 'call_send', tool: 'Notifications', arguments: SEND },
        ]
      })
      await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
        const session = await startUnattended(tree, 'unattended')
        const history = await ended(tree, session)
        const tools = declared(bodies[0] ?? '{}')
        expect(tools.map(tool => tool.name)).not.toContain('Ask')
        const menu = menuOf(tools, 'Notifications')
        expect(menu).toMatch(/^inbox \{/mu)
        expect(menu).not.toMatch(/^send \{/mu)
        expect(toolResults(history)).toEqual([
          'Ask: the command "ask" is not available here: no person can be asked for an answer in this session now. Continue without it, or stop and report what you need.',
          'Notifications: the command "send" is not available here: no person attends this session. Continue without it, or stop and report what you need.',
        ])
        expect(await tree.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
      })
    },
  )

  it(
    'an unattended session refuses an action a person would have to decide, and says nobody can approve',
    { timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(() => [
        { id: 'call_subscribe', tool: 'Notifications', arguments: SUBSCRIBE },
      ])
      await onReleaseTree({ script, permission: 'auto_permission' }, async tree => {
        await setGate(tree, NOTIFICATIONS, 'subscribe', 'ask', 'subscribe-asks')
        const session = await startUnattended(tree, 'nobody')
        const results = toolResults(await ended(tree, session)).join('\n')
        expect(results).toContain('no person can be asked here')
        expect(results).not.toContain('done Notifications subscribe')
        expect(await tree.cards({ states: ['pending', 'decided', 'invalidated'] })).toEqual([])
      })
    },
  )
})
