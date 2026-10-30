// 准入证据核对：F 的树与 C 的树相同时，C 上一次干净、每步都通过、带了 FULL=1 的全量准入就是 F 上的全量准入；其余一律拒绝并写明原因。
// 夹具是真实 git 仓库：C 是分支上的提交，F 是把它 `--no-ff` 并回主线的合并提交（树与 C 相同、提交不同），
// D 是 F 之后又改了文件的提交（树不同）。记录按运行记录的形状手写，每条用例只改一个字段，核对那一项单独就能让它被拒。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  admissionEvidence,
  admissionEvidenceCommand,
  formatEvidence,
  type AdmissionEvidence,
  type RejectionKind,
} from '../src/testing/admission-evidence.ts'

const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()

interface Fixture {
  readonly root: string
  /** 分支上的提交，全量准入跑在它上面。 */
  readonly c: string
  /** C 的空合并：树与 C 相同。 */
  readonly f: string
  /** F 之后改了文件：树与 C 不同。 */
  readonly d: string
  readonly tree: (commit: string) => string
}

let fixture: Fixture
const temporaries: string[] = []

beforeAll(() => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'admission-evidence-')))
  temporaries.push(root)
  git(root, 'init', '-q', '-b', 'main')
  writeFileSync(join(root, '.gitignore'), 'tmp/\n')
  writeFileSync(join(root, 'a.txt'), 'one\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'base')
  git(root, 'switch', '-qc', 'card')
  writeFileSync(join(root, 'a.txt'), 'two\n')
  git(root, 'commit', '-qam', 'card change')
  const c = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  git(root, 'merge', '-q', '--no-ff', '-m', 'gate merge', 'card')
  const f = git(root, 'rev-parse', 'HEAD')
  writeFileSync(join(root, 'a.txt'), 'three\n')
  git(root, 'commit', '-qam', 'later change')
  const d = git(root, 'rev-parse', 'HEAD')
  fixture = { root, c, f, d, tree: commit => git(root, 'rev-parse', `${commit}^{tree}`) }
})

afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** C 上一次干净、全部通过、带了 FULL=1 的全量准入记录。 */
function passingRecord(head = fixture.c): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: 'admission-run',
    admission: true,
    head,
    tree: fixture.tree(head),
    dirty: false,
    worktree: fixture.root,
    mode: 'full',
    fullRequested: true,
    base: null,
    resumeFrom: null,
    steps: [
      { name: 'lint:oxlint', exit: 0, seconds: 1.2, ran: true },
      { name: 'test', exit: 0, seconds: 30.5, ran: true },
    ],
    failedStep: null,
    startedAt: '2026-10-30T08:00:00.000Z',
    finishedAt: '2026-10-30T08:10:00.000Z',
    caches: { test: 'off', depGraph: 'off', mutation: 'unknown' },
  }
}

/** 写进夹具仓库的 `tmp/admission/<名字>.json`（按树找的那个目录），返回相对路径。 */
function writeRecord(name: string, record: unknown): string {
  const directory = join(fixture.root, 'tmp/admission')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${name}.json`), JSON.stringify(record))
  return `tmp/admission/${name}.json`
}

/** 另起一个空的记录目录，按树找的用例互不干扰。 */
function freshRecordDirectory(): void {
  rmSync(join(fixture.root, 'tmp'), { recursive: true, force: true })
}

const kinds = (evidence: AdmissionEvidence): RejectionKind[] =>
  evidence.kind === 'accepted'
    ? []
    : [...evidence.reasons, ...evidence.records.flatMap(finding => finding.reasons)].map(
        reason => reason.kind,
      )

describe('给了记录：只看那一份', () => {
  it('F 与 C 的树相同时接受 C 的全量准入，输出写明两个提交、同一个树、记录与缓存', () => {
    expect(fixture.f).not.toBe(fixture.c)
    const record = writeRecord('explicit-pass', passingRecord())
    const evidence = admissionEvidence(fixture.root, { for: fixture.f, record })
    expect(evidence).toMatchObject({
      kind: 'accepted',
      target: { commit: fixture.f, tree: fixture.tree(fixture.c) },
      source: { commit: fixture.c, tree: fixture.tree(fixture.c) },
      record,
    })
    expect(formatEvidence(evidence)).toEqual([
      `F ${fixture.f} 采用 C ${fixture.c} 的全量准入，树 ${fixture.tree(fixture.c)} 相同；记录 ${record}；` +
        '缓存 test=off, depGraph=off, mutation=unknown',
    ])
  })

  it('接续了一次带 FULL=1 的准入的记录算全量准入：输出写明是 H1 全量＋ C 上增量组成的', () => {
    const h1 = 'e'.repeat(40)
    const record = writeRecord('explicit-resume-of-full', {
      ...passingRecord(),
      mode: 'resume',
      fullRequested: false,
      base: h1,
      resumeFrom: {
        head: h1,
        tree: h1,
        failedStep: 'lint:oxlint',
        mode: 'full',
        fullRequested: true,
      },
    })
    const evidence = admissionEvidence(fixture.root, { for: fixture.f, record })
    expect(evidence).toMatchObject({
      kind: 'accepted',
      source: { commit: fixture.c },
      resumedFrom: h1,
    })
    expect(formatEvidence(evidence)[0]).toContain(
      `采用 C ${fixture.c} 的全量准入（H1 ${h1} 的全量准入＋ C 上的增量准入）`,
    )
  })

  it('树不同时拒绝，原因里写出两个树哈希', () => {
    const record = writeRecord('explicit-pass', passingRecord())
    const evidence = admissionEvidence(fixture.root, { for: fixture.d, record })
    expect(kinds(evidence)).toEqual(['tree-differs'])
    const text = formatEvidence(evidence).join('\n')
    expect(text).toContain(fixture.tree(fixture.c))
    expect(text).toContain(fixture.tree(fixture.d))
  })

  const singleFieldCases: readonly {
    readonly name: string
    readonly change: Record<string, unknown>
    readonly expected: readonly RejectionKind[]
    readonly says: string
  }[] = [
    {
      name: '不是准入运行（admission 为假）',
      change: { admission: false },
      expected: ['not-admission'],
      says: '不是准入运行',
    },
    {
      name: '不是准入运行（kind 不对）',
      change: { kind: 'test-run' },
      expected: ['not-admission'],
      says: '不是准入运行',
    },
    {
      name: '缺 admission 字段',
      change: { admission: undefined },
      expected: ['not-admission'],
      says: '不是准入运行',
    },
    {
      name: 'schemaVersion 不是 1',
      change: { schemaVersion: 2 },
      expected: ['schema-version'],
      says: '只认 1',
    },
    { name: '不是全量', change: { mode: 'affected' }, expected: ['not-full'], says: '不是全量' },
    {
      name: '计划判了全量，没带 FULL=1',
      change: { fullRequested: false },
      expected: ['full-not-requested'],
      says: '没有带 FULL=1',
    },
    {
      name: '缺 fullRequested',
      change: { fullRequested: undefined },
      expected: ['full-not-requested'],
      says: '看不出有没有带 FULL=1',
    },
    {
      name: '接续的 H1 只是计划判了全量，没带 FULL=1',
      change: {
        mode: 'resume',
        fullRequested: false,
        base: 'e'.repeat(40),
        resumeFrom: {
          head: 'e'.repeat(40),
          tree: 'e'.repeat(40),
          failedStep: 'test',
          mode: 'full',
          fullRequested: false,
        },
      },
      expected: ['full-not-requested'],
      says: '接续记录：H1 那次没有带 FULL=1',
    },
    {
      name: '接续记录没写 H1 的范围',
      change: { mode: 'resume' },
      expected: ['not-full'],
      says: '看不出 H1 那次的范围',
    },
    {
      name: '接续了一次影响面准入',
      change: {
        mode: 'resume',
        base: 'e'.repeat(40),
        resumeFrom: {
          head: 'e'.repeat(40),
          tree: 'e'.repeat(40),
          failedStep: 'test',
          mode: 'affected',
          fullRequested: false,
        },
      },
      expected: ['not-full'],
      says: 'H1 只按影响面运行，组成的证据不是全量准入',
    },
    {
      name: '有失败步',
      change: {
        steps: [
          { name: 'lint:oxlint', exit: 1, seconds: 1.2, ran: true },
          { name: 'test', exit: 0, seconds: 30.5, ran: true },
        ],
        failedStep: 'lint:oxlint',
      },
      expected: ['fast-failed', 'step-failed'],
      says: '步骤 lint:oxlint 失败（退出 1）',
    },
    {
      name: '有步骤没跑',
      change: {
        steps: [
          { name: 'lint:oxlint', exit: 0, seconds: 1.2, ran: true },
          { name: 'test', exit: null, seconds: 0, ran: false },
        ],
      },
      expected: ['step-not-run'],
      says: '步骤 test 没跑',
    },
    {
      name: '没有步骤表',
      change: { steps: [] },
      expected: ['no-steps'],
      says: '没有步骤表',
    },
    {
      name: '只写了快速失败的步',
      change: { failedStep: 'test' },
      expected: ['fast-failed'],
      says: '快速失败于 test',
    },
    { name: 'dirty', change: { dirty: true }, expected: ['dirty'], says: '未提交改动' },
    { name: '缺 dirty', change: { dirty: undefined }, expected: ['dirty'], says: '看不出' },
    {
      name: '缺 finishedAt',
      change: { finishedAt: undefined },
      expected: ['not-finished'],
      says: '没有正常结束',
    },
  ]

  it.each(singleFieldCases)('$name：拒绝，原因可读', ({ change, expected, says }) => {
    const record = writeRecord('explicit-case', { ...passingRecord(), ...change })
    const evidence = admissionEvidence(fixture.root, { for: fixture.f, record })
    expect(kinds(evidence).sort()).toEqual([...expected].sort())
    expect(formatEvidence(evidence).join('\n')).toContain(says)
  })

  it('记录缺 tree 时由它的头补算：头的树与 F 相同就接受，不同就拒绝', () => {
    const { tree: _dropped, ...withoutTree } = passingRecord()
    const record = writeRecord('no-tree', withoutTree)
    expect(admissionEvidence(fixture.root, { for: fixture.f, record }).kind).toBe('accepted')
    expect(kinds(admissionEvidence(fixture.root, { for: fixture.d, record }))).toEqual([
      'tree-differs',
    ])
  })

  it('记录写的树与它的头的树不一致时拒绝，哪怕写的树等于 F 的树', () => {
    const record = writeRecord('inconsistent', {
      ...passingRecord(fixture.d),
      tree: fixture.tree(fixture.c),
    })
    expect(kinds(admissionEvidence(fixture.root, { for: fixture.f, record }))).toEqual([
      'tree-inconsistent',
    ])
  })

  it('记录的头在本仓库里找不到时拒绝', () => {
    const record = writeRecord('foreign-head', { ...passingRecord(), head: 'f'.repeat(40) })
    expect(kinds(admissionEvidence(fixture.root, { for: fixture.f, record }))).toEqual([
      'head-missing',
    ])
  })

  it.each([
    ['不是 JSON', () => '{ 半截'],
    ['缓存状态写错', () => JSON.stringify({ ...passingRecord(), caches: { test: 'yes' } })],
  ])('记录读不出（%s）时拒绝', (_name, text) => {
    mkdirSync(join(fixture.root, 'tmp/admission'), { recursive: true })
    writeFileSync(join(fixture.root, 'tmp/admission/broken.json'), text())
    const evidence = admissionEvidence(fixture.root, {
      for: fixture.f,
      record: 'tmp/admission/broken.json',
    })
    expect(kinds(evidence)).toEqual(['unreadable'])
    expect(formatEvidence(evidence).join('\n')).toContain('记录读不出')
  })

  it('记录的头写成引用名（不是提交号）时按读不出拒绝，不拿引用当下的树去比', () => {
    const { tree: _dropped, ...withoutTree } = passingRecord()
    const record = writeRecord('ref-head', { ...withoutTree, head: 'HEAD' })
    expect(kinds(admissionEvidence(fixture.root, { for: fixture.d, record }))).toEqual([
      'unreadable',
    ])
  })

  it('记录文件不存在时拒绝', () => {
    expect(
      kinds(admissionEvidence(fixture.root, { for: fixture.f, record: 'tmp/admission/none.json' })),
    ).toEqual(['unreadable'])
  })

  it('F 解析不出时拒绝', () => {
    const record = writeRecord('explicit-pass', passingRecord())
    const evidence = admissionEvidence(fixture.root, { for: 'no-such-ref', record })
    expect(kinds(evidence)).toEqual(['target-missing'])
    expect(formatEvidence(evidence).join('\n')).toContain('no-such-ref')
  })
})

describe('没给记录：在本树 tmp/admission 里按树哈希找', () => {
  it('找到同树且通过的记录就接受，不管还有别的树的记录', () => {
    freshRecordDirectory()
    writeRecord('other-tree', passingRecord(fixture.d))
    const record = writeRecord('same-tree', passingRecord())
    expect(admissionEvidence(fixture.root, { for: fixture.f })).toMatchObject({
      kind: 'accepted',
      source: { commit: fixture.c },
      record,
    })
  })

  it('同树的记录都不合格时拒绝，逐份列出原因', () => {
    freshRecordDirectory()
    writeRecord('same-tree-dirty', { ...passingRecord(), dirty: true })
    writeRecord('other-tree', passingRecord(fixture.d))
    const evidence = admissionEvidence(fixture.root, { for: fixture.f })
    expect(evidence.kind === 'rejected' && evidence.records.map(r => r.record)).toEqual([
      'tmp/admission/same-tree-dirty.json',
    ])
    expect(kinds(evidence)).toEqual(['dirty'])
  })

  it('没有同树的记录时拒绝，并列出看不出树的记录', () => {
    freshRecordDirectory()
    writeRecord('other-tree', passingRecord(fixture.d))
    mkdirSync(join(fixture.root, 'tmp/admission'), { recursive: true })
    writeFileSync(join(fixture.root, 'tmp/admission/broken.json'), 'not json')
    const evidence = admissionEvidence(fixture.root, { for: fixture.f })
    expect(kinds(evidence)).toEqual(['no-matching-record', 'unreadable'])
    expect(formatEvidence(evidence).join('\n')).toContain(fixture.tree(fixture.f))
  })

  it('不看 tmp/admission 以外的记录', () => {
    freshRecordDirectory()
    mkdirSync(join(fixture.root, 'tmp/check-run/abc'), { recursive: true })
    writeFileSync(join(fixture.root, 'tmp/check-run/abc/run.json'), JSON.stringify(passingRecord()))
    expect(kinds(admissionEvidence(fixture.root, { for: fixture.f }))).toEqual([
      'no-matching-record',
    ])
  })
})

describe('admission-evidence 子命令', () => {
  const run = (argv: string[]) => {
    let out = ''
    let err = ''
    const code = admissionEvidenceCommand(fixture.root, argv, {
      out: text => (out += text),
      err: text => (err += text),
    })
    return { code, out, err }
  }

  it('接受退出 0，拒绝退出 1，结论写在标准输出', () => {
    const record = writeRecord('explicit-pass', passingRecord())
    const accepted = run(['--for', fixture.f, '--record', record])
    expect(accepted.code).toBe(0)
    expect(accepted.out).toContain('采用 C')
    const rejected = run(['--for', fixture.d, '--record', record])
    expect(rejected.code).toBe(1)
    expect(rejected.out).toContain('没有可采用的全量准入')
  })

  it.each([[[]], [['--record', 'x.json']], [['--for']], [['--for', 'HEAD', '--bogus']]])(
    '用法错误退出 2：%j',
    argv => {
      const result = run(argv)
      expect(result.code).toBe(2)
      expect(result.err).not.toBe('')
      expect(result.out).toBe('')
    },
  )
})

describe('真实 CLI 子进程', () => {
  const cli = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'admission-evidence', ...args],
      {
        cwd: fixture.root,
        encoding: 'utf8',
        env: { ...process.env, OMNE_SUBJECT_ROOT: fixture.root },
      },
    )

  it(
    '树相同接受（退出 0），树不同拒绝（退出 1），缺 --for 用法错误（退出 2）',
    // 起真实 CLI 子进程：核对 cli.ts 的接线与 OMNE_SUBJECT_ROOT 的解析，函数级用例测不到。
    { tags: ['slow'] },
    () => {
      const record = writeRecord('cli-pass', passingRecord())
      const accepted = cli('--for', fixture.f, '--record', record)
      expect(accepted.status, accepted.stderr).toBe(0)
      expect(accepted.stdout).toContain(`F ${fixture.f} 采用 C ${fixture.c} 的全量准入`)
      const rejected = cli('--for', fixture.d, '--record', record)
      expect(rejected.status).toBe(1)
      expect(rejected.stdout).toContain('树不同')
      const usage = cli('--record', record)
      expect(usage.status).toBe(2)
      expect(usage.stderr).toContain('admission-evidence 需要 --for <F>')
    },
  )
})
