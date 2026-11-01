// The records of the API semantic review: strict parsing, the carrier read, and the fold into
// one verdict per review member (candidate-r4.md sections 4, 5.5 and 6, test list section 9).
// The network is a stand-in; the fold takes the reviewer check, the trusted owner fact and the
// evidence check as injected facts, so no Git or platform call is needed. Each case changes one
// condition of an otherwise valid thread.
import { describe, expect, it } from 'vitest'
import {
  commentRefOf,
  evidenceChecker,
  foldSemanticReviews,
  hashJson,
  parseRecordComment,
  readCarrier,
  type Actor,
  type Comparison,
  type CommentRef,
  type EvidenceCheck,
  type FoldResult,
  type OwnerIdentityFact,
  type RecordAuthority,
} from '../src/delivery/api-semantic-review.ts'
import type { BaselineComment } from '../src/delivery/baseline.ts'
import { GhReadError, type GhRead } from '../src/delivery/github-read.ts'

const REPO = 'nemori-ai/omne-harness-lite'
const repository = { name: REPO, nodeId: 'R_repo' }
const A: Actor = { login: 'alice', nodeId: 'U_A' } // owner of packages/a
const B: Actor = { login: 'bob', nodeId: 'U_B' } // reviewer, owner of packages/b
const C: Actor = { login: 'carol', nodeId: 'U_C' } // reviewer, delegate
const X: Actor = { login: 'xavier', nodeId: 'U_X' } // not a reviewer
const hex = (n: number, width: number) => n.toString(16).padStart(width, '0')
const adoption = {
  comment: {
    url: `https://github.com/${REPO}/issues/7#issuecomment-1`,
    bodySha256: hex(1, 64),
    updatedAt: '2026-10-01T00:00:00Z',
  },
  authorNodeId: 'U_boss',
}
const fact = (lineId: string, owner: Actor): OwnerIdentityFact => ({ lineId, owner, adoption })
const FACT_A = fact('line-a', A)
const FACT_B = fact('line-b', B)

function comparison(
  member: string,
  owner = FACT_A,
  patch: { head?: number; kind?: 'card' | 'milestone' } = {},
): Comparison {
  const side = (n: number) => ({
    commit: hex(n, 40),
    apiTree: hex(n + 1, 40),
    packageName: '@omne-harness/example',
    snapshots: [{ path: 'api/example.api.md', sha256: hex(n + 2, 64) }],
  })
  const binding = {
    issue: { number: 5, nodeId: 'I_5' },
    revision: 1,
    attempt: 'a1',
    bindingSha256: hex(9, 64),
    dispatch: {
      url: `https://github.com/${REPO}/issues/5#issuecomment-900`,
      bodySha256: hex(10, 64),
      updatedAt: '2026-10-02T00:00:00Z',
    },
  }
  return {
    repository,
    head: hex(patch.head ?? 100, 40),
    targetBranch: 'refs/heads/integration/mainline',
    targetBase: hex(200, 40),
    authoritySha256: hex(300, 64),
    ownerIdentity: owner,
    tool: {
      packageName: '@omne-harness/repo-toolchain',
      version: '0.0.18',
      typescriptVersion: '6.0.0',
      lockSha256: hex(400, 64),
    },
    scope:
      patch.kind === 'milestone'
        ? {
            kind: 'milestone',
            milestone: { number: 3, nodeId: 'M_3', title: 'M2' },
            baselineIssue: { number: 6, nodeId: 'I_6' },
            baselineSha256: hex(11, 64),
            registrations: [],
          }
        : { kind: 'card', card: binding, base: hex(500, 40) },
    checkedMembers: [member],
    reviewMembers: [member],
    member,
    before: side(600),
    after: side(700),
    rawMemberSha256: hex(800, 64),
  }
}
const CMP_A = comparison('packages/a')

type Thread = ReturnType<typeof thread>
function thread() {
  const comments: BaselineComment[] = []
  let operation = 0
  const fence = (value: unknown) =>
    '```json omne-api-semantic-review:v1\n' + JSON.stringify(value, null, 2) + '\n```'
  const post = (author: Actor, body: unknown, options: { edited?: boolean } = {}): CommentRef => {
    const id = comments.length + 1
    const stamp = `2026-11-01T00:${String(id).padStart(2, '0')}:00Z`
    comments.push({
      id,
      url: `https://github.com/${REPO}/issues/5#issuecomment-${id}`,
      createdAt: stamp,
      updatedAt: options.edited === true ? '2026-11-01T09:00:00Z' : stamp,
      author,
      body: typeof body === 'string' ? body : fence(body),
    })
    return commentRefOf(comments[id - 1] as BaselineComment)
  }
  const envelope = (responsible: Actor, patch: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    repository,
    operationId: `op-${(operation += 1)}`,
    responsible,
    ...patch,
  })
  const review = (cmp: Comparison = CMP_A, conclusion: 'additive' | 'breaking' = 'additive') => ({
    comparison: cmp,
    conclusion,
    rationale: 'The change only adds exports.',
    evidence: [
      {
        url: `https://github.com/${REPO}/issues/8#issuecomment-50`,
        bodySha256: hex(50, 64),
        updatedAt: '2026-10-03T00:00:00Z',
      },
    ],
    consumerScope: 'No existing consumer reads the new exports.',
  })
  const attest = (
    responsible: Actor,
    options: {
      authority?: unknown
      review?: ReturnType<typeof review>
      replaces?: CommentRef[]
      patch?: Record<string, unknown>
    } = {},
  ) =>
    envelope(responsible, {
      action: 'attest',
      authority: options.authority ?? { kind: 'owner' },
      review: options.review ?? review(),
      replaces: options.replaces ?? [],
      ...options.patch,
    }) as ReturnType<typeof envelope> & {
      review: ReturnType<typeof review>
      replaces: CommentRef[]
    }
  const delegate = (responsible: Actor, to: Actor, patch: Record<string, unknown> = {}) =>
    envelope(responsible, {
      action: 'delegate',
      member: 'packages/a',
      ownerIdentity: FACT_A,
      reviewSha256: hashJson(review()),
      delegate: to,
      ...patch,
    })
  const revoke = (responsible: Actor, targets: CommentRef[], patch: Record<string, unknown> = {}) =>
    envelope(responsible, { action: 'revoke', targets, reason: 'superseded', ...patch })
  return { comments, post, attest, delegate, revoke, review, envelope, fence }
}

function authority(
  overrides: Partial<RecordAuthority> & { reviewers?: Actor[] } = {},
): RecordAuthority {
  const reviewers = overrides.reviewers ?? [A, B, C]
  return {
    isReviewer: author =>
      reviewers.some(r => r.login === author.login && r.nodeId === author.nodeId),
    ownerOf: member =>
      member === 'packages/a' ? FACT_A : member === 'packages/b' ? FACT_B : undefined,
    checkEvidence: () => 'matches',
    ...overrides,
  }
}
function fold(
  t: Thread,
  options: { auth?: RecordAuthority; expected?: Comparison[] } = {},
): FoldResult {
  return foldSemanticReviews({
    repository,
    comments: t.comments,
    expected: options.expected ?? [CMP_A],
    authority: options.auth ?? authority(),
  })
}
const only = (result: FoldResult) => result.members[0] as FoldResult['members'][number]
const refusal = (result: FoldResult) => {
  const verdict = only(result)
  return verdict.kind === 'refused' ? verdict.code : 'valid'
}

describe('parseRecordComment', () => {
  const t = thread()
  const good = t.attest(A)
  it('reads one strict fence, whatever the key order', () => {
    const reverse = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverse)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reverse(v)]),
            )
          : value
    const reordered = JSON.stringify(reverse(good))
    expect(parseRecordComment(t.fence(good)).kind).toBe('record')
    expect(
      parseRecordComment('```json omne-api-semantic-review:v1\n' + reordered + '\n```').kind,
    ).toBe('record')
  })
  it('ignores a comment without the marker', () => {
    expect(parseRecordComment('LGTM, thanks')).toEqual({ kind: 'none' })
  })
  it('refuses a duplicate key', () => {
    const body = t
      .fence(good)
      .replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,')
    expect(parseRecordComment(body).kind).toBe('invalid')
  })
  it('refuses an unknown key, also inside a nested object', () => {
    expect(parseRecordComment(t.fence({ ...good, extra: 1 })).kind).toBe('invalid')
    const nested = { ...good, responsible: { ...A, extra: 'x' } }
    expect(parseRecordComment(t.fence(nested)).kind).toBe('invalid')
  })
  it('refuses a missing key, a wrong schema version and an unsorted evidence list', () => {
    const { replaces: _replaces, ...missing } = good
    expect(parseRecordComment(t.fence(missing)).kind).toBe('invalid')
    expect(parseRecordComment(t.fence({ ...good, schemaVersion: 2 })).kind).toBe('invalid')
    const e1 = {
      url: 'https://github.com/x/y/issues/1#issuecomment-2',
      bodySha256: hex(1, 64),
      updatedAt: 't',
    }
    const e0 = { ...e1, url: 'https://github.com/x/y/issues/1#issuecomment-1' }
    const review = { ...good.review, evidence: [e1, e0] }
    expect(parseRecordComment(t.fence({ ...good, review })).kind).toBe('invalid')
    expect(
      parseRecordComment(t.fence({ ...good, review: { ...review, evidence: [e0, e0] } })).kind,
    ).toBe('invalid')
    expect(parseRecordComment(t.fence({ ...good, review: { ...review, evidence: [] } })).kind).toBe(
      'invalid',
    )
  })
  it('refuses a marker with no fence or with two fences', () => {
    expect(parseRecordComment('see omne-api-semantic-review please').kind).toBe('invalid')
    expect(parseRecordComment(t.fence(good) + '\n' + t.fence(good)).kind).toBe('invalid')
  })
  it('refuses a bad path, an unsafe integer and an upper-case digest', () => {
    const cmp = (patch: Record<string, unknown>) => ({
      ...good,
      review: { ...good.review, comparison: { ...CMP_A, ...patch } },
    })
    expect(parseRecordComment(t.fence(cmp({ member: '../a' }))).kind).toBe('invalid')
    expect(
      parseRecordComment(
        t.fence(cmp({ rawMemberSha256: hex(10, 64).toUpperCase().replace('A', 'A') })),
      ).kind,
    ).toBe('invalid')
    const text = t.fence(good).replace('"number": 5,', '"number": 9007199254740993,')
    expect(parseRecordComment(text).kind).toBe('invalid')
  })
})

describe('hashJson', () => {
  it('ignores key order and keeps array order', () => {
    expect(hashJson({ a: 1, b: [1, 2] })).toBe(hashJson({ b: [1, 2], a: 1 }))
    expect(hashJson({ b: [1, 2] })).not.toBe(hashJson({ b: [2, 1] }))
  })
})

describe('fold: accepted shapes', () => {
  it('accepts a direct owner attest and reports its authority', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    const verdict = only(fold(t))
    expect(verdict).toMatchObject({
      kind: 'valid',
      conclusion: 'additive',
      record: ref,
      authority: A,
    })
  })
  it('carries a breaking conclusion instead of refusing it', () => {
    const t = thread()
    t.post(A, t.attest(A, { review: t.review(CMP_A, 'breaking') }))
    expect(only(fold(t))).toMatchObject({ kind: 'valid', conclusion: 'breaking' })
  })
  it('orders by creation time and comment id, not by input order', () => {
    const t = thread()
    const first = t.post(A, t.attest(A))
    t.post(A, t.revoke(A, [first]))
    t.comments.reverse()
    expect(refusal(fold(t))).toBe('api-review-revoked')
  })
  it('accepts an exact single-payload delegation used by the delegate', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C))
    t.post(C, t.attest(C, { authority: { kind: 'delegated', grant } }))
    expect(only(fold(t))).toMatchObject({ kind: 'valid', authority: C })
  })
  it('accepts a new attest after a formal revoke, and one that replaces the active attest', () => {
    const t = thread()
    const first = t.post(A, t.attest(A))
    t.post(A, t.revoke(A, [first]))
    const second = t.post(A, t.attest(A))
    expect(only(fold(t))).toMatchObject({ kind: 'valid', record: second })
    const third = t.post(A, t.attest(A, { replaces: [second] }))
    expect(only(fold(t))).toMatchObject({ kind: 'valid', record: third })
  })
  it('gives each member its own verdict: a valid member does not hide a missing one', () => {
    const t = thread()
    t.post(A, t.attest(A))
    const result = fold(t, { expected: [CMP_A, comparison('packages/b', FACT_B)] })
    expect(result.members.map(m => (m.kind === 'valid' ? 'valid' : m.code))).toEqual([
      'valid',
      'api-review-missing',
    ])
  })
})

describe('fold: source, repository and author', () => {
  it('refuses a record that names another repository', () => {
    const t = thread()
    t.post(A, t.attest(A, { patch: { repository: { ...repository, nodeId: 'R_other' } } }))
    expect(refusal(fold(t))).toBe('api-review-invalid')
  })
  it('refuses a responsible that is not the comment author, by node ID', () => {
    const t = thread()
    t.post(A, t.attest({ ...A, nodeId: 'U_recycled' }))
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('ignores the marker comment of an author who is not a live reviewer', () => {
    const t = thread()
    t.post(X, t.attest(A))
    const result = fold(t)
    expect(refusal(result)).toBe('api-review-missing')
    expect(result.ignored).toHaveLength(1)
  })
  it('stops using a valid record once its author loses the reviewer role', () => {
    const t = thread()
    t.post(A, t.attest(A))
    expect(refusal(fold(t, { auth: authority({ reviewers: [B, C] }) }))).toBe('api-review-missing')
  })
  it('refuses a live reviewer who is neither owner nor delegate', () => {
    const t = thread()
    t.post(B, t.attest(B))
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('refuses a member without any trusted owner', () => {
    const t = thread()
    t.post(A, t.attest(A))
    expect(refusal(fold(t, { auth: authority({ ownerOf: () => undefined }) }))).toBe(
      'api-review-unauthorized',
    )
  })
  it('does not accept the record of another line owner for this member', () => {
    const t = thread()
    t.post(B, t.attest(B, { review: t.review(CMP_A) }))
    t.post(A, t.attest(A))
    // B's record stays present and unauthorized until the owner revokes it.
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('refuses an edited record, and its correction needs a new comment', () => {
    const t = thread()
    t.post(A, t.attest(A), { edited: true })
    expect(refusal(fold(t))).toBe('api-review-invalid')
  })
  it('ignores an edited revoke', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    t.post(A, t.revoke(A, [ref]), { edited: true })
    expect(only(fold(t)).kind).toBe('refused')
    expect(refusal(fold(t))).toBe('api-review-invalid')
  })
})

describe('fold: malformed records', () => {
  it('refuses every member when a reviewer comment cannot be parsed', () => {
    const t = thread()
    t.post(A, t.attest(A))
    t.post(B, '```json omne-api-semantic-review:v1\n{ "schemaVersion": 1, \n```')
    const result = fold(t, { expected: [CMP_A, comparison('packages/b', FACT_B)] })
    expect(result.members.map(m => (m.kind === 'valid' ? 'valid' : m.code))).toEqual([
      'api-review-invalid',
      'api-review-invalid',
    ])
  })
  it('lets a non-reviewer malformed comment pass as ignored', () => {
    const t = thread()
    t.post(A, t.attest(A))
    t.post(X, '```json omne-api-semantic-review:v1\nnot json\n```')
    expect(only(fold(t)).kind).toBe('valid')
  })
  it('lets only the owner author revoke the malformed record of that author', () => {
    const t = thread()
    const broken = t.post(A, '```json omne-api-semantic-review:v1\n{ "x": \n```')
    t.post(B, t.revoke(B, [broken]))
    expect(refusal(fold(t))).toBe('api-review-invalid')
    t.post(A, t.revoke(A, [broken]))
    t.post(A, t.attest(A))
    expect(only(fold(t)).kind).toBe('valid')
  })
  it('does not let the owner revoke a malformed record of another author', () => {
    const t = thread()
    const broken = t.post(B, '```json omne-api-semantic-review:v1\n{ "x": \n```')
    const result = (t.post(A, t.revoke(A, [broken])), fold(t))
    expect(refusal(result)).toBe('api-review-invalid')
    expect(result.ineffectiveRevokes[0]?.code).toBe('api-review-unauthorized')
  })
})

describe('fold: operationId', () => {
  it('reports a conflict for the same operationId, also with identical content', () => {
    const t = thread()
    const first = t.post(A, t.attest(A, { patch: { operationId: 'same' } }))
    // The second attest replaces the first exactly, so only the repeated ID is wrong.
    t.post(A, t.attest(A, { replaces: [first], patch: { operationId: 'same' } }))
    expect(refusal(fold(t))).toBe('api-review-conflict')
  })
  it('lets the owner revoke the duplicate and issue again under a new ID', () => {
    const t = thread()
    const first = t.post(A, t.attest(A, { patch: { operationId: 'same' } }))
    const second = t.post(A, t.attest(A, { replaces: [first], patch: { operationId: 'same' } }))
    expect(refusal(fold(t))).toBe('api-review-conflict')
    t.post(A, t.revoke(A, [first]))
    expect(only(fold(t)).kind).toBe('valid')
    expect(only(fold(t))).toMatchObject({ record: second })
  })
})

describe('fold: replaces', () => {
  it('refuses a second attest that does not replace the active one', () => {
    const t = thread()
    t.post(A, t.attest(A))
    t.post(A, t.attest(A))
    expect(refusal(fold(t))).toBe('api-review-conflict')
  })
  it('refuses a replaces list with an extra entry from another key', () => {
    const t = thread()
    const other = t.post(
      A,
      t.attest(A, { review: t.review(comparison('packages/a', FACT_A, { head: 101 })) }),
    )
    t.post(A, t.attest(A, { replaces: [other] }))
    expect(refusal(fold(t))).toBe('api-review-conflict')
  })
  it('refuses a replacement across scope kinds', () => {
    const t = thread()
    const milestone = t.post(
      A,
      t.attest(A, { review: t.review(comparison('packages/a', FACT_A, { kind: 'milestone' })) }),
    )
    t.post(A, t.attest(A, { replaces: [milestone] }))
    expect(refusal(fold(t))).toBe('api-review-conflict')
  })
  it('refuses a replaces reference that names a later or the same comment', () => {
    const t = thread()
    const future = {
      url: `https://github.com/${REPO}/issues/5#issuecomment-2`,
      bodySha256: hex(1, 64),
      updatedAt: '2026-11-01T00:02:00Z',
    }
    t.post(A, t.attest(A, { replaces: [future] }))
    expect(refusal(fold(t))).toBe('api-review-invalid')
    const own = thread()
    const self = {
      url: `https://github.com/${REPO}/issues/5#issuecomment-1`,
      bodySha256: hex(1, 64),
      updatedAt: '2026-11-01T00:01:00Z',
    }
    own.post(A, own.attest(A, { replaces: [self] }))
    expect(refusal(fold(own))).toBe('api-review-invalid')
  })
  it('refuses a replaces reference to a revoked record', () => {
    const t = thread()
    const first = t.post(A, t.attest(A))
    t.post(A, t.revoke(A, [first]))
    t.post(A, t.attest(A, { replaces: [first] }))
    expect(refusal(fold(t))).toBe('api-review-conflict')
  })
  it('refuses a replaces reference whose digest or updatedAt no longer matches', () => {
    const t = thread()
    const first = t.post(A, t.attest(A))
    t.post(A, t.attest(A, { replaces: [{ ...first, bodySha256: hex(7, 64) }] }))
    expect(refusal(fold(t))).toBe('api-review-source-changed')
  })
  it('keeps an unauthorized same-key record until the owner revokes it', () => {
    const t = thread()
    const intruder = t.post(B, t.attest(B))
    const blocked = t.post(A, t.attest(A))
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
    // The blocked attest is a conflicting candidate too: the owner clears both, then issues.
    t.post(A, t.revoke(A, [intruder, blocked]))
    t.post(A, t.attest(A))
    expect(only(fold(t)).kind).toBe('valid')
  })
})

describe('fold: scope and key', () => {
  it('reports scope-mismatch for an old record of the same scope kind and member', () => {
    const t = thread()
    t.post(A, t.attest(A, { review: t.review(comparison('packages/a', FACT_A, { head: 101 })) }))
    expect(refusal(fold(t))).toBe('api-review-scope-mismatch')
  })
  it('reports missing when the only record belongs to another scope kind', () => {
    const t = thread()
    t.post(
      A,
      t.attest(A, { review: t.review(comparison('packages/a', FACT_A, { kind: 'milestone' })) }),
    )
    expect(refusal(fold(t))).toBe('api-review-missing')
  })
  it('does not let a record of another key compete with or authorize the new key', () => {
    const t = thread()
    t.post(A, t.attest(A, { review: t.review(comparison('packages/a', FACT_A, { head: 101 })) }))
    t.post(A, t.attest(A))
    expect(only(fold(t)).kind).toBe('valid')
  })
  it('reports revoked when the only record of the key was revoked', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    t.post(A, t.revoke(A, [ref]))
    expect(refusal(fold(t))).toBe('api-review-revoked')
  })
  it('treats a changed owner identity as a new key', () => {
    const t = thread()
    t.post(A, t.attest(A))
    const moved = comparison('packages/a', fact('line-a', B))
    expect(
      refusal(
        fold(t, { expected: [moved], auth: authority({ ownerOf: () => fact('line-a', B) }) }),
      ),
    ).toBe('api-review-scope-mismatch')
  })
})

describe('fold: delegation', () => {
  const delegated = (t: Thread, grant: CommentRef, as: Actor = C) =>
    t.post(as, t.attest(as, { authority: { kind: 'delegated', grant } }))
  it('refuses a delegate for another conclusion', () => {
    const t = thread()
    const grant = t.post(
      A,
      t.delegate(A, C, { reviewSha256: hashJson(t.review(CMP_A, 'breaking')) }),
    )
    delegated(t, grant)
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('refuses a delegate for another member', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C, { member: 'packages/b' }))
    delegated(t, grant)
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('refuses a delegate that carries another owner identity', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C, { ownerIdentity: FACT_B }))
    delegated(t, grant)
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('refuses another payload under the same grant', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C))
    const other = { ...t.review(), rationale: 'A different rationale.' }
    t.post(C, t.attest(C, { authority: { kind: 'delegated', grant }, review: other }))
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
  })
  it('binds the grant to the delegate node ID, not to the login', () => {
    const t = thread()
    const recycled: Actor = { login: C.login, nodeId: 'U_C2' }
    const grant = t.post(A, t.delegate(A, C))
    delegated(t, grant, recycled)
    expect(refusal(fold(t, { auth: authority({ reviewers: [A, B, C, recycled] }) }))).toBe(
      'api-review-unauthorized',
    )
  })
  it('refuses a delegation by someone who is not the owner, and a re-delegation', () => {
    const t = thread()
    const forged = t.post(B, t.delegate(B, C))
    delegated(t, forged)
    expect(refusal(fold(t))).toBe('api-review-unauthorized')
    const again = thread()
    const grant = again.post(A, again.delegate(A, C))
    const second = again.post(C, again.delegate(C, B))
    delegated(again, second, B)
    void grant
    expect(refusal(fold(again))).toBe('api-review-unauthorized')
  })
  it('refuses a grant reference that is forward or whose digest drifted', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C))
    delegated(t, { ...grant, bodySha256: hex(5, 64) })
    expect(refusal(fold(t))).toBe('api-review-source-changed')
    const forward = thread()
    delegated(forward, {
      url: `https://github.com/${REPO}/issues/5#issuecomment-9`,
      bodySha256: hex(1, 64),
      updatedAt: 't',
    })
    expect(refusal(fold(forward))).toBe('api-review-invalid')
  })
  it('refuses an attest of a delegate who is not a live reviewer', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C))
    delegated(t, grant)
    expect(refusal(fold(t, { auth: authority({ reviewers: [A, B] }) }))).toBe('api-review-missing')
  })
  it('invalidates the dependent attest when the owner revokes the grant, without restoring older records', () => {
    const t = thread()
    const direct = t.post(A, t.attest(A))
    const grant = t.post(A, t.delegate(A, C))
    t.post(C, t.attest(C, { authority: { kind: 'delegated', grant }, replaces: [direct] }))
    expect(only(fold(t)).kind).toBe('valid')
    t.post(A, t.revoke(A, [grant]))
    expect(refusal(fold(t))).toBe('api-review-revoked')
  })
})

describe('fold: revoke', () => {
  it('keeps the attest when another line owner tries to revoke it', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    t.post(B, t.revoke(B, [ref]))
    const result = fold(t)
    expect(only(result).kind).toBe('valid')
    expect(result.ineffectiveRevokes[0]?.code).toBe('api-review-unauthorized')
  })
  it('lets only the current owner revoke after a change of owner', () => {
    const t = thread()
    const old = t.post(A, t.attest(A))
    const moved = comparison('packages/a', fact('line-a', B))
    const auth = authority({ ownerOf: () => fact('line-a', B) })
    t.post(A, t.revoke(A, [old]))
    const first = fold(t, { expected: [moved], auth })
    expect(first.ineffectiveRevokes[0]?.code).toBe('api-review-unauthorized')
    expect(refusal(first)).toBe('api-review-scope-mismatch')
    // The old attest (other key) is still unrevoked: B revokes it as the current owner.
    t.post(B, t.revoke(B, [old]))
    const second = fold(t, { expected: [moved], auth })
    expect(second.ineffectiveRevokes).toHaveLength(1)
  })
  it('lets a delegate revoke only its own attest under a valid grant', () => {
    const t = thread()
    const grant = t.post(A, t.delegate(A, C))
    const own = t.post(C, t.attest(C, { authority: { kind: 'delegated', grant } }))
    t.post(C, t.revoke(C, [own]))
    expect(refusal(fold(t))).toBe('api-review-revoked')
    const other = thread()
    const direct = other.post(A, other.attest(A))
    other.post(C, other.revoke(C, [direct]))
    expect(only(fold(other)).kind).toBe('valid')
    const delegateTarget = thread()
    const g = delegateTarget.post(A, delegateTarget.delegate(A, C))
    delegateTarget.post(C, delegateTarget.revoke(C, [g]))
    const result = fold(delegateTarget)
    expect(result.ineffectiveRevokes).toHaveLength(1)
  })
  it('treats a repeated revoke as idempotent and never restores anything', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    t.post(A, t.revoke(A, [ref]))
    t.post(A, t.revoke(A, [ref]))
    expect(refusal(fold(t))).toBe('api-review-revoked')
  })
  it('does not accept a revoke of a revoke, or a revoke that names a later comment', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    const gone = t.post(A, t.revoke(A, [ref]))
    t.post(A, t.revoke(A, [gone]))
    const result = fold(t)
    expect(refusal(result)).toBe('api-review-revoked')
    expect(result.ineffectiveRevokes[0]?.code).toBe('api-review-invalid')
  })
  it('does not accept a revoke by a non-reviewer', () => {
    const t = thread()
    const ref = t.post(A, t.attest(A))
    t.post(X, t.revoke(X, [ref]))
    expect(only(fold(t)).kind).toBe('valid')
  })
})

describe('fold: evidence', () => {
  const evidenceWith = (outcome: EvidenceCheck | 'throw') =>
    authority({
      checkEvidence: () => {
        if (outcome === 'throw') throw new Error('403')
        return outcome
      },
    })
  it.each([
    ['drifted', 'api-review-source-changed'],
    ['absent', 'api-review-source-changed'],
    ['foreign', 'api-review-invalid'],
    ['throw', 'api-review-input-unknown'],
  ] as const)('refuses evidence that is %s', (outcome, code) => {
    const t = thread()
    t.post(A, t.attest(A))
    expect(refusal(fold(t, { auth: evidenceWith(outcome) }))).toBe(code)
  })
  it('refuses evidence that names an ignored comment', () => {
    const t = thread()
    const ignored = t.post(X, t.attest(A))
    const review = {
      ...t.review(),
      evidence: [
        { url: ignored.url, bodySha256: ignored.bodySha256, updatedAt: ignored.updatedAt },
      ],
    }
    t.post(A, t.attest(A, { review }))
    expect(refusal(fold(t))).toBe('api-review-invalid')
  })
})

describe('carrier read', () => {
  const rest = (id: number, body = 'x') => ({
    id,
    html_url: `https://github.com/${REPO}/issues/5#issuecomment-${id}`,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    user: { login: 'alice', node_id: 'U_A' },
    body,
  })
  it('returns the comments when two complete reads agree', () => {
    const call: GhRead = () => [rest(1)]
    const read = readCarrier(REPO, 5, call)
    expect(read.kind === 'comments' && read.comments).toHaveLength(1)
  })
  it('is unknown at the 20 page limit', () => {
    const call: GhRead = () => Array.from({ length: 100 }, (_, i) => rest(i + 1))
    expect(readCarrier(REPO, 5, call)).toMatchObject({
      kind: 'refused',
      code: 'api-review-input-unknown',
    })
  })
  it('is unknown when the platform refuses the read', () => {
    const call: GhRead = () => {
      throw new GhReadError({ status: '403' })
    }
    expect(readCarrier(REPO, 5, call)).toMatchObject({
      kind: 'refused',
      code: 'api-review-input-unknown',
    })
  })
  it('is source-changed when the second read differs from the first', () => {
    let calls = 0
    const call: GhRead = () => [rest(1, calls++ === 0 ? 'before' : 'after')]
    expect(readCarrier(REPO, 5, call)).toMatchObject({
      kind: 'refused',
      code: 'api-review-source-changed',
    })
  })
})

describe('evidenceChecker', () => {
  const url = `https://github.com/${REPO}/issues/8#issuecomment-50`
  const body = 'evidence'
  const ref = (patch: Partial<CommentRef> = {}): CommentRef => ({
    url,
    bodySha256: commentRefOf({ id: 1, url, createdAt: 't', updatedAt: 'u', author: A, body })
      .bodySha256,
    updatedAt: 'u',
    ...patch,
  })
  const read =
    (value: unknown): GhRead =>
    () =>
      value
  const answer = { html_url: url, body, updated_at: 'u' }
  it('matches an unchanged comment, and reports drift of body or time', () => {
    expect(evidenceChecker(REPO, read(answer))(ref())).toBe('matches')
    expect(evidenceChecker(REPO, read({ ...answer, body: 'edited' }))(ref())).toBe('drifted')
    expect(evidenceChecker(REPO, read({ ...answer, updated_at: 'later' }))(ref())).toBe('drifted')
  })
  it('names a URL of another repository foreign without any request', () => {
    const never: GhRead = () => {
      throw new Error('must not be called')
    }
    const other = ref({ url: 'https://github.com/someone/else/issues/8#issuecomment-50' })
    expect(evidenceChecker(REPO, never)(other)).toBe('foreign')
  })
  it('maps a known 404 to absent and any other failure to a throw', () => {
    const missing: GhRead = () => {
      throw new GhReadError({ status: '404', message: 'Not Found' })
    }
    expect(evidenceChecker(REPO, missing)(ref())).toBe('absent')
    const forbidden: GhRead = () => {
      throw new GhReadError({ status: '403' })
    }
    expect(() => evidenceChecker(REPO, forbidden)(ref())).toThrow()
  })
})
