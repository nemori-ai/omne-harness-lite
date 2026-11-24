import { setTimeout as sleep } from 'node:timers/promises'
import { endedRuns } from '../rows/authorization/release-flow-support.ts'
import { toolResults, type ReleaseTree } from './release-tree.ts'

/** One call of Tools, as a scripted model writes it. */
export const toolsCall = (id: string, command: string, params: unknown) => ({
  id,
  tool: 'Tools',
  arguments: JSON.stringify({ command, intent: 'test call', params }),
})

type Message = Readonly<{ role: string; content: unknown }>

/** The last message of a model request. */
export function lastMessageOf(body: string): Message | undefined {
  return (JSON.parse(body) as { messages?: Message[] }).messages?.at(-1)
}

/** The recovery call a pending answer of Tools names: a model copies it to read the result. */
export function recoveryOf(last: Message | undefined) {
  if (last?.role !== 'tool') return undefined
  const texts =
    typeof last.content === 'string'
      ? [last.content]
      : (last.content as { text?: unknown }[]).flatMap(part =>
          typeof part.text === 'string' ? [part.text] : [],
        )
  for (const text of texts) {
    try {
      const answer = JSON.parse(text) as {
        state?: string
        next?: { command: string; params: unknown }
      }
      if (answer.state === 'pending' && answer.next !== undefined) return answer.next
    } catch {
      continue
    }
  }
  return undefined
}

/** What the server warned, each different line once, in the order they first came. */
export const warningsOf = (tree: ReleaseTree) =>
  [
    ...new Set(
      tree.records
        .filter(record => record['signal'] === 'log' && record['level'] !== 'info')
        .map(record => `${String(record['component'])}: ${JSON.stringify(record['fields'])}`),
    ),
  ]
    .slice(-30)
    .join('\n')

/** A read that does not settle within the bound fails with what it last saw and what the server warned. */
export async function settled<T>(
  tree: ReleaseTree,
  what: string,
  read: () => Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (Date.now() > deadline)
      throw new Error(`${what} did not happen: ${JSON.stringify(value)}\n${warningsOf(tree)}`)
    await sleep(200)
  }
}

/**
 * Runs a journey whose steps name themselves. A journey that does not end within the bound fails
 * with the step it was at and what the server warned, instead of a bare timeout.
 */
export async function journey(
  tree: ReleaseTree,
  limitMs: number,
  body: (at: (step: string) => void) => Promise<void>,
): Promise<void> {
  let current = 'start'
  let timer: ReturnType<typeof setTimeout> | undefined
  const stuck = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the journey is stuck at: ${current}\n${warningsOf(tree)}`)),
      limitMs,
    )
  })
  try {
    await Promise.race([
      body(step => {
        current = step
      }),
      stuck,
    ])
  } finally {
    clearTimeout(timer)
  }
}

export const lastResult = async (tree: ReleaseTree, session: string, runs: number) =>
  toolResults(await endedRuns(tree, session, runs)).at(-1) ?? ''

/** What a request gives the model before the conversation: the system part and the tool declarations. */
export function prefixOf(body: string): string {
  const request = JSON.parse(body) as { messages?: { role: string }[]; tools?: unknown }
  return JSON.stringify({
    system: request.messages?.filter(message => message.role === 'system'),
    tools: request.tools,
  })
}
