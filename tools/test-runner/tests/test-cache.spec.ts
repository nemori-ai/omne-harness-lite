// 成员级测试结果缓存：键与影响面规则同源——用仓库里真实的路径规则与一份造出来的成员清单、依赖图，
// 核对每类改动让哪些成员的键变、哪些不变；再核对策略、写入条件、条目的读写与坏条目的处理。
// 规则一旦从键里漏掉一类输入（例如上游成员的文件），这里会变红。
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { coordinates } from '@omne-harness/repo-toolchain/core/git'
import {
  fileTree,
  listWorkspaceMembers,
  type TestMember,
  type WorkspaceMember,
} from '@omne-harness/repo-toolchain/core/workspace'
import { parseTestRunsConfig, readTestRunsConfig, type RunTier } from '../src/testing/config.ts'
import type { MemberRun } from '../src/testing/ledger.ts'
import { classify } from '../src/testing/scope.ts'
import { recordedRun } from '../src/testing/steps.ts'
import {
  cacheable,
  cacheHome,
  cacheKey,
  cachePolicy,
  entryPath,
  keyEnvironment,
  KEY_VERSION,
  memberInputs,
  memberKeys,
  readEntry,
  snapshotTree,
  TEST_CACHE_ENV,
  TEST_CACHE_HOME_ENV,
  upstreamOf,
  writeEntry,
  type CacheEntry,
  type KeyInputs,
} from '../src/testing/test-cache.ts'
import {
  dependentMembers,
  packageGraph,
  parsePackageGraph,
  type PackageGraph,
} from '../src/testing/turbo.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const CONFIG = readTestRunsConfig()
const RULES = CONFIG.affected

const member = (path: string, dependencies: string[] = []): WorkspaceMember => ({
  path,
  name: `@x/${path.split('/').pop() ?? path}`,
  scripts: { build: 'tsc', typecheck: 'tsc', test: 'vitest run' },
  dependencies,
})

// base ← mid ← top；message 独立；读者规则点名的几个真实成员也在清单里。
const MEMBERS = [
  member('packages/core/base'),
  member('packages/core/mid', ['@x/base']),
  member('apps/top', ['@x/mid']),
  member('packages/common/message'),
  member('tools/test-runner'),
  member('tools/product-checks'),
  member('tools/repo-toolchain'),
  member('packages.0.0.1.legacy/core/stream-assembly'),
]

/** 造出来的 turbo 包依赖图：与成员清单声明的依赖一致。 */
const GRAPH: PackageGraph = new Map(
  MEMBERS.map(entry => [entry.name, { path: entry.path, dependencies: entry.dependencies }]),
)

const byPath = (path: string) => {
  const found = MEMBERS.find(entry => entry.path === path)
  if (found === undefined) throw new Error(path)
  return found
}

/** 这些路径里哪些进 `path` 这个成员的输入集。 */
function inputsOf(path: string, paths: readonly string[]): string[] {
  const files = paths.map(file => classify(file, MEMBERS, RULES))
  return memberInputs(path, files, upstreamOf(byPath(path), MEMBERS, GRAPH))
}

/** 这个路径进了哪些成员的输入集。 */
const keyedBy = (file: string) =>
  MEMBERS.map(entry => entry.path).filter(path => inputsOf(path, [file]).includes(file))

describe('输入集与影响面规则同源：每类改动进谁的键', () => {
  it('成员自己的文件：进它与它下游的键，不进上游与无关成员的', () => {
    expect(keyedBy('packages/core/mid/src/data.json')).toEqual(['packages/core/mid', 'apps/top'])
    // tsconfig 与 tests/ 下的夹具都是成员文件；package.json 另被 test-runner 的读者规则点名。
    expect(keyedBy('packages/core/mid/tsconfig.json')).toEqual(['packages/core/mid', 'apps/top'])
    expect(keyedBy('packages/core/mid/package.json')).toEqual([
      'packages/core/mid',
      'apps/top',
      'tools/test-runner',
    ])
    expect(keyedBy('packages/core/mid/tests/fixtures/a.md')).toEqual([
      'packages/core/mid',
      'apps/top',
    ])
    // 产品源码（含测试与 vitest 配置）另被 product-checks 的读者规则点名，所以也进它的键。
    for (const file of [
      'packages/core/mid/src/a.ts',
      'packages/core/mid/tests/a.spec.ts',
      'packages/core/mid/vitest.config.ts',
    ])
      expect(keyedBy(file), file).toEqual(['packages/core/mid', 'apps/top', 'tools/product-checks'])
    expect(keyedBy('apps/top/src/a.ts')).toEqual(['apps/top', 'tools/product-checks'])
  })

  it('上游成员的文件按依赖图传递进下游的键：底层一改，直接与间接依赖它的都变', () => {
    expect(keyedBy('packages/core/base/src/schema.json')).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
    ])
  })

  it('读者规则点名的文件只进点名成员的键，不沿依赖传播', () => {
    expect(keyedBy('repo-toolchain.config.json')).toEqual([
      'tools/test-runner',
      'tools/product-checks',
      'tools/repo-toolchain',
    ])
    // 被读的成员根目录文档：只进读者规则点名的成员。
    expect(keyedBy('packages/common/message/README.md')).toEqual(['packages/common/message'])
    // 产品源码同时是成员文件与 product-checks 的读者输入。
    expect(keyedBy('packages/core/base/src/c.ts')).toEqual([
      'packages/core/base',
      'packages/core/mid',
      'apps/top',
      'tools/product-checks',
    ])
  })

  it('全局文件进每个成员的键：锁文件、根清单、分层定义、运行器配置、turbo 配置', () => {
    for (const file of [
      'pnpm-lock.yaml',
      'package.json',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      'vitest.tiers.mts',
      'tools/test-runner/test-runs.config.json',
      'tools/test-runner/src/testing/scope.ts',
      'turbo.json',
      'scripts/check.sh',
    ])
      expect(keyedBy(file), file).toEqual(MEMBERS.map(entry => entry.path))
  })

  it('锁文件单独一类，仍进每个成员的键：计划按 importer 收窄，键按整份内容取摘要，只多重跑不少跑', () => {
    expect(classify('pnpm-lock.yaml', MEMBERS, RULES).category).toBe('lockfile')
    expect(keyedBy('pnpm-lock.yaml')).toEqual(MEMBERS.map(entry => entry.path))
  })

  it('没有规则认得的文件让计划判全量，所以也进每个成员的键', () => {
    expect(classify('.gitignore', MEMBERS, RULES).category).toBe('unclassified')
    expect(keyedBy('.gitignore')).toEqual(MEMBERS.map(entry => entry.path))
  })

  it('不进键：成员根目录文档、只需常驻检查的路径、Python 工具、退役目录', () => {
    expect(keyedBy('packages/core/mid/README.md')).toEqual([])
    expect(keyedBy('packages/core/base/SPEC.md')).toEqual([])
    expect(keyedBy('docs/verification.md')).toEqual([])
    expect(keyedBy('.meta_harness/human/guide.md')).toEqual([])
    expect(keyedBy('tools/spec-tools/src/x.py')).toEqual([])
    expect(keyedBy('packages.0.0.1.legacy/core/stream-assembly/src/a.ts')).toEqual([])
  })

  it('输入集按路径排序，与给入顺序无关', () => {
    const paths = ['packages/core/mid/src/b.ts', 'pnpm-lock.yaml', 'packages/core/base/src/a.ts']
    expect(inputsOf('packages/core/mid', paths)).toEqual([
      'packages/core/base/src/a.ts',
      'packages/core/mid/src/b.ts',
      'pnpm-lock.yaml',
    ])
    expect(inputsOf('packages/core/mid', [...paths].reverse())).toEqual(
      inputsOf('packages/core/mid', paths),
    )
  })
})

describe('上游闭包', () => {
  it('按依赖图传递，不含自己；依赖成环时终止', () => {
    expect(upstreamOf(byPath('apps/top'), MEMBERS, GRAPH)).toEqual(
      new Set(['packages/core/mid', 'packages/core/base']),
    )
    expect(upstreamOf(byPath('packages/core/base'), MEMBERS, GRAPH)).toEqual(new Set())
    const cyclic: PackageGraph = new Map([
      ['@x/base', { path: 'packages/core/base', dependencies: ['@x/mid'] }],
      ['@x/mid', { path: 'packages/core/mid', dependencies: ['@x/base'] }],
    ])
    expect(upstreamOf(byPath('packages/core/mid'), MEMBERS, cyclic)).toEqual(
      new Set(['packages/core/base']),
    )
  })

  it('图里点名了清单外的包就报错：它的文件归不到成员，键会漏', () => {
    const graph: PackageGraph = new Map([
      ['@x/mid', { path: 'packages/core/mid', dependencies: ['@x/elsewhere'] }],
    ])
    expect(() => upstreamOf(byPath('packages/core/mid'), MEMBERS, graph)).toThrow(
      '@x/elsewhere 不在 workspace 成员清单里',
    )
    expect(() => upstreamOf(byPath('apps/top'), MEMBERS, new Map())).toThrow('没有 @x/top')
  })

  it('turbo query 的输出：读出目录与直接依赖，根包 // 不算；形状不对给 undefined', () => {
    const stdout = JSON.stringify({
      data: {
        packages: {
          items: [
            { name: '//', path: '', directDependencies: { items: [{ name: '//' }] } },
            {
              name: '@x/mid',
              path: 'packages\\core\\mid',
              directDependencies: { items: [{ name: '@x/base' }, { name: '//' }] },
            },
          ],
        },
      },
    })
    expect(parsePackageGraph(stdout)).toEqual(
      new Map([['@x/mid', { path: 'packages/core/mid', dependencies: ['@x/base'] }]]),
    )
    expect(parsePackageGraph('not json')).toBeUndefined()
    expect(parsePackageGraph('{"data":{}}')).toBeUndefined()
    expect(parsePackageGraph('{"data":{"packages":{"items":[{"name":1}]}}}')).toBeUndefined()
  })
})

const BASE_KEY: KeyInputs = {
  member: 'packages/core/mid',
  tier: 'fast',
  files: [
    ['packages/core/mid/src/a.ts', 'aaa'],
    ['pnpm-lock.yaml', 'lll'],
  ],
  platform: 'win32',
  arch: 'x64',
  node: 'v26.12.0',
  env: { NODE_OPTIONS: '--max-old-space-size=4096' },
}

describe('缓存键', () => {
  it('同样的输入给同样的键，与文件顺序、环境变量顺序无关', () => {
    const key = cacheKey(BASE_KEY)
    expect(key).toMatch(/^[0-9a-f]{64}$/u)
    expect(cacheKey({ ...BASE_KEY, files: [...BASE_KEY.files].reverse() })).toBe(key)
    expect(
      cacheKey({
        ...BASE_KEY,
        env: { VITEST_X: '1', NODE_OPTIONS: '--max-old-space-size=4096' },
      }),
    ).toBe(
      cacheKey({ ...BASE_KEY, env: { NODE_OPTIONS: '--max-old-space-size=4096', VITEST_X: '1' } }),
    )
  })

  it('换层、换平台或架构、换 Node 版本、改进键的环境变量、改任一输入文件的内容，键都变', () => {
    const key = cacheKey(BASE_KEY)
    const changed: Partial<KeyInputs>[] = [
      { tier: 'slow' },
      { tier: 'all' },
      { platform: 'linux' },
      { arch: 'arm64' },
      { node: 'v24.0.0' },
      { env: { NODE_OPTIONS: '--max-old-space-size=8192' } },
      { env: {} },
      { env: { ...BASE_KEY.env, VITEST_SEGFAULT_RETRY: '1' } },
      {
        files: [
          ['packages/core/mid/src/a.ts', 'bbb'],
          ['pnpm-lock.yaml', 'lll'],
        ],
      },
      {
        files: [
          ['packages/core/mid/src/a.ts', 'aaa'],
          ['pnpm-lock.yaml', 'mmm'],
        ],
      },
      { files: [['packages/core/mid/src/a.ts', 'aaa']] },
      { member: 'apps/top' },
    ]
    const keys = changed.map(delta => cacheKey({ ...BASE_KEY, ...delta }))
    for (const [index, other] of keys.entries())
      expect(other, JSON.stringify(changed[index])).not.toBe(key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('进键的环境变量按配置的模式选：并行度、预算与报告目录这类只影响怎么跑的不进', () => {
    const env = {
      NODE_OPTIONS: '--x',
      OMNE_RUNNER_ROOT: '/r',
      VITEST_SEGFAULT_RETRY: '1',
      VITEST_MAX_WORKERS: '8',
      OMNE_WORKER_BUDGET: '16',
      OMNE_TEST_MEMBER_CONCURRENCY: '4',
      OMNE_TEST_REPORT_DIR: '/runs/1',
      OMNE_TEST_LEDGER_HOME: '/ledgers',
      TMP: '/tmp',
      PATH: '/bin',
      UNSET: undefined,
    }
    expect(keyEnvironment(env, CONFIG.cache)).toEqual({
      NODE_OPTIONS: '--x',
      OMNE_RUNNER_ROOT: '/r',
      VITEST_SEGFAULT_RETRY: '1',
    })
    expect(keyEnvironment({}, CONFIG.cache)).toEqual({})
  })

  it('配置里的 cache 一节：两个清单都要有，缺了报错', () => {
    expect(CONFIG.cache.env).toEqual(expect.arrayContaining(['NODE_OPTIONS', 'VITEST_*']))
    expect(CONFIG.cache.ignoreEnv).toContain('VITEST_MAX_WORKERS')
    const raw = JSON.parse(
      readFileSync(join(ROOT, 'tools/test-runner/test-runs.config.json'), 'utf8'),
    ) as {
      cache: unknown
    }
    expect(() => parseTestRunsConfig({ ...raw, cache: { env: ['A'] } })).toThrow('cache.ignoreEnv')
    expect(() => parseTestRunsConfig({ ...raw, cache: undefined })).toThrow('cache.env')
  })
})

describe('读不读', () => {
  it('缺省读；FULL=1、--full、--no-cache、OMNE_TEST_CACHE=0、准入模式都只写不读，并说明原因', () => {
    const none = { noCache: false, full: false }
    expect(cachePolicy({}, none)).toEqual({ read: true, reason: '' })
    expect(cachePolicy({ [TEST_CACHE_ENV]: '1' }, none)).toEqual({ read: true, reason: '' })
    expect(cachePolicy({ [TEST_CACHE_ENV]: '' }, none)).toEqual({ read: true, reason: '' })
    expect(cachePolicy({}, { noCache: false, full: true })).toMatchObject({
      read: false,
      reason: expect.stringContaining('FULL=1'),
    })
    expect(cachePolicy({}, { noCache: true, full: false })).toMatchObject({
      read: false,
      reason: expect.stringContaining('--no-cache'),
    })
    expect(cachePolicy({ [TEST_CACHE_ENV]: '0' }, none)).toMatchObject({
      read: false,
      reason: expect.stringContaining('OMNE_TEST_CACHE=0'),
    })
    expect(cachePolicy({ OMNE_ADMISSION: '1' }, none)).toMatchObject({
      read: false,
      reason: expect.stringContaining('准入'),
    })
  })

  it('OMNE_TEST_CACHE 不是 0、1 或空就报错，不猜', () => {
    expect(() => cachePolicy({ [TEST_CACHE_ENV]: 'off' }, { noCache: false, full: false })).toThrow(
      'OMNE_TEST_CACHE 只能是 0、1 或不设',
    )
  })

  it('缓存根：环境变量给了用它，给空串当没给，否则在主检出的 tmp/test-cache', () => {
    expect(cacheHome('/repo', {})).toBe(join('/repo', 'tmp/test-cache'))
    expect(cacheHome('/repo', { [TEST_CACHE_HOME_ENV]: '' })).toBe(join('/repo', 'tmp/test-cache'))
    expect(cacheHome('/repo', { [TEST_CACHE_HOME_ENV]: '/x' })).toBe('/x')
  })
})

const passed = (name: string, ...tests: string[]) => ({
  name,
  status: 'passed',
  startTime: 0,
  endTime: 1,
  assertionResults: tests.map(fullName => ({ fullName, status: 'passed' })),
})

const RUN: MemberRun = {
  member: 'packages/core/mid',
  exitCode: 0,
  wallSeconds: 1,
  report: { testResults: [passed('/r/a.spec.ts', 'a', 'b'), passed('/r/b.spec.ts')] },
}

describe('只有完整通过才写', () => {
  it('退出码 0、有报告、没有失败、运行器没判问题：写', () => {
    expect(cacheable(RUN)).toBe(true)
    // 这一层一个用例都没有（慢层下没有慢测试的成员）也是完整通过。
    expect(cacheable({ ...RUN, report: { testResults: [] } })).toBe(true)
  })

  it('退出码非零、没有报告、运行器判了问题、报告里有失败的用例或文件：都不写', () => {
    expect(cacheable({ ...RUN, exitCode: 1 })).toBe(false)
    expect(cacheable({ ...RUN, exitCode: -1 })).toBe(false)
    const { report: _absent, ...withoutReport } = RUN
    expect(cacheable(withoutReport)).toBe(false)
    expect(cacheable({ ...RUN, problem: '跑了嵌套归档目录里的测试' })).toBe(false)
    expect(
      cacheable({
        ...RUN,
        report: {
          testResults: [
            {
              ...passed('/r/a.spec.ts', 'a'),
              assertionResults: [{ fullName: 'a', status: 'failed' }],
            },
          ],
        },
      }),
    ).toBe(false)
    expect(
      cacheable({
        ...RUN,
        report: { testResults: [{ ...passed('/r/a.spec.ts'), status: 'failed' }] },
      }),
    ).toBe(false)
  })
})

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})
function temporary(prefix: string): string {
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
  temporaries.push(path)
  return path
}

const ENTRY: CacheEntry = {
  version: KEY_VERSION,
  member: 'packages/core/mid',
  tier: 'fast',
  key: 'k'.repeat(64),
  ledger: '/ledgers/abc/1-fast',
  head: 'abc',
  dirty: false,
  recordedAt: '2026-10-30T00:00:00.000Z',
  tests: 12,
  files: 3,
  wallSeconds: 2.5,
  inputs: { files: 40, node: 'v26.12.0', platform: 'win32-x64' },
}

describe('条目', () => {
  it('写了能读回；按成员、层、键各放一处', () => {
    const home = temporary('test-cache-entries-')
    expect(writeEntry(home, ENTRY)).toBeUndefined()
    expect(readEntry(home, ENTRY.member, ENTRY.tier, ENTRY.key)).toEqual(ENTRY)
    expect(entryPath(home, ENTRY.member, ENTRY.tier, ENTRY.key)).toBe(
      join(home, 'packages__core__mid', `fast-${ENTRY.key}.json`),
    )
    expect(readEntry(home, ENTRY.member, 'slow', ENTRY.key)).toBeUndefined()
    expect(readEntry(home, ENTRY.member, ENTRY.tier, 'x'.repeat(64))).toBeUndefined()
    expect(readEntry(home, 'apps/top', ENTRY.tier, ENTRY.key)).toBeUndefined()
  })

  it('坏条目按没有：不是 JSON、形状不对、记的不是这个键或这个成员、版本不对', () => {
    const home = temporary('test-cache-bad-')
    const path = entryPath(home, ENTRY.member, ENTRY.tier, ENTRY.key)
    mkdirSync(dirname(path), { recursive: true })
    for (const text of [
      '{',
      '[]',
      JSON.stringify({ ...ENTRY, tests: '12' }),
      JSON.stringify({ ...ENTRY, key: 'other' }),
      JSON.stringify({ ...ENTRY, member: 'apps/top' }),
      JSON.stringify({ ...ENTRY, version: KEY_VERSION + 1 }),
    ]) {
      writeFileSync(path, text)
      expect(readEntry(home, ENTRY.member, ENTRY.tier, ENTRY.key), text).toBeUndefined()
    }
  })

  it('写不进去不抛，返回原因', () => {
    const home = temporary('test-cache-ro-')
    // 成员目录的位置被一个文件占着，建不了目录。
    writeFileSync(join(home, 'packages__core__mid'), '')
    expect(writeEntry(home, ENTRY)).toContain('packages__core__mid')
  })
})

// 归慢层：起 git 子进程。
describe('工作树快照（真起 git）', () => {
  it(
    '干净的取索引 blob；改过、暂存过、未跟踪的现算；删掉的不在；被忽略的从不在',
    { tags: ['slow'] },
    () => {
      const root = temporary('test-cache-snapshot-')
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
      const put = (path: string, text: string) => {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), text)
      }
      git('init', '-q')
      put('.gitignore', 'ignored/\n')
      put('kept.txt', 'kept\n')
      put('changed.txt', 'before\n')
      put('staged.txt', 'before\n')
      put('gone.txt', 'gone\n')
      put('中文 名.txt', '非 ASCII\n')
      git('add', '.')
      git('-c', 'user.name=F', '-c', 'user.email=f@example.invalid', 'commit', '-qm', 'init')
      put('changed.txt', 'after\n')
      put('staged.txt', 'staged\n')
      git('add', 'staged.txt')
      put('staged.txt', 'staged then changed\n')
      put('new.txt', 'new\n')
      put('ignored/x.txt', 'ignored\n')
      rmSync(join(root, 'gone.txt'))

      const snapshot = snapshotTree(root)
      const hashOf = (text: string) =>
        execFileSync('git', ['hash-object', '--stdin'], {
          cwd: root,
          encoding: 'utf8',
          input: text,
        }).trim()
      expect(snapshot.get('kept.txt')).toBe(git('rev-parse', 'HEAD:kept.txt'))
      expect(snapshot.get('中文 名.txt')).toBe(git('rev-parse', 'HEAD:中文 名.txt'))
      expect(snapshot.get('changed.txt')).toBe(hashOf('after\n'))
      expect(snapshot.get('staged.txt')).toBe(hashOf('staged then changed\n'))
      expect(snapshot.get('new.txt')).toBe(hashOf('new\n'))
      expect(snapshot.has('gone.txt')).toBe(false)
      expect(snapshot.has('ignored/x.txt')).toBe(false)
      expect([...snapshot.keys()].sort()).toEqual([
        '.gitignore',
        'changed.txt',
        'kept.txt',
        'new.txt',
        'staged.txt',
        '中文 名.txt',
      ])
      // 内容改回去，id 也回去：键只看内容。
      put('changed.txt', 'before\n')
      expect(snapshotTree(root).get('changed.txt')).toBe(git('rev-parse', 'HEAD:changed.txt'))
    },
  )
})

// 归慢层：起 turbo 与 git 子进程，在本仓库上算全部成员的键。
describe('本仓库', () => {
  it(
    'turbo 的包依赖图里有每个成员，转置后与 --filter=...<包> 给的下游一致',
    { tags: ['slow'], timeout: 120_000 },
    () => {
      const members = listWorkspaceMembers(fileTree(ROOT), RULES.excludeRoots)
      const graph = packageGraph(ROOT)
      for (const entry of members) expect(graph.get(entry.name)?.path, entry.name).toBe(entry.path)
      const seed = 'packages/agent/agent-cordis-contract'
      const dependents = new Set(
        members
          .filter(entry => entry.path === seed || upstreamOf(entry, members, graph).has(seed))
          .map(entry => entry.path),
      )
      expect(dependents).toEqual(dependentMembers(ROOT, members, [seed]))
    },
  )

  it('每个成员都算得出键：依赖图里没有清单外的包', { tags: ['slow'], timeout: 120_000 }, () => {
    const members = listWorkspaceMembers(fileTree(ROOT), RULES.excludeRoots)
    const { keys, uncacheable } = memberKeys(
      {
        root: ROOT,
        mainRoot: ROOT,
        targets: members.map(entry => entry.path),
        tier: 'fast',
        policy: { read: true, reason: '' },
        config: CONFIG,
        env: {},
      },
      members,
      packageGraph(ROOT),
      snapshotTree(ROOT),
    )
    expect([...uncacheable]).toEqual([])
    expect(keys.size).toBe(members.length)
    for (const [path, { inputs }] of keys) expect(inputs, path).toBeGreaterThan(0)
  })
})

/** 成员的测试脚本：按第一个参数往报告目录写一份 vitest 形状的报告，再按第二个参数退出；同时记一笔自己跑了。 */
const FAKE_VITEST = `
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const [slug, code] = process.argv.slice(2)
appendFileSync(join(process.cwd(), '..', '..', 'ran.txt'), slug + '\\n')
writeFileSync(
  join(process.env.OMNE_TEST_REPORT_DIR, slug + '.json'),
  JSON.stringify({ testResults: [{ name: join(process.cwd(), 'tests/a.spec.ts'), status: 'passed', startTime: 0, endTime: 1,
    assertionResults: [{ fullName: 'a', status: code === '0' ? 'passed' : 'failed' }] }] }),
)
process.exit(Number(code))
`

/** 一个小 workspace（已提交）：good 通过，bad 失败；两层脚本相同。 */
function workspace(): { root: string; targets: TestMember[] } {
  const root = temporary('test-cache-e2e-')
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put(
    'package.json',
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  put('pnpm-workspace.yaml', 'packages:\n  - members/*\n')
  put('fake-vitest.mjs', FAKE_VITEST)
  put('.gitignore', 'ran.txt\nrun-*/\n')
  const targets = (['good', 'bad'] as const).map(name => {
    const code = name === 'good' ? 0 : 3
    const script = `node ../../fake-vitest.mjs members__${name} ${code}`
    put(
      `members/${name}/package.json`,
      JSON.stringify({
        name: `@fixture/${name}`,
        scripts: { test: script, 'test:fast': script, 'test:slow': script },
      }),
    )
    put(`members/${name}/src/index.ts`, 'export const value = 1\n')
    return { path: `members/${name}`, name: `@fixture/${name}`, script, dependencies: [] }
  })
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync(
    'git',
    ['-c', 'user.name=F', '-c', 'user.email=f@example.invalid', 'commit', '-qm', 'fixture'],
    { cwd: root },
  )
  return { root, targets }
}

const BUDGET = {
  workers: 2,
  machine: { cores: 2, idleFraction: 1, freeMemoryMiB: 4096 },
  source: 'env' as const,
}

interface LedgerCache {
  readonly meta: {
    readonly members: string[]
    readonly cache: {
      readonly mode: string
      readonly hits: { member: string; source: string }[]
      readonly written: string[]
    }
  }
  readonly members: { member: string }[]
}

// 归慢层：每次运行真起一次 turbo。
describe('一次运行里的缓存（真起 turbo）', { timeout: 180_000 }, () => {
  it(
    '完整通过的写进去，失败的不写；第二次命中的不执行并标明来源；改了输入、换层、不读时照跑；坏条目按未命中',
    { tags: ['slow'] },
    async () => {
      const { root, targets } = workspace()
      const home = temporary('test-cache-home-')
      const saved = { ...process.env }
      process.env[TEST_CACHE_HOME_ENV] = home
      delete process.env['FULL']
      delete process.env['OMNE_ADMISSION']
      delete process.env[TEST_CACHE_ENV]
      let count = 0
      const run = async (tier: RunTier, read = true) => {
        count += 1
        const out = join(root, `run-${count}`)
        writeFileSync(join(root, 'ran.txt'), '')
        const exitCode = await recordedRun(root, {
          script: 'test',
          tier,
          targets,
          build: false,
          out,
          at: coordinates(root, undefined),
          base: null,
          plan: null,
          budget: BUDGET,
          cache: { read, reason: read ? '' : '测试要求不读' },
        })
        const ledger = JSON.parse(readFileSync(join(out, 'ledger.json'), 'utf8')) as LedgerCache
        const ran = readFileSync(join(root, 'ran.txt'), 'utf8').split('\n').filter(Boolean).sort()
        return {
          out,
          exitCode,
          ran,
          ledger,
          summary: readFileSync(join(out, 'summary.md'), 'utf8'),
        }
      }
      try {
        // 第一次：都跑；good 完整通过写进去，bad 失败不写。
        const first = await run('fast')
        expect(first.exitCode).toBe(1)
        expect(first.ran).toEqual(['members__bad', 'members__good'])
        expect(first.ledger.meta.cache).toMatchObject({
          mode: 'read-write',
          hits: [],
          written: ['members/good'],
        })
        expect(first.summary).toContain('缓存命中 0 个成员；本次写入 1 个成员的完整通过')

        // 第二次：good 命中不执行、来源指向第一次的账本；bad 照跑；成员一级的读数只有跑了的。
        const second = await run('fast')
        expect(second.exitCode).toBe(1)
        expect(second.ran).toEqual(['members__bad'])
        expect(second.ledger.meta.cache.hits).toEqual([
          expect.objectContaining({ member: 'members/good', source: first.out }),
        ])
        expect(second.ledger.meta.members).toEqual(['members/good', 'members/bad'])
        expect(second.ledger.members.map(entry => entry.member)).toEqual(['members/bad'])
        expect(second.summary).toContain(`缓存命中 1 个成员，来源 ${first.out}`)
        expect(second.summary).toContain('1 个成员（另有 1 个成员缓存命中，没有跑）、1 个文件')

        // 换层：键不同，good 重跑。
        const slow = await run('slow')
        expect(slow.ran).toEqual(['members__bad', 'members__good'])
        expect(slow.ledger.meta.cache.written).toEqual(['members/good'])

        // 改 good 自己的文件：快层的 good 重跑；改回去又命中。
        writeFileSync(join(root, 'members/good/src/index.ts'), 'export const value = 2\n')
        expect((await run('fast')).ran).toEqual(['members__bad', 'members__good'])
        writeFileSync(join(root, 'members/good/src/index.ts'), 'export const value = 1\n')
        expect((await run('fast')).ran).toEqual(['members__bad'])

        // 不读：good 有条目也照跑，账本写明只写不读。
        const writeOnly = await run('fast', false)
        expect(writeOnly.ran).toEqual(['members__bad', 'members__good'])
        expect(writeOnly.ledger.meta.cache.mode).toBe('write-only')
        expect(writeOnly.summary).toContain('只写不读：测试要求不读')

        // 坏条目：按未命中，重跑后被完整通过的新条目覆盖。
        const entries = readdirSync(join(home, 'members__good')).filter(name =>
          name.startsWith('fast-'),
        )
        expect(entries.length).toBe(2)
        for (const name of entries) writeFileSync(join(home, 'members__good', name), '{')
        expect((await run('fast')).ran).toEqual(['members__bad', 'members__good'])
        expect((await run('fast')).ran).toEqual(['members__bad'])
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
        Object.assign(process.env, saved)
      }
    },
  )
})
