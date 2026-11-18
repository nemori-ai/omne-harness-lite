// @module-tag slow
// What a person authorizes or changes never enters the model's context: the prefix of every request stays the same.
import { expect, it } from 'vitest'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { onReleaseTree, toolResults } from '../../support/release-tree.ts'
import {
  ONCE,
  answerCard,
  endedRuns,
  pendingCard,
  perMessageShell,
  sendInput,
  setShell,
} from './release-flow-support.ts'

type Sent = { messages?: { role: string; content: unknown }[]; tools?: unknown }

// The system messages and the tool declarations of one model request, as the bytes sent.
function prefixOf(body: string): string {
  const sent = JSON.parse(body) as Sent
  const system = (sent.messages ?? []).filter(message => message.role === 'system')
  return JSON.stringify({ system, tools: sent.tools })
}

function recording(script: GatewayScript) {
  const bodies: string[] = []
  const recorded: GatewayScript = request => {
    bodies.push(request.body)
    return script(request)
  }
  return { bodies, recorded }
}

it(
  'the system prompt and the tool declarations stay byte-identical across a release, a release for the session and a prohibition',
  { timeout: 300_000 },
  async () => {
    const { bodies, recorded } = recording(perMessageShell)
    const exit = await onReleaseTree(
      { script: recorded, permission: 'auto_permission', extraHistoryKinds: [ONCE] },
      async tree => {
        const session = await tree.startSession('start: echo one')
        const once = await pendingCard(tree, session, 'one')
        await answerCard(tree, once, ['--option', 'allow-once'], 'reply-one')
        await endedRuns(tree, session, 1)

        await sendInput(tree, session, 'start: echo two')
        const forSession = await pendingCard(tree, session, 'two')
        await answerCard(tree, forSession, ['--option', 'allow-session'], 'reply-two')
        await endedRuns(tree, session, 2)

        await sendInput(tree, session, 'start: echo three')
        const third = await endedRuns(tree, session, 3)
        expect(toolResults(third).join('\n')).toContain('three-done')

        await setShell(tree, 'deny', 'set-shell-deny')
        await sendInput(tree, session, 'start: echo four')
        const fourth = await endedRuns(tree, session, 4)
        expect(toolResults(fourth).join('\n')).not.toContain('four-done')
      },
    )
    expect(exit).toBe(0)
    expect(bodies.length).toBeGreaterThanOrEqual(8)
    const prefixes = new Set(bodies.map(prefixOf))
    expect(prefixes.size).toBe(1)
    const [prefix] = prefixes
    expect(prefix).toContain('"Shell"')
  },
)

it.each([
  ['bypass-permissions', 'runs it and asks no one', true],
  ['never', 'refuses it and asks no one', false],
] as const)(
  'a session in %s meets a tool whose permission asks: it %s',
  { timeout: 180_000 },
  async (permission, _what, runs) => {
    const exit = await onReleaseTree({ script: perMessageShell, permission }, async tree => {
      const session = await tree.startSession('start: echo mode')
      const ended = await endedRuns(tree, session, 1)
      const results = toolResults(ended).join('\n')
      if (runs) expect(results).toContain('mode-done')
      else
        expect(results).toBe('The tool call was denied by a rule or a prohibition and did not run.')
      expect(await tree.cards({ sessionRef: session })).toEqual([])
    })
    expect(exit).toBe(0)
  },
)
