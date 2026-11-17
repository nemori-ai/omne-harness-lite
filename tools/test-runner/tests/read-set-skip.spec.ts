import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HISTORY_KEPT,
  archiveLatest,
  cachedRun,
  carriedOf,
  floorOf,
  floorReads,
  historyDir,
  ownerOf,
  planReuse,
  readHistory,
  reusableFiles,
  skippedOf,
  type Floor,
} from '../src/testing/read-set-skip.ts'
import {
  CHANGED_DURING_RUN,
  cachedResults,
  digests,
  readRecord,
  recordOf,
  recordPath,
  recordReadSets,
  writeRecord,
  type CachedResult,
  type ReadSetRecord,
  type RecordedFile,
} from '../src/testing/read-sets.ts'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

const ENV = { VITEST_POOL: 'forks' }

const cached = (file: string): CachedResult => ({
  result: {
    name: `/old/root/${file}`,
    status: 'passed',
    startTime: 0,
    endTime: 2000,
    assertionResults: [{ fullName: `${file} works`, status: 'passed' }],
  },
  timing: { file: `/old/root/${file}`, collectSeconds: 0.5, tests: [] },
})

const entry = (file: string, extra: Partial<RecordedFile> = {}): RecordedFile => ({
  verdict: 'passed',
  incomplete: [],
  reads: [`content:${file}`, 'content:src/a.ts'],
  cached: cached(file),
  ...extra,
})

function record(
  files: Record<string, RecordedFile>,
  tree: Record<string, string>,
  extra: Partial<ReadSetRecord> = {},
): ReadSetRecord {
  return {
    version: 1,
    head: 'head-new',
    recordedAt: '2026-11-17T10:00:00.000Z',
    tree,
    files,
    env: ENV,
    ...extra,
  }
}

const TREE = { 'content:t.spec.ts': 'f1', 'content:src/a.ts': 'a1' }
const same = (key: string) => TREE[key as keyof typeof TREE] ?? 'missing'

describe('一份用例文件能不能跳过（全化表）', () => {
  const reuse = (records: ReadSetRecord[], digest = same, env = ENV) =>
    reusableFiles(records, digest, env).get('t.spec.ts')

  it('没有任何记录：跑', () => {
    expect(reuse([])).toBeUndefined()
  })

  it('完整、通过、带结果、环境相同、读到的每一项都没变：跳过，结果与来源取自那份记录', () => {
    const hit = reuse([record({ 't.spec.ts': entry('t.spec.ts') }, TREE)])
    expect(hit?.from).toEqual({ head: 'head-new', recordedAt: '2026-11-17T10:00:00.000Z' })
    expect(hit?.entry.cached.result.assertionResults).toHaveLength(1)
    expect(hit?.tree).toEqual(TREE)
  })

  it('读集不全：跑', () => {
    expect(
      reuse([record({ 't.spec.ts': entry('t.spec.ts', { incomplete: ['起了子进程'] }) }, TREE)]),
    ).toBeUndefined()
  })

  it('上一次没过：跑', () => {
    expect(
      reuse([record({ 't.spec.ts': entry('t.spec.ts', { verdict: 'failed' }) }, TREE)]),
    ).toBeUndefined()
  })

  it('通过但没带结果（旧运行器写的记录）：跑', () => {
    const { cached: _dropped, ...bare } = entry('t.spec.ts')
    expect(reuse([record({ 't.spec.ts': bare }, TREE)])).toBeUndefined()
  })

  it('记录没有环境变量，或环境变量不同：跑', () => {
    const { env: _dropped, ...noEnv } = record({ 't.spec.ts': entry('t.spec.ts') }, TREE)
    expect(reuse([noEnv])).toBeUndefined()
    expect(
      reuse([record({ 't.spec.ts': entry('t.spec.ts') }, TREE)], same, { VITEST_POOL: 'threads' }),
    ).toBeUndefined()
  })

  it('读到的某一项摘要变了，或文件已被删掉：跑', () => {
    const changed = (key: string) => (key === 'content:src/a.ts' ? 'a2' : same(key))
    expect(reuse([record({ 't.spec.ts': entry('t.spec.ts') }, TREE)], changed)).toBeUndefined()
    const deleted = (key: string) => (key === 'content:src/a.ts' ? 'missing' : same(key))
    expect(reuse([record({ 't.spec.ts': entry('t.spec.ts') }, TREE)], deleted)).toBeUndefined()
  })

  it('记录里缺了某一项的摘要：跑', () => {
    expect(
      reuse([record({ 't.spec.ts': entry('t.spec.ts') }, { 'content:t.spec.ts': 'f1' })]),
    ).toBeUndefined()
  })

  it('最近一份对不上、更早的一份对得上（别的分支轮流跑）：跳过，来源是更早那份', () => {
    const newer = record({ 't.spec.ts': entry('t.spec.ts') }, { ...TREE, 'content:src/a.ts': 'a9' })
    const older = record({ 't.spec.ts': entry('t.spec.ts') }, TREE, {
      head: 'head-old',
      recordedAt: '2026-11-17T08:00:00.000Z',
    })
    expect(reuse([newer, older])?.from.head).toBe('head-old')
  })

  it('同样的读集与环境下有一份记录没过（用例不确定的证据）：跑', () => {
    const passed = record({ 't.spec.ts': entry('t.spec.ts') }, TREE)
    const failed = record({ 't.spec.ts': entry('t.spec.ts', { verdict: 'failed' }) }, TREE, {
      head: 'head-old',
    })
    expect(reuse([passed, failed])).toBeUndefined()
  })
})

describe('跳过的底：读集之外也要算进去的输入', () => {
  const MEMBERS = ['packages/a', 'packages/ab', 'apps/server']
  const FLOOR: Floor = {
    global: ['package.json', 'pnpm-lock.yaml', 'tsconfig.base.json'],
    member: member => [`${member}/package.json`, `${member}/tsconfig.json`],
  }

  it('成员按最长的目录前缀认，前缀要到斜杠为止', () => {
    expect(ownerOf('packages/ab/src/x.ts', MEMBERS)).toBe('packages/ab')
    expect(ownerOf('packages/a/src/x.ts', MEMBERS)).toBe('packages/a')
    expect(ownerOf('packages/a', MEMBERS)).toBe('packages/a')
    expect(ownerOf('tools/x.ts', MEMBERS)).toBeUndefined()
    expect(ownerOf('packages/abc/src/x.ts', ['packages/ab'])).toBeUndefined()
  })

  it('全局文件，加上读集涉及的每个成员的 package.json 与 tsconfig，都并进读集；运行时一项不算成员', () => {
    expect(
      floorReads(
        ['content:packages/a/src/x.ts', 'listing:apps/server/tests', 'runtime:node'],
        MEMBERS,
        FLOOR,
      ),
    ).toEqual([
      'content:apps/server/package.json',
      'content:apps/server/tsconfig.json',
      'content:package.json',
      'content:packages/a/package.json',
      'content:packages/a/src/x.ts',
      'content:packages/a/tsconfig.json',
      'content:pnpm-lock.yaml',
      'content:tsconfig.base.json',
      'listing:apps/server/tests',
      'runtime:node',
    ])
  })

  it('并进来的底变了，用例就不跳过：改了依赖成员的 package.json（例如 exports）', () => {
    const reads = floorReads(
      ['content:t.spec.ts', 'content:packages/a/dist/index.js'],
      MEMBERS,
      FLOOR,
    )
    const tree = Object.fromEntries(reads.map(key => [key, 'v1']))
    const rec = record({ 't.spec.ts': entry('t.spec.ts', { reads }) }, tree)
    expect(reusableFiles([rec], () => 'v1', ENV).has('t.spec.ts')).toBe(true)
    const exportsChanged = (key: string) =>
      key === 'content:packages/a/package.json' ? 'v2' : 'v1'
    expect(reusableFiles([rec], exportsChanged, ENV).has('t.spec.ts')).toBe(false)
    const tsconfigChanged = (key: string) => (key === 'content:tsconfig.base.json' ? 'v2' : 'v1')
    expect(reusableFiles([rec], tsconfigChanged, ENV).has('t.spec.ts')).toBe(false)
  })
})

describe('历史记录', () => {
  function home(): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'read-set-skip-')))
    homes.push(dir)
    return dir
  }

  it('最近一份存进历史再写新的；历史只留最近几份；读回时最近的在前', () => {
    const dir = home()
    for (let index = 0; index < HISTORY_KEPT + 2; index += 1) {
      archiveLatest(dir, 'm', 'fast')
      writeRecord(
        recordPath(dir, 'm', 'fast'),
        record({}, {}, { head: `h${index}`, recordedAt: `2026-11-17T0${index}:00:00.000Z` }),
      )
    }
    expect(readdirSync(historyDir(dir, 'm', 'fast'))).toHaveLength(HISTORY_KEPT)
    expect(readHistory(dir, 'm', 'fast').map(entry => entry.head)).toEqual([
      'h5',
      'h4',
      'h3',
      'h2',
      'h1',
    ])
    expect(readHistory(dir, 'm', 'slow')).toEqual([])
  })
})

describe('跳过的文件并回成员的结果', () => {
  it('结果与计时里的文件名换成当前的根，成员的退出码是 0；没有跳过的文件时没有这一份', () => {
    const reused = reusableFiles([record({ 't.spec.ts': entry('t.spec.ts') }, TREE)], same, ENV)
    const run = cachedRun('m', '/new/root', reused)
    expect(run?.exitCode).toBe(0)
    expect(run?.report?.testResults.map(result => result.name)).toEqual(['/new/root/t.spec.ts'])
    expect(run?.timing?.files.map(file => file.file)).toEqual(['/new/root/t.spec.ts'])
    expect(cachedRun('m', '/new/root', new Map())).toBeUndefined()
  })
})

describe('记录与跳过连起来', () => {
  function checkout(files: Record<string, string>): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'read-set-skip-root-')))
    homes.push(root)
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    return root
  }

  const rawFile = (root: string, file: string, verdict: 'passed' | 'failed' = 'passed') => ({
    file: join(root, file),
    verdict,
    modules: [join(root, file), join(root, 'pkg/src/a.ts')],
    externals: [],
    recorded: { content: [], listing: [], presence: [], incomplete: [] },
  })

  function run(root: string, dir: string, ran: readonly string[]): string {
    const runDir = join(root, dir)
    mkdirSync(runDir, { recursive: true })
    writeFileSync(
      join(runDir, 'pkg.reads.json'),
      JSON.stringify({ config: [], files: ran.map(file => rawFile(root, file)) }),
    )
    writeFileSync(
      join(runDir, 'pkg.json'),
      JSON.stringify({
        testResults: ran.map(file => ({
          name: join(root, file),
          status: 'passed',
          startTime: 0,
          endTime: 1500,
          assertionResults: [{ fullName: `${file} works`, status: 'passed' }],
        })),
      }),
    )
    return runDir
  }

  it('记录带上底、环境与通过的文件的结果；运行前后同一项摘要不同的标「运行中途变了」', () => {
    const root = checkout({
      'pkg/tests/a.spec.ts': 'a',
      'pkg/tests/b.spec.ts': 'b',
      'pkg/src/a.ts': 'src',
      'pkg/package.json': '{}',
      'tsconfig.base.json': '{}',
    })
    const floor = floorOf(root, ['tsconfig*.json'])
    const made = recordOf(
      root,
      {
        config: [],
        files: [
          rawFile(root, 'pkg/tests/a.spec.ts'),
          rawFile(root, 'pkg/tests/b.spec.ts', 'failed'),
        ],
      },
      digests(root),
      { head: 'h', recordedAt: 't' },
      {
        floor: reads => floorReads(reads, ['pkg'], floor),
        cached: new Map([
          ['pkg/tests/a.spec.ts', cached('pkg/tests/a.spec.ts')],
          ['pkg/tests/b.spec.ts', cached('pkg/tests/b.spec.ts')],
        ]),
        env: ENV,
        before: key => (key === 'content:pkg/src/a.ts' ? 'before-the-run' : undefined),
      },
    )
    expect(made.env).toEqual(ENV)
    expect(made.files['pkg/tests/a.spec.ts']?.reads).toEqual(
      expect.arrayContaining(['content:pkg/package.json', 'content:tsconfig.base.json']),
    )
    expect(made.tree['content:tsconfig.base.json']).toBeDefined()
    expect(made.files['pkg/tests/a.spec.ts']?.cached).toBeDefined()
    expect(made.files['pkg/tests/b.spec.ts']?.cached).toBeUndefined()
    expect(made.files['pkg/tests/a.spec.ts']?.incomplete).toEqual([CHANGED_DURING_RUN])
  })

  it('第一轮记下，第二轮跳过并把条目带进新记录、旧记录进历史；改了成员的 package.json 或环境变量就不跳过', () => {
    const root = checkout({
      'pkg/tests/a.spec.ts': 'a',
      'pkg/src/a.ts': 'src',
      'pkg/package.json': '{}',
    })
    const home = join(root, 'home')
    const floor = floorOf(root, [])
    const record = (runDir: string, plan = new Map<string, Map<string, never>>()) =>
      recordReadSets({
        root,
        home,
        runDir,
        tier: 'fast',
        head: runDir.endsWith('2') ? 'h2' : 'h1',
        recordedAt: runDir.endsWith('2') ? '2026-11-17T02:00:00.000Z' : '2026-11-17T01:00:00.000Z',
        members: [{ path: 'pkg', slug: 'pkg' }],
        extras: () => ({
          floor: reads => floorReads(reads, ['pkg'], floor),
          cached: cachedResults(root, runDir, 'pkg'),
          env: ENV,
        }),
        carry: member => carriedOf(plan, member),
        archive: slug => archiveLatest(home, slug, 'fast'),
      })
    const plan = (env = ENV) =>
      planReuse({
        root,
        home,
        tier: 'fast',
        members: ['pkg'],
        slug: member => member,
        env,
        digest: digests(root),
      })

    record(run(root, 'run1', ['pkg/tests/a.spec.ts']))
    const second = plan()
    expect([...skippedOf(second, 'pkg')]).toEqual(['tests/a.spec.ts'])
    expect(second.get('pkg')?.get('pkg/tests/a.spec.ts')?.from.head).toBe('h1')

    record(run(root, 'run2', []), second as never)
    expect(
      readRecord(recordPath(home, 'pkg', 'fast'))?.files['pkg/tests/a.spec.ts']?.cached,
    ).toBeDefined()
    expect(readdirSync(historyDir(home, 'pkg', 'fast'))).toHaveLength(1)
    expect([...skippedOf(plan(), 'pkg')]).toEqual(['tests/a.spec.ts'])

    expect(plan({ VITEST_POOL: 'threads' }).size).toBe(0)
    writeFileSync(join(root, 'pkg/package.json'), '{"exports":"./other.js"}')
    expect(plan().size).toBe(0)
  })
})
