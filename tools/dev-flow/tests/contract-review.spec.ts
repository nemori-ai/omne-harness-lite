// Pure comparison and interpretation of the API semantic review (candidate-r4.md sections 4 and 7).
// No I/O: every case builds plain values.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  anchorFindings,
  compareComparisons,
  composeRunExit,
  comparisonsEqual,
  enablementFindings,
  FAILURE_EXIT,
  hashJson,
  interpretRun,
  memberSetFindings,
  milestonePredicates,
  resolveMember,
  sideSetFindings,
  type ApiSide,
  type Comparison,
  type Enablement,
  type Finding,
  type Json,
  type MemberResolution,
  type ReviewFailureCode,
} from '../src/integration/contract-review.ts'

const sha = (c: string) => c.repeat(64)
const commit = (c: string) => c.repeat(40)
const node = (name: string) => `NODE_${name}`

function side(c: string): ApiSide {
  return {
    commit: commit(c),
    apiTree: commit('d'),
    packageName: '@omne-harness/example',
    snapshots: [
      { path: 'packages/a/api/a.api.md', sha256: sha('1') },
      { path: 'packages/a/api/b.api.md', sha256: sha('2') },
    ],
  }
}

const base = {
  repository: { name: 'omne-harness-lite', nodeId: node('repo') },
  head: commit('b'),
  targetBranch: 'refs/heads/main',
  targetBase: commit('c'),
  authoritySha256: sha('4'),
  ownerIdentity: {
    lineId: 'api',
    owner: { login: 'owner', nodeId: node('owner') },
    adoption: {
      comment: {
        url: 'https://github.com/o/r/issues/1#issuecomment-1',
        bodySha256: sha('5'),
        updatedAt: '2026-11-01T00:00:00Z',
      },
      authorNodeId: node('author'),
    },
  },
  tool: {
    packageName: '@omne-harness/repo-toolchain',
    version: '0.0.18',
    typescriptVersion: '6.0.0',
    lockSha256: sha('6'),
  },
  checkedMembers: ['packages/a', 'packages/b'],
  reviewMembers: ['packages/a'],
  member: 'packages/a',
  before: side('a'),
  after: side('b'),
  rawMemberSha256: sha('7'),
} as const

const binding = {
  issue: { number: 996, nodeId: node('issue') },
  revision: 1,
  attempt: '996-r1-a1',
  bindingSha256: sha('8'),
  dispatch: {
    url: 'https://github.com/o/r/issues/996#issuecomment-2',
    bodySha256: sha('9'),
    updatedAt: '2026-11-01T01:00:00Z',
  },
}

function make(scope: Comparison['scope']): Comparison {
  return structuredClone({ ...base, scope }) as unknown as Comparison
}
const cardScope = (): Comparison['scope'] => ({ kind: 'card', card: binding, base: commit('a') })
const riScope = (): Comparison['scope'] => ({
  kind: 'ri',
  track: 'mainline',
  sourceBranch: 'refs/heads/integration/mainline',
  base: commit('a'),
  carrier: { number: 7, nodeId: node('carrier') },
  units: [{ commit: commit('e'), tagObject: commit('f'), pr: 11 }],
  prs: [{ number: 11, nodeId: 'PR_11', bodySha256: sha('a'), head: commit('e'), baseRef: 'main' }],
  cards: [binding],
})
const milestoneScope = (): Comparison['scope'] => ({
  kind: 'milestone',
  milestone: { number: 3, nodeId: node('ms'), title: 'M2' },
  baselineIssue: { number: 5, nodeId: node('bl') },
  baselineSha256: sha('b'),
  registrations: [
    {
      url: 'https://github.com/o/r/issues/5#issuecomment-3',
      bodySha256: sha('c'),
      updatedAt: '2026-11-01T02:00:00Z',
    },
  ],
})

const scopes = { card: cardScope, ri: riScope, milestone: milestoneScope }

// Every changed object path: leaf edits, key removal, key addition, array growth, shrink and swap.
function mutations(
  value: Json,
  path: string[] = [],
): { name: string; apply: (root: Json) => void }[] {
  const out: { name: string; apply: (root: Json) => void }[] = []
  const at = (root: Json): Json => path.reduce<Json>((node, key) => (node as never)[key], root)
  const here = path.join('.') || '<root>'
  if (Array.isArray(value)) {
    out.push({ name: `${here}: append`, apply: r => (at(r) as Json[]).push('extra') })
    out.push({ name: `${here}: shrink`, apply: r => (at(r) as Json[]).pop() })
    if (value.length > 1) {
      out.push({ name: `${here}: swap`, apply: r => (at(r) as Json[]).reverse() })
    }
    value.forEach((item, index) => out.push(...mutations(item, [...path, String(index)])))
  } else if (value !== null && typeof value === 'object') {
    out.push({ name: `${here}: add key`, apply: r => ((at(r) as Record<string, Json>).extra = 1) })
    for (const [key, child] of Object.entries(value)) {
      out.push({
        name: `${here}.${key}: remove key`,
        apply: r => delete (at(r) as Record<string, Json>)[key],
      })
      out.push(...mutations(child, [...path, key]))
    }
  } else {
    const changed: Json = typeof value === 'number' ? value + 1 : `${String(value)}x`
    const parent = path.slice(0, -1)
    const key = path.at(-1) as string
    out.push({
      name: `${here}: edit`,
      apply: r =>
        ((parent.reduce<Json>((n, k) => (n as never)[k], r) as never)[key] = changed as never),
    })
  }
  return out
}

describe('hashJson', () => {
  it('sorts keys by UTF-16 code unit, keeps array order, writes compact UTF-8', () => {
    const expected = createHash('sha256')
      .update('{"B":1,"a":[2,1],"é":"\\u0000\\n\\"","𝒳":null}', 'utf8')
      .digest('hex')
    expect(hashJson({ é: '\u0000\n"', a: [2, 1], B: 1, 𝒳: null })).toBe(expected)
  })

  it('orders astral keys by code unit, not code point', () => {
    // U+FF5E is one unit 0xFF5E; U+1F600 is 0xD83D 0xDE00, which sorts before it.
    expect(hashJson({ '～': 1, '\u{1F600}': 2 })).toBe(
      createHash('sha256').update('{"\u{1F600}":2,"～":1}', 'utf8').digest('hex'),
    )
  })

  it('is independent of key insertion order and nesting order', () => {
    expect(hashJson({ a: { y: 1, x: 2 }, b: 3 })).toBe(hashJson({ b: 3, a: { x: 2, y: 1 } }))
  })

  it('differs when array order differs', () => {
    expect(hashJson([1, 2])).not.toBe(hashJson([2, 1]))
  })

  it.each([
    ['unsafe integer', 2 ** 53],
    ['fraction', 1.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['negative zero', -0],
    ['undefined', undefined],
    ['undefined member', { a: undefined }],
    ['function', () => 1],
    ['bigint', 1n],
  ])('rejects %s instead of hashing it', (_name, value) => {
    expect(() => hashJson(value as never)).toThrow(TypeError)
  })
})

describe('Comparison equality', () => {
  it.each(Object.keys(scopes) as (keyof typeof scopes)[])(
    'equal values compare equal for %s scope, also across key order',
    kind => {
      const a = make(scopes[kind]())
      const b = JSON.parse(JSON.stringify(a), (_k, v) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ) as Comparison
      expect(comparisonsEqual(a, b)).toBe(true)
      expect(compareComparisons(a, b)).toEqual({ equal: true })
    },
  )

  for (const kind of Object.keys(scopes) as (keyof typeof scopes)[]) {
    const cases = mutations(make(scopes[kind]()) as unknown as Json)
    it.each(cases.map(c => [c.name, c] as const))(`${kind} scope: %s breaks equality`, (_n, c) => {
      const a = make(scopes[kind]())
      const b = structuredClone(a)
      c.apply(b as unknown as Json)
      expect(comparisonsEqual(a, b)).toBe(false)
      expect(comparisonsEqual(b, a)).toBe(false)
      const result = compareComparisons(a, b)
      expect(result.equal).toBe(false)
      if (!result.equal) {
        expect(result.differing.length).toBeGreaterThan(0)
      }
    })
  }

  it('names the differing top-level fields in sorted order', () => {
    const a = make(cardScope())
    const b = structuredClone(a)
    b.head = commit('9')
    b.scope = milestoneScope()
    expect(compareComparisons(a, b)).toEqual({ equal: false, differing: ['head', 'scope'] })
  })

  it('does not treat the same head, member and apiTree as the same comparison', () => {
    const a = make(cardScope())
    const b = structuredClone(a)
    b.after.snapshots[0] = { path: 'packages/a/api/a.api.md', sha256: sha('f') }
    expect(a.head).toBe(b.head)
    expect(a.member).toBe(b.member)
    expect(a.after.apiTree).toBe(b.after.apiTree)
    expect(comparisonsEqual(a, b)).toBe(false)
  })

  it('throws on a comparison that cannot be canonicalized instead of calling it unequal', () => {
    const a = make(cardScope())
    const b = { ...structuredClone(a), head: undefined } as unknown as Comparison
    expect(() => comparisonsEqual(a, b)).toThrow(TypeError)
  })
})

describe('anchorFindings', () => {
  it('accepts card and RI when before is scope.base and after is head', () => {
    expect(anchorFindings(make(cardScope()), {})).toEqual([])
    expect(anchorFindings(make(riScope()), {})).toEqual([])
  })

  it.each([
    ['card', cardScope],
    ['ri', riScope],
  ] as const)('rejects %s before.commit that is not scope.base', (_kind, scope) => {
    const c = make(scope())
    c.before.commit = commit('9')
    const findings = anchorFindings(c, {})
    expect(findings.map(f => f.code)).toEqual(['api-review-scope-mismatch'])
    expect(findings[0]?.member).toBe('packages/a')
  })

  it('rejects after.commit that is not head', () => {
    const c = make(cardScope())
    c.after.commit = commit('9')
    expect(anchorFindings(c, {}).map(f => f.code)).toEqual(['api-review-scope-mismatch'])
  })

  it('reports both anchors when both are wrong', () => {
    const c = make(cardScope())
    c.before.commit = commit('8')
    c.after.commit = commit('9')
    expect(anchorFindings(c, {})).toHaveLength(2)
  })

  it('milestone before.commit must equal the registered commit of the member', () => {
    const c = make(milestoneScope())
    expect(anchorFindings(c, { registeredCommit: c.before.commit })).toEqual([])
    expect(anchorFindings(c, { registeredCommit: commit('9') }).map(f => f.code)).toEqual([
      'api-review-scope-mismatch',
    ])
  })

  it('milestone without a registered commit is unknown, not a pass', () => {
    const c = make(milestoneScope())
    expect(anchorFindings(c, {}).map(f => f.code)).toEqual(['api-review-input-unknown'])
  })
})

describe('memberSetFindings', () => {
  const ok = {
    checked: ['packages/a', 'packages/b'],
    review: ['packages/a'],
    rawReview: ['packages/a'],
    member: 'packages/a',
  }
  const codes = (input: Parameters<typeof memberSetFindings>[0]) =>
    memberSetFindings(input).map(f => f.code)

  it('accepts a complete sorted set whose review subset is exactly the raw review members', () => {
    expect(memberSetFindings(ok)).toEqual([])
  })

  it('accepts an empty review set when no member has raw review', () => {
    expect(memberSetFindings({ checked: ['x'], review: [], rawReview: [], member: null })).toEqual(
      [],
    )
  })

  it.each([
    ['missing review member', { review: [] }],
    ['unexpected review member', { review: ['packages/a', 'packages/b'] }],
    ['review member outside checked', { review: ['packages/z'], rawReview: ['packages/z'] }],
    ['duplicate checked member', { checked: ['packages/a', 'packages/a', 'packages/b'] }],
    ['duplicate review member', { review: ['packages/a', 'packages/a'] }],
    ['unsorted checked', { checked: ['packages/b', 'packages/a'] }],
    [
      'unsorted review',
      { review: ['packages/b', 'packages/a'], rawReview: ['packages/a', 'packages/b'] },
    ],
    ['member not in review', { member: 'packages/b' }],
    ['empty checked set', { checked: [] }],
  ])('rejects %s', (_name, change) => {
    expect(codes({ ...ok, ...change })).toEqual(['api-review-input-unknown'])
  })

  it.each(['', '.', '..', 'a/./b', 'a/../b', 'a//b', '/a', 'a\\b', 'a/'])(
    'rejects path %j as not normalized',
    path => {
      expect(
        codes({ ...ok, checked: [path, 'packages/b'], review: [], rawReview: [], member: null }),
      ).toEqual(['api-review-input-unknown'])
    },
  )

  it('lists every problem in one finding set, not only the first', () => {
    const findings = memberSetFindings({
      checked: ['b', 'a', 'a'],
      review: ['c'],
      rawReview: ['a'],
      member: 'q',
    })
    expect(findings.length).toBeGreaterThan(1)
    expect(new Set(findings.map(f => f.code))).toEqual(new Set(['api-review-input-unknown']))
  })
})

describe('sideSetFindings', () => {
  it('accepts a sorted unique nonempty snapshot list', () => {
    expect(sideSetFindings('before', side('a'), 'packages/a')).toEqual([])
  })

  it.each([
    ['empty list', (s: ApiSide) => (s.snapshots = [])],
    ['duplicate path', (s: ApiSide) => s.snapshots.push({ ...s.snapshots[0]! })],
    ['unsorted', (s: ApiSide) => s.snapshots.reverse()],
    ['bad path', (s: ApiSide) => (s.snapshots[0]!.path = '../x.api.md')],
    ['bad digest', (s: ApiSide) => (s.snapshots[0]!.sha256 = 'ABC')],
    ['bad commit', (s: ApiSide) => (s.commit = 'abc')],
    ['bad tree', (s: ApiSide) => (s.apiTree = commit('D'))],
    ['empty package name', (s: ApiSide) => (s.packageName = '')],
  ])('rejects %s', (_name, mutate) => {
    const s = side('a')
    mutate(s)
    expect(sideSetFindings('after', s, 'packages/a').map(f => f.code)).toEqual([
      'api-review-input-unknown',
    ])
  })

  it('names the side and member in the finding', () => {
    const s = side('a')
    s.snapshots = []
    const [finding] = sideSetFindings('after', s, 'packages/a')
    expect(finding?.member).toBe('packages/a')
    expect(JSON.stringify(finding?.detail)).toContain('after')
  })
})

describe('enablementFindings', () => {
  const run = (e: Enablement) => enablementFindings(e)

  it('enabled yields no findings', () => {
    expect(run({ kind: 'enabled', authoritySha256: sha('1') })).toEqual([])
  })

  it('entry outside root is an established refusal with exit 1, no member', () => {
    const [f, ...rest] = run({ kind: 'entry-outside-root', entryRealpath: '/x', root: '/r' })
    expect(rest).toEqual([])
    expect(f).toMatchObject({ code: 'api-review-entry-outside-root', member: null })
    expect(FAILURE_EXIT[f!.code]).toBe(1)
  })

  it('oid difference is self-authorization and lists the paths', () => {
    expect(run({ kind: 'oid-differs', paths: ['a.json', 'b.json'] })).toEqual([
      {
        code: 'api-review-self-authorization',
        member: null,
        detail: { paths: ['a.json', 'b.json'] },
      },
    ])
  })

  it('unparsable is policy-unavailable (exit 2)', () => {
    const [f] = run({ kind: 'unparsable', path: 'delivery-lines.json' })
    expect(f).toMatchObject({ code: 'api-review-policy-unavailable', member: null })
    expect(FAILURE_EXIT[f!.code]).toBe(2)
  })

  const row = (
    path: string,
    targetBase: 'present' | 'absent',
    candidate: 'present' | 'absent',
  ) => ({
    path,
    targetBase,
    candidate,
  })

  it.each([
    ['absent on target, present on candidate', row('p', 'absent', 'present')],
    ['present on target, absent on candidate', row('p', 'present', 'absent')],
  ])('presence differs (%s) is self-authorization', (_n, r) => {
    expect(run({ kind: 'presence', rows: [r] }).map(f => f.code)).toEqual([
      'api-review-self-authorization',
    ])
  })

  it('absent on both sides is policy-unavailable', () => {
    expect(
      run({ kind: 'presence', rows: [row('p', 'absent', 'absent')] }).map(f => f.code),
    ).toEqual(['api-review-policy-unavailable'])
  })

  it('self-authorization wins over policy-unavailable and keeps the other rows as detail', () => {
    const rows = [row('q', 'absent', 'absent'), row('p', 'absent', 'present')]
    const findings = run({ kind: 'presence', rows })
    expect(findings.map(f => f.code)).toEqual(['api-review-self-authorization'])
    expect(findings[0]?.detail).toEqual({ rows })
    expect(composeRunExit(findings)).toBe(1)
  })
})

describe('FAILURE_EXIT table, one case per row', () => {
  const rows = Object.entries(FAILURE_EXIT) as [ReviewFailureCode, 1 | 2][]
  const expected: Record<ReviewFailureCode, 1 | 2> = {
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
  }

  it('has exactly the fifteen codes of 7.1', () => {
    expect(rows.map(([code]) => code).sort()).toEqual(Object.keys(expected).sort())
  })

  it.each(Object.entries(expected))('%s alone exits %i', (code, exit) => {
    const finding: Finding = { code: code as ReviewFailureCode, member: null, detail: null }
    expect(composeRunExit([finding])).toBe(exit)
  })
})

describe('composeRunExit', () => {
  const f = (code: ReviewFailureCode, member: string | null = 'm'): Finding => ({
    code,
    member,
    detail: null,
  })

  it('no findings exits 0', () => {
    expect(composeRunExit([])).toBe(0)
  })

  it('any exit-2 finding wins over exit-1 findings in either order', () => {
    expect(composeRunExit([f('api-review-missing'), f('api-review-input-unknown')])).toBe(2)
    expect(composeRunExit([f('api-review-input-unknown'), f('api-review-missing')])).toBe(2)
  })

  it('several exit-1 findings stay at 1', () => {
    expect(composeRunExit([f('api-review-missing'), f('api-review-revoked')])).toBe(1)
  })

  it('one valid member cannot hide another member whose input is unknown', () => {
    const resolutions: MemberResolution[] = [
      resolved('a', 'review', 'additive'),
      resolved('b', 'review', null),
    ]
    const result = interpretRun({
      rawExitCode: 0,
      members: resolutions,
      findings: [f('api-review-input-unknown', 'b')],
    })
    expect(result.exit).toBe(2)
    expect(result.members[0]?.requiredLevel).toBe('additive')
  })

  it('treats a code outside the table as unknown (exit 2), never as success', () => {
    expect(composeRunExit([{ code: 'made-up' as never, member: null, detail: null }])).toBe(2)
  })
})

function resolved(
  member: string,
  raw: MemberResolution['rawClassification'],
  semantic: MemberResolution['semanticClassification'],
): MemberResolution {
  return {
    member,
    rawClassification: raw,
    semanticClassification: semantic,
    requiredLevel: semantic ?? (raw === 'review' ? 'additive' : raw),
    record: null,
    authority: null,
    identity: null,
  }
}

describe('resolveMember (section 7 levels)', () => {
  it('raw none stays none and needs no record', () => {
    const r = resolveMember({
      member: 'm',
      raw: 'none',
      semantic: null,
      record: null,
      authority: null,
    })
    expect(r.resolution).toMatchObject({
      rawClassification: 'none',
      semanticClassification: null,
      requiredLevel: 'none',
    })
    expect(r.findings).toEqual([])
  })

  it('raw additive stays additive and needs no record', () => {
    const r = resolveMember({
      member: 'm',
      raw: 'additive',
      semantic: null,
      record: null,
      authority: null,
    })
    expect(r.resolution.requiredLevel).toBe('additive')
    expect(r.findings).toEqual([])
  })

  it('a semantic conclusion does not touch a raw none or additive member', () => {
    for (const raw of ['none', 'additive'] as const) {
      const r = resolveMember({
        member: 'm',
        raw,
        semantic: 'breaking',
        record: null,
        authority: null,
      })
      expect(r.resolution.requiredLevel).toBe(raw)
      expect(r.resolution.semanticClassification).toBeNull()
      expect(r.findings).toEqual([])
    }
  })

  const record = {
    url: 'https://github.com/o/r/issues/1#issuecomment-9',
    bodySha256: sha('1'),
    updatedAt: '2026-11-01T00:00:00Z',
  }
  const authority = { login: 'owner', nodeId: node('owner') }

  it('review with a valid additive record requires additive and keeps record and authority', () => {
    const r = resolveMember({ member: 'm', raw: 'review', semantic: 'additive', record, authority })
    expect(r.resolution).toMatchObject({
      rawClassification: 'review',
      semanticClassification: 'additive',
      requiredLevel: 'additive',
      record,
      authority,
    })
    expect(r.findings).toEqual([])
  })

  it('review with a valid breaking record requires breaking and yields breaking-route-required', () => {
    const r = resolveMember({ member: 'm', raw: 'review', semantic: 'breaking', record, authority })
    expect(r.resolution.requiredLevel).toBe('breaking')
    expect(r.findings).toEqual([
      { code: 'api-review-breaking-route-required', member: 'm', detail: null },
    ])
  })

  it('review without a valid record yields the given failure, default missing', () => {
    const none = resolveMember({
      member: 'm',
      raw: 'review',
      semantic: null,
      record: null,
      authority: null,
    })
    expect(none.findings.map(f => f.code)).toEqual(['api-review-missing'])
    expect(none.resolution.semanticClassification).toBeNull()
    const revoked = resolveMember({
      member: 'm',
      raw: 'review',
      semantic: null,
      record: null,
      authority: null,
      failure: 'api-review-revoked',
    })
    expect(revoked.findings.map(f => f.code)).toEqual(['api-review-revoked'])
  })

  it('carries identity diagnostics through untouched', () => {
    const identity: NonNullable<MemberResolution['identity']> = {
      line: { kind: 'unique', lineId: 'api', ownerLogin: 'owner' },
      loginCaseOnly: true,
      adoption: { kind: 'drifted', fields: ['updatedAt'] },
    }
    const r = resolveMember({
      member: 'm',
      raw: 'review',
      semantic: 'additive',
      record,
      authority,
      identity,
    })
    expect(r.resolution.identity).toEqual(identity)
  })
})

describe('interpretRun', () => {
  it('reports rawExitCode next to the composed exit and never folds it in', () => {
    const clean = interpretRun({ rawExitCode: 1, members: [], findings: [] })
    expect(clean).toMatchObject({ rawExitCode: 1, exit: 0 })
    const refused = interpretRun({
      rawExitCode: 0,
      members: [],
      findings: [{ code: 'api-review-missing', member: 'm', detail: null }],
    })
    expect(refused).toMatchObject({ rawExitCode: 0, exit: 1 })
  })

  it('keeps every finding, in input order, and does not mutate the input', () => {
    const findings: Finding[] = [
      { code: 'api-review-revoked', member: 'b', detail: null },
      { code: 'api-review-missing', member: 'a', detail: null },
    ]
    const copy = structuredClone(findings)
    const result = interpretRun({ rawExitCode: 0, members: [], findings })
    expect(result.findings).toEqual(copy)
    expect(findings).toEqual(copy)
  })

  it('keeps raw and semantic classification and level per member', () => {
    const members = [resolved('a', 'review', 'additive'), resolved('b', 'none', null)]
    const result = interpretRun({ rawExitCode: 1, members, findings: [] })
    expect(
      result.members.map(m => [
        m.member,
        m.rawClassification,
        m.semanticClassification,
        m.requiredLevel,
      ]),
    ).toEqual([
      ['a', 'review', 'additive', 'additive'],
      ['b', 'none', null, 'none'],
    ])
  })
})

describe('milestonePredicates (8.2)', () => {
  const good = {
    rawExitCode: 1,
    refused: true,
    undetermined: [] as string[],
    statusesValid: true,
    registrationsMatch: true,
    membersComplete: true,
    members: [resolved('a', 'review', 'additive'), resolved('b', 'none', null)],
    findings: [] as Finding[],
    readsStable: true,
  }
  const run = (change: Partial<typeof good>) => milestonePredicates({ ...good, ...change })

  it('passes with raw refusal absorbed by an additive review member', () => {
    expect(run({})).toEqual({
      pass: true,
      predicates: {
        rawExitMatchesRefused: true,
        inputComplete: true,
        everyReviewAttestedAdditive: true,
        noBreakingConclusion: true,
        noFindingsAndStableReads: true,
      },
    })
  })

  it.each([
    ['rawExit 2', { rawExitCode: 2 }, 'rawExitMatchesRefused'],
    ['rawExit 1 but not refused', { rawExitCode: 1, refused: false }, 'rawExitMatchesRefused'],
    ['refused but rawExit 0', { rawExitCode: 0, refused: true }, 'rawExitMatchesRefused'],
    ['undetermined member', { undetermined: ['packages/z'] }, 'inputComplete'],
    ['invalid status', { statusesValid: false }, 'inputComplete'],
    ['registrations differ', { registrationsMatch: false }, 'inputComplete'],
    ['member set incomplete', { membersComplete: false }, 'inputComplete'],
    [
      'review member without conclusion',
      { members: [resolved('a', 'review', null)] },
      'everyReviewAttestedAdditive',
    ],
    [
      'review member breaking',
      { members: [resolved('a', 'review', 'breaking')] },
      'everyReviewAttestedAdditive',
    ],
    [
      'breaking conclusion',
      { members: [resolved('a', 'review', 'breaking')] },
      'noBreakingConclusion',
    ],
    [
      'a finding',
      {
        findings: [{ code: 'api-review-conflict', member: 'a', detail: null }] satisfies Finding[],
      },
      'noFindingsAndStableReads',
    ],
    ['unstable reads', { readsStable: false }, 'noFindingsAndStableReads'],
  ] as const)('%s fails exactly its predicate and the whole check', (_n, change, predicate) => {
    const result = run(change as Partial<typeof good>)
    expect(result.pass).toBe(false)
    expect(result.predicates[predicate]).toBe(false)
  })

  it('a raw review member recorded as additive but with no record reference stays unattested', () => {
    const member = { ...resolved('a', 'review', 'additive'), record: null }
    expect(run({ members: [member] }).predicates.everyReviewAttestedAdditive).toBe(true)
  })

  it('rawExit 0 with refused false passes the first predicate', () => {
    expect(run({ rawExitCode: 0, refused: false }).predicates.rawExitMatchesRefused).toBe(true)
  })
})
