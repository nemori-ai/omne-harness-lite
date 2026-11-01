// The records of the API semantic review (candidate-r4.md sections 4, 5.5 and 6): strict parsing
// of the `json omne-api-semantic-review:v1` comments of one carrier Issue, the paginated and
// double read of that Issue, and the fold of the records into one verdict per review member.
//
// This module decides only from the comments it is given and from two injected facts: who is a
// live publish reviewer, and who is the trusted owner of a member. The owner identity reader and
// the Comparison builder belong to other modules. Nothing here writes to the platform.
import { createHash } from 'node:crypto'
import { readComments, type BaselineComment, type RegistrarCheck } from './baseline.ts'
import { GhReadError, REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError, record as asRecord, text as asText } from './protocol.ts'
import { strictJson } from './strict-json.ts'

// ---------------------------------------------------------------------------------------------
// Record types. The shapes equal record-types-r4.ts (6f468667...); only the names used here.
// ---------------------------------------------------------------------------------------------
export type Actor = { login: string; nodeId: string }
export type Repository = { name: string; nodeId: string }
export type Issue = { number: number; nodeId: string }
export type CommentRef = { url: string; bodySha256: string; updatedAt: string }
export type IdentityAdoption = { comment: CommentRef; authorNodeId: string }
export type OwnerIdentityFact = { lineId: string; owner: Actor; adoption: IdentityAdoption }
export type BindingInput = {
  issue: Issue
  revision: number
  attempt: string
  bindingSha256: string
  dispatch: CommentRef
}
export type SourcePr = {
  number: number
  nodeId: string
  bodySha256: string
  head: string
  baseRef: string
}
export type UnitInput = { commit: string; tagObject: string; pr: number }
export type Scope =
  | { kind: 'card'; card: BindingInput; base: string }
  | {
      kind: 'ri'
      track: string
      sourceBranch: string
      base: string
      carrier: Issue
      units: UnitInput[]
      prs: SourcePr[]
      cards: BindingInput[]
    }
  | {
      kind: 'milestone'
      milestone: { number: number; nodeId: string; title: string }
      baselineIssue: Issue
      baselineSha256: string
      registrations: CommentRef[]
    }
export type SnapshotFile = { path: string; sha256: string }
export type ApiSide = {
  commit: string
  apiTree: string
  packageName: string
  snapshots: SnapshotFile[]
}
export type Comparison = {
  repository: Repository
  head: string
  targetBranch: string
  targetBase: string
  authoritySha256: string
  ownerIdentity: OwnerIdentityFact
  tool: {
    packageName: '@omne-harness/repo-toolchain'
    version: '0.0.18'
    typescriptVersion: string
    lockSha256: string
  }
  scope: Scope
  checkedMembers: string[]
  reviewMembers: string[]
  member: string
  before: ApiSide
  after: ApiSide
  rawMemberSha256: string
}
export type ReviewPayload = {
  comparison: Comparison
  conclusion: 'additive' | 'breaking'
  rationale: string
  evidence: CommentRef[]
  consumerScope: string
}
type Envelope = {
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
  member: string
  ownerIdentity: OwnerIdentityFact
  reviewSha256: string
  delegate: Actor
}
export type Revoke = Envelope & { action: 'revoke'; targets: CommentRef[]; reason: string }
export type SemanticReviewRecord = Attest | Delegate | Revoke

/** The failure codes of the record boundary; each is a member of `FAILURE_EXIT` (section 7.1). */
export type RecordFailureCode =
  | 'api-review-missing'
  | 'api-review-invalid'
  | 'api-review-scope-mismatch'
  | 'api-review-unauthorized'
  | 'api-review-source-changed'
  | 'api-review-revoked'
  | 'api-review-conflict'
  | 'api-review-input-unknown'

export const RECORD_MARKER = 'omne-api-semantic-review:v1'

// ---------------------------------------------------------------------------------------------
// Strict schema. Exact key sets, no undefined, no unknown key; duplicate keys die in strictJson.
// ---------------------------------------------------------------------------------------------
type Check<T> = (value: unknown, path: string) => T
function bad(path: string, reason: string): never {
  throw new InputError(`${path}: ${reason}`)
}
const str: Check<string> = (value, path) =>
  typeof value === 'string' && value !== '' ? value : bad(path, 'must be a nonempty string')
const matching =
  (pattern: RegExp, what: string): Check<string> =>
  (value, path) => {
    const result = str(value, path)
    return pattern.test(result) ? result : bad(path, `must be ${what}`)
  }
const sha256Text = matching(/^[0-9a-f]{64}$/, '64 lowercase hexadecimal characters')
const commitText = matching(/^[0-9a-f]{40}$/, '40 lowercase hexadecimal characters')
const operationIdText = matching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, 'an operationId')
const repoPath: Check<string> = (value, path) => {
  const result = str(value, path)
  if (result.includes('\\') || result.startsWith('/')) bad(path, 'must be a POSIX relative path')
  if (result.split('/').some(part => part === '' || part === '.' || part === '..'))
    bad(path, 'must have no empty, . or .. component')
  return result
}
const positive: Check<number> = (value, path) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : bad(path, 'must be a positive safe integer')
const literal =
  <const L extends string | number>(expected: L): Check<L> =>
  (value, path) =>
    value === expected ? expected : bad(path, `must be ${String(expected)}`)
const oneOfLiterals =
  <const L extends string>(...allowed: L[]): Check<L> =>
  (value, path) =>
    allowed.includes(value as L) ? (value as L) : bad(path, `must be one of ${allowed.join(', ')}`)
const list =
  <T>(item: Check<T>): Check<T[]> =>
  (value, path) => {
    if (!Array.isArray(value)) return bad(path, 'must be an array')
    return value.map((entry, index) => item(entry, `${path}[${index}]`))
  }
const object =
  <S extends Record<string, Check<unknown>>>(
    shape: S,
  ): Check<{ [K in keyof S]: ReturnType<S[K]> }> =>
  (value, path) => {
    const input = asRecord(value, path)
    const keys = Object.keys(shape)
    for (const key of Object.keys(input)) if (!keys.includes(key)) bad(path, `unknown key ${key}`)
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      if (!(key in input)) bad(path, `missing key ${key}`)
      result[key] = (shape[key] as Check<unknown>)(input[key], `${path}.${key}`)
    }
    return result as { [K in keyof S]: ReturnType<S[K]> }
  }

const actor = object({ login: str, nodeId: str })
const repository = object({ name: str, nodeId: str })
const issue = object({ number: positive, nodeId: str })
const commentRef = object({ url: str, bodySha256: sha256Text, updatedAt: str })
const ownerIdentityFact = object({
  lineId: str,
  owner: actor,
  adoption: object({ comment: commentRef, authorNodeId: str }),
})
const bindingInput = object({
  issue,
  revision: positive,
  attempt: str,
  bindingSha256: sha256Text,
  dispatch: commentRef,
})
const scope: Check<Scope> = (value, path) => {
  const kind = asRecord(value, path).kind
  if (kind === 'card')
    return object({ kind: literal('card'), card: bindingInput, base: commitText })(value, path)
  if (kind === 'ri')
    return object({
      kind: literal('ri'),
      track: str,
      sourceBranch: str,
      base: commitText,
      carrier: issue,
      units: list(object({ commit: commitText, tagObject: commitText, pr: positive })),
      prs: list(
        object({
          number: positive,
          nodeId: str,
          bodySha256: sha256Text,
          head: commitText,
          baseRef: str,
        }),
      ),
      cards: list(bindingInput),
    })(value, path)
  if (kind === 'milestone')
    return object({
      kind: literal('milestone'),
      milestone: object({ number: positive, nodeId: str, title: str }),
      baselineIssue: issue,
      baselineSha256: sha256Text,
      registrations: list(commentRef),
    })(value, path)
  return bad(path, 'scope.kind must be card, ri or milestone')
}
const apiSide = object({
  commit: commitText,
  apiTree: commitText,
  packageName: str,
  snapshots: list(object({ path: repoPath, sha256: sha256Text })),
})
const comparison = object({
  repository,
  head: commitText,
  targetBranch: str,
  targetBase: commitText,
  authoritySha256: sha256Text,
  ownerIdentity: ownerIdentityFact,
  tool: object({
    packageName: literal('@omne-harness/repo-toolchain'),
    version: literal('0.0.18'),
    typescriptVersion: str,
    lockSha256: sha256Text,
  }),
  scope,
  checkedMembers: list(repoPath),
  reviewMembers: list(repoPath),
  member: repoPath,
  before: apiSide,
  after: apiSide,
  rawMemberSha256: sha256Text,
})
/** A list of references: strictly ascending by URL code unit, so duplicates are refused. */
const refs =
  (nonempty: boolean): Check<CommentRef[]> =>
  (value, path) => {
    const result = list(commentRef)(value, path)
    if (nonempty && result.length === 0) bad(path, 'must not be empty')
    result.forEach((entry, index) => {
      const previous = result[index - 1]
      if (previous !== undefined && !(previous.url < entry.url))
        bad(path, 'must be sorted by URL without duplicates')
    })
    return result
  }
const envelope = {
  schemaVersion: literal(1),
  repository,
  operationId: operationIdText,
  responsible: actor,
}
const attestSchema = object({
  ...envelope,
  action: literal('attest'),
  authority: (value, path) => {
    const kind = asRecord(value, path).kind
    if (kind === 'owner') return object({ kind: literal('owner') })(value, path)
    if (kind === 'delegated')
      return object({ kind: literal('delegated'), grant: commentRef })(value, path)
    return bad(path, 'authority.kind must be owner or delegated')
  },
  review: object({
    comparison,
    conclusion: oneOfLiterals('additive', 'breaking'),
    rationale: str,
    evidence: refs(true),
    consumerScope: str,
  }),
  replaces: refs(false),
})
const delegateSchema = object({
  ...envelope,
  action: literal('delegate'),
  member: repoPath,
  ownerIdentity: ownerIdentityFact,
  reviewSha256: sha256Text,
  delegate: actor,
})
const revokeSchema = object({
  ...envelope,
  action: literal('revoke'),
  targets: refs(true),
  reason: str,
})

const FENCE = /^```json omne-api-semantic-review:v1[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm

export type ParsedComment =
  | { kind: 'none' }
  | { kind: 'record'; record: SemanticReviewRecord }
  | { kind: 'invalid'; reason: string }

/**
 * One comment body read as a record. A body without the marker is `none`. A body that names the
 * marker must hold exactly one valid fence; anything else is `invalid`, never skipped.
 */
export function parseRecordComment(body: string): ParsedComment {
  if (!body.includes('omne-api-semantic-review')) return { kind: 'none' }
  const fences = [...body.matchAll(FENCE)]
  if (fences.length !== 1) return { kind: 'invalid', reason: 'exactly one record fence required' }
  try {
    const json = strictJson(fences[0]?.[1] ?? '', 'record')
    const action = asRecord(json, 'record').action
    const parsed =
      action === 'attest'
        ? attestSchema(json, 'record')
        : action === 'delegate'
          ? delegateSchema(json, 'record')
          : action === 'revoke'
            ? revokeSchema(json, 'record')
            : bad('record', 'action must be attest, delegate or revoke')
    return { kind: 'record', record: parsed as SemanticReviewRecord }
  } catch (error) {
    if (error instanceof InputError) return { kind: 'invalid', reason: error.message }
    throw error
  }
}

// ---------------------------------------------------------------------------------------------
// Digests (section 4).
// ---------------------------------------------------------------------------------------------
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null) {
    const sorted: { [key: string]: Json } = {}
    for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key] as Json)
    return sorted
  }
  return value
}
const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')
/** H of section 4: sorted keys, no whitespace, UTF-8, SHA-256. */
export function hashJson(value: unknown): string {
  return sha256(JSON.stringify(canonical(value as Json)))
}
/** The reference a comment has now: its URL, the SHA-256 of its body bytes and its `updatedAt`. */
export function commentRefOf(comment: BaselineComment): CommentRef {
  return {
    url: comment.url,
    bodySha256: sha256(Buffer.from(comment.body, 'utf8')),
    updatedAt: comment.updatedAt,
  }
}

// ---------------------------------------------------------------------------------------------
// Carrier read: complete pages, read twice, equal both times.
// ---------------------------------------------------------------------------------------------
export type CarrierRead =
  | { kind: 'comments'; comments: BaselineComment[] }
  | {
      kind: 'refused'
      code: 'api-review-input-unknown' | 'api-review-source-changed'
      detail: string
    }

/**
 * Reads every comment of the carrier twice. A read that fails or reaches the 20 page limit is
 * unknown; two reads that differ are `source-changed`. The first read is never reused.
 */
export function readCarrier(repositoryName: string, carrier: number, call: GhRead): CarrierRead {
  let first: BaselineComment[], second: BaselineComment[]
  try {
    first = readComments(repositoryName, carrier, call)
    second = readComments(repositoryName, carrier, call)
  } catch (error) {
    return {
      kind: 'refused',
      code: 'api-review-input-unknown',
      detail: error instanceof Error ? error.message : 'carrier read failed',
    }
  }
  return JSON.stringify(first) === JSON.stringify(second)
    ? { kind: 'comments', comments: first }
    : {
        kind: 'refused',
        code: 'api-review-source-changed',
        detail: 'carrier comments changed between reads',
      }
}

export type EvidenceCheck = 'matches' | 'drifted' | 'absent' | 'foreign'
/**
 * The evidence check of one repository: reads the referenced Issue comment and compares body
 * digest and `updatedAt`. A known 404 is `absent`; any other read failure throws.
 */
export function evidenceChecker(
  repositoryName: string,
  call: GhRead,
): (ref: CommentRef) => EvidenceCheck {
  const pattern = new RegExp(
    `^https://github\\.com/${repositoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/[1-9][0-9]*#issuecomment-([1-9][0-9]*)$`,
  )
  return ref => {
    const id = pattern.exec(ref.url)?.[1]
    if (id === undefined) return 'foreign'
    let value: unknown
    try {
      value = call(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          `repos/${repositoryName}/issues/comments/${id}`,
        ],
        15_000,
      )
    } catch (error) {
      if (error instanceof GhReadError) {
        const body = error.body
        if (
          typeof body === 'object' &&
          body !== null &&
          (body as { status?: unknown }).status === '404'
        )
          return 'absent'
      }
      throw error
    }
    const comment = asRecord(value, 'comment')
    const body = comment.body === null ? '' : asText(comment.body, 'comment.body')
    if (comment.html_url !== ref.url) return 'foreign'
    return sha256(Buffer.from(body, 'utf8')) === ref.bodySha256 &&
      asText(comment.updated_at, 'comment.updated_at') === ref.updatedAt
      ? 'matches'
      : 'drifted'
  }
}

// ---------------------------------------------------------------------------------------------
// Fold (section 6).
// ---------------------------------------------------------------------------------------------
export type RecordAuthority = {
  /** Live publish reviewer check. A marker comment of a non-reviewer is ignored. */
  isReviewer: RegistrarCheck
  /** The trusted owner fact of a member from the target commit; undefined when there is none. */
  ownerOf: (member: string) => OwnerIdentityFact | undefined
  /** Reads one evidence reference. May throw; a throw makes the member `input-unknown`. */
  checkEvidence: (ref: CommentRef) => EvidenceCheck
}
export type FoldInput = {
  repository: Repository
  comments: readonly BaselineComment[]
  /** The Comparison generated by this run for every review member. */
  expected: readonly Comparison[]
  authority: RecordAuthority
}
export type Problem = { code: RecordFailureCode; url: string | null; reason: string }
export type MemberVerdict =
  | {
      kind: 'valid'
      member: string
      record: CommentRef
      authority: Actor
      conclusion: 'additive' | 'breaking'
      review: ReviewPayload
    }
  | { kind: 'refused'; member: string; code: RecordFailureCode; problems: Problem[] }
export type FoldResult = {
  members: MemberVerdict[]
  /** Marker comments of authors who are not live reviewers; they grant and revoke nothing. */
  ignored: CommentRef[]
  /** Reviewer revokes that changed nothing, with the reason; they never block a member. */
  ineffectiveRevokes: Problem[]
}

type Entry = {
  comment: BaselineComment
  ref: CommentRef
  order: number
  authorActor: Actor
  parsed: { ok: true; record: SemanticReviewRecord } | { ok: false; reason: string }
  edited: boolean
  /** Set once the entry failed a check; `valid` entries have none. */
  problem: Problem | null
  revoked: boolean
  replaced: boolean
  /** The entry of the grant an attest depends on. */
  grant: Entry | null
  /** False for an attest whose Comparison is not the one of this run: history only. */
  keyed: boolean
  /** The entries a valid revoke changed. */
  revokeTargets: Entry[]
}

const sameActor = (a: Actor, b: Actor): boolean => a.login === b.login && a.nodeId === b.nodeId
const sameValue = (a: unknown, b: unknown): boolean => hashJson(a) === hashJson(b)
const PRIORITY: RecordFailureCode[] = [
  'api-review-input-unknown',
  'api-review-invalid',
  'api-review-unauthorized',
  'api-review-conflict',
  'api-review-source-changed',
]

function memberOfEntry(entry: Entry): string | null {
  if (!entry.parsed.ok) return null
  const r = entry.parsed.record
  return r.action === 'attest'
    ? r.review.comparison.member
    : r.action === 'delegate'
      ? r.member
      : null
}

/** Folds the carrier comments into one verdict for every expected review member. */
export function foldSemanticReviews(input: FoldInput): FoldResult {
  const { authority } = input
  const expectedKey = new Map(input.expected.map(c => [c.member, hashJson(c)]))
  const expectedScopeKind = new Map(input.expected.map(c => [c.member, c.scope.kind]))
  const comments = [...input.comments].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1,
  )
  const entries: Entry[] = []
  const byUrl = new Map<string, Entry>()
  const ignored: CommentRef[] = []
  const ignoredUrls = new Set<string>()
  const ineffectiveRevokes: Problem[] = []

  const live = (entry: Entry): boolean => !entry.revoked && !(entry.grant?.revoked ?? false)
  const problem = (entry: Entry, code: RecordFailureCode, reason: string) => {
    entry.problem = { code, url: entry.ref.url, reason }
  }
  /** The earlier entry a reference names, or the reason it names none. */
  const resolve = (
    ref: CommentRef,
    self: Entry,
  ): { entry: Entry } | { code: RecordFailureCode; reason: string } => {
    const found = byUrl.get(ref.url)
    if (found === undefined || found.order >= self.order)
      return { code: 'api-review-invalid', reason: `reference ${ref.url} names no earlier record` }
    if (found.ref.bodySha256 !== ref.bodySha256 || found.ref.updatedAt !== ref.updatedAt)
      return { code: 'api-review-source-changed', reason: `reference ${ref.url} no longer matches` }
    return { entry: found }
  }
  const effective = (entry: Entry): boolean => entry.problem === null && live(entry)

  const evaluateAttest = (entry: Entry, r: Attest): void => {
    if (!sameValue(r.repository, input.repository))
      return problem(entry, 'api-review-invalid', 'record names another repository')
    if (!sameActor(r.responsible, entry.authorActor))
      return problem(entry, 'api-review-unauthorized', 'responsible is not the comment author')
    const member = r.review.comparison.member
    if (expectedKey.get(member) !== hashJson(r.review.comparison)) {
      entry.keyed = false
      return
    }
    const fact = authority.ownerOf(member)
    if (fact === undefined)
      return problem(entry, 'api-review-unauthorized', 'member has no trusted owner')
    if (r.authority.kind === 'owner') {
      if (!sameActor(r.responsible, fact.owner))
        return problem(entry, 'api-review-unauthorized', 'responsible is not the trusted owner')
    } else {
      const grant = resolve(r.authority.grant, entry)
      if ('code' in grant) return problem(entry, grant.code, grant.reason)
      const granted = grant.entry
      const g = granted.parsed.ok ? granted.parsed.record : null
      if (g?.action !== 'delegate' || !effective(granted))
        return problem(entry, 'api-review-unauthorized', 'grant is not a valid delegation')
      if (
        g.member !== member ||
        !sameValue(g.ownerIdentity, r.review.comparison.ownerIdentity) ||
        g.reviewSha256 !== hashJson(r.review) ||
        !sameActor(g.delegate, r.responsible)
      )
        return problem(entry, 'api-review-unauthorized', 'grant does not delegate this payload')
      entry.grant = granted
    }
    for (const ref of r.review.evidence) {
      if (ignoredUrls.has(ref.url))
        return problem(entry, 'api-review-invalid', `evidence ${ref.url} is an ignored comment`)
      let outcome: EvidenceCheck
      try {
        outcome = authority.checkEvidence(ref)
      } catch {
        return problem(entry, 'api-review-input-unknown', `evidence ${ref.url} cannot be read`)
      }
      if (outcome === 'foreign')
        return problem(entry, 'api-review-invalid', `evidence ${ref.url} is not a comment here`)
      if (outcome !== 'matches')
        return problem(entry, 'api-review-source-changed', `evidence ${ref.url} is ${outcome}`)
    }
    const key = expectedKey.get(member)
    const present = entries.filter(
      other =>
        other !== entry &&
        other.parsed.ok &&
        other.parsed.record.action === 'attest' &&
        other.keyed &&
        hashJson(other.parsed.record.review.comparison) === key &&
        live(other) &&
        !other.replaced,
    )
    const replaced: Entry[] = []
    for (const ref of r.replaces) {
      const target = resolve(ref, entry)
      if ('code' in target) return problem(entry, target.code, target.reason)
      replaced.push(target.entry)
    }
    const exact =
      replaced.length === present.length &&
      replaced.every(target => present.includes(target) && effective(target))
    if (!exact)
      return problem(
        entry,
        'api-review-conflict',
        'replaces is not the exact active set of the key',
      )
    replaced.forEach(target => (target.replaced = true))
  }

  const evaluateDelegate = (entry: Entry, r: Delegate): void => {
    if (!sameValue(r.repository, input.repository))
      return problem(entry, 'api-review-invalid', 'record names another repository')
    if (!sameActor(r.responsible, entry.authorActor))
      return problem(entry, 'api-review-unauthorized', 'responsible is not the comment author')
    const fact = authority.ownerOf(r.member)
    if (fact === undefined || !sameActor(r.responsible, fact.owner))
      return problem(entry, 'api-review-unauthorized', 'only the trusted owner may delegate')
    if (!sameValue(r.ownerIdentity, fact))
      return problem(entry, 'api-review-unauthorized', 'ownerIdentity is not the trusted fact')
  }

  const ownerOfAnyExpected = (who: Actor): boolean =>
    input.expected.some(c => {
      const fact = authority.ownerOf(c.member)
      return fact !== undefined && sameActor(fact.owner, who)
    })

  const evaluateRevoke = (entry: Entry, r: Revoke): void => {
    const refuse = (code: RecordFailureCode, reason: string): void => {
      ineffectiveRevokes.push({ code, url: entry.ref.url, reason })
    }
    if (!sameValue(r.repository, input.repository))
      return refuse('api-review-invalid', 'record names another repository')
    if (!sameActor(r.responsible, entry.authorActor))
      return refuse('api-review-unauthorized', 'responsible is not the comment author')
    const targets: Entry[] = []
    for (const ref of r.targets) {
      const target = resolve(ref, entry)
      if ('code' in target) return refuse(target.code, target.reason)
      const found = target.entry
      if (found.parsed.ok && found.parsed.record.action === 'revoke')
        return refuse('api-review-invalid', 'a revoke is not a valid target')
      if (!found.parsed.ok) {
        if (found.authorActor.nodeId !== r.responsible.nodeId || !ownerOfAnyExpected(r.responsible))
          return refuse(
            'api-review-unauthorized',
            'only the owner author may revoke a malformed record',
          )
      } else {
        const member = memberOfEntry(found)
        const fact = member === null ? undefined : authority.ownerOf(member)
        const byOwner = fact !== undefined && sameActor(fact.owner, r.responsible)
        const target_ = found.parsed.record
        const byDelegate =
          target_.action === 'attest' &&
          target_.authority.kind === 'delegated' &&
          found.grant !== null &&
          effective(found.grant) &&
          sameActor(target_.responsible, r.responsible) &&
          found.authorActor.nodeId === r.responsible.nodeId
        if (!byOwner && !byDelegate)
          return refuse('api-review-unauthorized', `revoker has no authority over ${found.ref.url}`)
      }
      targets.push(found)
    }
    entry.revokeTargets = targets
    targets.forEach(target => (target.revoked = true))
  }

  for (const comment of comments) {
    const parsed = parseRecordComment(comment.body)
    if (parsed.kind === 'none') continue
    const ref = commentRefOf(comment)
    if (!authority.isReviewer(comment.author)) {
      ignored.push(ref)
      ignoredUrls.add(ref.url)
      continue
    }
    const entry: Entry = {
      comment,
      ref,
      order: entries.length,
      authorActor: comment.author,
      parsed:
        parsed.kind === 'record'
          ? { ok: true, record: parsed.record }
          : { ok: false, reason: parsed.reason },
      edited: comment.createdAt !== comment.updatedAt,
      problem: null,
      revoked: false,
      replaced: false,
      grant: null,
      keyed: true,
      revokeTargets: [],
    }
    entries.push(entry)
    byUrl.set(ref.url, entry)
    if (!entry.parsed.ok) {
      problem(entry, 'api-review-invalid', entry.parsed.reason)
      continue
    }
    if (entry.edited) {
      problem(entry, 'api-review-invalid', 'an edited record is not valid')
      continue
    }
    const r = entry.parsed.record
    if (r.action === 'attest') evaluateAttest(entry, r)
    else if (r.action === 'delegate') evaluateDelegate(entry, r)
    else evaluateRevoke(entry, r)
  }

  // Duplicate operationIds among current records are a conflict, never merged.
  const byOperation = new Map<string, Entry[]>()
  for (const entry of entries) {
    if (!entry.parsed.ok || entry.edited || !live(entry)) continue
    const id = entry.parsed.record.operationId
    byOperation.set(id, [...(byOperation.get(id) ?? []), entry])
  }
  const affected = (entry: Entry): string[] | 'all' => {
    if (!entry.parsed.ok) return 'all'
    const direct = memberOfEntry(entry)
    if (direct !== null) return [direct]
    const members = entry.revokeTargets.map(memberOfEntry)
    return members.length === 0 || members.includes(null) ? 'all' : (members as string[])
  }
  const conflictProblems: { problem: Problem; members: string[] | 'all' }[] = []
  for (const [id, group] of byOperation) {
    if (group.length < 2) continue
    for (const entry of group)
      conflictProblems.push({
        problem: {
          code: 'api-review-conflict',
          url: entry.ref.url,
          reason: `operationId ${id} is repeated`,
        },
        members: affected(entry),
      })
  }

  const members = input.expected.map((c): MemberVerdict => {
    const member = c.member
    const key = expectedKey.get(member)
    const mine = (entry: Entry): boolean => {
      const scoped = affected(entry)
      return scoped === 'all' || scoped.includes(member)
    }
    const sameKey = entries.filter(
      e =>
        e.parsed.ok &&
        e.parsed.record.action === 'attest' &&
        e.keyed &&
        hashJson(e.parsed.record.review.comparison) === key,
    )
    const problems: Problem[] = []
    for (const e of entries) {
      if (e.problem === null || !live(e) || e.replaced) continue
      if (e.parsed.ok && e.parsed.record.action === 'attest' && !e.keyed) continue
      if (mine(e)) problems.push(e.problem)
    }
    for (const c2 of conflictProblems) {
      if (c2.members === 'all' || c2.members.includes(member)) problems.push(c2.problem)
    }
    const valid = sameKey.filter(e => effective(e) && !e.replaced)
    if (problems.length > 0)
      return {
        kind: 'refused',
        member,
        code: PRIORITY.find(code => problems.some(p => p.code === code)) ?? 'api-review-invalid',
        problems,
      }
    if (valid.length === 1) {
      const entry = valid[0] as Entry
      const r = (entry.parsed as { ok: true; record: Attest }).record
      return {
        kind: 'valid',
        member,
        record: entry.ref,
        authority: r.responsible,
        conclusion: r.review.conclusion,
        review: r.review,
      }
    }
    const none = (code: RecordFailureCode): MemberVerdict => ({
      kind: 'refused',
      member,
      code,
      problems,
    })
    if (valid.length > 1) return none('api-review-conflict')
    if (sameKey.some(e => !live(e))) return none('api-review-revoked')
    const kind = expectedScopeKind.get(member)
    const history = entries.some(
      e =>
        e.parsed.ok &&
        e.parsed.record.action === 'attest' &&
        e.parsed.record.review.comparison.member === member &&
        e.parsed.record.review.comparison.scope.kind === kind &&
        live(e),
    )
    return none(history ? 'api-review-scope-mismatch' : 'api-review-missing')
  })
  return { members, ignored, ineffectiveRevokes }
}
