// The history pages a reader sees (session-contract SPEC「条目的存储形式」, R2-D357). The storage
// view pages the stored form of revision 4, in which a value the log already holds is a marker; the
// faces give the payload of the full form. A page that only names its own origins resolves in
// place. A page that holds an SE01 with residents or an initial SE08 needs the initial adoption of
// the session, which the snapshot keeps. The SE01 is written once and never changes, so the first
// such page of a session reads the snapshot through the same view and later pages take the kept
// value: an active session reads nothing more. The kept values are bounded and keyed by tenant and
// session; a page reaches them only after its own access decision.
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  expandHistoryEntries,
  type HistoryEntry,
  type HistoryPage,
  type InitialAdoption,
  type SessionAccess,
  type SessionFailure,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import { OWNERS, unavailable } from './failures.ts'
import { readSnapshot } from './qualify.ts'

/** The sessions whose initial adoption one faces object keeps; past it the oldest goes. */
export const KEPT_INITIAL_ADOPTIONS = 256

export type HistoryPages = Readonly<{
  expanded<P>(
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    operation: string,
    read: Promise<Outcome<HistoryPage, SessionFailure>>,
  ): Promise<Outcome<HistoryPage, SessionFailure>>
}>

export function createHistoryPages(): HistoryPages {
  const kept = new Map<string, InitialAdoption>()
  const keyOf = (access: SessionAccess<unknown>): string | null => {
    const tenant = tenantCodec.encode(access.tenant)
    return tenant.ok ? JSON.stringify([tenant.value, access.session]) : null
  }
  const initialAdoption = async <P>(
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    operation: string,
  ): Promise<Outcome<InitialAdoption | null, SessionFailure>> => {
    const key = keyOf(access)
    const known = key === null ? undefined : kept.get(key)
    if (known !== undefined) return { ok: known }
    const snapshot = await readSnapshot(view, access, operation)
    if ('failure' in snapshot) return snapshot
    const value = snapshot.ok.initialization?.initialAdoption ?? null
    if (key !== null && value !== null) {
      kept.set(key, value)
      if (kept.size > KEPT_INITIAL_ADOPTIONS) kept.delete(kept.keys().next().value!)
    }
    return { ok: value }
  }
  return {
    expanded: async (view, access, operation, read) => {
      const page = await read
      if ('failure' in page) return page
      const rows: readonly HistoryEntry[] = [...page.ok.entries, ...page.ok.annotations]
      let expanded = expandHistoryEntries(rows, null)
      if ('missing' in expanded) {
        const created = await initialAdoption(view, access, operation)
        if ('failure' in created) return created
        expanded = expandHistoryEntries(rows, created.ok)
      }
      if ('missing' in expanded)
        return fail(
          unavailable(OWNERS.session, `${operation}: the snapshot keeps no initial adoption`),
        )
      if ('malformed' in expanded)
        return fail(unavailable(OWNERS.session, `${operation}: ${expanded.malformed}`))
      if (expanded.ok === rows) return page
      const count = page.ok.entries.length
      return {
        ok: {
          ...page.ok,
          entries: expanded.ok.slice(0, count),
          annotations: expanded.ok.slice(count),
        },
      }
    },
  }
}
