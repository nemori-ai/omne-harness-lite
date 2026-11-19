import type { DeclarationChange, ProducerFact, RoutedInput } from '@omne-harness/session-contract'

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
export type DeclarationKind = DeclarationChange['kind']

export type Branch =
  | Readonly<{ kind: 'routed'; kinds: readonly RoutedKind[] }>
  | Readonly<{ kind: 'fact'; kinds: readonly ReceivedFactKind[] }>
  | Readonly<{ kind: 'declaration'; kinds: readonly DeclarationKind[] }>

/** `reach: 'tenant'`: a work principal may target any session of its tenant, not only its own. */
export type MemberCell = Readonly<{
  verdict: 'member'
  source: Citation
  when?: Branch
  reach?: 'tenant'
}>
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

export type BranchInput = Readonly<{
  routed?: RoutedKind
  fact?: ReceivedFactKind
  declaration?: DeclarationKind
}>

function fits(branch: Branch, input: BranchInput): boolean {
  switch (branch.kind) {
    case 'routed':
      return input.routed !== undefined && branch.kinds.includes(input.routed)
    case 'fact':
      return input.fact !== undefined && branch.kinds.includes(input.fact)
    case 'declaration':
      return input.declaration !== undefined && branch.kinds.includes(input.declaration)
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
  const given = input[when.kind]
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

const tenantRead = (source: string): MemberCell =>
  Object.freeze({ verdict: 'member', source: cite(source), reach: 'tenant' })

const deny = (basis: string): DenyCell => Object.freeze({ verdict: 'deny', basis })

function freezeBranch(branch: Branch): Branch {
  return Object.freeze({ ...branch, kinds: Object.freeze([...branch.kinds]) }) as Branch
}

export const cell = Object.freeze({ member, tenantRead, matrix, deny })

export function readsAcrossTenant(cell: PolicyCell): boolean {
  return cell.verdict === 'member' && cell.reach === 'tenant'
}

export function row(login: PolicyCell, work: PolicyCell, system: PolicyCell): PolicyRow {
  return Object.freeze({ login, work, system })
}
