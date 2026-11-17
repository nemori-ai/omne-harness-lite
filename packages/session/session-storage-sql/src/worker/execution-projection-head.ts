import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { sessionHead } from './fact-rows.ts'
import { big, oneRow, type Scope } from './support.ts'

export function executionProjectionHead(port: ReadPort, scope: Scope, execution: string) {
  const gate = sessionHead(port, scope)
  if (gate.kind !== 'held') return gate
  const head = oneRow(
    port,
    `SELECT e.revision, c.revision AS current_revision, c.covered
    FROM er_execution e LEFT JOIN er_current_head c ON c.tenant = e.tenant
      AND c.execution = e.execution AND c.session = e.session
    WHERE e.tenant = ? AND e.session = ? AND e.execution = ? LIMIT 1`,
    [scope.tenant, scope.session, execution],
  )
  if (head === undefined) return { kind: 'denied' as const }
  if (head['current_revision'] === null || big(head['revision']) !== big(head['current_revision']))
    return { kind: 'missing' as const, published: String(gate.published) }
  return {
    kind: 'ready' as const,
    published: String(gate.published),
    covered: String(big(head['covered'])),
    revision: String(big(head['revision'])),
  }
}
