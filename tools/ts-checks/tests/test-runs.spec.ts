// 测试运行工具的已知值核对：受影响范围、并行度覆盖、耗时账本、失败归因的分类。
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  describePlan,
  listTestMembers,
  planAffected,
  workspacePatterns,
  type TestMember,
} from '../src/testing/affected.ts'
import {
  effectiveParallelism,
  parseTestRunsConfig,
  readTestRunsConfig,
} from '../src/testing/config.ts'
import { buildLedger, ledgerSummary, type MemberRun } from '../src/testing/ledger.ts'
import { classify, namePattern, outcomeOf, triageSummary } from '../src/testing/triage.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

const member = (path: string, name: string, dependencies: string[] = []): TestMember => ({
  path,
  name,
  testScript: 'vitest run',
  dependencies,
})

// leaf ← mid ← top；side 与它们无关。
const MEMBERS = [
  member('packages/core/leaf', '@x/leaf'),
  member('packages/core/mid', '@x/mid', ['@x/leaf']),
  member('apps/top', '@x/top', ['@x/mid']),
  member('packages/core/side', '@x/side'),
]
const GLOBAL = ['package.json', 'tsconfig*.json', '.meta_harness/design/spec/**']

describe('受影响范围', () => {
  it('改叶子成员：计划恰好是它与直接、间接依赖它的成员', () => {
    const plan = planAffected(['packages/core/leaf/src/index.ts'], MEMBERS, GLOBAL)
    expect(plan.changed).toEqual(['packages/core/leaf'])
    expect(plan.dependents).toEqual(['packages/core/mid', 'apps/top'])
    expect(plan.global).toBeUndefined()
  })

  it('改顶层成员：只有它自己', () => {
    const plan = planAffected(['apps/top/tests/a.spec.ts'], MEMBERS, GLOBAL)
    expect(plan.changed).toEqual(['apps/top'])
    expect(plan.dependents).toEqual([])
  })

  it('成员之外的改动只计数，不拉进任何成员', () => {
    const plan = planAffected(['docs/development.md', 'examples/demo/src/a.ts'], MEMBERS, GLOBAL)
    expect(plan.changed).toEqual([])
    expect(plan.dependents).toEqual([])
    expect(plan.outside).toBe(2)
    expect(describePlan(plan, MEMBERS.length).join('\n')).toContain('另有 2 个改动文件')
  })

  it('目录名只是前缀相同的不算同一个成员', () => {
    const plan = planAffected(['packages/core/leaf-extra/src/a.ts'], MEMBERS, GLOBAL)
    expect(plan.changed).toEqual([])
    expect(plan.outside).toBe(1)
  })

  it('命中全局路径：全部成员都算受影响，并说出是哪个文件、哪条模式', () => {
    const plan = planAffected(
      ['docs/a.md', '.meta_harness/design/spec/contracts/x/v1/schema.json'],
      MEMBERS,
      GLOBAL,
    )
    expect(plan.global).toEqual({
      path: '.meta_harness/design/spec/contracts/x/v1/schema.json',
      pattern: '.meta_harness/design/spec/**',
    })
    expect(plan.changed).toHaveLength(MEMBERS.length)
  })

  it('`*` 不跨目录：根 tsconfig 算全局，成员自己的 tsconfig 不算', () => {
    expect(planAffected(['tsconfig.base.json'], MEMBERS, GLOBAL).global?.pattern).toBe(
      'tsconfig*.json',
    )
    const own = planAffected(['packages/core/side/tsconfig.json'], MEMBERS, GLOBAL)
    expect(own.global).toBeUndefined()
    expect(own.changed).toEqual(['packages/core/side'])
  })

  it('依赖成环也能停下', () => {
    const cyclic = [
      member('packages/a/x', '@x/x', ['@x/y']),
      member('packages/a/y', '@x/y', ['@x/x']),
    ]
    const plan = planAffected(['packages/a/x/src/a.ts'], cyclic, [])
    expect(plan.changed).toEqual(['packages/a/x'])
    expect(plan.dependents).toEqual(['packages/a/y'])
  })

  it('成员模式取自 pnpm-workspace.yaml 的 packages 列表，到下一个顶层键为止', () => {
    const yaml = [
      'packages:',
      '  - packages/*/*',
      "  - 'apps/*'",
      '  # 注释',
      '  - tools/ts-checks # 行尾注释',
      '',
      'catalog:',
      '  - not/a/member',
    ].join('\n')
    expect(workspacePatterns(yaml)).toEqual(['packages/*/*', 'apps/*', 'tools/ts-checks'])
  })

  it('认不出的成员模式报错，不悄悄漏掉成员', () => {
    expect(() => workspacePatterns('packages:\n  - packages/**\n')).toThrow('不支持的写法')
    expect(() => workspacePatterns("packages:\n  - '!packages/x'\n")).toThrow('不支持的写法')
    expect(() => workspacePatterns('catalog:\n  a: 1\n')).toThrow('没有 packages')
  })

  it('本仓库：成员清单不含示例，且认得测试依赖', () => {
    const config = readTestRunsConfig()
    const members = listTestMembers(ROOT, config.affected.excludeRoots)
    expect(members.length).toBeGreaterThan(40)
    expect(members.some(item => item.path.startsWith('examples/'))).toBe(false)
    // ts-checks 只在 devDependencies 里依赖 identity-values；改后者要重跑前者的测试。
    const checks = members.find(item => item.path === 'tools/ts-checks')
    expect(checks?.dependencies).toContain('@omne-harness-lite/identity-values')
    expect(listTestMembers(ROOT, []).some(item => item.path.startsWith('examples/'))).toBe(true)
  })
})

describe('并行度', () => {
  const config = parseTestRunsConfig({
    parallel: { memberConcurrency: 2, vitestMaxWorkers: 4 },
    affected: { excludeRoots: [], globalPaths: [] },
    ledger: { slowFileSeconds: 10, slowTestSeconds: 2.5, top: 5 },
    triage: { repeats: 3 },
  })

  it('配置给初值，环境变量覆盖', () => {
    expect(effectiveParallelism(config, {})).toEqual({ memberConcurrency: 2, vitestMaxWorkers: 4 })
    expect(
      effectiveParallelism(config, { OMNE_TEST_MEMBER_CONCURRENCY: '1', VITEST_MAX_WORKERS: '8' }),
    ).toEqual({ memberConcurrency: 1, vitestMaxWorkers: 8 })
  })

  it('环境变量不是正整数就报错，不悄悄回落', () => {
    expect(() => effectiveParallelism(config, { OMNE_TEST_MEMBER_CONCURRENCY: '0' })).toThrow(
      'OMNE_TEST_MEMBER_CONCURRENCY',
    )
    expect(() => effectiveParallelism(config, { VITEST_MAX_WORKERS: '50%' })).toThrow(
      'VITEST_MAX_WORKERS',
    )
  })

  it('配置缺项或类型不对就报错', () => {
    expect(() => parseTestRunsConfig({})).toThrow()
    expect(() =>
      parseTestRunsConfig({
        parallel: { memberConcurrency: 0, vitestMaxWorkers: 4 },
        affected: { excludeRoots: [], globalPaths: [] },
        ledger: { slowFileSeconds: 10, slowTestSeconds: 2.5, top: 5 },
        triage: { repeats: 3 },
      }),
    ).toThrow('parallel.memberConcurrency')
  })

  it('仓库里的配置：两者之积不超过 8 核', () => {
    const { parallel } = readTestRunsConfig()
    expect(parallel.memberConcurrency * parallel.vitestMaxWorkers).toBeLessThanOrEqual(8)
  })
})

const RUNS: MemberRun[] = [
  {
    member: 'packages/core/leaf',
    exitCode: 1,
    wallSeconds: 30.04,
    report: {
      testResults: [
        {
          name: '/repo/packages/core/leaf/tests/a.spec.ts',
          status: 'failed',
          startTime: 1000,
          endTime: 13_000,
          assertionResults: [
            { fullName: 'a 快', status: 'passed', duration: 5 },
            {
              fullName: 'a 慢而且红',
              status: 'failed',
              duration: 11_000,
              failureMessages: ['\nError: Test timed out in 5000ms.\n    at x'],
            },
          ],
        },
        {
          name: '/repo/packages/core/leaf/tests/b.spec.ts',
          status: 'failed',
          startTime: 1000,
          endTime: 1500,
          message: 'SyntaxError: 加载不了',
          assertionResults: [],
        },
      ],
    },
  },
  {
    member: 'packages/core/mid',
    exitCode: 0,
    wallSeconds: 4,
    report: {
      testResults: [
        {
          name: '/repo/packages/core/mid/tests/c.spec.ts',
          status: 'passed',
          startTime: 0,
          endTime: 2000,
          assertionResults: [{ fullName: 'c', status: 'passed', duration: 1500 }],
        },
      ],
    },
  },
  { member: 'apps/top', exitCode: 137, wallSeconds: 1 },
]

describe('耗时账本', () => {
  const ledger = buildLedger(RUNS, '/repo', 1.5)

  it('成员一级：文件数、用例数、失败数、文件耗时之和', () => {
    expect(ledger.members[0]).toEqual({
      member: 'packages/core/leaf',
      exitCode: 1,
      wallSeconds: 30,
      files: 2,
      tests: 2,
      failed: 1,
      fileSeconds: 12.5,
    })
  })

  it('文件按耗时从大到小，路径相对仓库根', () => {
    expect(ledger.files.map(item => [item.file, item.seconds])).toEqual([
      ['packages/core/leaf/tests/a.spec.ts', 12],
      ['packages/core/mid/tests/c.spec.ts', 2],
      ['packages/core/leaf/tests/b.spec.ts', 0.5],
    ])
  })

  it('耗时到线的用例列入账本，从慢到快；没到线的不列', () => {
    expect(ledger.slowTests.map(item => [item.test, item.seconds])).toEqual([
      ['a 慢而且红', 11],
      ['c', 1.5],
    ])
  })

  it('失败分三种：用例失败、文件级失败、成员没出报告', () => {
    expect(ledger.failures).toEqual([
      {
        member: 'packages/core/leaf',
        file: 'packages/core/leaf/tests/a.spec.ts',
        test: 'a 慢而且红',
        message: 'Error: Test timed out in 5000ms.',
      },
      {
        member: 'packages/core/leaf',
        file: 'packages/core/leaf/tests/b.spec.ts',
        message: 'SyntaxError: 加载不了',
      },
      { member: 'apps/top', message: '退出码 137，没有产出报告' },
    ])
  })

  it('有报告、退出码非零、却没有失败的用例或文件：单列一条，不当作通过', () => {
    const typecheckOnly = buildLedger([{ ...RUNS[1]!, exitCode: 1 }], '/repo', 1.5)
    expect(typecheckOnly.failures).toHaveLength(1)
    expect(typecheckOnly.failures[0]?.message).toContain('报告里没有失败的用例或文件')
  })

  it('摘要说清总数、失败、最慢的成员与超时线以上的文件', () => {
    const summary = ledgerSummary(ledger, {
      wallSeconds: 31.2,
      slowFileSeconds: 10,
      slowTestSeconds: 1.5,
      top: 2,
      runDir: '/out',
    }).join('\n')
    expect(summary).toContain('3 个成员、3 个文件、3 条用例，墙钟 31 秒；2 个成员未通过，失败 3 处')
    expect(summary).toContain('✗ packages/core/leaf/tests/a.spec.ts › a 慢而且红')
    expect(summary).toContain('最慢的成员：packages/core/leaf 30 秒、packages/core/mid 4 秒')
    expect(summary).toContain('超过 10 秒的文件 1 个：packages/core/leaf/tests/a.spec.ts 12 秒')
    expect(summary).toContain('超过 1.5 秒的用例 2 条：')
  })

  it('全过时摘要写「全部通过」', () => {
    const green = buildLedger([RUNS[1]!], '/repo', 2.5)
    const summary = ledgerSummary(green, {
      wallSeconds: 4,
      slowFileSeconds: 10,
      slowTestSeconds: 2.5,
      top: 2,
      runDir: '/out',
    })
    expect(summary[0]).toContain('全部通过')
    expect(summary).toContain('超过 2.5 秒的用例 0 条')
  })
})

describe('失败归因', () => {
  it('全过、全不过、有过有不过各归其类；有一次没跑到就不下结论', () => {
    expect(classify(['passed', 'passed', 'passed'])).toBe('passes-alone')
    expect(classify(['failed', 'failed', 'failed'])).toBe('fails-alone')
    expect(classify(['passed', 'failed', 'passed'])).toBe('unstable-alone')
    expect(classify(['passed', 'not-run', 'passed'])).toBe('not-isolated')
    expect(classify([])).toBe('not-isolated')
  })

  it('用例名转义并加锚：只选中这一条，不选中以它为前缀的', () => {
    const pattern = new RegExp(namePattern('解析 a.b (x|y) [1] $HOME'))
    expect(pattern.test('解析 a.b (x|y) [1] $HOME')).toBe(true)
    expect(pattern.test('解析 a.b (x|y) [1] $HOME 再多一点')).toBe(false)
    expect(pattern.test('解析 aXb (x|y) [1] $HOME')).toBe(false)
  })

  const report = (status: string) => ({
    testResults: [
      {
        name: '/repo/a.spec.ts',
        status: status === 'failed' ? 'failed' : 'passed',
        startTime: 0,
        endTime: 1,
        assertionResults: [
          { fullName: '目标', status },
          { fullName: '旁的', status: 'skipped' },
        ],
      },
    ],
  })

  it('单条重跑：看报告里这条用例自己的状态', () => {
    expect(outcomeOf(report('passed'), 0, '目标')).toBe('passed')
    expect(outcomeOf(report('failed'), 1, '目标')).toBe('failed')
  })

  it('名字没选中（被跳过或不在报告里）与没有报告都算没跑到', () => {
    expect(outcomeOf(report('passed'), 0, '旁的')).toBe('not-run')
    expect(outcomeOf(report('passed'), 0, '不存在')).toBe('not-run')
    expect(outcomeOf(undefined, 1, '目标')).toBe('not-run')
  })

  it('整个文件重跑：退出码为零且文件通过才算过', () => {
    expect(outcomeOf(report('passed'), 0, undefined)).toBe('passed')
    expect(outcomeOf(report('passed'), 1, undefined)).toBe('failed')
    expect(outcomeOf(report('failed'), 1, undefined)).toBe('failed')
  })

  it('摘要对「隔离稳定通过」不下「是机器的问题」的结论', () => {
    const summary = triageSummary(
      [
        {
          member: 'm',
          file: 'm/tests/a.spec.ts',
          test: '超时的',
          message: '',
          outcomes: ['passed', 'passed', 'passed'],
          class: 'passes-alone',
          wholeFile: 'passed',
        },
        {
          member: 'm',
          file: 'm/tests/a.spec.ts',
          test: '写错的',
          message: '',
          outcomes: ['failed', 'failed', 'failed'],
          class: 'fails-alone',
        },
      ],
      '/out/triage',
    ).join('\n')
    expect(summary).toContain('隔离仍失败')
    expect(summary).toContain('m/tests/a.spec.ts › 写错的：不过、不过、不过')
    expect(summary).toContain('m/tests/a.spec.ts › 超时的：过、过、过；整个文件单独跑：过')
    expect(summary).toContain('本工具不区分是哪一种')
    expect(summary.indexOf('隔离仍失败')).toBeLessThan(summary.indexOf('隔离稳定通过'))
  })
})
