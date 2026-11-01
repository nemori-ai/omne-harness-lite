// @module-tag slow
// Slow: real temporary Git checkouts with the installed omne-contract-api, a copy of the dev-flow
// sources, and one CLI process. GitHub is a stand-in that answers by request path from one map.
// Nothing reads or writes the real platform.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { changeScope } from '../src/delivery/change-scope.ts'
import { GhReadError, type GhRead } from '../src/delivery/github-read.ts'
import { writeContext } from '../src/integration/context.ts'
import { cardReviewHook, draftCard } from '../src/integration/api-review-draft.ts'
import { git, repository } from '../src/integration/git.ts'
import {
  contracts,
  MEMBERS,
  SNAPSHOT_TEMPLATE,
  write,
  writeSnapshots,
} from './fixtures/contract-api.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'
import { body as cardBody, integrationFixture } from './fixtures/integration.ts'
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
/** `pkg/a` loses its property `a`: the CLI classifies it as `review`. */
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

function build({
  contractChange = 'additive',
}: { contractChange?: 'none' | 'additive' | 'breaking' } = {}) {
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
  mkdirSync(join(root, 'tools/dev-flow'), { recursive: true })
  symlinkSync(join(DEV_FLOW, 'node_modules'), join(root, 'tools/dev-flow/node_modules'), 'dir')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'Base with contracts and authority files'])
  const base = git(root, ['rev-parse', 'HEAD'])
  git(root, [
    'push',
    '-q',
    '-f',
    'origin',
    `${base}:refs/heads/main`,
    `${base}:refs/heads/integration/runtime`,
  ])
  const info = repository(root)
  const binding = {
    schemaVersion: 2 as const,
    issue: {
      repository: REPO,
      id: 'I_5',
      number: 5,
      url: `https://github.com/${REPO}/issues/5`,
    },
    revision: 1,
    attempt: '5-a1',
    responsible: 'human',
    branch: 'human/task',
    route: { kind: 'track' as const, track: 'runtime' },
    completionTarget: 'stable' as const,
    taskBase: base,
    writeScope: ['pkg/a', 'docs/engineering/integration.md', 'tmp/issue-5'],
    dispatch: `https://github.com/${REPO}/issues/5#issuecomment-55`,
    conditions: [],
    authorization: [],
    line: 'tools-line',
    nature: 'impl' as const,
    contractChange,
    milestone: 'M1',
  }
  writeContext(root, {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    targetBase: base,
    tasks: [{ binding, taskSource: base }],
    ownerTask: binding,
    operation: null,
  })
  // The card's own work.
  write(root, 'pkg/a/dist/index.d.ts', A_REVIEW)
  writeSnapshots(root)
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'card work'])

  const evidenceBody = 'investigation: A.a removed on purpose; consumers read b only'
  const evidence = comment(60, 9, 'carol', 'N_carol', evidenceBody)
  const decision = {
    schemaVersion: 1,
    responsible: 'dora',
    basis: ['x'],
    action: 'dispatch',
    task: binding,
    confirmations: [],
  }
  const dispatchText = `\`\`\`json omne-integration-authority:v1\n${JSON.stringify(decision)}\n\`\`\``
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
    [`repos/${REPO}/issues/5`]: {
      number: 5,
      node_id: 'I_5',
      html_url: binding.issue.url,
      body: cardBody(binding, [], { line: 'tools-line', nature: 'impl', contractChange }),
      labels: [],
      milestone: { title: 'M1' },
    },
    [`repos/${REPO}/issues/5/comments`]: [],
    [`repos/${REPO}/issues/comments/55`]: comment(55, 5, 'dora', 'N_dora', dispatchText),
    [`repos/${REPO}/issues/comments/60`]: evidence,
    [`repos/${REPO}/issues/comments/501`]: {
      html_url: ADOPTION_URL,
      body: ADOPTION_BODY,
      updated_at: '2026-11-01T04:39:28Z',
      user: { login: 'alice', node_id: 'N_alice' },
    },
  }
  const entry = join(root, 'tools/dev-flow/src/delivery/change-scope-cli.ts')
  return { f, root, base, binding, responses, evidence, evidenceBody, entry }
}
type Fx = ReturnType<typeof build>

/** The attest comment of `author` for `comparison`. */
function attest(
  fx: Fx,
  comparison: unknown,
  author = { login: 'alice', nodeId: 'N_alice' },
  conclusion: 'additive' | 'breaking' = 'additive',
) {
  const record = {
    schemaVersion: 1,
    repository: { name: REPO, nodeId: 'R_repo' },
    operationId: 'op-1',
    responsible: author,
    action: 'attest',
    authority: { kind: 'owner' },
    review: {
      comparison,
      conclusion,
      rationale: 'The removed property was never public.',
      evidence: [
        {
          url: String((fx.evidence as { html_url: string }).html_url),
          bodySha256: sha(fx.evidenceBody),
          updatedAt: (fx.evidence as { updated_at: string }).updated_at,
        },
      ],
      consumerScope: 'card 5 only',
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
function draftComparison(fx: Fx) {
  const { report, bundle } = draftCard({
    root: fx.root,
    entry: fx.entry,
    call: stub(fx.responses),
  })
  expect(report.findings).toEqual([])
  expect(bundle?.comparisons).toHaveLength(1)
  return (bundle?.comparisons ?? [])[0]
}
const run = (fx: Fx, calls: string[] = []) =>
  changeScope({
    root: fx.root,
    review: cardReviewHook({ entry: fx.entry, call: stub(fx.responses, calls) }),
  })
const carrier = () => `repos/${REPO}/issues/5/comments`

describe('card entry of the semantic review', () => {
  it('lets an exact owner attest carry a review member that the additive card declared', () => {
    const fx = build()
    fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
    const report = run(fx)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic).toMatchObject({ exit: 0, levels: { 'pkg/a': 'additive' } })
    expect(report.findings).toEqual([])
  })

  it('does not let a card that declared none consume an additive conclusion', () => {
    const fx = build({ contractChange: 'none' })
    fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
    const report = run(fx)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic?.exit).toBe(0)
    expect(report.findings.map(item => item.code)).toEqual(['contract-exceeds-declared'])
  })

  it('keeps the conservative rule when the carrier has no record', () => {
    const fx = build()
    const calls: string[] = []
    const report = run(fx, calls)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic).toBeUndefined()
    expect(report.findings.map(item => item.code)).toEqual(['contract-exceeds-declared'])
    // Only the carrier was read to look for records.
    expect(calls).toEqual([carrier()])
  })

  it('returns self-authorization when the same card edits integration.md, before any platform read', () => {
    const fx = build()
    const before = draftComparison(fx)
    write(fx.root, 'docs/engineering/integration.md', 'integration, edited by the card\n')
    git(fx.root, ['add', '-A'])
    git(fx.root, ['commit', '-q', '-m', 'edit the rule'])
    fx.responses[carrier()] = [attest(fx, before)]
    const calls: string[] = []
    const report = run(fx, calls)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic?.exit).toBe(1)
    expect(report.semantic?.findings.map(item => item.code)).toEqual([
      'api-review-self-authorization',
    ])
    expect(JSON.stringify(report.semantic?.findings[0]?.detail)).toContain(
      'docs/engineering/integration.md',
    )
    // The enablement check comes first: not even the carrier was read.
    expect(calls).toEqual([])
  })

  it('reads nothing from the platform when the entry lies outside the checkout (section 10)', () => {
    const fx = build()
    fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
    const calls: string[] = []
    const report = changeScope({
      root: fx.root,
      review: cardReviewHook({
        entry: join(fx.f.home, 'elsewhere', 'change-scope-cli.ts'),
        call: stub(fx.responses, calls),
      }),
    })
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic?.findings.map(item => item.code)).toEqual([
      'api-review-entry-outside-root',
    ])
    expect(calls).toEqual([])
  })

  it('ignores a marker comment of an account that is not an owner of the identity file', () => {
    const fx = build()
    const calls: string[] = []
    const marked = '```json ' + MARKER + '\n{}\n```'
    fx.responses[carrier()] = [comment(71, 5, 'mallory', 'N_mallory', marked)]
    const report = run(fx, calls)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic).toBeUndefined()
    expect(report.findings.map(item => item.code)).toEqual(['contract-exceeds-declared'])
    expect(calls).toEqual([carrier()])
  })

  it('judges a valid breaking conclusion by the original rule under a breaking binding', () => {
    const fx = build({ contractChange: 'breaking' })
    fx.responses[carrier()] = [attest(fx, draftComparison(fx), undefined, 'breaking')]
    const report = run(fx)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic?.exit).toBe(0)
    expect(report.findings).toEqual([])
  })

  it('still asks for the breaking route when the binding does not declare breaking', () => {
    const fx = build()
    fx.responses[carrier()] = [attest(fx, draftComparison(fx), undefined, 'breaking')]
    const report = run(fx)
    if (!report.bound) throw new Error('bound tree expected')
    expect(report.semantic?.findings.map(item => item.code)).toContain(
      'api-review-breaking-route-required',
    )
  })

  it('refuses --lines together with the semantic review of a card that has review members', () => {
    const fx = build()
    fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
    expect(() =>
      changeScope({
        root: fx.root,
        linesFile: join(fx.root, LINES_FILE),
        review: cardReviewHook({ entry: fx.entry, call: stub(fx.responses) }),
      }),
    ).toThrow(/--lines/)
  })

  describe('the platform read again after the judgement', () => {
    /** Runs the hook; `flip` runs once, when the fold reads the evidence comment. */
    function runDrifting(fx: Fx, flip: () => void) {
      const base = stub(fx.responses)
      let flipped = false
      const call: GhRead = (argv, timeoutMs) => {
        if (!flipped && String(argv[argv.length - 1]).endsWith('/issues/comments/60')) {
          flipped = true
          flip()
        }
        return base(argv, timeoutMs)
      }
      const report = changeScope({
        root: fx.root,
        review: cardReviewHook({ entry: fx.entry, call }),
      })
      if (!report.bound) throw new Error('bound tree expected')
      expect(flipped).toBe(true)
      return report.semantic?.findings.map(item => item.code) ?? []
    }
    const sourceChanged = 'api-review-source-changed'
    it('is quiet when nothing changes', () => {
      const fx = build()
      fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
      expect(runDrifting(fx, () => undefined)).toEqual([])
    })
    it('reports source-changed when a reviewer is removed during the fold', () => {
      const fx = build()
      fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
      const codes = runDrifting(fx, () => {
        fx.responses[`repos/${REPO}/environments/publish`] = {
          protection_rules: [
            {
              type: 'required_reviewers',
              reviewers: [{ type: 'User', reviewer: { login: 'dora', node_id: 'N_dora' } }],
            },
          ],
        }
      })
      expect(codes).toContain(sourceChanged)
    })
    it('reports source-changed when the carrier gains a comment during the fold', () => {
      const fx = build()
      const first = attest(fx, draftComparison(fx))
      fx.responses[carrier()] = [first]
      const codes = runDrifting(fx, () => {
        fx.responses[carrier()] = [first, comment(72, 5, 'alice', 'N_alice', 'revoked later')]
      })
      expect(codes).toContain(sourceChanged)
    })
    it('reports source-changed when the card is dispatched again during the fold', () => {
      const fx = build()
      fx.responses[carrier()] = [attest(fx, draftComparison(fx))]
      const codes = runDrifting(fx, () => {
        const issue = fx.responses[`repos/${REPO}/issues/5`] as { body: string }
        issue.body = issue.body.replace('5-a1', '5-a2')
      })
      expect(codes).toContain(sourceChanged)
    })
  })

  it('refuses a platform account that took over the owner login, though the r1 checks pass (C1)', () => {
    const fx = build()
    const comparison = draftComparison(fx)
    // alice renamed; bob now owns the login `alice`. Lookup, comment author and reviewer are bob.
    const bob = { login: 'alice', nodeId: 'N_bob' }
    fx.responses['users/alice'] = { login: 'alice', node_id: 'N_bob' }
    fx.responses[`repos/${REPO}/environments/publish`] = {
      protection_rules: [
        {
          type: 'required_reviewers',
          reviewers: [
            { type: 'User', reviewer: { login: 'alice', node_id: 'N_bob' } },
            { type: 'User', reviewer: { login: 'dora', node_id: 'N_dora' } },
          ],
        },
      ],
    }
    fx.responses[carrier()] = [attest(fx, comparison, bob)]
    // Control: the r1 rule passes this fixture, so the fixture reproduces the hole.
    expect(
      r1DynamicIdentityCheck({
        repository: REPO,
        ownerLogin: 'alice',
        author: bob,
        call: stub(fx.responses),
      }),
    ).toEqual({ passed: true, failures: [] })
    // Target: the entry, as a CLI process, refuses on the node ID.
    const map = join(fx.f.home, 'platform.json')
    const bin = join(fx.f.home, 'card-bin')
    mkdirSync(bin)
    writeFileSync(map, JSON.stringify(fx.responses))
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
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', fx.entry, '--root', fx.root],
      { cwd: fx.root, encoding: 'utf8', env: { ...process.env, ...ghEnv(bin) } },
    )
    expect(result.status, result.stderr).toBe(1)
    const out = JSON.parse(result.stdout) as { semantic: { findings: { code: string }[] } }
    expect(out.semantic.findings.map(item => item.code)).toEqual([
      'api-review-owner-identity-mismatch',
    ])
  })
})
