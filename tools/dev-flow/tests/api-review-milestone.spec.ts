// The cumulative entry (candidate-r4.md 8.1 to 8.3). Git is a real temporary repository and the
// installed, pinned omne-contract-api runs for every case. GitHub is a stand-in that answers by
// request path. A case changes one condition against the passing setup.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseBaselineText, renderBaselineBlock } from '../src/delivery/baseline.ts'
import { GhReadError, type GhRead } from '../src/delivery/github-read.ts'
import {
  checkMilestone,
  draftMilestone,
  observeMilestone,
  type MilestoneInput,
} from '../src/integration/contract-baseline-review.ts'
import {
  contractApiCommand,
  contractApiEnv,
  toolchainFacts,
} from '../src/integration/contract-diff.ts'
import { git } from '../src/integration/git.ts'
import {
  contracts,
  SNAPSHOT_TEMPLATE,
  write as writeFixture,
  writeSnapshots,
  A_ADDITIVE,
} from './fixtures/contract-api.ts'
import { body as cardBody, init } from './fixtures/integration.ts'
import { r1DynamicIdentityCheck } from './support/r1-dynamic-identity-check.ts'

const REPO = 'owner/repo'
const ISSUE = 20
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const ALICE = { login: 'alice', nodeId: 'N_alice' }
const REPOSITORY = { name: REPO, nodeId: 'R_repo' }
const ADOPTION_BODY = 'accept line alpha: alice / N_alice'
const ADOPTION_UPDATED = '2026-11-01T04:39:28Z'
const ADOPTION_URL = `https://github.com/${REPO}/issues/10#issuecomment-501`
const EVIDENCE_URL = `https://github.com/${REPO}/issues/10#issuecomment-502`
const EVIDENCE_BODY = 'review evidence'
const EVIDENCE_UPDATED = '2026-11-01T04:40:00Z'
const BRANCH = 'refs/heads/integration/mainline'

const LINES = {
  schemaVersion: 1,
  integration: { track: 'mainline', paths: [] },
  shared: [],
  lines: [
    {
      id: 'alpha',
      title: 'alpha',
      owner: 'alice',
      track: null,
      paths: [],
      contracts: ['pkg/a', 'pkg/b', 'pkg/c'],
    },
  ],
}
const MANIFEST = {
  schemaVersion: 1,
  repository: REPOSITORY,
  owners: [
    {
      lineId: 'alpha',
      owner: ALICE,
      adoption: {
        comment: {
          url: ADOPTION_URL,
          bodySha256: sha(ADOPTION_BODY),
          updatedAt: ADOPTION_UPDATED,
        },
        authorNodeId: 'N_alice',
      },
    },
  ],
}

type World = {
  root: string
  entry: string
  base: string
  head: string
  registrationAll: string
  registrationAB: string
  registrationBHead: string
  registrationWithCards: string
}
let world: World
const homes: string[] = []

function commitAll(root: string, message: string): string {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '--allow-empty', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}
function toolRun(root: string, args: string[]) {
  const command = contractApiCommand()
  if (!('file' in command)) throw new Error(command.reason)
  return spawnSync(command.file, [...command.args, ...args, '--root', root], {
    cwd: root,
    encoding: 'utf8',
    env: contractApiEnv(root),
  })
}
/** The registration comment body for `--baseline-write` arguments. */
function registration(root: string, commit: string, extra: string[], cards?: string[]): string {
  const out = toolRun(root, ['--baseline-write', commit, '--milestone', 'M1', '--json', ...extra])
  if (out.status !== 0) throw new Error(out.stderr)
  const parsed = JSON.parse(out.stdout) as Record<string, unknown>
  if (cards !== undefined) parsed.breakingCards = cards
  return renderBaselineBlock(parseBaselineText(JSON.stringify(parsed)))
}

// Builds a real temporary repository and runs the installed CLI once; under the full slow tier this can exceed the default hook timeout.
beforeAll(() => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-milestone-')))
  homes.push(root)
  init(root)
  writeFixture(root, '.gitignore', 'node_modules/\n')
  contracts(
    root,
    { members: 'docs/engineering/delivery-lines.json', snapshot: SNAPSHOT_TEMPLATE },
    LINES,
  )
  writeFixture(root, 'docs/engineering/api-review-owners.json', JSON.stringify(MANIFEST, null, 2))
  writeFixture(
    root,
    'docs/engineering/integration-policy.json',
    JSON.stringify({ repository: REPO }),
  )
  for (const path of [
    'docs/engineering/integration.md',
    'docs/engineering/delivery.md',
    'docs/verification.md',
  ])
    writeFixture(root, path, 'text\n')
  writeFixture(root, 'tools/dev-flow/package.json', '{}\n')
  const entryPath = 'tools/dev-flow/src/integration/api-review-cli.ts'
  writeFixture(root, entryPath, '// entry\n')
  writeFixture(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n')
  writeSnapshots(root)
  const base = commitAll(root, 'base')
  const registrationAll = registration(root, base, [])
  const registrationAB = registration(root, base, ['--member', 'pkg/a', '--member', 'pkg/b'])
  const registrationWithCards = registration(root, base, [], ['#7'])
  writeFixture(root, 'pkg/a/dist/index.d.ts', A_ADDITIVE)
  writeFixture(root, 'pkg/b/dist/index.d.ts', 'export {};\n')
  writeFixture(root, 'pkg/c/dist/index.d.ts', 'export declare const c: string;\n')
  writeSnapshots(root)
  const head = commitAll(root, 'head')
  const registrationBHead = registration(root, head, ['--member', 'pkg/b'])
  world = {
    root,
    entry: join(root, entryPath),
    base,
    head,
    registrationAll,
    registrationAB,
    registrationBHead,
    registrationWithCards,
  }
}, 120_000)
afterAll(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))

type ApiComment = {
  id: number
  html_url: string
  created_at: string
  updated_at: string
  user: { login: string; node_id: string }
  body: string
}
type State = {
  attempt: string
  repoNode: string
  comments: ApiComment[]
  reviewers: { login: string; node_id: string }[]
  users: Record<string, { login: string; node_id: string }>
}
function state(): State {
  return {
    attempt: '5-a1',
    repoNode: 'R_repo',
    comments: [],
    reviewers: [{ login: 'alice', node_id: 'N_alice' }],
    users: { alice: { login: 'alice', node_id: 'N_alice' } },
  }
}
function post(s: State, body: string): void {
  const id = s.comments.length + 1
  const at = `2026-11-01T01:00:${String(id).padStart(2, '0')}Z`
  s.comments.push({
    id,
    html_url: `https://github.com/${REPO}/issues/${ISSUE}#issuecomment-${id}`,
    created_at: at,
    updated_at: at,
    user: { login: 'alice', node_id: 'N_alice' },
    body,
  })
}
const CARD_URL = `https://github.com/${REPO}/issues/5`
const DISPATCH_URL = `${CARD_URL}#issuecomment-55`
/** The owner task of the checkout: a version 2 binding of card 5. */
function bindingOf(attempt: string) {
  return {
    schemaVersion: 2 as const,
    issue: { repository: REPO, id: 'I_5', number: 5, url: CARD_URL },
    revision: 1,
    attempt,
    responsible: 'human',
    branch: 'human/task',
    route: { kind: 'track' as const, track: 'mainline' },
    completionTarget: 'stable' as const,
    taskBase: world.base,
    writeScope: ['pkg/a'],
    dispatch: DISPATCH_URL,
    conditions: [],
    authorization: [],
    line: 'alpha',
    nature: 'impl' as const,
    contractChange: 'additive' as const,
    milestone: 'M1',
  }
}
const trusted = (s: State, over: Partial<ReturnType<typeof trustedOf>> = {}) => ({
  ...trustedOf(s),
  ...over,
})
function trustedOf(s: State) {
  return {
    candidate: world.head,
    targetBase: world.base,
    targetBranch: BRANCH,
    binding: bindingOf(s.attempt),
  }
}
function dispatchText(attempt: string): string {
  const decision = {
    schemaVersion: 1,
    responsible: 'alice',
    basis: ['x'],
    action: 'dispatch',
    task: bindingOf(attempt),
    confirmations: [],
  }
  return `\`\`\`json omne-integration-authority:v1\n${JSON.stringify(decision)}\n\`\`\``
}
const apiError = (status: string) => new GhReadError({ message: 'x', status })
function gh(s: State) {
  const reads: string[] = []
  const call: GhRead = argv => {
    const path = String(argv[argv.length - 1])
    reads.push(path)
    if (path.startsWith('users/')) {
      const user = s.users[decodeURIComponent(path.slice(6)).toLowerCase()]
      if (user === undefined) throw apiError('404')
      return user
    }
    if (path === `repos/${REPO}/environments/publish`)
      return {
        protection_rules: [
          {
            type: 'required_reviewers',
            reviewers: s.reviewers.map(reviewer => ({ type: 'User', reviewer })),
          },
        ],
      }
    if (path === `repos/${REPO}`) return { node_id: s.repoNode }
    if (path === `repos/${REPO}/issues/5`)
      return {
        number: 5,
        node_id: 'I_5',
        html_url: CARD_URL,
        body: cardBody(bindingOf(s.attempt), [], {
          line: 'alpha',
          nature: 'impl',
          contractChange: 'additive',
        }),
        labels: [],
        milestone: { title: 'M1' },
      }
    if (path === `repos/${REPO}/issues/comments/55`)
      return {
        id: 55,
        html_url: DISPATCH_URL,
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
        user: { login: 'alice', node_id: 'N_alice' },
        body: dispatchText(s.attempt === '5-a1' ? '5-a1' : s.attempt),
      }
    if (path === `repos/${REPO}/issues/${ISSUE}`)
      return {
        number: ISSUE,
        node_id: 'I_20',
        milestone: { number: 7, node_id: 'M_7', title: 'M1' },
      }
    if (path === `repos/${REPO}/issues/${ISSUE}/comments?per_page=100&page=1`) return s.comments
    if (path === `repos/${REPO}/issues/comments/501`)
      return {
        html_url: ADOPTION_URL,
        body: ADOPTION_BODY,
        updated_at: ADOPTION_UPDATED,
        user: { login: 'alice', node_id: 'N_alice' },
      }
    if (path === `repos/${REPO}/issues/comments/502`)
      return {
        html_url: EVIDENCE_URL,
        body: EVIDENCE_BODY,
        updated_at: EVIDENCE_UPDATED,
        user: { login: 'alice', node_id: 'N_alice' },
      }
    throw new Error(`unexpected read ${path}`)
  }
  return { call, reads }
}
const EVIDENCE = { url: EVIDENCE_URL, bodySha256: sha(EVIDENCE_BODY), updatedAt: EVIDENCE_UPDATED }
let operation = 0
function attestBody(comparison: unknown, conclusion: 'additive' | 'breaking'): string {
  operation += 1
  const record = {
    schemaVersion: 1,
    repository: REPOSITORY,
    operationId: `op-${operation}`,
    responsible: ALICE,
    action: 'attest',
    authority: { kind: 'owner' },
    review: {
      comparison,
      conclusion,
      rationale: 'checked',
      evidence: [EVIDENCE],
      consumerScope: 'none',
    },
    replaces: [],
  }
  return `\`\`\`json omne-api-semantic-review:v1\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`
}

function inputFor(
  s: State,
  over: Partial<MilestoneInput> & { semanticReview?: boolean } = {},
): MilestoneInput & { semanticReview: boolean } {
  return {
    root: world.root,
    entry: world.entry,
    baselineIssue: ISSUE,
    semanticReview: true,
    call: gh(s).call,
    resolveTrusted: () => trusted(s),
    ...over,
  }
}
/** Posts the registration, then one attest per review member with the given conclusions. */
function signed(
  s: State,
  registrationBody: string,
  conclusions: Record<string, 'additive' | 'breaking'>,
): void {
  post(s, registrationBody)
  const seen = observeMilestone(inputFor(s))
  if (seen.kind !== 'observed') throw new Error(JSON.stringify(seen.findings))
  for (const comparison of seen.comparisons) {
    const conclusion = conclusions[comparison.member]
    if (conclusion !== undefined) post(s, attestBody(comparison, conclusion))
  }
}
const codesOf = (report: { findings: { code: string; member: string | null }[] }) =>
  report.findings.map(item => `${item.code}@${item.member ?? '-'}`)

describe('check-milestone --semantic-review true', () => {
  it(
    'lets a raw refusal pass when every review member holds a valid additive record',
    { tags: ['slow'] },
    () => {
      const s = state()
      signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
      const report = checkMilestone(inputFor(s))
      expect(report.findings).toEqual([])
      expect(report).toMatchObject({ exit: 0, pass: true, rawExitCode: 1, refused: true })
      expect(report.members.map(m => [m.member, m.rawClassification, m.requiredLevel])).toEqual([
        ['pkg/a', 'additive', 'additive'],
        ['pkg/b', 'review', 'additive'],
        ['pkg/c', 'review', 'additive'],
      ])
    },
  )

  it('reports a review member without a record as missing', { tags: ['slow'] }, () => {
    const s = state()
    signed(s, world.registrationAll, { 'pkg/b': 'additive' })
    const report = checkMilestone(inputFor(s))
    expect(codesOf(report)).toEqual(['api-review-missing@pkg/c'])
    expect(report).toMatchObject({ exit: 1, pass: false })
  })

  it('requires the breaking route for a valid breaking conclusion', { tags: ['slow'] }, () => {
    const s = state()
    signed(s, world.registrationAll, { 'pkg/b': 'breaking', 'pkg/c': 'additive' })
    const report = checkMilestone(inputFor(s))
    expect(codesOf(report)).toEqual(['api-review-breaking-route-required@pkg/b'])
    expect(report).toMatchObject({ exit: 1, pass: false })
  })

  it(
    'stays blocked in a mixed milestone until the breaking member is registered again',
    { tags: ['slow'] },
    () => {
      const s = state()
      signed(s, world.registrationWithCards, { 'pkg/b': 'breaking', 'pkg/c': 'additive' })
      const blocked = checkMilestone(inputFor(s))
      expect(blocked).toMatchObject({ rawExitCode: 0, refused: false, exit: 1 })
      expect(codesOf(blocked)).toEqual(['api-review-breaking-route-required@pkg/b'])

      post(s, world.registrationBHead)
      const seen = observeMilestone(inputFor(s))
      if (seen.kind !== 'observed') throw new Error('not observed')
      expect(seen.comparisons.map(item => item.member)).toEqual(['pkg/c'])
      post(s, attestBody(seen.comparisons[0], 'additive'))
      const passed = checkMilestone(inputFor(s))
      expect(passed.findings).toEqual([])
      expect(passed).toMatchObject({ exit: 0, pass: true })
    },
  )

  it('does not let a record cover an undetermined member', { tags: ['slow'] }, () => {
    const s = state()
    post(s, world.registrationAB)
    const seen = observeMilestone(inputFor(s))
    if (seen.kind !== 'observed') throw new Error(JSON.stringify(seen.findings))
    const b = seen.comparisons.find(item => item.member === 'pkg/b')
    post(s, attestBody(b, 'additive'))
    const report = checkMilestone(inputFor(s))
    expect(report.members.find(m => m.member === 'pkg/b')?.requiredLevel).toBe('additive')
    expect(report.pass).toBe(false)
    expect(report.exit).toBe(2)
    expect(codesOf(report)).toContain('api-review-input-unknown@-')
  })

  it('reports input-unknown when raw exit 1 comes with refused false', { tags: ['slow'] }, () => {
    const s = state()
    signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
    const real = checkMilestone(inputFor(s))
    expect(real.pass).toBe(true)
    const report = checkMilestone(
      inputFor(s, {
        runBaseline: () => ({
          exitCode: 1,
          stdout: JSON.stringify({ ...(real.raw?.report as object), refused: false }),
        }),
      }),
    )
    expect(codesOf(report)).toEqual(['api-review-input-unknown@-'])
    expect(report).toMatchObject({ exit: 2, pass: false })
    expect(report.members.every(m => m.requiredLevel !== 'breaking')).toBe(true)
  })

  it(
    'reports owner-identity-mismatch after a login was reused, although r1 passes',
    { tags: ['slow'] },
    () => {
      const s = state()
      post(s, world.registrationAll)
      s.users.alice = { login: 'alice', node_id: 'N_bob' }
      s.reviewers.push({ login: 'alice', node_id: 'N_bob' })
      const r1 = r1DynamicIdentityCheck({
        repository: REPO,
        ownerLogin: 'alice',
        author: { login: 'alice', nodeId: 'N_bob' },
        call: gh(s).call,
      })
      expect(r1.passed).toBe(true)
      const report = checkMilestone(inputFor(s))
      expect(codesOf(report)).toEqual([
        'api-review-owner-identity-mismatch@pkg/b',
        'api-review-owner-identity-mismatch@pkg/c',
      ])
      expect(report).toMatchObject({ exit: 1, pass: false })
      expect(draftMilestone(inputFor(s)).bundle).toBeNull()
    },
  )

  it(
    'refuses before any read when the entry lies outside the candidate source',
    { tags: ['slow'] },
    () => {
      const s = state()
      const platform = gh(s)
      let resolved = 0
      const report = checkMilestone(
        inputFor(s, {
          call: platform.call,
          entry: join(tmpdir(), 'elsewhere', 'api-review-cli.ts'),
          resolveTrusted: () => {
            resolved += 1
            return trusted(s)
          },
        }),
      )
      expect(codesOf(report)).toEqual(['api-review-entry-outside-root@-'])
      expect(report.exit).toBe(1)
      expect(resolved).toBe(0)
      expect(platform.reads).toEqual([])
    },
  )

  it(
    'reports self-authorization when the candidate changes an authority file',
    { tags: ['slow'] },
    () => {
      const s = state()
      post(s, world.registrationAll)
      writeFileSync(join(world.root, 'docs/engineering/delivery.md'), 'edited\n')
      const edited = commitAll(world.root, 'edit authority file')
      try {
        const platform = gh(s)
        const report = checkMilestone(
          inputFor(s, {
            call: platform.call,
            resolveTrusted: () => trusted(s, { candidate: edited }),
          }),
        )
        expect(codesOf(report)).toEqual(['api-review-self-authorization@-'])
        expect(report.exit).toBe(1)
        expect(platform.reads).toEqual([])
      } finally {
        git(world.root, ['reset', '-q', '--hard', world.head])
      }
    },
  )

  it('rejects a trusted target that changed between the two reads', { tags: ['slow'] }, () => {
    const s = state()
    signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
    let calls = 0
    const report = checkMilestone(
      inputFor(s, {
        resolveTrusted: () => {
          calls += 1
          return trusted(s, {
            targetBranch: calls > 1 ? 'refs/heads/integration/other' : BRANCH,
          })
        },
      }),
    )
    expect(codesOf(report)).toEqual(['api-review-source-changed@-'])
    expect(report.exit).toBe(1)
  })
})

describe('check-milestone without --semantic-review', () => {
  it(
    'reports the installed raw JSON and exit code byte for byte, with no new-path read',
    { tags: ['slow'] },
    () => {
      const s = state()
      post(s, world.registrationAll)
      let resolved = 0
      const report = checkMilestone(
        inputFor(s, {
          semanticReview: false,
          resolveTrusted: () => {
            resolved += 1
            return trusted(s)
          },
        }),
      )
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-direct-')))
      homes.push(dir)
      const file = join(dir, 'baseline.json')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(parseBaselineText(world.registrationAll)))
      const direct = toolRun(world.root, ['--baseline', file, '--json'])
      expect(direct.status).toBe(1)
      expect(report.raw?.stdout).toBe(direct.stdout)
      expect(report.raw?.exitCode).toBe(direct.status)
      expect(report.exit).toBe(direct.status)
      expect(report.pass).toBe(false)
      expect(resolved).toBe(0)
    },
  )
})

describe('live binding, platform repository and second read of the milestone path', () => {
  it('refuses when the card was dispatched again with a new attempt', { tags: ['slow'] }, () => {
    const s = state()
    signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
    s.attempt = '5-a2'
    const report = checkMilestone(
      inputFor(s, { resolveTrusted: () => trusted(s, { binding: bindingOf('5-a1') }) }),
    )
    expect(codesOf(report)).toContain('api-review-source-changed@-')
    expect(report).toMatchObject({ pass: false })
  })
  it(
    'reports source-changed when a reviewer is removed during the fold',
    { tags: ['slow'] },
    () => {
      const s = state()
      signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
      const base = gh(s).call
      let flipped = false
      const call: GhRead = (argv, timeoutMs) => {
        if (!flipped && String(argv[argv.length - 1]).endsWith('/issues/comments/502')) {
          flipped = true
          s.reviewers = [{ login: 'dora', node_id: 'N_dora' }]
        }
        return base(argv, timeoutMs)
      }
      const report = checkMilestone(inputFor(s, { call }))
      expect(flipped).toBe(true)
      expect(codesOf(report)).toContain('api-review-source-changed@-')
      expect(report.pass).toBe(false)
    },
  )
  it(
    'reports source-changed when the card is dispatched again during the fold',
    { tags: ['slow'] },
    () => {
      const s = state()
      signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
      const base = gh(s).call
      let flipped = false
      const call: GhRead = (argv, timeoutMs) => {
        if (!flipped && String(argv[argv.length - 1]).endsWith('/issues/comments/502')) {
          flipped = true
          s.attempt = '5-a2'
        }
        return base(argv, timeoutMs)
      }
      const report = checkMilestone(
        inputFor(s, { call, resolveTrusted: () => trusted(s, { binding: bindingOf('5-a1') }) }),
      )
      expect(flipped).toBe(true)
      expect(codesOf(report)).toContain('api-review-source-changed@-')
    },
  )
  it(
    'takes the repository node ID from the platform, not from the identity file',
    { tags: ['slow'] },
    () => {
      const s = state()
      post(s, world.registrationAll)
      s.repoNode = 'R_other'
      const report = checkMilestone(inputFor(s))
      expect(codesOf(report)).toContain('api-review-owner-identity-mismatch@pkg/b')
      expect(report.pass).toBe(false)
    },
  )
})

describe('tool facts of the milestone path', () => {
  const other = () => ({ kind: 'known', version: '0.0.19', typescriptVersion: '6.0.0' }) as const
  it(
    'refuses when the installed toolchain differs from the version the path needs',
    { tags: ['slow'] },
    () => {
      const s = state()
      signed(s, world.registrationAll, { 'pkg/b': 'additive', 'pkg/c': 'additive' })
      const report = checkMilestone(inputFor(s, { toolchain: other }))
      expect(report).toMatchObject({ exit: 2, pass: false })
      expect(JSON.stringify(report.findings)).toContain('0.0.19 is installed')
      expect(draftMilestone(inputFor(s, { toolchain: other })).bundle).toBeNull()
    },
  )
  it('records the installed TypeScript version in the Comparison', { tags: ['slow'] }, () => {
    const s = state()
    post(s, world.registrationAll)
    const facts = toolchainFacts()
    if (facts.kind !== 'known') throw new Error('toolchain unavailable')
    const draft = draftMilestone(inputFor(s))
    expect(draft.bundle?.comparisons[0]?.tool).toMatchObject({
      version: facts.version,
      typescriptVersion: facts.typescriptVersion,
    })
  })
})

describe('draft-milestone', () => {
  it(
    'drafts exactly the review members with a stable identity and no conclusion',
    { tags: ['slow'] },
    () => {
      const s = state()
      post(s, world.registrationAll)
      const draft = draftMilestone(inputFor(s))
      expect(draft.exit).toBe(0)
      expect(draft.bundle?.comparisons.map(c => c.member)).toEqual(['pkg/b', 'pkg/c'])
      expect(draft.bundle?.raw.exitCode).toBe(1)
      const first = draft.bundle?.comparisons[0]
      expect(first).toMatchObject({
        head: world.head,
        targetBase: world.base,
        ownerIdentity: { lineId: 'alpha', owner: ALICE },
        before: { commit: world.base },
        after: { commit: world.head },
        scope: { kind: 'milestone', baselineIssue: { number: ISSUE }, milestone: { number: 7 } },
      })
      expect(first?.reviewMembers).toEqual(['pkg/b', 'pkg/c'])
      expect(first?.checkedMembers).toEqual(['pkg/a', 'pkg/b', 'pkg/c'])
    },
  )

  it('writes no draft for an unfinished baseline read', { tags: ['slow'] }, () => {
    const s = state()
    const draft = draftMilestone(inputFor(s))
    expect(draft.bundle).toBeNull()
    expect(draft.exit).toBe(2)
  })
})
