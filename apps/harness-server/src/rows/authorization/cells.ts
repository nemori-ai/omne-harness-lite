// The shape of one policy cell (DP-4 §3.2): what the authorization row does for one access
// operation and one class of principal. An allowing cell cannot be written without a citation, so
// a cell with no source is a type error, not a runtime finding. Which cell applies to a branched
// operation (`accept` by RoutedInput kind, `receive` by fact kind) is decided by `resolveCell`.
import type { ProducerFact, RoutedInput } from '@omne-harness/session-contract'

/** A non-empty citation of the rule that allows a cell. Only `cite` makes one. */
export type Citation = string & { readonly __citation: 'non-empty' }

export function cite(text: string): Citation {
  if (text.trim() === '') throw new Error('a policy citation cannot be empty')
  return text as Citation
}

/** The purposes of the system matrix that a policy cell may name. `auditPolicy` checks each against `SYSTEM_ACTION_MATRIX`. */
export type SystemPurpose =
  | 'resident-references'
  | 'released-scopes'
  | 'pending-sessions'
  | 'scope-release-receive'
  | 'agent-instance-publish'
  | 'agent-instance-quiesce'
  | 'agent-instance-withdraw'

export type RoutedKind = RoutedInput['kind']
export type ReceivedFactKind = ProducerFact['kind']

/** The branch of an operation that a cell is limited to. A request outside the listed kinds is denied. */
export type Branch =
  | Readonly<{ kind: 'routed'; kinds: readonly RoutedKind[] }>
  | Readonly<{ kind: 'fact'; kinds: readonly ReceivedFactKind[] }>

/** The two D items of the policy draft §7: cells that wait for a product rule and deny until then. */
export type DecisionItemId = 'D-1' | 'D-2'

export type MemberCell = Readonly<{ verdict: 'member'; source: Citation; when?: Branch }>
export type MatrixCell = Readonly<{
  verdict: 'matrix'
  purpose: SystemPurpose
  source: Citation
  when?: Branch
}>
export type DenyCell = Readonly<{ verdict: 'deny'; basis: string }>
export type PendingCell = Readonly<{ verdict: 'deny-pending'; item: DecisionItemId }>

/**
 * `member`: the tenant admission check with an empty `requires`. `matrix`: the system action
 * authorization on the named purpose. `deny`: denied with a written basis, no dependency called.
 * `deny-pending`: denied until the D item is decided.
 */
export type PolicyCell = MemberCell | MatrixCell | DenyCell | PendingCell

/** The three classes of principal (policy draft §2): login principal, session work principal, system principal. */
export type PrincipalColumn = 'login' | 'work' | 'system'
export type PolicyRow = Readonly<Record<PrincipalColumn, PolicyCell>>

/** A cell after its branch was applied: `when` is gone, the request either fits it or is denied. */
export type ResolvedCell =
  | Omit<MemberCell, 'when'>
  | Omit<MatrixCell, 'when'>
  | DenyCell
  | PendingCell

/** What the request carries of the branched inputs. Absent when the operation has no such input. */
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

/** The cell that applies to this request. A branched cell whose branch the request does not fit is a denial. */
export function resolveCell(cell: PolicyCell, input: BranchInput): ResolvedCell {
  if (cell.verdict === 'deny' || cell.verdict === 'deny-pending') return cell
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

const pending = (item: DecisionItemId): PendingCell =>
  Object.freeze({ verdict: 'deny-pending', item })

function freezeBranch(branch: Branch): Branch {
  return branch.kind === 'routed'
    ? Object.freeze({ kind: 'routed', kinds: Object.freeze([...branch.kinds]) })
    : Object.freeze({ kind: 'fact', kinds: Object.freeze([...branch.kinds]) })
}

/** The constructors of the tables. Kept together so a table reads as data. */
export const cell = Object.freeze({ member, matrix, deny, pending })

export function row(login: PolicyCell, work: PolicyCell, system: PolicyCell): PolicyRow {
  return Object.freeze({ login, work, system })
}
