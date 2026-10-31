// @module-tag slow
// ri-notes against a real task worktree and a local bare remote with unit record tags; the CLI
// cases start a Node process with a `gh` stand-in that serves fixed REST responses. The contract
// check runs the installed `omne-contract-api` against contract members in the same checkout.
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { GhRead } from '../src/delivery/github-read.ts'
import { snapshotContractDiff } from '../src/integration/contract-diff.ts'
import { git, GitError } from '../src/integration/git.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { riNotes } from '../src/integration/ri-notes.ts'
import { readUnit, riInput, trackFacts } from '../src/integration/ri-source.ts'
import {
  A_ADDITIVE,
  contracts,
  MEMBERS,
  SNAPSHOT_TEMPLATE,
  write,
  writeSnapshots,
} from './fixtures/contract-api.ts'
import {
  commit,
  gateRecord,
  integrationFixture,
  policyDocument,
  setGate,
  setStartTag,
  trackEntry,
} from './fixtures/integration.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
const lines = {
  schemaVersion: 1,
  integration: { track: 'runtime', paths: ['apps'] },
  shared: [],
  lines: [
    {
      id: 'tools-line',
      title: '工具',
      owner: 'human',
      track: null,
      paths: ['feature'],
      contracts: [],
    },
  ],
}
function unitRecord(result: string, pr: number, target = 'refs/heads/integration/runtime'): string {
  return JSON.stringify({
    schema: 'omne-gate-record:v1',
    target,
    base: 'b'.repeat(40),
    head: 'c'.repeat(40),
    result,
    pr,
    mode: 'merge',
    confirmedBy: 'human',
    run: 'https://github.com/owner/repo/actions/runs/1',
    gate: 'a'.repeat(40),
  })
}
type Fixture = ReturnType<typeof integrationFixture>
/** Merges `branch` into the checked-out branch as the gate would, and writes its unit tag. */
function gateMerge(f: Fixture, branch: string, pr: number, target?: string): string {
  git(f.root, ['merge', '-q', '--no-ff', branch, '-m', `Merge pull request #${pr} from ${branch}`])
  const merge = git(f.root, ['rev-parse', 'HEAD'])
  git(f.root, ['push', '-q', 'origin', `${merge}:refs/tags/omne/gate/unit/${merge}`])
  // The pushed tag is replaced by an annotated one on the remote, like the gate's record.
  git(f.remote, [
    'tag',
    '-f',
    '-a',
    `omne/gate/unit/${merge}`,
    '-m',
    unitRecord(merge, pr, target),
    merge,
  ])
  return merge
}
function feature(f: Fixture, branch: string, file: string): void {
  git(f.root, ['checkout', '-q', '-b', branch])
  commit(f.root, file, `${file}\n`)
  git(f.root, ['checkout', '-q', 'track'])
}
/**
 * The track `integration/runtime` gets three first-parent commits beyond main: a direct commit
 * at the cutover, a gate merge of PR #10 with its unit tag, and a later direct push without one.
 */
function trackFixture({ cutover = true }: { cutover?: boolean } = {}) {
  const f = integrationFixture({ lines })
  homes.push(f.home)
  git(f.root, ['checkout', '-q', '-b', 'track', f.initial])
  const before = commit(f.root, 'a.txt', 'a\n')
  feature(f, 'human/issue-5-x', 'feature.txt')
  const merge = gateMerge(f, 'human/issue-5-x', 10)
  const direct = commit(f.root, 'c.txt', 'c\n')
  git(f.root, ['push', '-q', 'origin', 'track:refs/heads/integration/runtime'])
  setGate(
    f.remote,
    JSON.stringify({ main: f.main, ...(cutover ? { 'integration/runtime': before } : {}) }),
  )
  git(f.root, ['checkout', '-q', 'human/task'])
  return { f, before, merge, direct }
}
/**
 * A track that was already promoted into main once, then received an FI sync merge of main
 * (PR #30), a gate merge of PR #40 and a direct push. Only these three are beyond main.
 */
function promotedFixture() {
  const f = integrationFixture({ lines })
  homes.push(f.home)
  git(f.root, ['checkout', '-q', '-b', 'track', f.initial])
  const before = commit(f.root, 'a.txt', 'a\n')
  feature(f, 'human/issue-5-x', 'feature.txt')
  const promoted = gateMerge(f, 'human/issue-5-x', 10)
  git(f.root, ['checkout', '-q', '-B', 'main-copy', f.main])
  const promotion = gateMerge(f, 'track', 20, 'refs/heads/main')
  git(f.root, ['push', '-q', 'origin', 'main-copy:refs/heads/main'])
  git(f.root, ['checkout', '-q', 'track'])
  git(f.root, ['branch', '-q', '-f', 'main', 'main-copy'])
  const sync = gateMerge(f, 'main', 30)
  feature(f, 'human/issue-6-y', 'y.txt')
  const work = gateMerge(f, 'human/issue-6-y', 40)
  const direct = commit(f.root, 'd.txt', 'd\n')
  git(f.root, ['push', '-q', 'origin', 'track:refs/heads/integration/runtime'])
  setGate(f.remote, JSON.stringify({ main: f.main, 'integration/runtime': before }))
  git(f.root, ['checkout', '-q', 'human/task'])
  return { f, promoted, promotion, sync, work, direct }
}

describe('ri-notes track facts', () => {
  it('lists the first-parent commits beyond the parent with their unit records, oldest first', () => {
    const { f, before, merge, direct } = trackFixture()
    const facts = trackFacts(f.root, f.policy, 'runtime')
    expect(facts.lowerBound).toEqual({ commit: before, source: 'cutover', ancestor: true })
    expect(facts.parent).toEqual({ name: 'main', branch: 'main', head: f.main })
    expect(facts.registryParent).toBe('main')
    expect(facts.mergeBase).toBe(f.initial)
    expect(facts.head).toBe(direct)
    expect(facts.commits).toEqual([
      {
        commit: before,
        subject: 'Fixture a.txt',
        coverage: 'before-lower-bound',
        unit: { kind: 'missing' },
      },
      {
        commit: merge,
        subject: 'Merge pull request #10 from human/issue-5-x',
        coverage: 'checked',
        unit: {
          kind: 'found',
          record: { target: 'refs/heads/integration/runtime', result: merge, pr: 10 },
        },
      },
      { commit: direct, subject: 'Fixture c.txt', coverage: 'checked', unit: { kind: 'missing' } },
    ])
  })
  it('starts after the last promotion and keeps an FI sync merge in the range', () => {
    const { f, promotion, sync, work, direct } = promotedFixture()
    const facts = trackFacts(f.root, f.policy, 'runtime')
    expect(facts.parent.head).toBe(promotion)
    expect(facts.commits.map(item => [item.commit, item.coverage, item.unit.kind])).toEqual([
      [sync, 'checked', 'found'],
      [work, 'checked', 'found'],
      [direct, 'checked', 'missing'],
    ])
  })
  it('refuses a track with neither a cutover entry nor a start tag', () => {
    const { f } = trackFixture({ cutover: false })
    expect(() => trackFacts(f.root, f.policy, 'runtime')).toThrow(
      'Track runtime has neither a start tag nor a cutover entry',
    )
  })
  it('takes the upstream and lower bound from the start tag when the cutover has no entry', () => {
    const { f, before } = trackFixture({ cutover: false })
    setStartTag(f.remote, 'runtime', before, gateRecord('runtime', before, 'main'))
    const facts = trackFacts(f.root, f.policy, 'runtime')
    expect(facts.parent.name).toBe('main')
    expect(facts.lowerBound).toEqual({ commit: before, source: 'start-tag', ancestor: true })
    expect(facts.commits.map(item => item.coverage)).toEqual([
      'before-lower-bound',
      'checked',
      'checked',
    ])
  })
  it('checks every commit when the lower bound is not on the track history', () => {
    const { f } = trackFixture()
    setGate(f.remote, JSON.stringify({ main: f.main, 'integration/runtime': f.main }))
    const facts = trackFacts(f.root, f.policy, 'runtime')
    expect(facts.lowerBound).toEqual({ commit: f.main, source: 'cutover', ancestor: false })
    expect(facts.commits.map(item => item.coverage)).toEqual(['checked', 'checked', 'checked'])
  })
})

describe('ri-notes unit tags and upstream', () => {
  it('reads a lightweight unit tag as an invalid unit', () => {
    const { f, direct } = trackFixture()
    git(f.remote, ['tag', `omne/gate/unit/${direct}`, direct])
    const unit = trackFacts(f.root, f.policy, 'runtime').commits.at(-1)?.unit
    expect(unit).toEqual({
      kind: 'invalid',
      reason: expect.stringContaining('not an annotated tag'),
    })
  })
  it('lets a Git read failure through instead of an invalid unit', () => {
    const { f, direct } = trackFixture()
    const policy = {
      ...f.policy,
      transport: { kind: 'local-bare' as const, location: `${f.home}/missing.git` },
    }
    expect(() => readUnit(f.root, policy, direct, 'f'.repeat(40))).toThrow(GitError)
  })
  /** A child track `child` on top of `runtime`, with its start tag recording `parent`. */
  function childFixture(parent: string) {
    const fixture = trackFixture(),
      { f } = fixture
    git(f.root, ['checkout', '-q', 'track'])
    const start = git(f.root, ['rev-parse', 'HEAD'])
    git(f.root, ['checkout', '-q', '-b', 'child'])
    feature(f, 'human/issue-8-z', 'z.txt')
    git(f.root, ['checkout', '-q', 'child'])
    git(f.root, [
      'merge',
      '-q',
      '--no-ff',
      'human/issue-8-z',
      '-m',
      'Merge pull request #50 from human/issue-8-z',
    ])
    const merge = git(f.root, ['rev-parse', 'HEAD'])
    git(f.root, ['push', '-q', 'origin', 'child:refs/heads/integration/child'])
    git(f.root, ['checkout', '-q', 'human/task'])
    setStartTag(f.remote, 'child', start, gateRecord('child', start, parent))
    const policy = parsePolicy(
      policyDocument(f.initial, f.remote, [
        trackEntry('runtime', f.initial),
        trackEntry('child', start, 'runtime'),
      ]),
    )
    return { ...fixture, start, merge, policy }
  }
  it('takes a track as the upstream when the start tag names it', () => {
    const { f, start, merge, direct, policy } = childFixture('runtime')
    const facts = trackFacts(f.root, policy, 'child')
    expect(facts.parent).toEqual({ name: 'runtime', branch: 'integration/runtime', head: direct })
    expect(facts.registryParent).toBe('runtime')
    expect(facts.lowerBound).toEqual({ commit: start, source: 'start-tag', ancestor: true })
    expect(facts.commits.map(item => item.commit)).toEqual([merge])
  })
  it('refuses when the upstream named by the start tag has no branch', () => {
    const { f, policy } = childFixture('gone')
    expect(() => trackFacts(f.root, policy, 'child')).toThrow(
      'Remote branch integration/gone does not exist',
    )
  })
})

describe('ri-notes with the snapshot difference of the installed omne-contract-api', () => {
  const LINE_TABLE = 'docs/engineering/delivery-lines.json'
  const contractLines = {
    ...lines,
    lines: [{ ...lines.lines[0], paths: ['feature', 'pkg'], contracts: Object.keys(MEMBERS) }],
  }
  function commitAll(root: string, message: string): string {
    git(root, ['add', '-A'])
    git(root, ['commit', '-q', '-m', message])
    return git(root, ['rev-parse', 'HEAD'])
  }
  /**
   * Main holds the contract members with their snapshots. The track gets one gate merge of
   * PR #10, which adds an optional property to `pkg/a`. The checkout is left clean on the track
   * head, so the provider runs the CLI.
   */
  function contractTrackFixture() {
    const f = integrationFixture({ lines: contractLines })
    homes.push(f.home)
    write(f.root, '.gitignore', 'tmp/\nnode_modules/\n')
    contracts(f.root, { members: LINE_TABLE, snapshot: SNAPSHOT_TEMPLATE })
    writeSnapshots(f.root)
    const base = commitAll(f.root, 'Contract members with snapshots')
    git(f.root, ['push', '-q', 'origin', `${base}:refs/heads/main`])
    git(f.root, ['checkout', '-q', '-b', 'track', base])
    git(f.root, ['checkout', '-q', '-b', 'human/issue-5-x'])
    write(f.root, 'pkg/a/dist/index.d.ts', A_ADDITIVE)
    writeSnapshots(f.root)
    commitAll(f.root, 'Add A.b')
    git(f.root, ['checkout', '-q', 'track'])
    const head = gateMerge(f, 'human/issue-5-x', 10)
    git(f.root, ['push', '-q', 'origin', 'track:refs/heads/integration/runtime'])
    setGate(f.remote, JSON.stringify({ main: base, 'integration/runtime': base }))
    return { f, base, head }
  }
  /** Serves PR #10 with `contractsSection` and its card #5, which declares an additive change. */
  function reader(contractsSection: string): GhRead {
    const responses: Record<string, unknown> = {
      'repos/owner/repo/pulls/10': {
        number: 10,
        html_url: 'https://github.com/owner/repo/pull/10',
        head: { ref: 'human/issue-5-x' },
        base: { ref: 'integration/runtime' },
        body: `## 所含的卡\n\n- #5 revision 1 attempt \`5-a1\`：无\n\n## 契约变化\n\n${contractsSection}\n`,
      },
      'repos/owner/repo/issues/5': {
        number: 5,
        node_id: 'I_5',
        html_url: 'https://github.com/owner/repo/issues/5',
        body: '## 身份与责任\n\n- 交付线：tools-line\n- 性质：impl\n- 契约变更：additive\n',
        labels: [],
        milestone: { title: 'M1' },
      },
    }
    return argv => {
      const endpoint = argv.at(-1) ?? ''
      if (!(endpoint in responses)) throw new Error(`unexpected read ${argv.join(' ')}`)
      return responses[endpoint]
    }
  }
  const notesWith = (root: string, contractsSection: string) =>
    riNotes(
      riInput({
        root,
        track: 'runtime',
        read: reader(contractsSection),
        contractDiffProvider: snapshotContractDiff,
      }),
    )
  const mismatches = (notes: ReturnType<typeof riNotes>) =>
    notes.findings
      .filter(item => item.code === 'contract-diff-mismatch')
      .map(item => [item.at.path, item.message])

  it(
    'checks the declarations against the CLI difference over the promoted range',
    { tags: ['slow'] },
    () => {
      const { f, base, head } = contractTrackFixture()
      const agreed = notesWith(f.root, '- pkg/a：additive')
      expect(agreed.contractCheck).toEqual({ kind: 'checked', base, head })
      expect(mismatches(agreed)).toEqual([])

      const omitted = notesWith(f.root, '无')
      expect(omitted.contractCheck).toEqual({ kind: 'checked', base, head })
      expect(mismatches(omitted)).toEqual([
        ['pkg/a', '快照差异把 pkg/a 分为 additive，PR 声明汇总为 none。'],
      ])
    },
  )
  it(
    'exits 1 from the CLI when the declarations disagree with the difference, 0 when they agree',
    { tags: ['slow'] },
    () => {
      const { f, base, head } = contractTrackFixture()
      const cardFive = reader('')(['repos/owner/repo/issues/5'], 0)
      const pullTen = (section: string) => ({
        number: 10,
        html_url: 'https://github.com/owner/repo/pull/10',
        head: { ref: 'human/issue-5-x' },
        base: { ref: 'integration/runtime' },
        body: `## 所含的卡\n\n- #5 revision 1 attempt \`5-a1\`：无\n\n## 契约变化\n\n${section}\n`,
      })
      const omitted = server(f, {
        'repos/owner/repo/pulls/10': pullTen('无'),
        'repos/owner/repo/issues/5': cardFive,
      })('--track', 'runtime', '--root', f.root)
      expect(omitted.status, omitted.stderr).toBe(1)
      expect(JSON.parse(omitted.stdout)).toMatchObject({
        contractCheck: { kind: 'checked', base, head },
        findings: expect.arrayContaining([
          expect.objectContaining({ code: 'contract-diff-mismatch' }),
        ]),
      })
      rmSync(join(f.home, 'responses'), { recursive: true })
      rmSync(join(f.home, 'ri-bin'), { recursive: true })
      const agreed = server(f, {
        'repos/owner/repo/pulls/10': pullTen('- pkg/a：additive'),
        'repos/owner/repo/issues/5': cardFive,
      })('--track', 'runtime', '--root', f.root)
      expect(agreed.status, agreed.stderr).toBe(0)
    },
  )
})

const cli = fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url))
/** Runs the ri-notes CLI with a `gh` stand-in that serves `responses` by endpoint. */
function server(f: Fixture, responses: Record<string, unknown>) {
  const dir = join(f.home, 'responses'),
    bin = join(f.home, 'ri-bin')
  mkdirSync(dir)
  mkdirSync(bin)
  for (const [endpoint, value] of Object.entries(responses))
    writeFileSync(join(dir, `${endpoint.replaceAll('/', '_')}.json`), JSON.stringify(value))
  writeGh(
    bin,
    `#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
const file = ${JSON.stringify(dir)} + '/' + process.argv.at(-1).replaceAll('/', '_') + '.json'
if (!existsSync(file)) { process.stdout.write('{"message":"Not Found","status":"404"}'); process.exit(1) }
process.stdout.write(readFileSync(file, 'utf8'))
`,
  )
  return (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, 'ri-notes', ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...ghEnv(bin) },
    })
}

describe('ri-notes CLI', () => {
  const pull = (number: number, head: string, body: string) => ({
    number,
    html_url: `https://github.com/owner/repo/pull/${number}`,
    head: { ref: head },
    base: { ref: 'integration/runtime' },
    body,
  })
  const card = (number: number) => ({
    number,
    node_id: `I_${number}`,
    html_url: `https://github.com/owner/repo/issues/${number}`,
    body: '## 身份与责任\n\n- 交付线：tools-line\n- 性质：impl\n- 契约变更：none\n',
    labels: [],
    milestone: { title: 'M1' },
  })
  it('prints JSON, prints Markdown with the findings on standard error, and exits 0', () => {
    const { f, direct } = trackFixture()
    const run = server(f, {
      'repos/owner/repo/pulls/10': pull(
        10,
        'human/issue-5-x',
        '## 所含的卡\n\n- #5 revision 1 attempt `5-a1`：无\n\n## 契约变化\n\n无\n\n---\n_Generated by host_',
      ),
      'repos/owner/repo/issues/5': card(5),
    })
    const args = ['--track', 'runtime', '--root', f.root]
    const json = run(...args)
    expect(json.status, json.stderr).toBe(0)
    expect(json.stderr).toBe('')
    const notes = JSON.parse(json.stdout)
    expect(notes.cards).toEqual([
      expect.objectContaining({ issue: 5, revision: 1, attempt: '5-a1', line: 'tools-line' }),
    ])
    expect(notes.findings.map((item: { code: string }) => item.code)).toEqual([
      'unit-missing',
      'contracts-unknown',
    ])
    // The command's snapshot provider sees the task branch checked out, not the track head.
    expect(notes.contractCheck).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining(`HEAD 为 ${f.main}，不是范围头 ${direct}`),
    })
    const markdown = run(...args, '--format', 'markdown')
    expect(markdown.status, markdown.stderr).toBe(0)
    expect(markdown.stdout).toBe(
      `## 所含的卡\n\n- #5 revision 1 attempt \`5-a1\`：无\n\n## 契约变化\n\n- 待确认：提交 ${notes.contractGaps[0].commit.slice(0, 9)}、提交 ${direct.slice(0, 9)} 的契约变化未知，逐个核对后改写本节。\n`,
    )
    const reports = markdown.stderr
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(reports.slice(0, -1)).toEqual(notes.findings)
    expect(reports.at(-1)).toEqual({
      severity: 'report',
      summary: {
        findings: 2,
        codes: { 'unit-missing': 1, 'contracts-unknown': 1 },
        contractCheck: notes.contractCheck,
      },
    })
    expect(run(...args, '--format', 'yaml').status).toBe(2)
  })
  it('exits 1 with a refusing contract code and keeps the Markdown output', () => {
    const { f } = trackFixture()
    const run = server(f, {
      'repos/owner/repo/pulls/10': pull(
        10,
        'human/issue-5-x',
        '## 所含的卡\n\n- #5 revision 1 attempt `5-a1`：无\n\n## 契约变化\n\n- feature/api：additive\n',
      ),
      'repos/owner/repo/issues/5': card(5),
    })
    const args = ['--track', 'runtime', '--root', f.root]
    const json = run(...args)
    expect(json.status, json.stderr).toBe(1)
    const notes = JSON.parse(json.stdout)
    expect(notes.findings.map((item: { code: string }) => item.code)).toContain(
      'contract-level-exceeds-card',
    )
    const markdown = run(...args, '--format', 'markdown')
    expect(markdown.status, markdown.stderr).toBe(1)
    expect(markdown.stdout).toBe(notes.markdown)
    const summary = JSON.parse(markdown.stderr.trim().split('\n').at(-1) ?? '')
    expect(summary.summary.codes['contract-level-exceeds-card']).toBe(1)
  })
  it('skips the sections of a sync PR after a promotion', () => {
    const { f } = promotedFixture()
    const run = server(f, {
      'repos/owner/repo/pulls/30': pull(30, 'main', '同步，不写两节'),
      'repos/owner/repo/pulls/40': pull(
        40,
        'human/issue-6-y',
        '## 所含的卡\n\n- #6 revision 2 attempt `6-a2`：无\n\n## 契约变化\n\n无\n',
      ),
      'repos/owner/repo/issues/6': card(6),
    })
    const result = run('--track', 'runtime', '--root', f.root)
    expect(result.status, result.stderr).toBe(0)
    const notes = JSON.parse(result.stdout)
    expect(
      notes.commits.map((item: { pr: { kind: string } | null }) => item.pr?.kind ?? null),
    ).toEqual(['sync', 'work', null])
    expect(notes.cards.map((item: { issue: number }) => item.issue)).toEqual([6])
  })
  it('prints its usage with --help and exits 0', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cli, 'ri-notes', '--help'],
      {
        encoding: 'utf8',
      },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('integration ri-notes --track ID')
  })
})
