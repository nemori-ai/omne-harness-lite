import type { ResidueReport } from '@omne-harness/execution-environment-contract'
import type { ResiduePolicy } from '../host-command.ts'

export type MacosResidueInput = Readonly<{
  members: number | null
  policy: ResiduePolicy
  bound: boolean
  sameScope: boolean
  closed: boolean
}>

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
