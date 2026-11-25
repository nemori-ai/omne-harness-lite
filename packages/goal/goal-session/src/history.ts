import type { GoalHistory, PortRead } from '@omne-harness/goal'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import { NO_ENTRY } from './calls.ts'
import type { HistoryResults, SessionCalls } from './ports.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
type Read = Extract<Awaited<ReturnType<GoalHistory['calls']>>, { kind: 'read' }>
type ObservedCall = Read['value'][number]
export const HISTORY_PAGE_LIMIT = 256

/** One tool call as the history holds it: its name, its arguments as plain data, and the text of its result. */
export type MadeCall = Readonly<{ tool: string; arguments: unknown; result: string }>
/** What a tool call was, and the text of it a judging reads. The assembly answers it: it knows the tools of the release. */
export type CallReading = Omit<ObservedCall, 'ref' | 'order'>
export type DescribeCall = (call: MadeCall) => CallReading

type Tagged = Readonly<{ kind?: unknown; value?: unknown; entries?: unknown; items?: unknown }>
type Block = Readonly<{
  kind?: unknown
  callId?: unknown
  name?: unknown
  arguments?: unknown
  text?: unknown
}>
type Entry = Readonly<{
  payload?: Readonly<{ message?: Readonly<{ role?: unknown; blocks?: readonly Block[] }> }>
}>

/** The plain data of a JSON value kept in its tagged form; a value of another shape is kept as it is. */
export function plainOf(value: unknown): unknown {
  const tagged = value as Tagged | null
  if (typeof tagged !== 'object' || tagged === null) return value
  if (tagged.kind === 'object' && Array.isArray(tagged.entries))
    return Object.fromEntries(
      (tagged.entries as readonly Readonly<{ key: string; value: unknown }>[]).map(entry => [
        entry.key,
        plainOf(entry.value),
      ]),
    )
  if (tagged.kind === 'array' && Array.isArray(tagged.items)) return tagged.items.map(plainOf)
  if (tagged.kind === 'number') return Number(tagged.value)
  if (tagged.kind === 'null') return null
  return 'value' in tagged ? tagged.value : value
}

type Asked = Readonly<{ ref: string; tool: string; arguments: unknown }>

const blocksOf = (entry: unknown): readonly Block[] =>
  (entry as Entry | null)?.payload?.message?.blocks ?? []

function askedIn(blocks: readonly Block[]): readonly Asked[] {
  return blocks.flatMap(block =>
    block.kind === 'tool_call' && typeof block.callId === 'string' && typeof block.name === 'string'
      ? [{ ref: block.callId, tool: block.name, arguments: plainOf(block.arguments) }]
      : [],
  )
}

function answeredIn(blocks: readonly Block[]): Readonly<{ ref: string; result: string }> | null {
  const [head, ...rest] = blocks
  if (head?.kind !== 'tool_result' || typeof head.callId !== 'string') return null
  const texts = rest.flatMap(block => (typeof block.text === 'string' ? [block.text] : []))
  return { ref: head.callId, result: texts.join('\n') }
}

/** The answered tool calls of these entries in the order they were answered. A call without a result is left out. */
export function madeCalls(
  entries: readonly unknown[],
): readonly (MadeCall & Readonly<{ ref: string }>)[] {
  const asked = new Map<string, Asked>()
  const made: (MadeCall & { ref: string })[] = []
  for (const entry of entries) {
    const blocks = blocksOf(entry)
    for (const call of askedIn(blocks)) asked.set(call.ref, call)
    const answer = answeredIn(blocks)
    const call = answer === null ? undefined : asked.get(answer.ref)
    if (answer !== null && call !== undefined) made.push({ ...call, result: answer.result })
  }
  return made
}

/** What the agent said in the last of these entries it wrote, when it asked for no tool there; null otherwise. */
export function lastSaid(entries: readonly unknown[]): string | null {
  const last = entries.findLast(
    entry => (entry as Entry | null)?.payload?.message?.role === 'assistant',
  )
  const blocks = blocksOf(last)
  if (askedIn(blocks).length > 0) return null
  const said = blocks
    .flatMap(block => (block.kind === 'text' && typeof block.text === 'string' ? [block.text] : []))
    .join('\n')
    .trim()
  return said === '' ? null : said
}

/** The tool calls of a session since a goal was set, read from its history and described by the assembly. */
export function createGoalHistory(calls: SessionCalls, describe: DescribeCall): GoalHistory {
  async function entriesAfter(
    tenant: string,
    session: string,
    since: string,
  ): Promise<PortRead<readonly unknown[]>> {
    const legal = tenantCodec.parse(tenant)
    if (!legal.ok) return { kind: 'read', value: [] }
    const at = { tenant: legal.value, session: session as SessionId }
    const entries: unknown[] = []
    let cursor: string | null = null
    for (let page = 0; page < HISTORY_PAGE_LIMIT; page += 1) {
      const read: PortRead<HistoryResults> = await calls
        .callsAfter({ ...at, after: since === NO_ENTRY ? null : since, cursor })
        .catch(() => UNAVAILABLE)
      if (read.kind !== 'read') return UNAVAILABLE
      entries.push(...read.value.entries)
      cursor = read.value.next
      if (cursor === null) return { kind: 'read', value: entries }
    }
    return UNAVAILABLE
  }

  return {
    async calls(tenant, session, since): Promise<PortRead<readonly ObservedCall[]>> {
      const entries = await entriesAfter(tenant, session, since)
      if (entries.kind !== 'read') return UNAVAILABLE
      const value = madeCalls(entries.value).map(({ ref, ...call }, order) => ({
        ref,
        order,
        ...describe(call),
      }))
      return { kind: 'read', value }
    },
    async said(tenant, session, since) {
      const entries = await entriesAfter(tenant, session, since)
      return entries.kind === 'read'
        ? { kind: 'read', value: lastSaid(entries.value) }
        : UNAVAILABLE
    },
  }
}
