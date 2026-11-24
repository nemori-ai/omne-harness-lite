// A session as consumer scopes: its executions under the agent's owner, and its compactions under
// the compaction provider's owner, each rebuilt from the session's history.
import { decodeCompactionTaskId, encodeCompactionTaskRef } from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { HistoryEntry, SessionHistory, SessionId } from '@omne-harness/session-contract'
import type { UsageConsumer, UsageSessionScope } from '@omne-harness/usage-contract'

export type ScopeOwners = Readonly<{ agent: string; compaction: string }>

const KINDS = ['run.started', 'message.compaction'] as const

/** A text at a path of keys in the typed JSON tree of a history payload; null when it is not there. */
function textAt(value: JsonValue, ...path: readonly string[]): string | null {
  let at: JsonValue | undefined = value
  for (const key of path)
    at = at?.kind === 'object' ? at.entries.find(entry => entry.key === key)?.value : undefined
  return at?.kind === 'string' && at.value !== '' ? at.value : null
}

/** The work a compaction's summary call is consumed under, rebuilt from the compacted message. */
function compactionWork(entry: HistoryEntry, tenant: TenantId): string | null {
  const authority = textAt(entry.payload, 'message', 'derivation', 'owner')
  const task = textAt(entry.payload, 'message', 'derivation', 'record')
  const requestDigest = textAt(entry.payload, 'message', 'derivation', 'digest')
  if (authority === null || task === null || requestDigest === null) return null
  const id = decodeCompactionTaskId(task)
  if ('failure' in id) return null
  const work = encodeCompactionTaskRef({ authority, tenant, task: id.ok, requestDigest })
  return 'ok' in work ? work.ok : null
}

function consumersOf(
  entries: readonly HistoryEntry[],
  tenant: TenantId,
  owners: ScopeOwners,
): readonly UsageConsumer[] {
  const executions = new Set<string>()
  const compactions = new Set<string>()
  for (const entry of entries) {
    const execution = entry.kind === 'run.started' ? textAt(entry.payload, 'execution') : null
    if (execution !== null) executions.add(execution)
    const work = entry.kind === 'message.compaction' ? compactionWork(entry, tenant) : null
    if (work !== null) compactions.add(work)
  }
  const scopes: UsageConsumer[] = []
  if (executions.size > 0) scopes.push({ owner: owners.agent, works: [...executions] })
  if (compactions.size > 0) scopes.push({ owner: owners.compaction, works: [...compactions] })
  return scopes
}

/** The session scope over the reader's history face, taken at each call. */
export function sessionUsageScope<P>(
  read: () => SessionHistory<P> | undefined,
  input: Readonly<{ owners: ScopeOwners; pageBytes: number }>,
): UsageSessionScope<P> {
  return {
    async resolve({ principal, tenant, session }) {
      const history = read()
      if (history === undefined)
        return fail({ kind: 'unavailable', diagnostic: 'the session history is not here' })
      const access = { principal, tenant, session: session as SessionId }
      const entries: HistoryEntry[] = []
      try {
        let page = await history.begin({
          ...access,
          kinds: KINDS,
          from: null,
          direction: 'forward',
          pageBytes: input.pageBytes,
        })
        while (true) {
          if ('failure' in page) {
            const { failure } = page
            if (failure.kind === 'denied' || failure.kind === 'invalid')
              return succeed({ kind: 'absent' })
            return fail({
              kind: 'unavailable',
              diagnostic: `the session history answered ${failure.kind}`,
            })
          }
          for (const entry of page.ok.entries) entries.push(entry)
          if (page.ok.exhausted || page.ok.next === null) break
          page = await history.next({ ...access, cursor: page.ok.next })
        }
      } catch {
        return fail({ kind: 'unavailable', diagnostic: 'the session history threw' })
      }
      return succeed({ kind: 'found', consumers: consumersOf(entries, tenant, input.owners) })
    },
  }
}
