// @module-tag slow
// Slow: a real task worktree with a local bare remote, unit record tags, the installed
// omne-contract-api, a copy of the dev-flow sources, and CLI processes. GitHub is a stand-in that
// answers by request path from one map. Nothing reads or writes the real platform.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { GhReadError, type GhRead } from '../src/delivery/github-read.ts'
import { draftRi, reviewRi } from '../src/integration/api-review-draft.ts'
import { git } from '../src/integration/git.ts'
import {
  contracts,
  MEMBERS,
  SNAPSHOT_TEMPLATE,
  write,
  writeSnapshots,
} from './fixtures/contract-api.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'
import { body as cardBody, integrationFixture, setGate } from './fixtures/integration.ts'
import { r1DynamicIdentityCheck } from './support/r1-dynamic-identity-check.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const DEV_FLOW = fileURLToPath(new URL('..', import.meta.url))
const LINES_FILE = 'docs/engineering/delivery-lines.json'
const OWNERS_FILE = 'docs/engineering/api-review-owners.json'
const REPO = 'owner/repo'
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const MARKER = 'omne-api-semantic-review:v1'

const lines = {
  schemaVersion: 1,
  integration: { track: 'runtime', paths: ['apps'] },
  shared: [],
  lines: [
    {
      id: 'tools-line',
      title: '工具',
      owner: 'alice',
      track: null,
      paths: ['pkg', 'tools', 'docs'],
      contracts: Object.keys(MEMBERS),
    },
  ],
}
const ADOPTION_URL = `https://github.com/${REPO}/issues/10#issuecomment-501`
const ADOPTION_BODY = 'accept line tools-line: alice / N_alice'
const manifest = {
  schemaVersion: 1,
  repository: { name: REPO, nodeId: 'R_repo' },
  owners: [
    {
      lineId: 'tools-line',
      owner: { login: 'alice', nodeId: 'N_alice' },
      adoption: {
        comment: {
          url: ADOPTION_URL,
          bodySha256: sha(ADOPTION_BODY),
          updatedAt: '2026-11-01T04:39:28Z',
        },
        authorNodeId: 'N_alice',
      },
    },
  ],
}
const A_REVIEW = 'export interface A {\n    b?: number;\n}\n'

type Responses = Record<string, unknown>
const stub =
  (responses: Responses, calls: string[] = []): GhRead =>
  argv => {
    const path = String(argv[argv.length - 1]).split('?')[0] as string
    calls.push(path)
    if (!(path in responses)) throw new GhReadError({ message: 'Not Found', status: '404' })
    return responses[path]
  }
const comment = (id: number, issue: number, login: string, nodeId: string, text: string) => ({
  id,
  html_url: `https://github.com/${REPO}/issues/${issue}#issuecomment-${id}`,
  created_at: `2026-11-01T0${id % 10}:00:00Z`,
  updated_at: `2026-11-01T0${id % 10}:00:00Z`,
  user: { login, node_id: nodeId },
  body: text,
})

type Fixture = ReturnType<typeof integrationFixture>
function gateMerge(
  f: Fixture,
  branch: string,
  pr: number,
  target = 'refs/heads/integration/runtime',
) {
  git(f.root, ['merge', '-q', '--no-ff', branch, '-m', `Merge pull request #${pr} from ${branch}`])
  const merge = git(f.root, ['rev-parse', 'HEAD'])
  git(f.root, ['push', '-q', 'origin', `${merge}:refs/tags/omne/gate/unit/${merge}`])
  git(f.remote, [
    'tag',
    '-f',
    '-a',
    `omne/gate/unit/${merge}`,
    '-m',
    JSON.stringify({
      schema: 'omne-gate-record:v1',
      target,
      base: 'b'.repeat(40),
      head: 'c'.repeat(40),
      result: merge,
      pr,
      mode: 'merge',
      confirmedBy: 'human',
      run: 'https://github.com/owner/repo/actions/runs/1',
      gate: 'a'.repeat(40),
    }),
    merge,
  ])
  return merge
}
function branchWith(f: Fixture, name: string, work: () => void): void {
  git(f.root, ['checkout', '-q', '-b', name])
  work()
  git(f.root, ['add', '-A'])
  git(f.root, ['commit', '-q', '-m', `work of ${name}`])
  git(f.root, ['checkout', '-q', 'track'])
}

/**
 * Main holds the contract members and every authority file. The track `integration/runtime`
 * gets PR #9 (a dev-flow source change) and PR #10 (a review change of `pkg/a`). The checkout
 * stays on the track head.
 */
function build() {
  const f = integrationFixture({ lines })
  homes.push(f.home)
  const root = f.root
  write(root, '.gitignore', 'tmp/\nnode_modules\n')
  contracts(root, { members: LINES_FILE, snapshot: SNAPSHOT_TEMPLATE })
  writeSnapshots(root)
  cpSync(SRC, join(root, 'tools/dev-flow/src'), { recursive: true })
  write(root, 'tools/dev-flow/package.json', '{}\n')
  for (const file of ['integration', 'delivery'])
    write(root, `docs/engineering/${file}.md`, `${file}\n`)
  write(root, 'docs/verification.md', 'verification\n')
  write(root, OWNERS_FILE, JSON.stringify(manifest))
  write(root, 'pnpm-lock.yaml', 'lock\n')
  symlinkSync(join(DEV_FLOW, 'node_modules'), join(root, 'tools/dev-flow/node_modules'), 'dir')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'Base with contracts and authority files'])
  const base = git(root, ['rev-parse', 'HEAD'])
  git(root, ['push', '-q', '-f', 'origin', `${base}:refs/heads/main`])
  git(root, ['checkout', '-q', '-b', 'track', base])
  branchWith(f, 'human/issue-5-tool', () =>
    write(root, 'tools/dev-flow/src/marker.ts', 'export {}\n'),
  )
  const tool = gateMerge(f, 'human/issue-5-tool', 9)
  branchWith(f, 'human/issue-5-x', () => {
    write(root, 'pkg/a/dist/index.d.ts', A_REVIEW)
    writeSnapshots(root)
  })
  gateMerge(f, 'human/issue-5-x', 10)
  git(root, ['push', '-q', '-f', 'origin', 'track:refs/heads/integration/runtime'])
  setGate(f.remote, JSON.stringify({ main: base, 'integration/runtime': base }))

  const binding = {
    schemaVersion: 2 as const,
    issue: { repository: REPO, id: 'I_5', number: 5, url: `https://github.com/${REPO}/issues/5` },
    revision: 1,
    attempt: '5-a1',
    responsible: 'human',
    branch: 'human/issue-5-x',
    route: { kind: 'track' as const, track: 'runtime' },
    completionTarget: 'stable' as const,
    taskBase: base,
    writeScope: ['pkg/a'],
    dispatch: `https://github.com/${REPO}/issues/5#issuecomment-55`,
    conditions: [],
    authorization: [],
    line: 'tools-line',
    nature: 'impl' as const,
    contractChange: 'additive' as const,
    milestone: 'M1',
  }
  const decision = {
    schemaVersion: 1,
    responsible: 'dora',
    basis: ['x'],
    action: 'dispatch',
    task: binding,
    confirmations: [],
  }
  const evidenceBody = 'investigation: A.a removed on purpose; consumers read b only'
  const evidence = comment(60, 9, 'carol', 'N_carol', evidenceBody)
  const pull = (n: number, head: string, headRef: string, text: string) => ({
    number: n,
    node_id: `PR_${n}`,
    html_url: `https://github.com/${REPO}/pull/${n}`,
    head: { ref: headRef, sha: head },
    base: { ref: 'integration/runtime' },
    body: text,
  })
  const cardText = `## 所含的卡\n\n- #5 revision 1 attempt \`5-a1\`：无\n\n## 契约变化\n\n- pkg/a：additive\n`
  const responses: Responses = {
    [`repos/${REPO}`]: { node_id: 'R_repo' },
    'users/alice': { login: 'alice', node_id: 'N_alice' },
    [`repos/${REPO}/environments/publish`]: {
      protection_rules: [
        {
          type: 'required_reviewers',
          reviewers: [
            { type: 'User', reviewer: { login: 'alice', node_id: 'N_alice' } },
            { type: 'User', reviewer: { login: 'dora', node_id: 'N_dora' } },
          ],
        },
      ],
    },
    [`repos/${REPO}/pulls/9`]: pull(
      9,
      tool,
      'human/issue-5-tool',
      cardText.replace('- pkg/a：additive', '无'),
    ),
    [`repos/${REPO}/pulls/10`]: pull(10, base, 'human/issue-5-x', cardText),
    [`repos/${REPO}/pulls/30`]: pull(30, base, 'main', 'sync'),
    [`repos/${REPO}/issues/5`]: {
      number: 5,
      node_id: 'I_5',
      html_url: binding.issue.url,
      body: cardBody(binding, [], {
        line: 'tools-line',
        nature: 'impl',
        contractChange: 'additive',
      }),
      labels: [],
      milestone: { title: 'M1' },
    },
    [`repos/${REPO}/issues/5/comments`]: [],
    [`repos/${REPO}/issues/comments/55`]: comment(
      55,
      5,
      'dora',
      'N_dora',
      `\`\`\`json omne-integration-authority:v1\n${JSON.stringify(decision)}\n\`\`\``,
    ),
    [`repos/${REPO}/issues/comments/60`]: evidence,
    [`repos/${REPO}/issues/comments/501`]: {
      html_url: ADOPTION_URL,
      body: ADOPTION_BODY,
      updated_at: '2026-11-01T04:39:28Z',
      user: { login: 'alice', node_id: 'N_alice' },
    },
  }
  const entry = join(root, 'tools/dev-flow/src/integration/cli.ts')
  return { f, root, base, responses, evidence, evidenceBody, entry }
}
type Fx = ReturnType<typeof build>

/**
 * The tool prefix goes to the upstream first (PR #20 promotes PR #9 only) and the upstream is
 * synced back into the track (PR #30). Then only PR #10 lies beyond the upstream.
 */
function promoteToolPrefix(fx: Fx): void {
  const { f, root, base } = fx
  const toolMerge = git(root, [
    'log',
    '--first-parent',
    '--format=%H',
    '--grep=#9 from',
    'track',
  ]).split('\n')[0] as string
  git(root, ['checkout', '-q', '-B', 'main-copy', base])
  gateMerge(f, toolMerge, 20, 'refs/heads/main')
  git(root, ['push', '-q', '-f', 'origin', 'main-copy:refs/heads/main'])
  git(root, ['checkout', '-q', 'track'])
  git(root, ['branch', '-q', '-f', 'main', 'main-copy'])
  gateMerge(f, 'main', 30)
  git(root, ['push', '-q', '-f', 'origin', 'track:refs/heads/integration/runtime'])
}

function attest(fx: Fx, comparison: unknown, author = { login: 'alice', nodeId: 'N_alice' }) {
  const record = {
    schemaVersion: 1,
    repository: { name: REPO, nodeId: 'R_repo' },
    operationId: 'op-1',
    responsible: author,
    action: 'attest',
    authority: { kind: 'owner' },
    review: {
      comparison,
      conclusion: 'additive',
      rationale: 'The removed property was never public.',
      evidence: [
        {
          url: String((fx.evidence as { html_url: string }).html_url),
          bodySha256: sha(fx.evidenceBody),
          updatedAt: (fx.evidence as { updated_at: string }).updated_at,
        },
      ],
      consumerScope: 'RI of the runtime track only',
    },
    replaces: [],
  }
  return comment(
    70,
    5,
    author.login,
    author.nodeId,
    `\`\`\`json ${MARKER}\n${JSON.stringify(record)}\n\`\`\``,
  )
}
const input = (fx: Fx, calls: string[] = []) => ({
  root: fx.root,
  entry: fx.entry,
  track: 'runtime',
  reviewIssue: 5,
  call: stub(fx.responses, calls),
})
function comparisonOf(fx: Fx) {
  const { report, bundle } = draftRi(input(fx))
  expect(report.findings).toEqual([])
  expect(bundle?.comparisons).toHaveLength(1)
  return (bundle?.comparisons ?? [])[0]
}
/** Runs the ri-notes CLI as a process whose `gh` answers from `responses`. */
function cli(fx: Fx, responses: Responses, ...args: string[]) {
  const map = join(fx.f.home, 'platform.json')
  const bin = join(fx.f.home, 'ri-review-bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(map, JSON.stringify(responses))
  writeGh(
    bin,
    `#!/usr/bin/env node
import { readFileSync } from 'node:fs'
const map = JSON.parse(readFileSync(${JSON.stringify(map)}, 'utf8'))
const key = process.argv.at(-1).split('?')[0]
if (!(key in map)) { process.stdout.write('{"message":"Not Found","status":"404"}'); process.exit(1) }
process.stdout.write(JSON.stringify(map[key]))
`,
  )
  return spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      fx.entry,
      'ri-notes',
      '--track',
      'runtime',
      '--root',
      fx.root,
      ...args,
    ],
    { cwd: fx.root, encoding: 'utf8', env: { ...process.env, ...ghEnv(bin) } },
  )
}

describe('RI entry of the semantic review: promotion order', () => {
  it('returns self-authorization while a dev-flow change shares the range, and passes after the prefix was promoted', () => {
    const fx = build()
    const calls: string[] = []
    const first = reviewRi(input(fx, calls))
    expect(first.report.exit).toBe(1)
    expect(first.report.findings.map(item => item.code)).toEqual(['api-review-self-authorization'])
    expect(JSON.stringify(first.report.findings[0]?.detail)).toContain('tools/dev-flow/src')
    // The check stops before the CLI, the PRs, the carrier and the platform account reads.
    expect(
      calls.filter(
        path => path.startsWith('users/') || path.includes('/pulls/') || path.includes('/comments'),
      ),
    ).toEqual([])

    promoteToolPrefix(fx)
    fx.responses[`repos/${REPO}/issues/5/comments`] = [attest(fx, comparisonOf(fx))]
    const second = reviewRi(input(fx))
    expect(second.report.findings).toEqual([])
    expect(second.exit).toBe(0)
    expect(second.notes?.contracts).toEqual([
      expect.objectContaining({ path: 'pkg/a', level: 'additive' }),
    ])
    expect(second.notes?.findings.map(item => item.code)).not.toContain('contract-diff-mismatch')
  })
})

describe('RI entry of the semantic review: the CLI', () => {
  it('refuses a platform account that took over the owner login, though the r1 checks pass (C1)', () => {
    const fx = build()
    promoteToolPrefix(fx)
    const comparison = comparisonOf(fx)
    const bob = { login: 'alice', nodeId: 'N_bob' }
    const hijacked: Responses = {
      ...fx.responses,
      'users/alice': { login: 'alice', node_id: 'N_bob' },
      [`repos/${REPO}/environments/publish`]: {
        protection_rules: [
          {
            type: 'required_reviewers',
            reviewers: [
              { type: 'User', reviewer: { login: 'alice', node_id: 'N_bob' } },
              { type: 'User', reviewer: { login: 'dora', node_id: 'N_dora' } },
            ],
          },
        ],
      },
      [`repos/${REPO}/issues/5/comments`]: [attest(fx, comparison, bob)],
    }
    expect(
      r1DynamicIdentityCheck({
        repository: REPO,
        ownerLogin: 'alice',
        author: bob,
        call: stub(hijacked),
      }),
    ).toEqual({ passed: true, failures: [] })
    const result = cli(fx, hijacked, '--review-issue', '5', '--format', 'json')
    expect(result.status, result.stderr).toBe(1)
    const out = JSON.parse(result.stdout) as { semanticReview: { findings: { code: string }[] } }
    expect(out.semanticReview.findings.map(item => item.code)).toEqual([
      'api-review-owner-identity-mismatch',
    ])
  })

  it('keeps the old behavior and exit code without --review-issue', () => {
    const fx = build()
    promoteToolPrefix(fx)
    const responses = {
      ...fx.responses,
      [`repos/${REPO}/issues/5/comments`]: [attest(fx, comparisonOf(fx))],
    }
    const result = cli(fx, responses, '--format', 'json')
    // The old rule: a review member only matches a breaking declaration.
    expect(result.status, result.stderr).toBe(1)
    const out = JSON.parse(result.stdout) as Record<string, unknown> & {
      findings: { code: string }[]
    }
    expect('semanticReview' in out).toBe(false)
    expect(out.findings.map(item => item.code)).toContain('contract-diff-mismatch')
  })

  it('exits 0 with --review-issue and a matching attest', () => {
    const fx = build()
    promoteToolPrefix(fx)
    const responses = {
      ...fx.responses,
      [`repos/${REPO}/issues/5/comments`]: [attest(fx, comparisonOf(fx))],
    }
    const result = cli(fx, responses, '--review-issue', '5', '--format', 'json')
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ semanticReview: { exit: 0 } })
  })

  it('exits 2 when the snapshot difference is unavailable on the new path', () => {
    const fx = build()
    promoteToolPrefix(fx)
    // The checkout is not at the range head, so the snapshot difference cannot run.
    git(fx.root, ['checkout', '-q', fx.base])
    const result = cli(fx, fx.responses, '--review-issue', '5', '--format', 'json')
    expect(result.status, result.stderr).toBe(2)
    const out = JSON.parse(result.stdout) as { semanticReview: { findings: { code: string }[] } }
    expect(out.semanticReview.findings.map(item => item.code)).toEqual(['api-review-input-unknown'])
    const inProcess = reviewRi(input(fx))
    expect(inProcess.exit).toBe(2)
  })
})
