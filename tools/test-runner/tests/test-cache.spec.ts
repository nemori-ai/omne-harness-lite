// 成员级测试结果缓存：键与影响面规则同源——用仓库里真实的路径规则与一份造出来的成员清单、依赖图，
// 核对每类改动让哪些成员的键变、哪些不变；再核对策略、写入条件、条目的读写与坏条目的处理。
// 规则一旦从键里漏掉一类输入（例如上游成员的文件），这里会变红。
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { slugOf } from '../src/testing/run.ts'
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
import {
  buildStep,
  fastThenSlow,
  recordedRun,
  runCachePolicy,
  stepTestCache,
  testStep,
  writePlanFile,
  type PlanFile,
} from '../src/testing/steps.ts'
import {
  cacheable,
  cacheHome,
  builtFromPath,
  cacheKey,
  cacheMeta,
  distDigest,
  type BuiltMember,
  cachePolicy,
  entryPath,
  isEntry,
  keyEnvironment,
  lookupCache,
  KEY_VERSION,
  memberInputs,
  memberKeys,
  currentDigests,
  readBuiltFrom,
  readEntry,
  recordCache,
  snapshotTree,
  TEST_CACHE_ENV,
  TEST_CACHE_HOME_ENV,
  upstreamOf,
  writeBuiltFrom,
  writeEntry,
  type CacheEntry,
  type CacheLookup,
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
    const none = { noCache: false, full: false, build: true }
    expect(cachePolicy({}, none)).toEqual({
      read: true,
      reason: '',
      write: true,
      writeReason: '',
    })
    expect(cachePolicy({ [TEST_CACHE_ENV]: '1' }, none)).toMatchObject({ read: true })
    expect(cachePolicy({ [TEST_CACHE_ENV]: '' }, none)).toMatchObject({ read: true })
    expect(cachePolicy({}, { ...none, full: true })).toMatchObject({
      read: false,
      reason: expect.stringContaining('FULL=1'),
    })
    expect(cachePolicy({}, { ...none, noCache: true })).toMatchObject({
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

  it('本次没有构建就不写，读不受影响；构建过才写', () => {
    const base = { noCache: false, full: false }
    expect(cachePolicy({}, { ...base, build: false })).toMatchObject({
      read: true,
      write: false,
      writeReason: expect.stringContaining('没有构建'),
    })
    expect(cachePolicy({}, { ...base, build: true })).toMatchObject({ read: true, write: true })
    // 不读的原因与不写互不牵连。
    expect(cachePolicy({}, { noCache: true, full: false, build: true })).toMatchObject({
      read: false,
      write: true,
    })
  })

  it('run 认 FULL=1：不读；不带构建时也不写，所以 `FULL=1 pnpm run test` 既不读也不写', () => {
    expect(runCachePolicy({ FULL: '1' }, { noCache: false, build: false })).toMatchObject({
      read: false,
      write: false,
    })
    expect(runCachePolicy({ FULL: '1' }, { noCache: false, build: true })).toMatchObject({
      read: false,
      write: true,
    })
    expect(runCachePolicy({}, { noCache: false, build: true })).toMatchObject({ read: true })
    expect(() => runCachePolicy({ FULL: 'yes' }, { noCache: false, build: true })).toThrow()
  })

  it('OMNE_TEST_CACHE 不是 0、1 或空就报错，不猜', () => {
    expect(() =>
      cachePolicy({ [TEST_CACHE_ENV]: 'off' }, { noCache: false, full: false, build: true }),
    ).toThrow('OMNE_TEST_CACHE 只能是 0、1 或不设')
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
      JSON.stringify({ ...ENTRY, inputs: { ...ENTRY.inputs, files: '40' } }),
      JSON.stringify({ ...ENTRY, inputs: { ...ENTRY.inputs, node: 26 } }),
      JSON.stringify({ ...ENTRY, inputs: { files: 40, node: 'v26.12.0' } }),
    ]) {
      writeFileSync(path, text)
      expect(readEntry(home, ENTRY.member, ENTRY.tier, ENTRY.key), text).toBeUndefined()
    }
  })

  it('形状核对：认得的层才算条目，inputs 的三项各有类型', () => {
    expect(isEntry(ENTRY)).toBe(true)
    expect(isEntry({ ...ENTRY, tier: 'medium' })).toBe(false)
    expect(isEntry({ ...ENTRY, tier: 7 })).toBe(false)
    expect(isEntry({ ...ENTRY, inputs: { ...ENTRY.inputs, files: '40' } })).toBe(false)
    expect(isEntry({ ...ENTRY, inputs: { ...ENTRY.inputs, node: 26 } })).toBe(false)
    expect(isEntry({ ...ENTRY, inputs: { files: 40, node: 'v26.12.0' } })).toBe(false)
  })

  it('写不进去不抛，返回原因', () => {
    const home = temporary('test-cache-ro-')
    // 成员目录的位置被一个文件占着，建不了目录。
    writeFileSync(join(home, 'packages__core__mid'), '')
    expect(writeEntry(home, ENTRY)).toContain('packages__core__mid')
  })
})

// 归慢层：起 git 子进程。
describe('写缓存：策略与跑完后的键复核', () => {
  const SOURCE = { ledger: '/runs/1', head: 'abc', dirty: false }
  /** 一个只有成员 mid 的查询结果；`rekey` 是可注入的钩子：模拟「跑完后重算键」得到什么。 */
  const lookupFor = (
    home: string,
    write: boolean,
    rekey: CacheLookup['rekey'],
    built: ReadonlyMap<string, BuiltMember> | null = BUILT,
  ): CacheLookup => ({
    home,
    policy: { read: true, reason: '', write, writeReason: write ? '' : '没有构建' },
    keys: new Map([['packages/core/mid', { key: 'k-before', digest: 'd-built', inputs: 3 }]]),
    ...(built === null ? {} : { built }),
    uncacheable: new Map(),
    hits: new Map(),
    rekey,
  })
  /** 构建记录：这个成员构建时的输入摘要。 */
  const BUILT = new Map([['packages/core/mid', { input: 'd-built' }]])
  const same = () =>
    new Map([['packages/core/mid', { key: 'k-before', digest: 'd-built', inputs: 3 }]])
  const entryFile = (home: string, key: string) => entryPath(home, RUN.member, 'fast', key)

  it('策略允许写、键没变：写', () => {
    const home = temporary('test-cache-record-')
    const recorded = recordCache(lookupFor(home, true, same), [RUN], 'fast', SOURCE)
    expect(recorded).toEqual({ written: [RUN.member], problems: [], skipped: [] })
    expect(existsSync(entryFile(home, 'k-before'))).toBe(true)
  })

  it('策略不许写（本次没有构建）：通过的成员也不写，缓存目录里没有条目', () => {
    const home = temporary('test-cache-record-')
    const recorded = recordCache(lookupFor(home, false, same), [RUN], 'fast', SOURCE)
    expect(recorded.written).toEqual([])
    expect(existsSync(entryFile(home, 'k-before'))).toBe(false)
    expect(existsSync(join(home, slugOf(RUN.member)))).toBe(false)
  })

  it('运行期间输入变了（复核的键与开跑前不一致）：这个成员不写，并说明原因', () => {
    const home = temporary('test-cache-record-')
    const changed = () =>
      new Map([['packages/core/mid', { key: 'k-after', digest: 'd-after', inputs: 3 }]])
    const recorded = recordCache(lookupFor(home, true, changed), [RUN], 'fast', SOURCE)
    expect(recorded.written).toEqual([])
    expect(recorded.skipped).toEqual([expect.stringContaining('运行期间输入有变化')])
    expect(recorded.skipped[0]).toContain(RUN.member)
    expect(existsSync(entryFile(home, 'k-before'))).toBe(false)
    expect(existsSync(entryFile(home, 'k-after'))).toBe(false)
  })

  it('复核时算不出键：全部跳过，不当作没变', () => {
    const home = temporary('test-cache-record-')
    const broken = () => {
      throw new Error('git 取不到')
    }
    const recorded = recordCache(lookupFor(home, true, broken), [RUN], 'fast', SOURCE)
    expect(recorded.written).toEqual([])
    expect(recorded.skipped).toEqual([expect.stringContaining('git 取不到')])
  })

  it('只对要写的成员复核：没有要写的就不重算', () => {
    const home = temporary('test-cache-record-')
    const rekey = vi.fn(same)
    recordCache(lookupFor(home, true, rekey), [{ ...RUN, exitCode: 1 }], 'fast', SOURCE)
    expect(rekey).not.toHaveBeenCalled()
  })
  it('构建之后输入变了（现在的输入摘要不等于构建记录）：这个成员不写，并说明原因', () => {
    const home = temporary('test-cache-record-')
    const staleBuild = new Map([['packages/core/mid', { input: 'd-old-source' }]])
    const recorded = recordCache(lookupFor(home, true, same, staleBuild), [RUN], 'fast', SOURCE)
    expect(recorded.written).toEqual([])
    expect(recorded.skipped).toEqual([expect.stringContaining('构建之后输入变了')])
    expect(existsSync(entryFile(home, 'k-before'))).toBe(false)
  })

  it('没有构建记录（整份没有，或没有这个成员的）：不写，并说明原因', () => {
    const home = temporary('test-cache-record-')
    for (const built of [null, new Map([['packages/other', { input: 'd-built' }]])]) {
      const recorded = recordCache(lookupFor(home, true, same, built), [RUN], 'fast', SOURCE)
      expect(recorded.written).toEqual([])
      expect(recorded.skipped).toEqual([expect.stringContaining('没有构建记录')])
    }
    expect(existsSync(entryFile(home, 'k-before'))).toBe(false)
  })

  it('记录带产物摘要时：现在的产物摘要相等才写，不等就跳过并说明 dist 被改过', () => {
    const home = temporary('test-cache-record-')
    const built = new Map([['packages/core/mid', { input: 'd-built', output: 'o-built' }]])
    const withOutputs = (output: string) => ({
      ...lookupFor(home, true, same, built),
      outputs: () => new Map([['packages/core/mid', output]]),
    })
    const changed = recordCache(withOutputs('o-other'), [RUN], 'fast', SOURCE)
    expect(changed.written).toEqual([])
    expect(changed.skipped).toEqual([expect.stringContaining('构建之后 dist 被改过')])
    expect(existsSync(entryFile(home, 'k-before'))).toBe(false)
    const unchanged = recordCache(withOutputs('o-built'), [RUN], 'fast', SOURCE)
    expect(unchanged).toEqual({ written: [RUN.member], problems: [], skipped: [] })
  })

  it('账本的 cache 栏：write 说写不写，与 mode（读不读）分开；skipped 数跳过的成员', () => {
    const home = temporary('test-cache-record-')
    const none = { written: [], problems: [], skipped: [] }
    expect(cacheMeta(lookupFor(home, false, same), none)).toMatchObject({
      mode: 'read-write',
      write: 'off',
      skipped: 0,
    })
    expect(
      cacheMeta(lookupFor(home, true, same), { ...none, skipped: ['a：x', 'b：y'] }),
    ).toMatchObject({ mode: 'read-write', write: 'on', skipped: 2 })
    expect(
      cacheMeta({ ...lookupFor(home, true, same), unavailable: '快照取不到' }, none),
    ).toMatchObject({ mode: 'unavailable', write: 'off' })
  })
})

describe('构建记录与 step test --plan 的策略', () => {
  const HEAD = 'a'.repeat(40)
  const planIn = (dir: string) => join(dir, 'plan.json')

  const ENTRY = { input: 'd1', output: 'o1' }

  it('读回写下的记录；文件不存在、坏的、记的是别的提交、是旧格式，都当作没有且分开说', () => {
    const dir = temporary('test-cache-built-')
    const path = builtFromPath(planIn(dir))
    expect(path).toBe(join(dir, 'built-from.json'))
    expect(readBuiltFrom(path, HEAD)).toEqual({ status: 'missing' })
    writeBuiltFrom(path, HEAD, new Map([['members/alpha', ENTRY]]))
    expect(readBuiltFrom(path, HEAD)).toEqual({
      status: 'ok',
      members: new Map([['members/alpha', ENTRY]]),
    })
    expect(readBuiltFrom(path, 'b'.repeat(40))).toEqual({ status: 'other-head', recorded: HEAD })
    writeFileSync(path, JSON.stringify({ head: HEAD, members: { 'members/alpha': 'd1' } }))
    expect(readBuiltFrom(path, HEAD)).toEqual({ status: 'legacy' })
    writeFileSync(path, '{')
    expect(readBuiltFrom(path, HEAD)).toEqual({ status: 'missing' })
  })

  it('计划旁边没有构建记录：不许写；有记录才许写；不带计划文件（turbo 先构建）许写', () => {
    const dir = temporary('test-cache-built-')
    const options = { planPath: planIn(dir), head: HEAD, noCache: false, full: false }
    expect(stepTestCache({}, options).policy).toMatchObject({ write: false })
    expect(stepTestCache({}, options).builtFrom).toBeUndefined()
    writeBuiltFrom(builtFromPath(planIn(dir)), HEAD, new Map([['members/alpha', ENTRY]]))
    expect(stepTestCache({}, options).policy).toMatchObject({ read: true, write: true })
    expect(stepTestCache({}, { ...options, head: 'b'.repeat(40) }).policy).toMatchObject({
      write: false,
    })
    expect(stepTestCache({}, { ...options, planPath: undefined }).policy).toMatchObject({
      write: true,
    })
  })

  it('不写缓存的原因分三种：没有记录文件、记录是另一个提交的（两个头号前 9 位）、记录是旧格式', () => {
    const dir = temporary('test-cache-built-')
    const options = { planPath: planIn(dir), head: HEAD, noCache: false, full: false }
    const reason = (head = HEAD) => stepTestCache({}, { ...options, head }).policy.writeReason
    expect(reason()).toContain('没有构建记录')
    writeBuiltFrom(builtFromPath(planIn(dir)), 'c'.repeat(40), new Map([['members/alpha', ENTRY]]))
    expect(reason()).toContain('记录是另一个提交的')
    expect(reason()).toContain('c'.repeat(9))
    expect(reason()).toContain(HEAD.slice(0, 9))
    writeFileSync(
      builtFromPath(planIn(dir)),
      JSON.stringify({ head: HEAD, members: { 'members/alpha': 'd1' } }),
    )
    expect(reason()).toContain('记录是旧格式')
    expect(reason()).not.toContain('没有构建')
  })
})

describe('产物摘要', () => {
  const put = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  it('没有 dist 记 absent；文件增减、改大小、改 mtime 都让摘要变；不读内容', () => {
    const root = temporary('test-cache-dist-digest-')
    expect(distDigest(root, 'members/alpha')).toBe('absent')
    put(root, 'members/alpha/dist/a.js', 'aaa')
    const one = distDigest(root, 'members/alpha')
    expect(one).not.toBe('absent')
    expect(distDigest(root, 'members/alpha')).toBe(one)
    put(root, 'members/alpha/dist/sub/b.js', 'b')
    const two = distDigest(root, 'members/alpha')
    expect(two).not.toBe(one)
    put(root, 'members/alpha/dist/sub/b.js', 'bb')
    const three = distDigest(root, 'members/alpha')
    expect(three).not.toBe(two)
    utimesSync(join(root, 'members/alpha/dist/a.js'), new Date(1e12), new Date(1e12))
    expect(distDigest(root, 'members/alpha')).not.toBe(three)
  })
})

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
        policy: { read: true, reason: '', write: true, writeReason: '' },
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

/** 一个小 workspace（已提交）：成员互不依赖，名字以 bad 打头的失败、其余通过；两层脚本相同。 */
function workspace(names: readonly string[] = ['good', 'bad']): {
  root: string
  targets: TestMember[]
} {
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
  const targets = names.map(name => {
    const code = name.startsWith('bad') ? 3 : 0
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

/** 构建记录：模拟前面一步在同一份源码上构建完（`step build --plan` 在构建开始前取的摘要）。 */
const builtNow = (root: string, targets: readonly TestMember[]) =>
  new Map(
    [
      ...currentDigests({
        root,
        targets: targets.map(entry => entry.path),
        config: CONFIG,
        env: process.env,
      }),
    ].map(([member, input]) => [member, { input }]),
  )

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
      readonly write: string
      readonly skipped: number
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
        const { exitCode } = await recordedRun(root, {
          script: 'test',
          tier,
          targets,
          build: false,
          out,
          at: coordinates(root, undefined),
          base: null,
          plan: null,
          budget: BUDGET,
          builtFrom: builtNow(root, targets),
          cache: { read, reason: read ? '' : '测试要求不读', write: true, writeReason: '' },
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

  /** 在 `root` 上起运行器跑一层（读写缓存，缓存根是 `home`），返回这次谁真跑了与账本。调用方负责环境变量。 */
  const runner = (root: string, targets: TestMember[]) => {
    let count = 0
    return async (tier: RunTier) => {
      count += 1
      const out = join(root, `run-${count}`)
      writeFileSync(join(root, 'ran.txt'), '')
      const { exitCode } = await recordedRun(root, {
        script: 'test',
        tier,
        targets,
        build: false,
        out,
        at: coordinates(root, undefined),
        base: null,
        plan: null,
        budget: BUDGET,
        builtFrom: builtNow(root, targets),
        cache: { read: true, reason: '', write: true, writeReason: '' },
      })
      const ledger = JSON.parse(readFileSync(join(out, 'ledger.json'), 'utf8')) as LedgerCache
      const ran = readFileSync(join(root, 'ran.txt'), 'utf8').split('\n').filter(Boolean).sort()
      return { out, exitCode, ran, ledger }
    }
  }
  /** 缓存根设成新的临时目录、清掉会改变读不读的变量，跑完恢复环境。 */
  const withCacheHome = async (body: () => Promise<void>) => {
    const saved = { ...process.env }
    process.env[TEST_CACHE_HOME_ENV] = temporary('test-cache-home-')
    delete process.env['FULL']
    delete process.env['OMNE_ADMISSION']
    delete process.env[TEST_CACHE_ENV]
    try {
      await body()
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
      Object.assign(process.env, saved)
    }
  }

  it('改了成员 A 只让 A 重跑：无关的成员 B 照样命中，来源是上一次的账本', { tags: ['slow'] }, () =>
    withCacheHome(async () => {
      const { root, targets } = workspace(['alpha', 'beta'])
      const run = runner(root, targets)
      const first = await run('fast')
      expect(first.exitCode).toBe(0)
      expect(first.ledger.meta.cache.written).toEqual(['members/alpha', 'members/beta'])

      writeFileSync(join(root, 'members/alpha/src/index.ts'), 'export const value = 2\n')
      const second = await run('fast')
      expect(second.exitCode).toBe(0)
      expect(second.ran).toEqual(['members__alpha'])
      expect(second.ledger.meta.cache.hits).toEqual([
        expect.objectContaining({ member: 'members/beta', source: first.out }),
      ])
      expect(second.ledger.meta.cache.written).toEqual(['members/alpha'])
    }),
  )

  it(
    '不构建的一次运行（策略不许写）：成员通过也没有新条目；许写的一次有；全部命中时提示行写明没有执行',
    { tags: ['slow'] },
    () =>
      withCacheHome(async () => {
        const { root, targets } = workspace(['alpha', 'beta'])
        const home = process.env[TEST_CACHE_HOME_ENV] ?? ''
        const lines: string[] = []
        const spy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
          lines.push(parts.join(' '))
        })
        let count = 0
        const go = async (write: boolean) => {
          count += 1
          const out = join(root, `run-${count}`)
          const { exitCode } = await recordedRun(root, {
            script: 'test',
            tier: 'fast',
            targets,
            build: false,
            out,
            at: coordinates(root, undefined),
            base: null,
            plan: null,
            budget: BUDGET,
            builtFrom: builtNow(root, targets),
            cache: { read: true, reason: '', write, writeReason: write ? '' : '没有构建' },
          })
          const ledger = JSON.parse(readFileSync(join(out, 'ledger.json'), 'utf8')) as LedgerCache
          return { exitCode, ledger }
        }
        try {
          const unbuilt = await go(false)
          expect(unbuilt.exitCode).toBe(0)
          expect(unbuilt.ledger.meta.cache.written).toEqual([])
          expect(unbuilt.ledger.meta.cache.write).toBe('off')
          expect(existsSync(home) ? readdirSync(home) : []).toEqual([])
          expect(lines.join('\n')).toContain('不写缓存（没有构建')

          const built = await go(true)
          expect(built.ledger.meta.cache.written).toEqual(['members/alpha', 'members/beta'])
          expect(built.ledger.meta.cache.write).toBe('on')
          expect(readdirSync(home).sort()).toEqual(['members__alpha', 'members__beta'])

          lines.length = 0
          const hit = await go(true)
          expect(hit.exitCode).toBe(0)
          expect(lines).toContain('2 个成员全部命中缓存，没有执行（快层）')
          expect(lines.join('\n')).not.toContain('个成员的 `test`')
        } finally {
          spy.mockRestore()
        }
      }),
  )

  it(
    '跑完后键复核（真起 git 与 turbo）：运行期间改了成员的源文件，这个成员不写',
    { tags: ['slow'] },
    () =>
      withCacheHome(async () => {
        const { root, targets } = workspace(['alpha'])
        const home = process.env[TEST_CACHE_HOME_ENV] ?? ''
        const lookup = lookupCache({
          root,
          mainRoot: root,
          targets: targets.map(entry => entry.path),
          tier: 'fast',
          policy: { read: true, reason: '', write: true, writeReason: '' },
          config: CONFIG,
          env: process.env,
        })
        expect(lookup.unavailable).toBeUndefined()
        const built = builtNow(root, targets)
        writeFileSync(join(root, 'members/alpha/src/index.ts'), 'export const value = 2\n')
        const run: MemberRun = { ...RUN, member: 'members/alpha' }
        const recorded = recordCache({ ...lookup, built }, [run], 'fast', {
          ledger: '/runs/1',
          head: 'abc',
          dirty: false,
        })
        expect(recorded.written).toEqual([])
        expect(recorded.skipped).toHaveLength(1)
        expect(existsSync(home) ? readdirSync(home) : []).toEqual([])
      }),
  )

  it('快层的成员全部命中时这一层算通过，慢层照常跑', { tags: ['slow'] }, () =>
    withCacheHome(async () => {
      const { root, targets } = workspace(['alpha', 'beta'])
      const run = runner(root, targets)
      expect((await run('fast')).exitCode).toBe(0)

      const tiers: string[] = []
      const notes: string[] = []
      const code = await fastThenSlow(
        async tier => {
          const result = await run(tier)
          tiers.push(`${tier}: ${result.ran.join(' ')}`)
          if (tier === 'fast') expect(result.ledger.meta.cache.hits).toHaveLength(2)
          return result.exitCode
        },
        note => notes.push(note),
      )
      expect(code).toBe(0)
      expect(notes).toEqual([])
      expect(tiers).toEqual(['fast: ', 'slow: members__alpha members__beta'])
    }),
  )
})

/** 测试读 `dist/`（按包名导入自己、执行的是构建产物）的成员：dist 里是 `value = 1` 才通过；构建把 src 拷成 dist。 */
const CHECK_DIST = `
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const ok = readFileSync(join(process.cwd(), 'dist/index.js'), 'utf8').includes('value = 1')
writeFileSync(
  join(process.env.OMNE_TEST_REPORT_DIR, process.argv[2] + '.json'),
  JSON.stringify({ testResults: [{ name: join(process.cwd(), 'tests/a.spec.ts'), status: ok ? 'passed' : 'failed', startTime: 0, endTime: 1,
    assertionResults: [{ fullName: 'a', status: ok ? 'passed' : 'failed' }] }] }),
)
process.exit(ok ? 0 : 1)
`
const COPY_DIST = `require('fs').mkdirSync('dist',{recursive:true});require('fs').copyFileSync('src/index.ts','dist/index.js')`
const CHECK_SCRIPT = 'node ../../check-dist.mjs members__alpha'

function commitAll(root: string, message: string): void {
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync(
    'git',
    ['-c', 'user.name=F', '-c', 'user.email=f@example.invalid', 'commit', '-qm', message],
    { cwd: root },
  )
}

/** 一个已提交的 workspace，成员 alpha 有 build 脚本，测试读构建产物 dist。 */
function distWorkspace(
  buildScript = `node -e "${COPY_DIST}"`,
  options: { readonly upstream?: boolean } = {},
): {
  root: string
  file: PlanFile
  planPath: string
} {
  const root = temporary('test-cache-dist-')
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put(
    'package.json',
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  put('pnpm-workspace.yaml', 'packages:\n  - members/*\n')
  put('.gitignore', 'run-*/\ndist/\ntmp/\n.turbo/\nnode_modules/\n')
  put('check-dist.mjs', CHECK_DIST)
  put(
    'members/alpha/package.json',
    JSON.stringify({
      name: '@fixture/alpha',
      ...(options.upstream === true ? { dependencies: { '@fixture/beta': 'workspace:*' } } : {}),
      scripts: {
        build: buildScript,
        test: CHECK_SCRIPT,
        'test:fast': CHECK_SCRIPT,
        'test:slow': CHECK_SCRIPT,
      },
    }),
  )
  put('members/alpha/src/index.ts', 'export const value = 1\n')
  if (options.upstream === true) {
    put(
      'members/beta/package.json',
      JSON.stringify({ name: '@fixture/beta', scripts: { build: buildScript } }),
    )
    put('members/beta/src/index.ts', 'export const value = 1\n')
  }
  execFileSync('git', ['init', '-q'], { cwd: root })
  commitAll(root, 'fixture')
  const head = coordinates(root, undefined).head
  const file: PlanFile = {
    head,
    dirty: false,
    base: { ref: 'HEAD', mergeBase: head },
    plan: {
      mode: 'full',
      reason: '测试用的计划',
      files: [],
      members: [],
      build: [{ path: 'members/alpha', reason: 'selected' }],
      typecheck: [],
      test: ['members/alpha'],
      acceptance: [],
      python: { run: false, reason: '' },
    },
  }
  // 计划文件放在被忽略的目录里：未跟踪、未忽略的文件会进键。
  const planPath = join(root, 'run-plan', 'plan.json')
  writePlanFile(planPath, file)
  return { root, file, planPath }
}

/** 缓存根设成新的临时目录、清掉会改变读不读的变量，跑完恢复环境。 */
async function withHome(body: (home: string) => Promise<void>): Promise<void> {
  const saved = { ...process.env }
  const home = temporary('test-cache-home-')
  process.env[TEST_CACHE_HOME_ENV] = home
  delete process.env['FULL']
  delete process.env['OMNE_ADMISSION']
  delete process.env[TEST_CACHE_ENV]
  try {
    await body(home)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}
const entriesIn = (home: string) => (existsSync(home) ? readdirSync(home) : [])

// 归慢层：真起 turbo，分进程的构建与测试一步一步走。
describe(
  '构建与测试之间改了源码（step build --plan → step test --plan）',
  {
    timeout: 180_000,
  },
  () => {
    /** 按 cli.ts `step test --plan` 的做法跑成员测试一步。 */
    const stepTest = (root: string, file: PlanFile, planPath: string) => {
      const { policy, builtFrom } = stepTestCache(process.env, {
        planPath,
        head: file.head,
        noCache: false,
        full: false,
      })
      return testStep(root, file, false, policy, builtFrom)
    }
    const stepBuild = (root: string, file: PlanFile, planPath: string) =>
      buildStep(root, file, BUDGET, planPath)

    it(
      '构建之后改了源码：测试照常通过，但没有写缓存、日志写原因；下一次构建出失败的 dist 时不会命中',
      { tags: ['slow'] },
      () =>
        withHome(async home => {
          const { root, file, planPath } = distWorkspace()
          const lines: string[] = []
          const spy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
            lines.push(parts.join(' '))
          })
          try {
            expect(stepBuild(root, file, planPath)).toBe(0)
            expect(existsSync(builtFromPath(planPath))).toBe(true)
            // 构建之后、测试一步之前：源码变成会让测试失败的样子。
            writeFileSync(join(root, 'members/alpha/src/index.ts'), 'export const value = 2\n')
            expect(await stepTest(root, file, planPath)).toBe(0) // 旧 dist 仍通过
            expect(entriesIn(home)).toEqual([])
            expect(lines.join('\n')).toContain('构建之后输入变了')

            // 下一次检查：构建出新 dist，测试失败，不能因缓存命中而通过。
            expect(stepBuild(root, file, planPath)).toBe(0)
            expect(await stepTest(root, file, planPath)).toBe(1)
          } finally {
            spy.mockRestore()
          }
        }),
    )

    it(
      '构建期间改了源码（构建脚本自己改）：构建记录取开始前的摘要，所以不写',
      { tags: ['slow'] },
      () =>
        withHome(async home => {
          const { root, file, planPath } = distWorkspace(
            `node -e "${COPY_DIST};require('fs').writeFileSync('src/index.ts','export const value = 2\\n')"`,
          )
          const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
          try {
            expect(stepBuild(root, file, planPath)).toBe(0)
            expect(await stepTest(root, file, planPath)).toBe(0) // dist 是 value = 1 的源码构建的
            expect(entriesIn(home)).toEqual([])
          } finally {
            spy.mockRestore()
          }
        }),
    )

    it('构建之后源码没变：写缓存（快、慢两层各一条）', { tags: ['slow'] }, () =>
      withHome(async home => {
        const { root, file, planPath } = distWorkspace()
        const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
          expect(stepBuild(root, file, planPath)).toBe(0)
          expect(await stepTest(root, file, planPath)).toBe(0)
          expect(readdirSync(join(home, 'members__alpha'))).toHaveLength(2)
        } finally {
          spy.mockRestore()
        }
      }),
    )

    /** 计划之外重建 dist：源码临时换成 `source` 构建，再还原；mtime 拨到固定的另一刻，不依赖文件系统的时间精度。 */
    const outOfBandBuild = (root: string, member: string, source: string, restore: string) => {
      const src = join(root, member, 'src/index.ts')
      const dist = join(root, member, 'dist/index.js')
      writeFileSync(src, source)
      mkdirSync(dirname(dist), { recursive: true })
      writeFileSync(dist, source)
      const later = new Date(Date.now() + 60_000)
      utimesSync(dist, later, later)
      writeFileSync(src, restore)
    }
    const quiet = () => {
      const lines: string[] = []
      const spy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
        lines.push(parts.join(' '))
      })
      return { lines, spy }
    }

    it(
      '构建之后在计划之外用别的源码重建 dist 再把源码改回：不写缓存，下一次构建出失败的 dist 时不命中',
      { tags: ['slow'] },
      () =>
        withHome(async home => {
          const { root, file, planPath } = distWorkspace()
          const S1 = 'export const value = 2\n' // 构建出的 dist 让测试失败
          const S2 = 'export const value = 1\n'
          writeFileSync(join(root, 'members/alpha/src/index.ts'), S1)
          const { lines, spy } = quiet()
          try {
            expect(stepBuild(root, file, planPath)).toBe(0)
            outOfBandBuild(root, 'members/alpha', S2, S1)
            expect(await stepTest(root, file, planPath)).toBe(0) // dist(S2) 通过
            expect(entriesIn(home)).toEqual([])
            expect(lines.join('\n')).toContain(
              '构建之后 dist 被改过，这次通过不一定对应记录里的构建',
            )
            // 下一次检查：dist 是对 S1 构建出的，测试失败；缓存里没有「S1 通过」可命中。
            expect(stepBuild(root, file, planPath)).toBe(0)
            outOfBandBuild(root, 'members/alpha', S1, S1)
            expect(await stepTest(root, file, planPath)).toBe(1)
          } finally {
            spy.mockRestore()
          }
        }),
    )

    it('上游成员的 dist 在构建之后被改过：也不写缓存', { tags: ['slow'] }, () =>
      withHome(async home => {
        const { root, file, planPath } = distWorkspace(undefined, { upstream: true })
        const { lines, spy } = quiet()
        try {
          expect(stepBuild(root, file, planPath)).toBe(0)
          expect(existsSync(join(root, 'members/beta/dist/index.js'))).toBe(true)
          const same = 'export const value = 1\n'
          outOfBandBuild(root, 'members/beta', same, same) // 内容与大小都没变，只动了 mtime
          expect(await stepTest(root, file, planPath)).toBe(0) // alpha 自己的 dist 没动，测试照过
          expect(entriesIn(home)).toEqual([])
          expect(lines.join('\n')).toContain('构建之后 dist 被改过')
        } finally {
          spy.mockRestore()
        }
      }),
    )

    it('构建记录是旧格式：不写，原因是记录是旧格式', { tags: ['slow'] }, () =>
      withHome(async home => {
        const { root, file, planPath } = distWorkspace()
        const { lines, spy } = quiet()
        try {
          expect(stepBuild(root, file, planPath)).toBe(0)
          const old = JSON.parse(readFileSync(builtFromPath(planPath), 'utf8')) as {
            head: string
            members: Record<string, { input: string }>
          }
          const members = Object.fromEntries(
            Object.entries(old.members).map(([member, { input }]) => [member, input]),
          )
          writeFileSync(builtFromPath(planPath), JSON.stringify({ head: old.head, members }))
          expect(await stepTest(root, file, planPath)).toBe(0)
          expect(entriesIn(home)).toEqual([])
          expect(lines.join('\n')).toContain('构建记录是旧格式')
        } finally {
          spy.mockRestore()
        }
      }),
    )

    it('构建记录是另一个提交的：不写，原因里有记录与现在的头号前 9 位', { tags: ['slow'] }, () =>
      withHome(async home => {
        const { root, file, planPath } = distWorkspace()
        const { lines, spy } = quiet()
        try {
          expect(stepBuild(root, file, planPath)).toBe(0)
          const old = JSON.parse(readFileSync(builtFromPath(planPath), 'utf8')) as object
          writeFileSync(builtFromPath(planPath), JSON.stringify({ ...old, head: 'b'.repeat(40) }))
          expect(await stepTest(root, file, planPath)).toBe(0)
          expect(entriesIn(home)).toEqual([])
          const text = lines.join('\n')
          expect(text).toContain('记录是另一个提交的')
          expect(text).toContain('b'.repeat(9))
          expect(text).toContain(file.head.slice(0, 9))
        } finally {
          spy.mockRestore()
        }
      }),
    )

    it('手工 --plan、计划旁边没有构建记录：测试通过也不写缓存', { tags: ['slow'] }, () =>
      withHome(async home => {
        const { root, file, planPath } = distWorkspace()
        // 前面没有构建一步；dist 是以前留下的。
        mkdirSync(join(root, 'members/alpha/dist'), { recursive: true })
        writeFileSync(join(root, 'members/alpha/dist/index.js'), 'export const value = 1\n')
        expect(existsSync(builtFromPath(planPath))).toBe(false)
        const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
          expect(await stepTest(root, file, planPath)).toBe(0)
        } finally {
          spy.mockRestore()
        }
        expect(entriesIn(home)).toEqual([])
      }),
    )

    it('构建失败时旧的构建记录被清掉，不让后面的测试沿用', { tags: ['slow'] }, () =>
      withHome(async () => {
        const { root, file, planPath } = distWorkspace()
        const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
          expect(stepBuild(root, file, planPath)).toBe(0)
          expect(existsSync(builtFromPath(planPath))).toBe(true)
          writeFileSync(
            join(root, 'members/alpha/package.json'),
            JSON.stringify({
              name: '@fixture/alpha',
              scripts: { build: 'node -e "process.exit(1)"' },
            }),
          )
          expect(stepBuild(root, file, planPath)).not.toBe(0)
          expect(existsSync(builtFromPath(planPath))).toBe(false)
        } finally {
          spy.mockRestore()
        }
      }),
    )
  },
)

const RUNNER_CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

// 归慢层：起真正的命令行入口（OMNE_SUBJECT_ROOT 指向造出来的 workspace），核对 `run` 入口的接线。
describe('run 入口的缓存接线（真起命令行与 turbo）', { timeout: 180_000 }, () => {
  const runCli = (root: string, home: string, args: string[]) => {
    const out = join(root, 'run-cli')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OMNE_SUBJECT_ROOT: root,
      [TEST_CACHE_HOME_ENV]: home,
    }
    delete env['FULL']
    delete env['OMNE_ADMISSION']
    delete env[TEST_CACHE_ENV]
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        RUNNER_CLI,
        'run',
        '--all',
        '--tier',
        'fast',
        '--out',
        out,
        ...args,
      ],
      { cwd: root, env, encoding: 'utf8' },
    )
    const ledger = JSON.parse(readFileSync(join(out, 'ledger.json'), 'utf8')) as LedgerCache
    return { status: result.status, output: `${result.stdout}${result.stderr}`, ledger }
  }

  it('不带 --build：不写缓存，账本 write 为 off', { tags: ['slow'] }, () => {
    const { root } = distWorkspace()
    const home = temporary('test-cache-home-')
    mkdirSync(join(root, 'members/alpha/dist'), { recursive: true })
    writeFileSync(join(root, 'members/alpha/dist/index.js'), 'export const value = 1\n')
    const result = runCli(root, home, [])
    expect(result.status, result.output).toBe(0)
    expect(result.ledger.meta.cache).toMatchObject({ write: 'off', written: [] })
    expect(entriesIn(home)).toEqual([])
  })

  it('带 --build 且输入没变：写缓存，账本 write 为 on', { tags: ['slow'] }, () => {
    const { root } = distWorkspace()
    const home = temporary('test-cache-home-')
    const result = runCli(root, home, ['--build'])
    expect(result.status, result.output).toBe(0)
    expect(result.ledger.meta.cache).toMatchObject({
      write: 'on',
      skipped: 0,
      written: ['members/alpha'],
    })
    expect(readdirSync(home)).toEqual(['members__alpha'])
  })

  it('带 --build，构建期间改了源码：不写，账本记下跳过', { tags: ['slow'] }, () => {
    // 构建脚本自己在拷贝之后改源码：模拟构建开始之后、测试算键之前的改动。
    const { root } = distWorkspace(
      `node -e "${COPY_DIST};require('fs').writeFileSync('src/index.ts','export const value = 2\\n')"`,
    )
    const home = temporary('test-cache-home-')
    const result = runCli(root, home, ['--build'])
    expect(result.status, result.output).toBe(0)
    expect(result.ledger.meta.cache).toMatchObject({ write: 'on', skipped: 1, written: [] })
    expect(entriesIn(home)).toEqual([])
  })
})
