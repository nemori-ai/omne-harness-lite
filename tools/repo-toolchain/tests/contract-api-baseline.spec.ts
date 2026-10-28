// @module-tag slow
// The baseline is written from and checked against temporary Git repositories, and the CLI cases
// start real Node subprocesses.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BASELINE_MARKER,
  BaselineFormatError,
  checkBaseline,
  parseBaselineText,
  renderBaselineBlock,
  writeBaseline,
  type ContractBaseline,
} from '../src/declarations/api-baseline.ts'
import { checkSnapshots, writeSnapshots } from '../src/declarations/contract-api.ts'
import {
  CONFIG,
  committedCheckout,
  contractCheckout,
  MEMBERS,
  setContracts,
  setDist,
} from './fixtures/contract-api.ts'
import { commit, git, removeTemporaries } from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const CLI = fileURLToPath(new URL('../src/declarations/api-cli.ts', import.meta.url))
const SHA1 = 'a'.repeat(40),
  SHA256 = 'b'.repeat(64)
const sample: ContractBaseline = {
  milestone: 'M1.5',
  members: [
    { path: 'packages/x/a', commit: SHA1, sha256: SHA256, apiTree: 'c'.repeat(40) },
    { path: 'packages/x/b', commit: 'd'.repeat(40), sha256: SHA256, apiTree: SHA1 },
  ],
}

describe('the baseline block format', () => {
  it('reads back what it renders, as a fenced block in a comment or as raw JSON', () => {
    const block = renderBaselineBlock(sample)
    expect(block.split('\n')[0]).toBe(`\`\`\`json ${BASELINE_MARKER}`)
    expect(parseBaselineText(`登记 M1.5 的基线。\n\n${block}\n其余说明。\n`)).toEqual(sample)
    expect(parseBaselineText(JSON.stringify(sample))).toEqual(sample)
    const withCards = { ...sample, milestone: null, breakingCards: ['https://x/issues/1'] }
    expect(parseBaselineText(renderBaselineBlock(withCards))).toEqual(withCards)
  })

  it.each([
    ['no block and no JSON', 'just prose'],
    ['two blocks', `${renderBaselineBlock(sample)}\n${renderBaselineBlock(sample)}`],
    ['an unknown key', JSON.stringify({ ...sample, digest: 'x' })],
    ['a missing milestone', JSON.stringify({ members: sample.members })],
    ['no members', JSON.stringify({ ...sample, members: [] })],
    [
      'a repeated path',
      JSON.stringify({ ...sample, members: [sample.members[0], sample.members[0]] }),
    ],
    [
      'a short commit',
      JSON.stringify({ ...sample, members: [{ ...sample.members[0], commit: 'abc' }] }),
    ],
    [
      'an upper-case sha256',
      JSON.stringify({
        ...sample,
        members: [{ ...sample.members[0], sha256: SHA256.toUpperCase() }],
      }),
    ],
    [
      'a bad apiTree',
      JSON.stringify({ ...sample, members: [{ ...sample.members[0], apiTree: '' }] }),
    ],
    [
      'an absolute path',
      JSON.stringify({ ...sample, members: [{ ...sample.members[0], path: '/x' }] }),
    ],
    [
      'an unknown member key',
      JSON.stringify({ ...sample, members: [{ ...sample.members[0], tree: SHA1 }] }),
    ],
    ['breakingCards that are not strings', JSON.stringify({ ...sample, breakingCards: [1] })],
    [
      'a sha256 one digit short',
      JSON.stringify({ ...sample, members: [{ ...sample.members[0], sha256: SHA256.slice(1) }] }),
    ],
    [
      'a commit one digit short',
      JSON.stringify({ ...sample, members: [{ ...sample.members[0], commit: SHA1.slice(1) }] }),
    ],
  ])('refuses %s', (_name, text) => {
    expect(() => parseBaselineText(text)).toThrow(BaselineFormatError)
  })

  it('names the missing milestone key, which is not the same as a null milestone', () => {
    expect(() => parseBaselineText(JSON.stringify({ members: sample.members }))).toThrow(
      '缺 milestone',
    )
    expect(parseBaselineText(JSON.stringify({ ...sample, milestone: null })).milestone).toBeNull()
  })
})

function cli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--root', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, OMNE_RUNNER_ROOT: root },
  })
}
const ADDITIVE_A = 'export interface A {\n    a: string;\n    b?: number;\n}\n'

describe('writing a baseline', { timeout: 120_000 }, () => {
  it('records each member at the commit: the snapshot sha256 of --check and the api tree', () => {
    const { root, base } = committedCheckout()
    // Later work must not change what the baseline of `base` records.
    setDist(root, 'packages/x/a', { 'index.d.ts': ADDITIVE_A })
    writeSnapshots(root, CONFIG)
    commit(root, 'later')
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    git(root, 'checkout', '-q', base)
    const check = checkSnapshots(root, CONFIG)
    expect(baseline).toEqual({
      milestone: 'M1',
      members: check.members.map(member => ({
        path: member.directory,
        commit: base,
        sha256: 'sha256' in member ? member.sha256 : 'none',
        apiTree: git(root, 'rev-parse', `${base}:${member.directory}/api`),
      })),
    })
  })

  it('writes only the members named by --member, and refuses one that is not a contract member', () => {
    const { root, base } = committedCheckout()
    const block = cli(root, '--baseline-write', base, '--member', 'packages/x/b')
    expect(block.status).toBe(0)
    const written = parseBaselineText(block.stdout)
    expect(written).toMatchObject({ milestone: null, members: [{ path: 'packages/x/b' }] })
    expect(written.members).toHaveLength(1)
    expect(cli(root, '--baseline-write', base, '--member', 'packages/x/none')).toMatchObject({
      status: 2,
      stderr: expect.stringContaining('packages/x/none'),
    })
  })

  it('refuses a commit without a snapshot for a member, and a ref that is not a commit', () => {
    const { root } = committedCheckout()
    git(root, 'rm', '-q', '-r', 'packages/x/b/api')
    const bare = commit(root, 'no snapshot for b')
    expect(cli(root, '--baseline-write', bare)).toMatchObject({
      status: 2,
      stderr: expect.stringContaining('packages/x/b'),
    })
    expect(cli(root, '--baseline-write', 'no-such-ref')).toMatchObject({
      status: 2,
      stderr: expect.stringContaining('不是这个仓库里的提交'),
    })
  })
})

describe('checking against a baseline', { timeout: 120_000 }, () => {
  /** `first` is the committed checkout; `second` adds an optional field to A. */
  function twoCommits() {
    const { root, base: first } = committedCheckout()
    setDist(root, 'packages/x/a', { 'index.d.ts': ADDITIVE_A })
    writeSnapshots(root, CONFIG)
    const second = commit(root, 'a gets an optional field')
    return { root, first, second }
  }
  function baselineFile(root: string, baseline: ContractBaseline): string {
    const path = join(root, '..', `baseline-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(path, JSON.stringify(baseline))
    return path
  }

  it('compares each member from its own commit', () => {
    const { root, first, second } = twoCommits()
    const atFirst = writeBaseline(root, CONFIG, first, { milestone: 'M1' })
    expect(checkBaseline(root, CONFIG, atFirst)).toMatchObject({
      change: 'additive',
      refused: false,
      members: [
        { directory: 'packages/x/a', commit: first, change: 'additive' },
        { directory: 'packages/x/b', commit: first, change: 'none' },
      ],
    })
    // The supplementary registration moves a to the second commit; b stays on the first.
    const [a] = writeBaseline(root, CONFIG, second, {
      milestone: 'M1',
      members: ['packages/x/a'],
    }).members
    const mixed = { ...atFirst, members: [a!, atFirst.members[1]!] }
    expect(checkBaseline(root, CONFIG, mixed)).toMatchObject({
      change: 'none',
      members: [
        { directory: 'packages/x/a', commit: second, change: 'none' },
        { directory: 'packages/x/b', commit: first, change: 'none' },
      ],
      registration: [],
    })
  })

  it('counts a member added after the baseline as a whole addition', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    const withC = {
      ...MEMBERS,
      'packages/x/c': {
        name: '@fixture/c',
        exports: { '.': 'index.d.ts' },
        dist: { 'index.d.ts': 'export type C = 3;\n' },
      },
    }
    contractCheckout(withC, Object.keys(withC), root)
    writeSnapshots(root, CONFIG)
    const run = checkBaseline(root, CONFIG, baseline)
    expect(run.change).toBe('additive')
    expect(run.members[2]).toMatchObject({
      directory: 'packages/x/c',
      commit: null,
      change: 'additive',
      differences: [{ target: { scope: 'snapshot' }, kind: 'added', change: 'additive' }],
    })
  })

  it('refuses a review change without breakingCards and passes it with them', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    setDist(root, 'packages/x/b', { 'index.d.ts': 'export {};\n' })
    writeSnapshots(root, CONFIG)
    expect(checkBaseline(root, CONFIG, baseline)).toMatchObject({ change: 'review', refused: true })
    const refused = cli(root, '--baseline', baselineFile(root, baseline))
    expect(refused.status).toBe(1)
    expect(refused.stdout).toContain(`packages/x/b（基线 ${base.slice(0, 9)}）：review`)
    const cards = { ...baseline, breakingCards: ['https://github.com/o/r/issues/9'] }
    const passed = cli(root, '--baseline', baselineFile(root, cards), '--json')
    expect(passed.status).toBe(0)
    expect(JSON.parse(passed.stdout)).toMatchObject({ change: 'review', refused: false })
  })

  it('reports a registration whose sha256 or api tree differs from its commit, without failing', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    const [a, b] = baseline.members
    const wrong = {
      ...baseline,
      members: [
        { ...a!, sha256: '0'.repeat(64) },
        { ...b!, apiTree: '0'.repeat(40) },
      ],
    }
    const run = checkBaseline(root, CONFIG, wrong)
    expect(run).toMatchObject({ change: 'none', refused: false })
    expect(run.registration).toEqual([
      expect.objectContaining({
        path: 'packages/x/a',
        code: 'sha256-mismatch',
        registered: '0'.repeat(64),
        actual: a!.sha256,
      }),
      expect.objectContaining({
        path: 'packages/x/b',
        code: 'api-tree-mismatch',
        registered: '0'.repeat(40),
        actual: b!.apiTree,
      }),
    ])
    const shown = cli(root, '--baseline', baselineFile(root, wrong))
    expect(shown.status).toBe(0)
    expect(shown.stdout).toContain('sha256-mismatch')
  })

  it('reads the fenced block that --baseline-write prints, and exits 2 on a bad file', () => {
    const { root, base } = committedCheckout()
    const block = cli(root, '--baseline-write', base, '--milestone', 'M1').stdout
    const path = join(root, '..', 'comment.md')
    writeFileSync(path, `登记基线。\n\n${block}`)
    expect(cli(root, '--baseline', path)).toMatchObject({ status: 0 })
    writeFileSync(path, 'no block\n')
    expect(cli(root, '--baseline', path)).toMatchObject({ status: 2 })
    expect(cli(root, '--baseline', join(root, '..', 'missing.json'))).toMatchObject({ status: 2 })
    expect(cli(root, '--milestone', 'M1', '--check')).toMatchObject({ status: 2 })
  })

  it('cannot judge a member whose registered commit has no such contract member', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    // The first commit of the fixture holds only a README: no line table, no contract member.
    const empty = git(root, 'rev-list', '--max-parents=0', 'HEAD')
    const [a, b] = baseline.members
    const wrong = {
      ...baseline,
      members: [{ ...a!, commit: empty }, b!],
      breakingCards: ['https://github.com/o/r/issues/9'],
    }
    const run = checkBaseline(root, CONFIG, wrong)
    // breakingCards do not cover a member that cannot be judged.
    expect(run).toMatchObject({
      refused: true,
      undetermined: [{ path: 'packages/x/a', reason: expect.stringContaining('不是契约成员') }],
    })
    expect(run.members[0]).toMatchObject({ directory: 'packages/x/a', status: 'invalid' })
    expect(run.registration).toContainEqual(
      expect.objectContaining({ path: 'packages/x/a', code: 'not-a-contract-member' }),
    )
    const shown = cli(root, '--baseline', baselineFile(root, wrong))
    expect(shown.status).toBe(1)
    expect(shown.stdout).toContain('packages/x/a')
    expect(shown.stdout).toContain('判不了')
  })

  it('cannot judge a member whose registered commit has no snapshot file', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    git(root, 'rm', '-q', 'packages/x/a/api/a.api.md')
    const bare = commit(root, 'a without a snapshot')
    writeSnapshots(root, CONFIG)
    const [a, b] = baseline.members
    const run = checkBaseline(root, CONFIG, { ...baseline, members: [{ ...a!, commit: bare }, b!] })
    expect(run).toMatchObject({
      refused: true,
      undetermined: [{ path: 'packages/x/a', reason: expect.stringContaining('没有快照文件') }],
    })
  })

  it('cannot judge a member that was a contract member at the baseline but is not registered', () => {
    const { root, base } = committedCheckout()
    // A registration that left out packages/x/b although it was a contract member at base.
    const partial = writeBaseline(root, CONFIG, base, {
      milestone: 'M1',
      members: ['packages/x/a'],
    })
    const run = checkBaseline(root, CONFIG, partial)
    expect(run).toMatchObject({
      refused: true,
      undetermined: [{ path: 'packages/x/b', reason: expect.stringContaining('没有登记') }],
    })
    expect(run.members[1]).toMatchObject({
      directory: 'packages/x/b',
      status: 'invalid',
      commit: null,
    })
  })

  it('counts a registered member that left the line table as a removal', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    setContracts(root, ['packages/x/a'])
    const run = checkBaseline(root, CONFIG, baseline)
    expect(run).toMatchObject({ change: 'review', refused: true, undetermined: [] })
    expect(run.members[1]).toMatchObject({ directory: 'packages/x/b', change: 'review' })
  })

  it('counts a member whose working snapshot cannot be read as review', () => {
    const { root, base } = committedCheckout()
    const baseline = writeBaseline(root, CONFIG, base, { milestone: 'M1' })
    writeFileSync(join(root, 'packages/x/b/api/b.api.md'), 'not a snapshot\n')
    const run = checkBaseline(root, CONFIG, baseline)
    expect(run.members[1]).toMatchObject({ directory: 'packages/x/b', status: 'invalid' })
    expect(run).toMatchObject({ change: 'review', refused: true })
  })

  it('takes sha256 over the snapshot file bytes', () => {
    const { root, base } = committedCheckout()
    const [a] = writeBaseline(root, CONFIG, base, { milestone: null }).members
    const bytes = readFileSync(join(root, 'packages/x/a/api/a.api.md'))
    expect(a!.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  })
})
