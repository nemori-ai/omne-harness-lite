import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EXTERNAL_IN_REPO,
  LOCKFILE_KEY,
  NO_RECORDER,
  READ_SETS_DIR,
  READ_SETS_ENV,
  READ_SETS_HOME_ENV,
  RUNTIME_KEY,
  compareRecords,
  describeReadSets,
  digestKey,
  digests,
  readRaw,
  readRecord,
  readSetHome,
  readSetsRequested,
  readsOf,
  recordOf,
  recordPath,
  recordReadSets,
  type RawFile,
  type RawReadSets,
  type ReadSetRecord,
} from '../src/testing/read-sets.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tree(files: Readonly<Record<string, string>> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'read-sets-')))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const NONE = { content: [], listing: [], presence: [], incomplete: [] }

function raw(root: string, file: string, extra: Partial<RawFile> = {}): RawFile {
  return {
    file: join(root, file),
    verdict: 'passed',
    modules: [join(root, file)],
    externals: [],
    recorded: NONE,
    ...extra,
  }
}

describe('一份用例文件的读集', () => {
  it('模块、配置与记录到的读各成一类键；路径写成相对仓库根的', () => {
    const root = tree()
    const { reads, incomplete } = readsOf(
      root,
      raw(root, 'pkg/tests/a.spec.ts', {
        modules: [join(root, 'pkg/tests/a.spec.ts'), join(root, 'pkg/dist/index.js')],
        recorded: {
          content: [join(root, 'pkg/data.json')],
          listing: [join(root, 'pkg/src')],
          presence: [join(root, 'pkg/absent')],
          incomplete: [],
        },
      }),
      [join(root, 'pkg/vitest.config.ts'), join(root, 'vitest.tiers.mts')],
    )
    expect(reads).toEqual([
      'content:pkg/data.json',
      'content:pkg/dist/index.js',
      'content:pkg/tests/a.spec.ts',
      'content:pkg/vitest.config.ts',
      'content:vitest.tiers.mts',
      'listing:pkg/src',
      'presence:pkg/absent',
      RUNTIME_KEY,
    ])
    expect(incomplete).toEqual([])
  })

  it('依赖目录里的一律记成锁文件；仓库外的路径与内置模块不记', () => {
    const root = tree()
    const { reads, incomplete } = readsOf(
      root,
      raw(root, 'a.spec.ts', {
        externals: [join(root, 'node_modules/.pnpm/zod/index.js'), 'node:fs'],
        recorded: {
          content: [join(root, 'pkg/node_modules/x/package.json'), '/etc/hosts', root],
          listing: [dirname(root)],
          presence: [],
          incomplete: [],
        },
      }),
      [],
    )
    expect(reads).toEqual(['content:a.spec.ts', LOCKFILE_KEY, RUNTIME_KEY])
    expect(incomplete).toEqual([])
  })

  it('仓库里的外部化模块只知道入口，读集标不全', () => {
    const root = tree()
    const { reads, incomplete } = readsOf(
      root,
      raw(root, 'a.spec.ts', { externals: [join(root, 'scripts/tool.mjs')] }),
      [],
    )
    expect(reads).toContain('content:scripts/tool.mjs')
    expect(incomplete).toEqual([EXTERNAL_IN_REPO])
  })

  it('不是绝对路径的模块号（vite 的虚拟模块）不记', () => {
    const root = tree()
    const { reads } = readsOf(
      root,
      raw(root, 'a.spec.ts', {
        modules: [join(root, 'a.spec.ts'), '\0virtual:setup', 'virtual:entry', 'a.spec.ts'],
      }),
      [],
    )
    expect(reads).toEqual(['content:a.spec.ts', RUNTIME_KEY])
  })

  it('没有记录器交回的记录时标不全；记录器给的原因原样带上', () => {
    const root = tree()
    const { recorded: _, ...bare } = raw(root, 'a.spec.ts')
    expect(readsOf(root, bare, []).incomplete).toEqual([NO_RECORDER])
    expect(
      readsOf(
        root,
        raw(root, 'a.spec.ts', { recorded: { ...NONE, incomplete: ['起了子进程'] } }),
        [],
      ).incomplete,
    ).toEqual(['起了子进程'])
  })
})

describe('一项读的摘要', () => {
  it('内容：字节变了就变；不存在、是目录各有固定的值', () => {
    const root = tree({ 'a.txt': 'one', 'dir/b.txt': 'b' })
    const before = digestKey(root, 'content:a.txt')
    expect(digestKey(root, 'content:a.txt')).toBe(before)
    writeFileSync(join(root, 'a.txt'), 'two')
    expect(digestKey(root, 'content:a.txt')).not.toBe(before)
    expect(digestKey(root, 'content:absent.txt')).toBe('missing')
    expect(digestKey(root, 'content:dir')).toBe('dir')
  })

  it('目录列表：多一项就变，里面文件的内容变了不变', () => {
    const root = tree({ 'dir/a.txt': 'a' })
    const before = digestKey(root, 'listing:dir')
    writeFileSync(join(root, 'dir/a.txt'), 'changed')
    expect(digestKey(root, 'listing:dir')).toBe(before)
    writeFileSync(join(root, 'dir/b.txt'), 'b')
    expect(digestKey(root, 'listing:dir')).not.toBe(before)
    expect(digestKey(root, 'listing:absent')).toBe('missing')
    expect(digestKey(root, 'listing:dir/a.txt')).toBe('file')
  })

  it('目录列表按名字逐个区分：a 与 bc 两项和 ab 与 c 两项不同', () => {
    const root = tree({ 'one/a': '', 'one/bc': '', 'two/ab': '', 'two/c': '' })
    expect(digestKey(root, 'listing:one')).not.toBe(digestKey(root, 'listing:two'))
  })

  it('存在与否：文件、目录、没有；内容变了不变', () => {
    const root = tree({ 'dir/a.txt': 'a' })
    expect(digestKey(root, 'presence:dir/a.txt')).toBe('file')
    expect(digestKey(root, 'presence:dir')).toBe('dir')
    expect(digestKey(root, 'presence:absent')).toBe('missing')
    writeFileSync(join(root, 'dir/a.txt'), 'changed')
    expect(digestKey(root, 'presence:dir/a.txt')).toBe('file')
  })

  it('运行时一项记 Node 的版本与平台；同一次核对里每一项只算一次', () => {
    const root = tree({ 'a.txt': 'one' })
    expect(digestKey(root, RUNTIME_KEY)).toBe(
      `${process.version} ${process.platform} ${process.arch}`,
    )
    const digest = digests(root)
    const first = digest('content:a.txt')
    writeFileSync(join(root, 'a.txt'), 'two')
    expect(digest('content:a.txt')).toBe(first)
  })
})

function record(files: ReadSetRecord['files'], tree: ReadSetRecord['tree']): ReadSetRecord {
  return { version: 1, head: 'h', recordedAt: 't', tree, files }
}

describe('对着上一次的记录', () => {
  const now = record(
    {
      'a.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:a'] },
      'b.spec.ts': { verdict: 'failed', incomplete: [], reads: ['content:b'] },
      'c.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:c'] },
      'd.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:d'] },
      'e.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:e'] },
    },
    {},
  )
  const before = record(
    {
      'a.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:a', 'presence:p'] },
      'b.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:b'] },
      'c.spec.ts': { verdict: 'passed', incomplete: [], reads: ['content:c', 'content:c2'] },
      'd.spec.ts': { verdict: 'failed', incomplete: ['起了子进程'], reads: ['content:d'] },
    },
    {
      'content:a': '1',
      'presence:p': 'missing',
      'content:b': '1',
      'content:c': '1',
      'content:c2': '1',
      'content:d': '1',
    },
  )
  const current = new Map([
    ['content:a', '1'],
    ['presence:p', 'missing'],
    ['content:b', '1'],
    ['content:c', '1'],
    ['content:c2', '2'],
    ['content:d', '1'],
  ])
  const digest = (key: string) => current.get(key) ?? 'missing'

  it('五种结局：命中且相同、命中而不同、读集变了、上一次不全、没有记录', () => {
    expect(compareRecords(before, now, digest)).toEqual([
      { file: 'a.spec.ts', cell: 'hit-same', now: 'passed', was: 'passed' },
      { file: 'b.spec.ts', cell: 'hit-different', now: 'failed', was: 'passed' },
      { file: 'c.spec.ts', cell: 'changed', now: 'passed', was: 'passed', changed: ['content:c2'] },
      { file: 'd.spec.ts', cell: 'incomplete', now: 'passed', was: 'failed' },
      { file: 'e.spec.ts', cell: 'no-record', now: 'passed' },
    ])
  })

  it('没有上一次的记录时每一份都是没有记录；上一次的摘要缺了算变了', () => {
    expect(compareRecords(undefined, now, digest).map(outcome => outcome.cell)).toEqual(
      Array.from({ length: 5 }, () => 'no-record'),
    )
    const holed = record(before.files, { 'content:a': '1' })
    expect(compareRecords(holed, now, digest)[0]).toMatchObject({
      cell: 'changed',
      changed: ['presence:p'],
    })
  })

  it('读集变了的只列前五项', () => {
    const reads = Array.from({ length: 8 }, (_, index) => `content:x${index}`)
    const wide = record({ 'a.spec.ts': { verdict: 'passed', incomplete: [], reads } }, {})
    expect(compareRecords(wide, now, () => 'other')[0]?.changed).toEqual(reads.slice(0, 5))
  })
})

describe('读回存下的东西', () => {
  const good: ReadSetRecord = { version: 1, head: 'h', recordedAt: 't', tree: {}, files: {} }

  it('记录：形状对才认，没有、不是 JSON、版本不对、树或文件表不是对象的都按没有记录算', () => {
    const root = tree()
    const at = (name: string, text: string) => {
      writeFileSync(join(root, name), text)
      return join(root, name)
    }
    expect(readRecord(at('good.json', JSON.stringify(good)))).toEqual(good)
    expect(readRecord(join(root, 'absent.json'))).toBeUndefined()
    expect(readRecord(at('bad.json', '{'))).toBeUndefined()
    expect(readRecord(at('null.json', 'null'))).toBeUndefined()
    for (const broken of [
      { ...good, version: 2 },
      { ...good, tree: null },
      { ...good, tree: 'x' },
      { ...good, files: null },
      { ...good, files: 'x' },
      { version: 1, head: 'h', recordedAt: 't', tree: {} },
    ])
      expect(readRecord(at('broken.json', JSON.stringify(broken)))).toBeUndefined()
  })

  it('原始读集：配置与文件都得是数组', () => {
    const root = tree()
    const at = (text: unknown) => {
      writeFileSync(join(root, 'reads.json'), JSON.stringify(text))
      return join(root, 'reads.json')
    }
    expect(readRaw(at({ config: [], files: [] }))).toEqual({ config: [], files: [] })
    expect(readRaw(at({ config: 'x', files: [] }))).toBeUndefined()
    expect(readRaw(at({ config: [], files: {} }))).toBeUndefined()
    expect(readRaw(at({ files: [] }))).toBeUndefined()
  })
})

describe('一次运行的记录与报告', () => {
  const at = { head: 'abc', recordedAt: '2026-11-17T00:00:00.000Z' }

  function member(root: string, runDir: string, slug: string, files: readonly RawFile[]): void {
    mkdirSync(runDir, { recursive: true })
    const report: RawReadSets = { config: [join(root, 'pkg/vitest.config.ts')], files }
    writeFileSync(join(runDir, `${slug}.reads.json`), JSON.stringify(report))
  }

  it('被跳过的与仓库外的用例文件不进记录；记录里每一项读都有摘要', () => {
    const root = tree({ 'pkg/tests/a.spec.ts': 'a', 'pkg/vitest.config.ts': 'c' })
    const made = recordOf(
      root,
      {
        config: [join(root, 'pkg/vitest.config.ts')],
        files: [
          raw(root, 'pkg/tests/a.spec.ts'),
          raw(root, 'pkg/tests/skipped.spec.ts', { verdict: 'skipped' }),
          { ...raw(root, 'x.spec.ts'), file: '/elsewhere/x.spec.ts' },
        ],
      },
      digests(root),
      at,
    )
    expect(Object.keys(made.files)).toEqual(['pkg/tests/a.spec.ts'])
    expect(Object.keys(made.tree).sort()).toEqual(made.files['pkg/tests/a.spec.ts']?.reads)
    expect(made.tree['content:pkg/tests/a.spec.ts']).toBe(
      digestKey(root, 'content:pkg/tests/a.spec.ts'),
    )
    expect(made).toMatchObject({ version: 1, ...at })
  })

  it('同一棵树连记两次：第一次都没有记录，第二次全部命中且相同；改一个读到的文件，只有读它的那份变', () => {
    const root = tree({
      'pkg/tests/a.spec.ts': 'a',
      'pkg/tests/b.spec.ts': 'b',
      'pkg/data.json': '1',
      'pkg/vitest.config.ts': 'c',
    })
    const home = join(root, 'home')
    const runDir = join(root, 'run')
    const files = [
      raw(root, 'pkg/tests/a.spec.ts', {
        recorded: { ...NONE, content: [join(root, 'pkg/data.json')] },
      }),
      raw(root, 'pkg/tests/b.spec.ts'),
    ]
    member(root, runDir, 'pkg', files)
    const options = {
      root,
      home,
      runDir,
      tier: 'fast' as const,
      ...at,
      members: [{ path: 'pkg', slug: 'pkg' }],
    }
    const cells = () => recordReadSets(options)[0]?.outcomes.map(outcome => outcome.cell)

    expect(cells()).toEqual(['no-record', 'no-record'])
    expect(readRecord(recordPath(home, 'pkg', 'fast'))).toMatchObject(at)
    expect(readRecord(recordPath(home, 'pkg', 'fast'))?.files).toHaveProperty([
      'pkg/tests/a.spec.ts',
    ])
    expect(cells()).toEqual(['hit-same', 'hit-same'])

    writeFileSync(join(root, 'pkg/data.json'), '2')
    expect(recordReadSets(options)[0]?.outcomes).toEqual([
      {
        file: 'pkg/tests/a.spec.ts',
        cell: 'changed',
        now: 'passed',
        was: 'passed',
        changed: ['content:pkg/data.json'],
      },
      { file: 'pkg/tests/b.spec.ts', cell: 'hit-same', now: 'passed', was: 'passed' },
    ])
    expect(cells()).toEqual(['hit-same', 'hit-same'])
    expect(readdirSync(home)).toEqual(['pkg.fast.json'])
  })

  it('读集没变而裁定变了：报命中而不同；各层的记录分开放', () => {
    const root = tree({ 'pkg/tests/a.spec.ts': 'a', 'pkg/vitest.config.ts': 'c' })
    const home = join(root, 'home')
    const runDir = join(root, 'run')
    const options = {
      root,
      home,
      runDir,
      tier: 'fast' as const,
      ...at,
      members: [{ path: 'pkg', slug: 'pkg' }],
    }
    member(root, runDir, 'pkg', [raw(root, 'pkg/tests/a.spec.ts')])
    recordReadSets(options)
    member(root, runDir, 'pkg', [raw(root, 'pkg/tests/a.spec.ts', { verdict: 'failed' })])
    expect(recordReadSets({ ...options, tier: 'slow' })[0]?.outcomes[0]?.cell).toBe('no-record')
    expect(recordReadSets(options)[0]?.outcomes).toEqual([
      { file: 'pkg/tests/a.spec.ts', cell: 'hit-different', now: 'failed', was: 'passed' },
    ])
  })

  it('没有写出读集的成员报出来，不动它上一次的记录；读不出的记录按没有算', () => {
    const root = tree({ 'pkg/tests/a.spec.ts': 'a' })
    const home = join(root, 'home')
    const runDir = join(root, 'run')
    const options = {
      root,
      home,
      runDir,
      tier: 'fast' as const,
      ...at,
      members: [{ path: 'pkg', slug: 'pkg' }],
    }
    mkdirSync(runDir)
    expect(recordReadSets(options)).toEqual([
      { member: 'pkg', outcomes: [], incompleteNow: {}, problem: '这次运行没有写出读集' },
    ])
    expect(existsSync(home)).toBe(false)

    mkdirSync(home)
    writeFileSync(recordPath(home, 'pkg', 'fast'), '{ not json')
    member(root, runDir, 'pkg', [raw(root, 'pkg/tests/a.spec.ts')])
    expect(recordReadSets(options)[0]?.outcomes[0]?.cell).toBe('no-record')
    expect(JSON.parse(readFileSync(recordPath(home, 'pkg', 'fast'), 'utf8'))).toMatchObject({
      version: 1,
    })
  })

  it('记录写不进去时报在这个成员名下，不抛出，别的成员照记', () => {
    const root = tree({ 'pkg/tests/a.spec.ts': 'a', blocked: 'a file where the home should be' })
    const runDir = join(root, 'run')
    member(root, runDir, 'pkg', [raw(root, 'pkg/tests/a.spec.ts')])
    const [blocked] = recordReadSets({
      root,
      home: join(root, 'blocked'),
      runDir,
      tier: 'fast',
      ...at,
      members: [{ path: 'pkg', slug: 'pkg' }],
    })
    expect(blocked).toMatchObject({ member: 'pkg', outcomes: [] })
    expect(blocked?.problem).toMatch(/^记录没有写成：/u)
  })

  it('这一次读集不全的份数按原因计', () => {
    const root = tree({ 'pkg/tests/a.spec.ts': 'a', 'pkg/tests/b.spec.ts': 'b' })
    const runDir = join(root, 'run')
    member(root, runDir, 'pkg', [
      raw(root, 'pkg/tests/a.spec.ts', { recorded: { ...NONE, incomplete: ['起了子进程'] } }),
      raw(root, 'pkg/tests/b.spec.ts', {
        recorded: { ...NONE, incomplete: ['起了子进程', '起了工作线程'] },
      }),
    ])
    expect(
      recordReadSets({
        root,
        home: join(root, 'home'),
        runDir,
        tier: 'fast',
        ...at,
        members: [{ path: 'pkg', slug: 'pkg' }],
      })[0]?.incompleteNow,
    ).toEqual({ 起了子进程: 2, 起了工作线程: 1 })
  })
})

describe('报告的几行', () => {
  it('第一行给出各种结局的份数；命中而不同的逐份列出；不全的原因与没有读集的成员各一行', () => {
    const lines = describeReadSets([
      {
        member: 'pkg/a',
        outcomes: [
          { file: 'pkg/a/tests/1.spec.ts', cell: 'hit-same', now: 'passed', was: 'passed' },
          { file: 'pkg/a/tests/2.spec.ts', cell: 'hit-different', now: 'failed', was: 'passed' },
          { file: 'pkg/a/tests/3.spec.ts', cell: 'changed', now: 'passed', was: 'passed' },
        ],
        incompleteNow: { 起了子进程: 2 },
      },
      {
        member: 'pkg/b',
        outcomes: [
          { file: 'pkg/b/tests/1.spec.ts', cell: 'incomplete', now: 'passed', was: 'passed' },
          { file: 'pkg/b/tests/2.spec.ts', cell: 'no-record', now: 'passed' },
        ],
        incompleteNow: { 起了子进程: 1, 起了工作线程: 4 },
      },
      { member: 'pkg/c', outcomes: [], incompleteNow: {}, problem: '这次运行没有写出读集' },
    ])
    expect(lines).toEqual([
      '读集：这一次记了 5 份用例文件（2 个成员）。对着上一次的记录：会命中 2 份（裁定相同 1 份，不同 1 份），读集变了 1 份，上一次读集不全 1 份，没有上一次记录 1 份',
      '命中而裁定不同（读集不全或用例不确定的证据）：',
      '  pkg/a/tests/2.spec.ts：上一次 passed，这一次 failed',
      '这一次读集不全的原因（一份文件可以有几个）：起了工作线程 4 份、起了子进程 3 份',
      '没有读集的成员 1 个：pkg/c（这次运行没有写出读集）',
    ])
  })

  it('什么都好的时候只有第一行', () => {
    expect(
      describeReadSets([
        {
          member: 'pkg/a',
          outcomes: [
            { file: 'pkg/a/tests/1.spec.ts', cell: 'hit-same', now: 'passed', was: 'passed' },
          ],
          incompleteNow: {},
        },
      ]),
    ).toHaveLength(1)
  })
})

describe('开关与存放', () => {
  it('只在准入时记；环境变量给 0 时关掉', () => {
    expect(readSetsRequested({}, true)).toBe(true)
    expect(readSetsRequested({}, false)).toBe(false)
    expect(readSetsRequested({ [READ_SETS_ENV]: '0' }, true)).toBe(false)
    expect(readSetsRequested({ [READ_SETS_ENV]: '1' }, false)).toBe(false)
  })

  it('记录放主检出的 tmp 下，环境变量可以改；一个成员一层一份', () => {
    expect(readSetHome('/main', {})).toBe(join('/main', READ_SETS_DIR))
    expect(readSetHome('/main', { [READ_SETS_HOME_ENV]: '' })).toBe(join('/main', READ_SETS_DIR))
    expect(readSetHome('/main', { [READ_SETS_HOME_ENV]: '/elsewhere' })).toBe('/elsewhere')
    expect(recordPath('/home', 'pkg__a', 'slow')).toBe(join('/home', 'pkg__a.slow.json'))
  })
})
