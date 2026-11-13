// Support of the session observation cases and demonstration (#1248). No vitest import: the
// demonstration script runs it with node.
import type { SessionId } from '@omne-harness/session-contract'
import {
  sessionObservationKey,
  type SessionObservationService,
} from '@omne-harness/session-observation/cordis'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import type { ReleaseTree } from '../support/release-tree.ts'
import { bodyOf } from '../r9/support.ts'
import type { LoginAccess } from '../model/public-stream-support.ts'

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const ECHO = JSON.stringify({ command: 'execute', params: { script: 'echo observed' } })

/**
 * A turn with one tool call, both Model calls held after their first piece until `release`: the
 * first call says `Checking.` and then asks for the Shell tool; the call after the tool result
 * says `All` and then ` done.`.
 */
export function heldToolTurn(): Readonly<{
  script: GatewayScript
  held(): number
  release(): void
}> {
  const waiting: (() => void)[] = []
  const script: GatewayScript = ({ body }) => {
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    const afterTool = body.includes('"role":"tool"')
    const head = sse([
      { ...serving, choices: [{ delta: { content: afterTool ? 'All' : 'Checking.' } }] },
    ]).replace('data: [DONE]\n\n', '')
    const tail = afterTool
      ? sse([
          { choices: [{ delta: { content: ' done.' } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ])
      : sse([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_echo',
                      type: 'function',
                      function: { name: 'Shell', arguments: ECHO },
                    },
                  ],
                },
              },
            ],
          },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ])
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: head,
      rest: { after: new Promise<void>(resolve => waiting.push(resolve)), body: tail },
    }
  }
  return {
    script,
    held: () => waiting.length,
    release() {
      for (const resolve of waiting.splice(0)) resolve()
    },
  }
}

export function observationService(tree: ReleaseTree): SessionObservationService<unknown> {
  const service = tree.scope.get(sessionObservationKey) as
    | SessionObservationService<unknown>
    | undefined
  if (service === undefined) throw new Error('sessionObservation is not on the tree')
  return service
}

export function openObservation(
  tree: ReleaseTree,
  access: LoginAccess,
  session: string,
  signal: AbortSignal,
) {
  return observationService(tree).open({
    access: { ...access, session: session as SessionId },
    signal,
  })
}

/** A session made through the CLI, with no input yet. */
export async function emptySession(tree: ReleaseTree): Promise<string> {
  const created = await tree.cli(['create-session', '--definition', 'coding'])
  if (created.status !== 0) throw new Error(created.stderr)
  return String(bodyOf(created)['session'])
}

export async function sendInput(tree: ReleaseTree, session: string, text: string): Promise<void> {
  const sent = await tree.cli(['send-input', '--session', session, '--text', text])
  if (sent.status !== 0) throw new Error(sent.stderr)
}
