// The one copy of the frozen record types of the API semantic review (candidate-r4.md,
// `record-types-r4.ts`). Modules import them from here. The failure codes live here as a union;
// the one table that maps each code to its exit code is `FAILURE_EXIT` in
// `integration/contract-review.ts`.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

type Sha256 = string
type Commit = string
type RepoPath = string

export type Actor = { login: string; nodeId: string }
export type Repository = { name: string; nodeId: string }
export type Issue = { number: number; nodeId: string }
export type CommentRef = { url: string; bodySha256: Sha256; updatedAt: string }
export type IdentityAdoption = { comment: CommentRef; authorNodeId: string }
export type OwnerIdentityFact = { lineId: string; owner: Actor; adoption: IdentityAdoption }
export type OwnerIdentityManifest = {
  schemaVersion: 1
  repository: Repository
  /** Unique and sorted by lineId; a line without an entry has no anchor. */
  owners: OwnerIdentityFact[]
}
export type BindingInput = {
  issue: Issue
  revision: number
  attempt: string
  bindingSha256: Sha256
  dispatch: CommentRef
}
export type SourcePr = {
  number: number
  nodeId: string
  bodySha256: Sha256
  head: Commit
  baseRef: string
}
export type UnitInput = { commit: Commit; tagObject: Commit; pr: number }
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
      milestone: { number: number; nodeId: string; title: string }
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
export type ReviewPayload = {
  comparison: Comparison
  conclusion: 'additive' | 'breaking'
  rationale: string
  evidence: CommentRef[]
  consumerScope: string
}
export type Envelope = {
  schemaVersion: 1
  repository: Repository
  operationId: string
  responsible: Actor
}
export type Attest = Envelope & {
  action: 'attest'
  authority: { kind: 'owner' } | { kind: 'delegated'; grant: CommentRef }
  review: ReviewPayload
  replaces: CommentRef[]
}
export type Delegate = Envelope & {
  action: 'delegate'
  member: RepoPath
  ownerIdentity: OwnerIdentityFact
  reviewSha256: Sha256
  delegate: Actor
}
export type Revoke = Envelope & { action: 'revoke'; targets: CommentRef[]; reason: string }
export type SemanticReviewRecord = Attest | Delegate | Revoke

export type DraftBundle = {
  schemaVersion: 1
  kind: 'draft'
  comparisons: Comparison[]
  raw: { exitCode: number; stdoutSha256: Sha256; report: Json }
  facts: { observedAt: string; carrierIssue: Issue }
}

/** Every failure code of one run. Its exit codes are in `FAILURE_EXIT` (section 7.1). */
export type ReviewFailureCode =
  | 'api-review-missing'
  | 'api-review-owner-unresolved'
  | 'api-review-owner-identity-missing'
  | 'api-review-owner-identity-mismatch'
  | 'api-review-invalid'
  | 'api-review-scope-mismatch'
  | 'api-review-unauthorized'
  | 'api-review-source-changed'
  | 'api-review-revoked'
  | 'api-review-conflict'
  | 'api-review-entry-outside-root'
  | 'api-review-self-authorization'
  | 'api-review-breaking-route-required'
  | 'api-review-input-unknown'
  | 'api-review-policy-unavailable'
/** The codes the record boundary returns. */
export type RecordFailureCode = Extract<
  ReviewFailureCode,
  | 'api-review-missing'
  | 'api-review-invalid'
  | 'api-review-scope-mismatch'
  | 'api-review-unauthorized'
  | 'api-review-source-changed'
  | 'api-review-revoked'
  | 'api-review-conflict'
  | 'api-review-input-unknown'
>
/** The codes the owner identity reader returns. */
export type IdentityFailureCode = Extract<
  ReviewFailureCode,
  | 'api-review-owner-unresolved'
  | 'api-review-owner-identity-missing'
  | 'api-review-owner-identity-mismatch'
  | 'api-review-unauthorized'
  | 'api-review-source-changed'
  | 'api-review-input-unknown'
>
/** The codes the enablement check returns. */
export type EnablementFailureCode = Extract<
  ReviewFailureCode,
  | 'api-review-entry-outside-root'
  | 'api-review-self-authorization'
  | 'api-review-policy-unavailable'
>

/** Overall exit of one run: 2 if any finding exits 2, else 1 if any finding exists, else 0. */
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
/** Online re-read of the adoption comment. A diagnostic only; it never changes a verdict. */
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

// verify-owner-adoption (candidate-r4.md 8.6). The exit table is in `integration/api-review-cli.ts`.
export type AdoptionVerifyCode =
  | 'adoption-verify-foreign-url'
  | 'adoption-verify-comment-missing'
  | 'adoption-verify-mismatch'
  | 'adoption-verify-manifest-invalid'
  | 'adoption-verify-input-unknown'
type MismatchField = 'bodySha256' | 'updatedAt' | 'authorNodeId'
export type AdoptionVerifyFinding =
  | {
      code: 'adoption-verify-mismatch'
      lineId: string
      fields: [MismatchField, ...MismatchField[]]
    }
  | {
      code: Exclude<AdoptionVerifyCode, 'adoption-verify-mismatch'>
      lineId: string | null
      detail: Json
    }
export type AdoptionReadBack = {
  htmlUrl: string
  bodySha256: Sha256
  updatedAt: string
  author: Actor
  body: string
}
export type AdoptionVerifyEntry =
  | { change: 'added' | 'changed'; fact: OwnerIdentityFact; readBack: AdoptionReadBack | null }
  | { change: 'removed'; fact: OwnerIdentityFact }
export type AdoptionVerifyReport =
  | { kind: 'unchanged'; base: Commit; head: Commit; mergeTree: Commit }
  | {
      kind: 'changed'
      base: Commit
      head: Commit
      mergeTree: Commit
      entries: AdoptionVerifyEntry[]
      findings: AdoptionVerifyFinding[]
      exitCode: RunExit
    }
  | { kind: 'input-unknown'; findings: AdoptionVerifyFinding[] }
