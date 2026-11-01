// The owner identity reader of the semantic review path (candidate r4, 5.3 and 5.4). GitHub is a
// stand-in that answers by request path and counts calls. Nothing reads or writes the real platform.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  readOwnerIdentity,
  resolveOwnerLine,
  type OwnerIdentityFact,
  type OwnerIdentityManifest,
  type OwnerIdentityReading,
} from '../src/delivery/api-review-identity.ts'
import { readCommentByUrl } from '../src/delivery/baseline.ts'
import { evidenceChecker } from '../src/delivery/api-semantic-review.ts'
import { GhReadError, type GhRead } from '../src/delivery/github-read.ts'
import type { DeliveryLine, DeliveryLines } from '../src/delivery/lines.ts'
import { r1DynamicIdentityCheck } from './support/r1-dynamic-identity-check.ts'

const REPO = 'owner/repo'
const MEMBER = 'packages/a'
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const line = (id: string, owner: string, contracts: string[]): DeliveryLine => ({
  id,
  title: id,
  owner,
  track: null,
  paths: [],
  contracts,
})
const table = (...lines: DeliveryLine[]): DeliveryLines => ({
  schemaVersion: 1,
  integration: { track: 'mainline', paths: [] },
  shared: [],
  lines,
})

const ADOPTION_URL = `https://github.com/${REPO}/issues/10#issuecomment-501`
const ADOPTION_BODY = 'accept line alpha: alice / N_alice'
const adoptionComment = {
  html_url: ADOPTION_URL,
  body: ADOPTION_BODY,
  updated_at: '2026-11-01T04:39:28Z',
  user: { login: 'alice', node_id: 'N_alice' },
}
const fact = (over: Partial<OwnerIdentityFact> = {}): OwnerIdentityFact => ({
  lineId: 'alpha',
  owner: { login: 'alice', nodeId: 'N_alice' },
  adoption: {
    comment: {
      url: ADOPTION_URL,
      bodySha256: sha(ADOPTION_BODY),
      updatedAt: '2026-11-01T04:39:28Z',
    },
    authorNodeId: 'N_alice',
  },
  ...over,
})
const manifest = (...owners: OwnerIdentityFact[]): OwnerIdentityManifest => ({
  schemaVersion: 1,
  repository: { name: REPO, nodeId: 'R_repo' },
  owners,
})
const repository = { name: REPO, nodeId: 'R_repo' }

type PlatformUser = { login: unknown; node_id: string } | 'forbidden' | 'limited' | 'broken'
type Platform = {
  /** Keys are lower case: the platform lookup ignores case and returns the canonical login. */
  users: Record<string, PlatformUser>
  reviewers: { login: string; node_id: string }[]
  comments: Record<string, unknown>
}
function platform(): Platform {
  return {
    users: { alice: { login: 'alice', node_id: 'N_alice' } },
    reviewers: [{ login: 'alice', node_id: 'N_alice' }],
    comments: { '501': adoptionComment },
  }
}
const apiError = (status: string) => new GhReadError({ message: 'x', status })

/** `before` runs ahead of each answer with the path and the number of earlier reads of it. */
function gh(state: Platform, before?: (path: string, n: number) => void) {
  const seen = new Map<string, number>()
  const calls: string[] = []
  const call: GhRead = argv => {
    const path = String(argv[argv.length - 1])
    const n = (seen.get(path) ?? 0) + 1
    seen.set(path, n)
    calls.push(path)
    before?.(path, n)
    if (path.startsWith('users/')) {
      const user = state.users[decodeURIComponent(path.slice(6)).toLowerCase()]
      if (user === undefined) throw apiError('404')
      if (user === 'forbidden') throw apiError('403')
      if (user === 'limited') throw apiError('429')
      if (user === 'broken') throw new Error('socket hang up')
      return user
    }
    if (path === `repos/${REPO}/environments/publish`)
      return {
        protection_rules: [
          {
            type: 'required_reviewers',
            reviewers: state.reviewers.map(reviewer => ({ type: 'User', reviewer })),
          },
        ],
      }
    const id = /^repos\/owner\/repo\/issues\/comments\/(\d+)$/.exec(path)?.[1]
    if (id !== undefined) {
      const found = state.comments[id]
      if (found === undefined) throw apiError('404')
      return found
    }
    throw new Error(`unexpected read ${path}`)
  }
  return { call, calls }
}

function read(
  state: Platform,
  options: {
    lines?: DeliveryLines
    manifest?: OwnerIdentityManifest
    author?: { login: string; nodeId: string }
    before?: (path: string, n: number) => void
  } = {},
): OwnerIdentityReading {
  return readOwnerIdentity({
    repository,
    member: MEMBER,
    lines: options.lines ?? table(line('alpha', 'alice', [MEMBER])),
    manifest: options.manifest ?? manifest(fact()),
    call: gh(state, options.before).call,
    ...(options.author === undefined ? {} : { author: options.author }),
  })
}
const code = (reading: OwnerIdentityReading) => reading.finding?.code ?? null
const detail = (reading: OwnerIdentityReading) => reading.finding?.detail ?? null

describe('owner line resolution (section 2)', () => {
  it('finds the one line that lists the member in contracts, by exact string', () => {
    expect(
      resolveOwnerLine(table(line('alpha', 'alice', [MEMBER]), line('beta', 'bob', [])), MEMBER),
    ).toEqual({ kind: 'unique', lineId: 'alpha', ownerLogin: 'alice' })
  })

  it('does not match a prefix or a longer path', () => {
    const lines = table(line('alpha', 'alice', ['packages/a/sub', 'packages']))
    expect(resolveOwnerLine(lines, MEMBER)).toEqual({ kind: 'unresolved', lineIds: [] })
  })

  it('is unresolved with no line ids when no line lists the member', () => {
    expect(resolveOwnerLine(table(line('beta', 'bob', ['packages/b'])), MEMBER)).toEqual({
      kind: 'unresolved',
      lineIds: [],
    })
  })

  it('is unresolved and names both lines when two lines list the member', () => {
    const lines = table(line('beta', 'bob', [MEMBER]), line('alpha', 'alice', [MEMBER]))
    expect(resolveOwnerLine(lines, MEMBER)).toEqual({
      kind: 'unresolved',
      lineIds: ['alpha', 'beta'],
    })
  })
})

describe('identity check on a consistent target', () => {
  it('passes and returns the exact manifest fact and a consistent adoption diagnostic', () => {
    const reading = read(platform())
    expect(reading).toEqual({
      finding: null,
      line: { kind: 'unique', lineId: 'alpha', ownerLogin: 'alice' },
      fact: fact(),
      loginCaseOnly: false,
      adoption: { kind: 'consistent' },
    })
  })

  it('accepts a governed rename: same nodeId under the new login in both files', () => {
    const state = platform()
    state.users = { alice2: { login: 'alice2', node_id: 'N_alice' } }
    const renamed = fact({ owner: { login: 'alice2', nodeId: 'N_alice' } })
    const reading = read(state, {
      lines: table(line('alpha', 'alice2', [MEMBER])),
      manifest: manifest(renamed),
    })
    expect(code(reading)).toBeNull()
  })

  it('accepts a governed change of owner: new login and new nodeId in both files', () => {
    const state = platform()
    state.users = { carol: { login: 'carol', node_id: 'N_carol' } }
    const swapped = fact({ owner: { login: 'carol', nodeId: 'N_carol' } })
    const reading = read(state, {
      lines: table(line('alpha', 'carol', [MEMBER])),
      manifest: manifest(swapped),
    })
    expect(code(reading)).toBeNull()
  })
})

describe('C1: a renamed owner login claimed by another account', () => {
  // alice renamed to alice-new. bob then claimed the login alice. The table still says alice and
  // the anchor still says N_alice. bob is a live reviewer and wrote the comment.
  function reused() {
    const state = platform()
    state.users = {
      alice: { login: 'alice', node_id: 'N_bob' },
      'alice-new': { login: 'alice-new', node_id: 'N_alice' },
    }
    state.reviewers = [{ login: 'alice', node_id: 'N_bob' }]
    return state
  }
  const bob = { login: 'alice', nodeId: 'N_bob' }

  it('step 1: the r1 dynamic rule lets the claimant through, so the fixture reproduces C1', () => {
    const verdict = r1DynamicIdentityCheck({
      repository: REPO,
      ownerLogin: 'alice',
      author: bob,
      call: gh(reused()).call,
    })
    expect(verdict).toEqual({ passed: true, failures: [] })
  })

  it('step 2: the same fixture is refused because the nodeId differs from the anchor', () => {
    const reading = read(reused(), { author: bob })
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(detail(reading)).toMatchObject({
      reason: 'node-id-differs',
      anchored: 'N_alice',
      platform: 'N_bob',
    })
  })
})

describe('refusals before any platform read', () => {
  it('owner-unresolved with no line id when the member is in no contracts', () => {
    const { call, calls } = gh(platform())
    const reading = readOwnerIdentity({
      repository,
      member: MEMBER,
      lines: table(line('beta', 'bob', [])),
      manifest: manifest(fact()),
      call,
    })
    expect(code(reading)).toBe('api-review-owner-unresolved')
    expect(detail(reading)).toEqual({ lineIds: [] })
    expect(calls).toEqual([])
  })

  it('owner-unresolved with both line ids when two lines list the member', () => {
    const reading = read(platform(), {
      lines: table(line('alpha', 'alice', [MEMBER]), line('beta', 'alice', [MEMBER])),
    })
    expect(code(reading)).toBe('api-review-owner-unresolved')
    expect(detail(reading)).toEqual({ lineIds: ['alpha', 'beta'] })
  })

  it('does not fall back to another entry when the member line has no anchor: identity-missing', () => {
    const reading = read(platform(), {
      manifest: manifest(fact({ lineId: 'beta' })),
    })
    expect(code(reading)).toBe('api-review-owner-identity-missing')
    expect(reading.fact).toBeNull()
  })

  it('identity-missing when the manifest has no entries (anchor removed)', () => {
    expect(code(read(platform(), { manifest: manifest() }))).toBe(
      'api-review-owner-identity-missing',
    )
  })

  it('mismatch when the manifest belongs to another repository', () => {
    const other = { ...manifest(fact()), repository: { name: 'owner/other', nodeId: 'R_other' } }
    const reading = read(platform(), { manifest: other })
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(detail(reading)).toMatchObject({ reason: 'repository' })
  })

  it('mismatch when only delivery-lines changed the owner login (drift), without reading users', () => {
    const { call, calls } = gh(platform())
    const reading = readOwnerIdentity({
      repository,
      member: MEMBER,
      lines: table(line('alpha', 'alice-new', [MEMBER])),
      manifest: manifest(fact()),
      call,
    })
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(detail(reading)).toMatchObject({ reason: 'line-owner-login' })
    expect(calls).toEqual([])
  })
})

describe('the users lookup is a consistency check against the anchor', () => {
  it('login differing only in case is a mismatch with the repair hint', () => {
    const state = platform()
    state.users = { alice: { login: 'Alice', node_id: 'N_alice' } }
    const reading = read(state)
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(reading.loginCaseOnly).toBe(true)
    expect(detail(reading)).toMatchObject({ reason: 'login-differs', loginCaseOnly: true })
  })

  it('a different login for the anchored nodeId is a mismatch without the hint', () => {
    const state = platform()
    state.users = { alice: { login: 'alice-new', node_id: 'N_alice' } }
    const reading = read(state)
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(reading.loginCaseOnly).toBe(false)
  })

  it('a nodeId in the new format is a mismatch: compared byte for byte, never converted', () => {
    const state = platform()
    state.users = { alice: { login: 'alice', node_id: 'U_kgDOAAB' } }
    const reading = read(state)
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(detail(reading)).toMatchObject({ reason: 'node-id-differs' })
  })

  it('a known 404 is a mismatch: the registered login no longer exists (rename or deletion)', () => {
    const state = platform()
    state.users = {}
    const reading = read(state)
    expect(code(reading)).toBe('api-review-owner-identity-mismatch')
    expect(detail(reading)).toMatchObject({ reason: 'users-not-found' })
  })

  it.each([
    ['403', 'forbidden'],
    ['429', 'limited'],
    ['network failure', 'broken'],
  ] as const)('%s is input-unknown, not a verdict', (_name, kind) => {
    const state = platform()
    state.users = { alice: kind }
    expect(code(read(state))).toBe('api-review-input-unknown')
  })

  it('an unexplained response shape is input-unknown', () => {
    const state = platform()
    state.users = { alice: { login: 7, node_id: 'N_alice' } }
    expect(code(read(state))).toBe('api-review-input-unknown')
  })

  it('never writes the lookup result back: the returned fact is the manifest fact', () => {
    expect(read(platform()).fact).toEqual(fact())
  })
})

describe('the comment author must be the anchored owner and a live reviewer', () => {
  it('refuses an author with the owner login but another nodeId, even as a live reviewer', () => {
    const state = platform()
    state.reviewers = [{ login: 'alice', node_id: 'N_other' }]
    const reading = read(state, { author: { login: 'alice', nodeId: 'N_other' } })
    expect(code(reading)).toBe('api-review-unauthorized')
    expect(detail(reading)).toMatchObject({ reason: 'author-not-owner' })
  })

  it('refuses the owner when it is no longer a live reviewer', () => {
    const state = platform()
    state.reviewers = [{ login: 'bob', node_id: 'N_bob' }]
    const reading = read(state, { author: { login: 'alice', nodeId: 'N_alice' } })
    expect(code(reading)).toBe('api-review-unauthorized')
  })

  it('accepts the anchored owner who is a live reviewer', () => {
    expect(code(read(platform(), { author: { login: 'alice', nodeId: 'N_alice' } }))).toBeNull()
  })
})

describe('adoption re-read is a diagnostic and never changes the verdict', () => {
  it.each([
    ['body edited', { body: 'edited' }, ['bodySha256']],
    ['updatedAt moved', { updated_at: '2026-11-02T00:00:00Z' }, ['updatedAt']],
    ['author changed', { user: { login: 'eve', node_id: 'N_eve' } }, ['authorNodeId']],
    [
      'moved to another comment url',
      { html_url: `https://github.com/${REPO}/issues/10#issuecomment-999` },
      ['url'],
    ],
  ] as const)('%s: drifted, finding stays null', (_name, change, fields) => {
    const state = platform()
    state.comments['501'] = { ...adoptionComment, ...change }
    const reading = read(state)
    expect(reading.finding).toBeNull()
    expect(reading.adoption).toEqual({ kind: 'drifted', fields })
  })

  it('lists every differing field, sorted', () => {
    const state = platform()
    state.comments['501'] = {
      ...adoptionComment,
      body: 'x',
      updated_at: 'later',
      user: { login: 'eve', node_id: 'N_eve' },
    }
    expect(read(state).adoption).toEqual({
      kind: 'drifted',
      fields: ['authorNodeId', 'bodySha256', 'updatedAt'],
    })
  })

  it('a deleted comment is unreadable and the verdict is unchanged', () => {
    const state = platform()
    delete state.comments['501']
    const reading = read(state)
    expect(reading.finding).toBeNull()
    expect(reading.adoption).toMatchObject({ kind: 'unreadable' })
  })

  it('a comment url outside this repository is unreadable and is never fetched', () => {
    const state = platform()
    const foreign = fact()
    foreign.adoption.comment.url = 'https://github.com/other/repo/issues/10#issuecomment-501'
    const { call, calls } = gh(state)
    const reading = readOwnerIdentity({
      repository,
      member: MEMBER,
      lines: table(line('alpha', 'alice', [MEMBER])),
      manifest: manifest(foreign),
      call,
    })
    expect(reading.finding).toBeNull()
    expect(reading.adoption).toMatchObject({ kind: 'unreadable' })
    expect(calls.some(path => path.includes('issues/comments'))).toBe(false)
  })

  it('a failed adoption read does not turn into a refusal', () => {
    const state = platform()
    state.comments['501'] = 'not an object'
    const reading = read(state)
    expect(reading.finding).toBeNull()
    expect(reading.adoption).toMatchObject({ kind: 'unreadable' })
  })

  it('an adoption change between the two reads does not cause source-changed', () => {
    const state = platform()
    const reading = read(state, {
      before: (path, n) => {
        if (path.includes('issues/comments') && n === 1) {
          state.comments['501'] = { ...adoptionComment, body: 'edited between reads' }
        }
      },
    })
    expect(reading.finding).toBeNull()
  })

  it('is not read at all when an earlier step refused', () => {
    const state = platform()
    state.users = {}
    const reading = read(state)
    expect(reading.adoption).toBeNull()
  })
})

describe('source-changed: the platform facts are read again before the answer', () => {
  it('refuses when the reviewer list changes between the two reads', () => {
    const state = platform()
    const reading = read(state, {
      before: (path, n) => {
        if (path.endsWith('/environments/publish') && n === 2) state.reviewers = []
      },
    })
    expect(code(reading)).toBe('api-review-source-changed')
  })

  it('refuses when the current account changes between the two reads', () => {
    const state = platform()
    const reading = read(state, {
      before: (path, n) => {
        if (path === 'users/alice' && n === 2)
          state.users = { alice: { login: 'alice', node_id: 'N_bob' } }
      },
    })
    expect(code(reading)).toBe('api-review-source-changed')
  })

  it('does not reuse the first read as the second', () => {
    const { call, calls } = gh(platform())
    readOwnerIdentity({
      repository,
      member: MEMBER,
      lines: table(line('alpha', 'alice', [MEMBER])),
      manifest: manifest(fact()),
      call,
    })
    expect(calls.filter(path => path === 'users/alice')).toHaveLength(2)
    expect(calls.filter(path => path.endsWith('/environments/publish'))).toHaveLength(2)
  })

  it('an unreadable second read is input-unknown', () => {
    const state = platform()
    const reading = read(state, {
      before: (path, n) => {
        if (path === 'users/alice' && n === 2) state.users = { alice: 'limited' }
      },
    })
    expect(code(reading)).toBe('api-review-input-unknown')
  })
})

describe('one reading of a comment URL for every caller', () => {
  const urls = [
    `https://github.com/${REPO}/issues/10#issuecomment-501`,
    `https://github.com/${REPO}/issues/0#issuecomment-501`,
    `https://github.com/${REPO}/issues/10#issuecomment-0501`,
    `https://github.com/${REPO}/issues/10#issuecomment-0`,
    `https://github.com/${REPO}/pull/10#issuecomment-501`,
    `https://github.com/other/repo/issues/10#issuecomment-501`,
  ]
  it.each(urls)('%s is foreign to all three readers or to none', url => {
    const answer = { ...adoptionComment, html_url: url }
    const fetched = (run: (call: GhRead) => unknown): boolean => {
      let requested = false
      const call: GhRead = argv => {
        const path = String(argv[argv.length - 1])
        if (path.includes('issues/comments/')) {
          requested = true
          return answer
        }
        return gh(platform()).call(argv, 15_000)
      }
      run(call)
      return requested
    }
    const byUrl = fetched(call => readCommentByUrl(REPO, url, call))
    const byEvidence = fetched(call =>
      evidenceChecker(REPO, call)({ url, bodySha256: sha(ADOPTION_BODY), updatedAt: 'u' }),
    )
    const adopted = fact()
    adopted.adoption.comment.url = url
    const byIdentity = fetched(call =>
      readOwnerIdentity({
        repository,
        member: MEMBER,
        lines: table(line('alpha', 'alice', [MEMBER])),
        manifest: manifest(adopted),
        call,
      }),
    )
    expect(byEvidence).toBe(byUrl)
    expect(byIdentity).toBe(byUrl)
    expect(byUrl).toBe(url === urls[0])
  })
})
