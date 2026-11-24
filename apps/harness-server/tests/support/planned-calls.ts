import type { GatewayScript } from '../fixtures/model-gateway.ts'
import {
  historyOf,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from './release-tree.ts'

export type PlannedCall = Readonly<{
  tool: string
  command: string
  params: Record<string, unknown>
}>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>

const textOf = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

/** A user message that tells the scripted model which calls to make in each of its next steps. */
export const plan = (...steps: readonly (readonly PlannedCall[])[]): string =>
  `PLAN ${JSON.stringify(steps)} END`

export const files = (command: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'Files',
  command,
  params,
})

export const extensions = (command: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'OmneExtensions',
  command,
  params,
})

export const skills = (command: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'Skills',
  command,
  params,
})

export const extensionPoints = (command: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'OmneExtensionPoints',
  command,
  params,
})

const argumentsOf = ({ tool, command, params }: PlannedCall) =>
  tool === 'Files' ? { command, intent: 'test call', params } : { command, params }

/** The model makes the calls of the step it is at: one step for each of its earlier turns with calls. */
export const plannedModel: GatewayScript = toolCallsByRequest(body => {
  const { messages } = JSON.parse(body) as { messages: readonly Message[] }
  const at = messages.findLastIndex(
    message => message.role === 'user' && /PLAN /u.test(textOf(message)),
  )
  const found = at < 0 ? null : /PLAN (.*) END/su.exec(textOf(messages[at]!))?.[1]
  if (found === null || found === undefined) return []
  const text =
    typeof messages[at]!.content === 'string' ? found : (JSON.parse(`"${found}"`) as string)
  const steps = JSON.parse(text) as readonly (readonly PlannedCall[])[]
  const done = messages
    .slice(at + 1)
    .filter(message => message.role === 'assistant' && (message.tool_calls?.length ?? 0) > 0).length
  return (steps[done] ?? []).map((call, index) => ({
    id: `call_${String(at)}_${String(done)}_${String(index)}`,
    tool: call.tool,
    arguments: JSON.stringify(argumentsOf(call)),
  }))
})

/** Sends a plan into a session, waits for that run to end, and gives the tool results it added. */
export function askerIn(tree: ReleaseTree) {
  const progress = new Map<string, { runs: number; results: number }>()
  return async (
    session: string,
    ...steps: readonly (readonly PlannedCall[])[]
  ): Promise<string> => {
    const at = progress.get(session) ?? { runs: 0, results: 0 }
    progress.set(session, at)
    at.runs += 1
    const sent = await tree.cli(['send-input', '--session', session, '--text', plan(...steps)])
    if (sent.status !== 0) throw new Error(`send-input failed: ${sent.stderr}`)
    const wanted = at.runs
    const entries = await pollUntil(
      `run ${String(wanted)} to end`,
      () => historyOf(tree, session),
      seen => seen.filter(entry => entry.kind === 'run.terminal').length >= wanted,
    )
    const results = toolResults(entries)
    const fresh = results.slice(at.results)
    at.results = results.length
    return fresh.join('\n')
  }
}
