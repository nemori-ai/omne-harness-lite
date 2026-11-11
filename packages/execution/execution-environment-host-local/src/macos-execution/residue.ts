import type { ResidueReport } from '@omne-harness/execution-environment-contract'
import type { ResiduePolicy } from '../host-command.ts'

export type MacosResidueInput = Readonly<{
  /** The gate's reading of the session's other members; null when it could not read them. */
  members: number | null
  policy: ResiduePolicy
  /** The acquisition has a retained-process ledger view. */
  bound: boolean
  /** The retention scope is the requester scope: the host keeps nothing in another scope. */
  sameScope: boolean
  /** The retention scope closed, or the acquisition released the domain or asked it to stop. */
  closed: boolean
}>

/**
 * The residue of a macOS domain. Sessions do not meet closed containment, so the provider never
 * keeps a domain: leftovers are always stopped. The reason is the first unmet condition of the
 * contract's ordered list; when the others hold, it is `uncontained`. An unread count is not empty.
 */
export function macosResidue(
  input: MacosResidueInput,
): Extract<ResidueReport, { kind: 'none' | 'stopping' }> {
  if (input.members === 0) return { kind: 'none' }
  if (input.policy === 'stop') return { kind: 'stopping', reason: 'policy' }
  if (!input.bound) return { kind: 'stopping', reason: 'unbound' }
  if (!input.sameScope) return { kind: 'stopping', reason: 'policy' }
  if (input.closed) return { kind: 'stopping', reason: 'closed' }
  return { kind: 'stopping', reason: 'uncontained' }
}
