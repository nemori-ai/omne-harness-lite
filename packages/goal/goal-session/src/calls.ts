import type { GoalCalls, PortRead } from '@omne-harness/goal'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import type { HistoryResults, SessionCalls } from './ports.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
/** How many pages of history one check reads before it says it could not tell. */
export const CITED_PAGE_LIMIT = 64
/** The moment of a session whose history has no entry yet: every entry comes after it. */
export const NO_ENTRY = '0'

type Block = Readonly<{ kind?: unknown; callId?: unknown }>
type Payload = Readonly<{ message?: Readonly<{ blocks?: readonly Block[] }> }>

/** The call ids the tool results of these entries answer. An entry of another shape answers none. */
export function answeredCalls(entries: readonly unknown[]): readonly string[] {
  return entries.flatMap(entry => {
    const blocks = (entry as Readonly<{ payload?: Payload }> | null)?.payload?.message?.blocks ?? []
    return blocks.flatMap(block =>
      block.kind === 'tool_result' && typeof block.callId === 'string' ? [block.callId] : [],
    )
  })
}

/** The tool calls an agent cites, checked against the history of its own session after the goal was set. */
export function createGoalCalls(calls: SessionCalls): GoalCalls {
  return {
    async cited(tenant, session, refs, since): Promise<PortRead<readonly string[]>> {
      if (refs.length === 0) return { kind: 'read', value: [] }
      const legal = tenantCodec.parse(tenant)
      if (!legal.ok) return { kind: 'read', value: [] }
      const at = { tenant: legal.value, session: session as SessionId }
      const wanted = new Set(refs)
      const found = new Set<string>()
      let cursor: string | null = null
      for (let page = 0; page < CITED_PAGE_LIMIT; page += 1) {
        const read: PortRead<HistoryResults> = await calls
          .resultsAfter({ ...at, after: since === NO_ENTRY ? null : since, cursor })
          .catch(() => UNAVAILABLE)
        if (read.kind !== 'read') return UNAVAILABLE
        for (const call of answeredCalls(read.value.entries)) if (wanted.has(call)) found.add(call)
        cursor = read.value.next
        if (cursor === null || found.size === wanted.size)
          return { kind: 'read', value: [...found] }
      }
      return UNAVAILABLE
    },
  }
}
