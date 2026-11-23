import { expect } from 'vitest'
import {
  history,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from './release-tree.ts'

/** One call the scripted model makes: the tool and the whole arguments object it sends. */
export type PlannedCall = Readonly<{ tool: string; arguments: Record<string, unknown> }>
type Message = Readonly<{ role: string; content: unknown; tool_calls?: readonly unknown[] }>

const command = (tool: string, name: string, params: Record<string, unknown>): PlannedCall => ({
  tool,
  arguments: { command: name, params },
})

export const files = (name: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'Files',
  arguments: { command: name, intent: 'test call', params },
})
export const extensions = (name: string, params: Record<string, unknown>): PlannedCall =>
  command('OmneExtensions', name, params)
export const tools = (name: string, params: Record<string, unknown>): PlannedCall =>
  command('Tools', name, params)
/** A dispatch starts in the background, so it carries the intent its command requires. */
export const agents = (name: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'Agents',
  arguments:
    name === 'dispatch'
      ? { command: name, intent: 'hand the work over', params }
      : { command: name, params },
})
/** A call of a tool by its own arguments, as the model sends them. */
export const direct = (tool: string, args: Record<string, unknown>): PlannedCall => ({
  tool,
  arguments: args,
})

/** A user message that tells the scripted model which calls to make in each of its next steps. */
export const plan = (...steps: readonly (readonly PlannedCall[])[]): string =>
  `PLAN ${JSON.stringify(steps)} END`

const textOf = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

/** A person's words are a user message; the work dispatched to a session reaches its model as a developer message. */
const PLAN_ROLES = ['user', 'developer']

/** The model makes the calls of the step it is at: one step for each of its earlier turns with calls. */
export const plannedModel = toolCallsByRequest(body => {
  const { messages } = JSON.parse(body) as { messages: readonly Message[] }
  const at = messages.findLastIndex(
    message => PLAN_ROLES.includes(message.role) && /PLAN /u.test(textOf(message)),
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
    arguments: JSON.stringify(call.arguments),
  }))
})

/** Whoever acts on the tree: its first account, or another with a home of its own. */
export type Acting = Pick<ReleaseTree, 'cli' | 'port' | 'home'>

export async function cliOk(tree: Pick<Acting, 'cli'>, args: readonly string[]) {
  const ran = await tree.cli(args)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as { outcome: string; body: Record<string, unknown> }
}

/** Sends plans to sessions one run at a time; each answer is the text of the tool results of that run. */
export function planner(tree: Acting) {
  const progress = new Map<string, { runs: number; results: number }>()
  return async (
    session: string,
    ...steps: readonly (readonly PlannedCall[])[]
  ): Promise<string> => {
    const at = progress.get(session) ?? { runs: 0, results: 0 }
    progress.set(session, at)
    at.runs += 1
    await cliOk(tree, ['send-input', '--session', session, '--text', plan(...steps)])
    const wanted = at.runs
    const entries = await pollUntil(
      `run ${String(wanted)} to end`,
      () => history(tree.port, tree.home, session),
      seen => seen.filter(entry => entry.kind === 'run.terminal').length >= wanted,
    )
    const results = toolResults(entries)
    const fresh = results.slice(at.results)
    at.results = results.length
    return fresh.join('\n')
  }
}
