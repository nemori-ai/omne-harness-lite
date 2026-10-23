import type { AssemblyInput, AssemblyFailure, HistoryEvidence } from './values.js'
import type { AssemblyPorts, HistoryRow } from './ports.js'
export async function readHistory<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
): Promise<
  | Readonly<{ kind: 'history'; rows: readonly HistoryRow[]; evidence: HistoryEvidence }>
  | AssemblyFailure
  | Readonly<{ kind: 'unknown'; source: 'read'; diagnostic: string }>
> {
  let evidence = input.history
  let after: number | null = null
  let rows: HistoryRow[] = []
  const epochs = new Set<string>([evidence.epoch])
  while (true) {
    const result = await ports.history.read(evidence, input.identity.access, after, 65536)
    switch (result.kind) {
      case 'page': {
        if (
          result.page.rows.some(
            (r, i) =>
              r.seq < 0 ||
              r.seq > evidence.upper ||
              r.seq <= (i === 0 ? (after ?? -1) : (result.page.rows[i - 1]?.seq ?? -1)),
          )
        )
          return { kind: 'invalid', field: 'history.page', reason: 'unsupported-format' }
        rows.push(...result.page.rows)
        if (result.page.next === null) return { kind: 'history', rows, evidence }
        if (result.page.next <= (after ?? -1) || result.page.next !== rows.at(-1)?.seq)
          return { kind: 'invalid', field: 'history.cursor', reason: 'unsupported-format' }
        after = result.page.next
        break
      }
      case 'epoch-changed':
        if (epochs.has(result.current.epoch))
          return {
            kind: 'unavailable',
            owner: 'history-source',
            diagnostic: 'History epoch did not advance',
          }
        if (result.current.scope.ref !== evidence.scope.ref)
          return { kind: 'invalid', field: 'history.scope', reason: 'scope-mismatch' }
        evidence = result.current
        epochs.add(evidence.epoch)
        rows = []
        after = null
        break
      case 'denied':
        return {
          kind: 'denied',
          action: 'read-history',
          diagnostic: 'History source refused access',
        }
      case 'invalid':
        return {
          kind: 'invalid',
          field: 'history',
          reason:
            result.reason === 'missing-access'
              ? 'missing-access'
              : result.reason === 'missing-scope'
                ? 'missing-scope'
                : 'unsupported-format',
        }
      case 'unavailable':
        return { kind: 'unavailable', owner: 'history-source', diagnostic: result.diagnostic }
      case 'unknown':
        return { kind: 'unknown', source: 'read', diagnostic: 'History source outcome unknown' }
    }
  }
}
