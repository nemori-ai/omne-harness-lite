// Pure comparison and interpretation of the API semantic review (candidate-r4.md sections 4 and 7).
// Nothing here reads Git, the network or the file system: callers pass plain values and receive
// findings. Shapes follow the frozen `record-types-r4.ts`; only the types this module needs are
// declared here.
import { createHash } from 'node:crypto'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

type Sha256 = string
type Commit = string
type RepoPath = string
type NodeId = string
type PositiveInteger = number

export type Actor = { login: string; nodeId: NodeId }
export type Repository = { name: string; nodeId: NodeId }
export type Issue = { number: PositiveInteger; nodeId: NodeId }
export type CommentRef = { url: string; bodySha256: Sha256; updatedAt: string }
export type OwnerIdentityFact = {
  lineId: string
  owner: Actor
  adoption: { comment: CommentRef; authorNodeId: NodeId }
}
export type BindingInput = {
  issue: Issue
  revision: PositiveInteger
  attempt: string
  bindingSha256: Sha256
  dispatch: CommentRef
}
export type SourcePr = {
  number: PositiveInteger
  nodeId: string
  bodySha256: Sha256
  head: Commit
  baseRef: string
}
export type UnitInput = { commit: Commit; tagObject: Commit; pr: PositiveInteger }
export type Scope =
  | { kind: 'card'; card: BindingInput; base: Commit }
  | {
      kind: 'ri'
      track: string
      sourceBranch: string
      base: Commit
      carrier: Issue
      units: UnitInput[]
      prs: SourcePr[]
      cards: BindingInput[]
    }
  | {
      kind: 'milestone'
      milestone: { number: PositiveInteger; nodeId: string; title: string }
      baselineIssue: Issue
      baselineSha256: Sha256
      registrations: CommentRef[]
    }
export type SnapshotFile = { path: RepoPath; sha256: Sha256 }
export type ApiSide = {
  commit: Commit
  apiTree: Commit
  packageName: string
  snapshots: SnapshotFile[]
}
export type Comparison = {
  repository: Repository
  head: Commit
  targetBranch: string
  targetBase: Commit
  authoritySha256: Sha256
  ownerIdentity: OwnerIdentityFact
  tool: {
    packageName: '@omne-harness/repo-toolchain'
    version: '0.0.18'
    typescriptVersion: string
    lockSha256: Sha256
  }
  scope: Scope
  checkedMembers: RepoPath[]
  reviewMembers: RepoPath[]
  member: RepoPath
  before: ApiSide
  after: ApiSide
  rawMemberSha256: Sha256
}

// One failure code, one exit code (candidate-r4.md 7.1). Exit 1: an established refusal.
// Exit 2: the facts or the policy could not be established.
export const FAILURE_EXIT = {
  'api-review-missing': 1,
  'api-review-owner-unresolved': 1,
  'api-review-owner-identity-missing': 1,
  'api-review-owner-identity-mismatch': 1,
  'api-review-invalid': 1,
  'api-review-scope-mismatch': 1,
  'api-review-unauthorized': 1,
  'api-review-source-changed': 1,
  'api-review-revoked': 1,
  'api-review-conflict': 1,
  'api-review-entry-outside-root': 1,
  'api-review-self-authorization': 1,
  'api-review-breaking-route-required': 1,
  'api-review-input-unknown': 2,
  'api-review-policy-unavailable': 2,
} as const satisfies Record<string, 1 | 2>
export type ReviewFailureCode = keyof typeof FAILURE_EXIT
export type RunExit = 0 | 1 | 2

export type Finding = {
  code: ReviewFailureCode
  member: RepoPath | null
  detail: Json
}

export type AuthorityPathPresence = {
  path: RepoPath
  targetBase: 'present' | 'absent'
  candidate: 'present' | 'absent'
}
export type Enablement =
  | { kind: 'enabled'; authoritySha256: Sha256 }
  | { kind: 'entry-outside-root'; entryRealpath: string; root: string }
  | { kind: 'presence'; rows: AuthorityPathPresence[] }
  | { kind: 'oid-differs'; paths: RepoPath[] }
  | { kind: 'unparsable'; path: RepoPath }

export type OwnerLineResolution =
  | { kind: 'unique'; lineId: string; ownerLogin: string }
  | { kind: 'unresolved'; lineIds: string[] }
export type AdoptionDiagnostic =
  | { kind: 'consistent' }
  | { kind: 'drifted'; fields: ('url' | 'bodySha256' | 'updatedAt' | 'authorNodeId')[] }
  | { kind: 'unreadable'; reason: string }

export type MemberResolution = {
  member: RepoPath
  rawClassification: 'none' | 'additive' | 'review'
  semanticClassification: 'additive' | 'breaking' | null
  requiredLevel: 'none' | 'additive' | 'breaking'
  record: CommentRef | null
  authority: Actor | null
  identity: {
    line: OwnerLineResolution
    loginCaseOnly: boolean
    adoption: AdoptionDiagnostic
  } | null
}

export type MilestonePredicates = {
  rawExitMatchesRefused: boolean
  inputComplete: boolean
  everyReviewAttestedAdditive: boolean
  noBreakingConclusion: boolean
  noFindingsAndStableReads: boolean
}

// ---------------------------------------------------------------------------------------------
// H and Comparison equality (section 4)

/** Canonical text of H. Throws TypeError on anything the wire format forbids. */
function canonicalText(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new TypeError(`Not a canonical wire number: ${String(value)}`)
      }
      return String(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`
      const prototype: unknown = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Not a plain object')
      }
      // The default sort compares UTF-16 code units, as H requires.
      const keys = Object.keys(value).sort()
      return `{${keys
        .map(
          key => `${JSON.stringify(key)}:${canonicalText((value as Record<string, unknown>)[key])}`,
        )
        .join(',')}}`
    }
    default:
      throw new TypeError(`Not a JSON value: ${typeof value}`)
  }
}

/** SHA-256 of the canonical, whitespace-free UTF-8 JSON of `value`. */
export function hashJson(value: Json): string {
  return createHash('sha256').update(canonicalText(value), 'utf8').digest('hex')
}

/** Full-byte equality of the canonical JSON. A comparison that cannot be canonicalized throws. */
export function comparisonsEqual(a: Comparison, b: Comparison): boolean {
  return canonicalText(a) === canonicalText(b)
}

export type ComparisonDiff = { equal: true } | { equal: false; differing: string[] }

/** Equality plus the sorted names of the top-level fields that differ. */
export function compareComparisons(a: Comparison, b: Comparison): ComparisonDiff {
  if (comparisonsEqual(a, b)) return { equal: true }
  const left = a as unknown as Record<string, unknown>
  const right = b as unknown as Record<string, unknown>
  const differing = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .filter(
      key =>
        !(key in left) || !(key in right) || canonicalText(left[key]) !== canonicalText(right[key]),
    )
  return { equal: false, differing }
}

// ---------------------------------------------------------------------------------------------
// Set and anchor checks (section 4). Each check yields at most one finding, listing its problems.

const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

function finding(code: ReviewFailureCode, member: RepoPath | null, detail: Json): Finding {
  return { code, member, detail }
}

function pathProblem(path: string): string | null {
  if (path === '' || path.includes('\\') || path.startsWith('/')) return `not normalized: ${path}`
  return path.split('/').some(part => part === '' || part === '.' || part === '..')
    ? `not normalized: ${path}`
    : null
}

function listProblems(label: string, paths: readonly string[]): string[] {
  const problems = paths.flatMap(path => pathProblem(path) ?? [])
  for (let index = 1; index < paths.length; index += 1) {
    const [previous, current] = [paths[index - 1] as string, paths[index] as string]
    if (previous === current) problems.push(`${label}: duplicate ${current}`)
    else if (previous > current) problems.push(`${label}: unsorted at ${current}`)
  }
  return problems
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index])

/**
 * Checked set complete and sorted; review set sorted, inside it, and exactly the raw review
 * members; `member` (when given) is one of the review members. A subject whose own shape is
 * broken is not cross-checked against the others, so one defect gives one finding.
 */
export function memberSetFindings(input: {
  checked: readonly string[]
  review: readonly string[]
  rawReview: readonly string[]
  member: RepoPath | null
}): Finding[] {
  const findings: Finding[] = []
  const checkedProblems = listProblems('checkedMembers', input.checked)
  if (input.checked.length === 0) checkedProblems.push('checkedMembers: empty')
  if (checkedProblems.length > 0) {
    findings.push(
      finding('api-review-input-unknown', null, {
        set: 'checkedMembers',
        problems: checkedProblems,
      }),
    )
  }
  const reviewProblems = listProblems('reviewMembers', input.review)
  if (checkedProblems.length === 0) {
    reviewProblems.push(
      ...input.review
        .filter(path => !input.checked.includes(path))
        .map(path => `outside checkedMembers: ${path}`),
    )
  }
  if (reviewProblems.length === 0 && !sameList(input.review, [...input.rawReview].sort())) {
    reviewProblems.push('reviewMembers differ from the raw review members')
  }
  if (reviewProblems.length > 0) {
    findings.push(
      finding('api-review-input-unknown', null, { set: 'reviewMembers', problems: reviewProblems }),
    )
  } else if (input.member !== null && !input.review.includes(input.member)) {
    findings.push(
      finding('api-review-input-unknown', input.member, {
        set: 'member',
        problems: [`not in reviewMembers: ${input.member}`],
      }),
    )
  }
  return findings
}

/** One side of a comparison: valid commit and tree, a package name, a sorted unique snapshot list. */
export function sideSetFindings(
  label: 'before' | 'after',
  side: ApiSide,
  member: RepoPath,
): Finding[] {
  const problems: string[] = []
  if (!COMMIT.test(side.commit)) problems.push('commit is not a 40-digit lowercase hexadecimal')
  if (!COMMIT.test(side.apiTree)) problems.push('apiTree is not a 40-digit lowercase hexadecimal')
  if (side.packageName === '') problems.push('packageName is empty')
  if (side.snapshots.length === 0) problems.push('snapshots: empty')
  problems.push(
    ...listProblems(
      'snapshots',
      side.snapshots.map(file => file.path),
    ),
  )
  for (const file of side.snapshots) {
    if (!SHA256.test(file.sha256)) problems.push(`snapshot digest invalid: ${file.path}`)
  }
  return problems.length === 0
    ? []
    : [finding('api-review-input-unknown', member, { side: label, problems })]
}

/**
 * before.commit is scope.base (card, RI) or the registered commit (milestone); after.commit is
 * head. A milestone without a registered commit cannot be judged and is unknown, not a pass.
 */
export function anchorFindings(
  comparison: Comparison,
  facts: { registeredCommit?: Commit },
): Finding[] {
  const { scope, before, after, head, member } = comparison
  const findings: Finding[] = []
  const expectedBefore = scope.kind === 'milestone' ? facts.registeredCommit : scope.base
  if (expectedBefore === undefined) {
    findings.push(
      finding('api-review-input-unknown', member, {
        anchor: 'before.commit',
        problem: 'no registered commit',
      }),
    )
  } else if (before.commit !== expectedBefore) {
    findings.push(
      finding('api-review-scope-mismatch', member, {
        anchor: 'before.commit',
        expected: expectedBefore,
        actual: before.commit,
      }),
    )
  }
  if (after.commit !== head) {
    findings.push(
      finding('api-review-scope-mismatch', member, {
        anchor: 'after.commit',
        expected: head,
        actual: after.commit,
      }),
    )
  }
  return findings
}

// ---------------------------------------------------------------------------------------------
// Enablement (3.2) and per-member levels (7)

export function enablementFindings(enablement: Enablement): Finding[] {
  switch (enablement.kind) {
    case 'enabled':
      return []
    case 'entry-outside-root':
      return [
        finding('api-review-entry-outside-root', null, {
          entryRealpath: enablement.entryRealpath,
          root: enablement.root,
        }),
      ]
    case 'oid-differs':
      return [finding('api-review-self-authorization', null, { paths: [...enablement.paths] })]
    case 'unparsable':
      return [finding('api-review-policy-unavailable', null, { path: enablement.path })]
    case 'presence': {
      const rows = enablement.rows.map(row => ({ ...row }))
      if (rows.some(row => row.targetBase !== row.candidate)) {
        return [finding('api-review-self-authorization', null, { rows })]
      }
      if (rows.some(row => row.targetBase === 'absent')) {
        return [finding('api-review-policy-unavailable', null, { rows })]
      }
      // No row differs or is absent: the report does not support a verdict.
      return [
        finding('api-review-input-unknown', null, {
          problem: 'presence report has no unresolved row',
          rows,
        }),
      ]
    }
  }
}

/**
 * Level of one member. Raw none/additive keep their level and ignore any semantic conclusion.
 * A raw review member needs a valid conclusion with its record and authority; without one it gets
 * `failure` (default missing) and the strictest level, so no binding can consume it.
 */
export function resolveMember(input: {
  member: RepoPath
  raw: MemberResolution['rawClassification']
  semantic: MemberResolution['semanticClassification']
  record: CommentRef | null
  authority: Actor | null
  identity?: MemberResolution['identity']
  failure?: ReviewFailureCode
}): { resolution: MemberResolution; findings: Finding[] } {
  const identity = input.identity ?? null
  const make = (
    semantic: MemberResolution['semanticClassification'],
    requiredLevel: MemberResolution['requiredLevel'],
    record: CommentRef | null,
    authority: Actor | null,
  ): MemberResolution => ({
    member: input.member,
    rawClassification: input.raw,
    semanticClassification: semantic,
    requiredLevel,
    record,
    authority,
    identity,
  })
  if (input.raw !== 'review') {
    return { resolution: make(null, input.raw, null, null), findings: [] }
  }
  if (input.semantic !== null && input.record !== null && input.authority !== null) {
    const resolution = make(input.semantic, input.semantic, input.record, input.authority)
    return {
      resolution,
      findings:
        input.semantic === 'breaking'
          ? [finding('api-review-breaking-route-required', input.member, null)]
          : [],
    }
  }
  const code: ReviewFailureCode =
    input.semantic !== null ? 'api-review-input-unknown' : (input.failure ?? 'api-review-missing')
  return {
    resolution: make(null, 'breaking', null, null),
    findings: [finding(code, input.member, null)],
  }
}

// ---------------------------------------------------------------------------------------------
// Exit composition (7.1)

/** 2 if any finding exits 2, else 1 if any finding exists, else 0. A code outside the table is 2. */
export function composeRunExit(findings: readonly Finding[]): RunExit {
  let exit: RunExit = 0
  for (const item of findings) {
    const mapped = Object.hasOwn(FAILURE_EXIT, item.code) ? FAILURE_EXIT[item.code] : 2
    if (mapped === 2) return 2
    exit = 1
  }
  return exit
}

export type RunInterpretation = {
  rawExitCode: number
  exit: RunExit
  members: MemberResolution[]
  findings: Finding[]
}

/** Report: raw exit code beside the composed exit, every finding kept in input order. */
export function interpretRun(input: {
  rawExitCode: number
  members: readonly MemberResolution[]
  findings: readonly Finding[]
}): RunInterpretation {
  return {
    rawExitCode: input.rawExitCode,
    exit: composeRunExit(input.findings),
    members: input.members.map(member => ({ ...member })),
    findings: input.findings.map(item => ({ ...item })),
  }
}

/** The five predicates of 8.2; `pass` holds iff all do. */
export function milestonePredicates(input: {
  rawExitCode: number
  refused: boolean
  undetermined: readonly string[]
  statusesValid: boolean
  registrationsMatch: boolean
  membersComplete: boolean
  members: readonly MemberResolution[]
  findings: readonly Finding[]
  readsStable: boolean
}): { pass: boolean; predicates: MilestonePredicates } {
  const predicates: MilestonePredicates = {
    rawExitMatchesRefused:
      (input.rawExitCode === 0 || input.rawExitCode === 1) &&
      (input.rawExitCode === 1) === input.refused,
    inputComplete:
      input.undetermined.length === 0 &&
      input.statusesValid &&
      input.registrationsMatch &&
      input.membersComplete,
    everyReviewAttestedAdditive: input.members.every(
      member =>
        member.rawClassification !== 'review' || member.semanticClassification === 'additive',
    ),
    noBreakingConclusion: input.members.every(
      member => member.semanticClassification !== 'breaking',
    ),
    noFindingsAndStableReads: input.findings.length === 0 && input.readsStable,
  }
  return { pass: Object.values(predicates).every(Boolean), predicates }
}
