import type { ProducerFact, RoutedInput } from '@omne-harness/session-contract'

export type Citation = string & { readonly __citation: 'non-empty' }

export function cite(text: string): Citation {
  if (text.trim() === '') throw new Error('a policy citation cannot be empty')
  return text as Citation
}

export type SystemPurpose =
  | 'enumerate-tenants'
  | 'resident-references'
  | 'released-scopes'
  | 'pending-sessions'
  | 'scope-release-receive'
  | 'agent-instance-publish'
  | 'agent-instance-quiesce'
  | 'agent-instance-withdraw'

export type RoutedKind = RoutedInput['kind']
export type ReceivedFactKind = ProducerFact['kind']

export type Branch =
  | Readonly<{ kind: 'routed'; kinds: readonly RoutedKind[] }>
  | Readonly<{ kind: 'fact'; kinds: readonly ReceivedFactKind[] }>

export type MemberCell = Readonly<{ verdict: 'member'; source: Citation; when?: Branch }>
export type MatrixCell = Readonly<{
  verdict: 'matrix'
  purpose: SystemPurpose
  source: Citation
  when?: Branch
}>
export type DenyCell = Readonly<{ verdict: 'deny'; basis: string }>

export type PolicyCell = MemberCell | MatrixCell | DenyCell

export type PrincipalColumn = 'login' | 'work' | 'system'
export type PolicyRow = Readonly<Record<PrincipalColumn, PolicyCell>>

export type ResolvedCell = Omit<MemberCell, 'when'> | Omit<MatrixCell, 'when'> | DenyCell

export type BranchInput = Readonly<{ routed?: RoutedKind; fact?: ReceivedFactKind }>

function fits(branch: Branch, input: BranchInput): boolean {
  switch (branch.kind) {
    case 'routed':
      return input.routed !== undefined && branch.kinds.includes(input.routed)
    case 'fact':
      return input.fact !== undefined && branch.kinds.includes(input.fact)
    default: {
      const _exhaustive: never = branch
      return _exhaustive
    }
  }
}

export function resolveCell(cell: PolicyCell, input: BranchInput): ResolvedCell {
  if (cell.verdict === 'deny') return cell
  const { when, ...plain } = cell
  if (when === undefined) return cell
  if (fits(when, input)) return Object.freeze(plain)
  const given = when.kind === 'routed' ? input.routed : input.fact
  return Object.freeze({
    verdict: 'deny',
    basis: `the ${when.kind} branch ${given ?? '(absent)'} is outside the allowed kinds ${when.kinds.join(', ')}`,
  })
}

const member = (source: string, when?: Branch): MemberCell =>
  Object.freeze(
    when === undefined
      ? { verdict: 'member', source: cite(source) }
      : { verdict: 'member', source: cite(source), when: freezeBranch(when) },
  )

const matrix = (purpose: SystemPurpose, source: string, when?: Branch): MatrixCell =>
  Object.freeze(
    when === undefined
      ? { verdict: 'matrix', purpose, source: cite(source) }
      : { verdict: 'matrix', purpose, source: cite(source), when: freezeBranch(when) },
  )

const deny = (basis: string): DenyCell => Object.freeze({ verdict: 'deny', basis })

function freezeBranch(branch: Branch): Branch {
  return branch.kind === 'routed'
    ? Object.freeze({ kind: 'routed', kinds: Object.freeze([...branch.kinds]) })
    : Object.freeze({ kind: 'fact', kinds: Object.freeze([...branch.kinds]) })
}

export const cell = Object.freeze({ member, matrix, deny })

export function row(login: PolicyCell, work: PolicyCell, system: PolicyCell): PolicyRow {
  return Object.freeze({ login, work, system })
}
