// A new entry that augments an interface of its own package with `declare module` (candidate-r4.md
// 8.1 to 8.3). The installed, pinned omne-contract-api cannot prove such a change additive, so the
// raw run refuses with exit 1. The semantic review lets one valid additive record carry the member,
// and the report shows the raw exit code beside the composed result. Git is a real temporary
// repository. GitHub is a stand-in that answers by request path.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseBaselineText, renderBaselineBlock } from '../src/delivery/baseline.ts'
import type { GhRead } from '../src/delivery/github-read.ts'
import { checkMilestone, observeMilestone } from '../src/integration/contract-baseline-review.ts'
import { contractApiCommand, contractApiEnv } from '../src/integration/contract-diff.ts'
import { git } from '../src/integration/git.ts'
import { contracts, SNAPSHOT_TEMPLATE, write, writeSnapshots } from './fixtures/contract-api.ts'
import { body as cardBody, init } from './fixtures/integration.ts'

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
const MEMBER = 'pkg/a'
const CARD_URL = `https://github.com/${REPO}/issues/5`
const DISPATCH_URL = `${CARD_URL}#issuecomment-55`

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
        comment: { url: ADOPTION_URL, bodySha256: sha(ADOPTION_BODY), updatedAt: ADOPTION_UPDATED },
        authorNodeId: 'N_alice',
      },
    },
  ],
}
/** The new entry: it adds one optional property to `A` of the main entry of the same package. */
const AUGMENT_ENTRY = `import '@fixture/a'
declare module '@fixture/a' {
    interface A {
        added?: number
    }
}
export {}
`

let root = ''
let entry = ''
let base = ''
let head = ''
let registrationAll = ''

function commitAll(message: string): string {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '--allow-empty', '-m', message])
  return git(root, ['rev-parse', 'HEAD'])
}

// Builds a real temporary repository and runs the installed CLI; this can exceed the default hook timeout.
beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-augment-')))
  init(root)
  write(root, '.gitignore', 'node_modules/\n')
  contracts(
    root,
    { members: 'docs/engineering/delivery-lines.json', snapshot: SNAPSHOT_TEMPLATE },
    LINES,
  )
  write(root, 'docs/engineering/api-review-owners.json', JSON.stringify(MANIFEST, null, 2))
  write(root, 'docs/engineering/integration-policy.json', JSON.stringify({ repository: REPO }))
  for (const path of [
    'docs/engineering/integration.md',
    'docs/engineering/delivery.md',
    'docs/verification.md',
  ])
    write(root, path, 'text\n')
  write(root, 'tools/dev-flow/package.json', '{}\n')
  const entryPath = 'tools/dev-flow/src/integration/api-review-cli.ts'
  write(root, entryPath, '// entry\n')
  write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n')
  writeSnapshots(root)
  base = commitAll('base')
  const command = contractApiCommand()
  if (!('file' in command)) throw new Error(command.reason)
  const out = spawnSync(
    command.file,
    [...command.args, '--baseline-write', base, '--milestone', 'M1', '--json', '--root', root],
    { cwd: root, encoding: 'utf8', env: contractApiEnv(root) },
  )
  if (out.status !== 0) throw new Error(out.stderr)
  registrationAll = renderBaselineBlock(parseBaselineText(out.stdout))

  // The change under test: a second entry that augments the interface of the main entry.
  write(
    root,
    'pkg/a/package.json',
    JSON.stringify({
      name: '@fixture/a',
      type: 'module',
      exports: {
        '.': { types: './dist/index.d.ts' },
        './augment': { types: './dist/augment.d.ts' },
      },
    }),
  )
  write(root, 'pkg/a/dist/augment.d.ts', AUGMENT_ENTRY)
  writeSnapshots(root)
  head = commitAll('head')
  entry = join(root, entryPath)
}, 120_000)
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** The owner task of the checkout: a version 2 binding of card 5. */
function bindingOf() {
  return {
    schemaVersion: 2 as const,
    issue: { repository: REPO, id: 'I_5', number: 5, url: CARD_URL },
    revision: 1,
    attempt: '5-a1',
    responsible: 'human',
    branch: 'human/task',
    route: { kind: 'track' as const, track: 'mainline' },
    completionTarget: 'stable' as const,
    taskBase: base,
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
function dispatchText(): string {
  const decision = {
    schemaVersion: 1,
    responsible: 'alice',
    basis: ['x'],
    action: 'dispatch',
    task: bindingOf(),
    confirmations: [],
  }
  return `\`\`\`json omne-integration-authority:v1
${JSON.stringify(decision)}
\`\`\``
}

type State = { comments: unknown[] }
function gh(state: State): GhRead {
  return argv => {
    const path = String(argv[argv.length - 1])
    if (path.startsWith('users/')) return { login: 'alice', node_id: 'N_alice' }
    if (path === `repos/${REPO}/environments/publish`)
      return {
        protection_rules: [
          {
            type: 'required_reviewers',
            reviewers: [{ type: 'User', reviewer: { login: 'alice', node_id: 'N_alice' } }],
          },
        ],
      }
    if (path === `repos/${REPO}`) return { node_id: REPOSITORY.nodeId }
    if (path === `repos/${REPO}/issues/5`)
      return {
        number: 5,
        node_id: 'I_5',
        html_url: CARD_URL,
        body: cardBody(bindingOf(), [], {
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
        body: dispatchText(),
      }
    if (path === `repos/${REPO}/issues/${ISSUE}`)
      return {
        number: ISSUE,
        node_id: 'I_20',
        milestone: { number: 7, node_id: 'M_7', title: 'M1' },
      }
    if (path === `repos/${REPO}/issues/${ISSUE}/comments?per_page=100&page=1`) return state.comments
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
}
function post(state: State, body: string): void {
  const id = state.comments.length + 1
  const at = `2026-11-01T01:00:${String(id).padStart(2, '0')}Z`
  state.comments.push({
    id,
    html_url: `https://github.com/${REPO}/issues/${ISSUE}#issuecomment-${id}`,
    created_at: at,
    updated_at: at,
    user: { login: 'alice', node_id: 'N_alice' },
    body,
  })
}
function attest(comparison: unknown): string {
  const record = {
    schemaVersion: 1,
    repository: REPOSITORY,
    operationId: 'op-augment',
    responsible: ALICE,
    action: 'attest',
    authority: { kind: 'owner' },
    review: {
      comparison,
      conclusion: 'additive',
      rationale: 'The augmentation adds one optional property.',
      evidence: [
        { url: EVIDENCE_URL, bodySha256: sha(EVIDENCE_BODY), updatedAt: EVIDENCE_UPDATED },
      ],
      consumerScope: 'none',
    },
    replaces: [],
  }
  return `\`\`\`json omne-api-semantic-review:v1\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`
}
const input = (state: State) => ({
  root,
  entry,
  baselineIssue: ISSUE,
  semanticReview: true,
  call: gh(state),
  resolveTrusted: () => ({
    candidate: head,
    targetBase: base,
    targetBranch: BRANCH,
    binding: bindingOf(),
  }),
})

describe('a new entry that augments an interface with declare module', () => {
  it('keeps raw exit 1 beside an additive conclusion of a valid record', { tags: ['slow'] }, () => {
    const state: State = { comments: [] }
    post(state, registrationAll)
    const seen = observeMilestone(input(state))
    if (seen.kind !== 'observed') throw new Error(JSON.stringify(seen.findings))
    expect(seen.comparisons.map(item => item.member)).toEqual([MEMBER])
    post(state, attest(seen.comparisons[0]))

    const report = checkMilestone(input(state))
    expect(report.findings).toEqual([])
    expect(report).toMatchObject({ exit: 0, pass: true, rawExitCode: 1, refused: true })
    expect(report.members.find(item => item.member === MEMBER)).toMatchObject({
      rawClassification: 'review',
      semanticClassification: 'additive',
      requiredLevel: 'additive',
    })
  })

  it('stays refused with raw exit 1 and no record', { tags: ['slow'] }, () => {
    const state: State = { comments: [] }
    post(state, registrationAll)
    const report = checkMilestone(input(state))
    expect(report).toMatchObject({ exit: 1, pass: false, rawExitCode: 1 })
    expect(report.findings.map(item => `${item.code}@${item.member}`)).toEqual([
      `api-review-missing@${MEMBER}`,
    ])
  })
})
