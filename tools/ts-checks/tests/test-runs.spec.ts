// 测试运行工具的已知值核对：成员清单、并行度覆盖、耗时账本、计时报告器、失败归因的分类。影响面的计划另见 affected.spec.ts。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  fileTree,
  gitTree,
  listTestMembers,
  listWorkspaceMembers,
  ownerOf,
  workspacePatterns,
} from '../src/testing/members.ts'
import {
  effectiveParallelism,
  ledgerHome,
  parseTestRunsConfig,
  readTestRunsConfig,
} from '../src/testing/config.ts'
import { buildLedger, ledgerSummary, type MemberRun } from '../src/testing/ledger.ts'
import { TIMING_FILE_ENV, type TimingReport } from '../src/testing/timing-reporter.ts'
import { classify, namePattern, outcomeOf, triageSummary } from '../src/testing/triage.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const VITEST = fileURLToPath(new URL('../node_modules/.bin/vitest', import.meta.url))
const TIMING_REPORTER = fileURLToPath(new URL('../src/testing/timing-reporter.ts', import.meta.url))

describe('成员清单', () => {
  it('路径归最长的成员目录前缀；目录名只是前缀相同的不算', () => {
    const members = [{ path: 'packages/core/leaf' }, { path: 'packages/core/leaf/nested' }]
    expect(ownerOf('packages/core/leaf/src/a.ts', members)?.path).toBe('packages/core/leaf')
    expect(ownerOf('packages/core/leaf/nested/src/a.ts', members)?.path).toBe(
      'packages/core/leaf/nested',
    )
    expect(ownerOf('packages/core/leaf-extra/src/a.ts', members)).toBeUndefined()
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
    expect(listTestMembers(ROOT, []).some(item => item.path.startsWith('examples/'))).toBe(false)
    expect(existsSync(join(ROOT, 'examples'))).toBe(false)
  })

  it('从提交读与从工作树读走同一套解析：HEAD 上的成员清单与工作树一致（工作树没有新增或删掉成员时）', () => {
    const config = readTestRunsConfig()
    const fromTree = listWorkspaceMembers(fileTree(ROOT), config.affected.excludeRoots)
    const fromHead = listWorkspaceMembers(gitTree(ROOT, 'HEAD'), config.affected.excludeRoots)
    const paths = (members: readonly { path: string }[]) => members.map(item => item.path)
    // 工作树可能多出还没提交的成员；HEAD 上有的，工作树里都得有，且依赖与脚本一样。
    expect(paths(fromHead).every(path => paths(fromTree).includes(path))).toBe(true)
    for (const member of fromHead)
      expect(fromTree.find(item => item.path === member.path)).toEqual(member)
    expect(() => gitTree(ROOT, '0'.repeat(40))).toThrow('不存在')
  })

  it('按脚本名选成员：acceptance 只选有这个脚本的，并带上脚本原文', () => {
    const config = readTestRunsConfig()
    const accepting = listTestMembers(ROOT, config.affected.excludeRoots, 'acceptance')
    expect(accepting.map(item => item.path)).toContain('apps/cli')
    expect(accepting.find(item => item.path === 'apps/cli')?.script).toContain('acceptance/')
    expect(accepting.some(item => item.path === 'tools/ts-checks')).toBe(false)
  })
})

describe('账本根', () => {
  it('测试与验收各放一处；环境变量给了用它，给空串当没给', () => {
    expect(ledgerHome('test', '/repo', {})).toBe('/repo/tmp/test-ledger')
    expect(ledgerHome('acceptance', '/repo', {})).toBe('/repo/tmp/acceptance-ledger')
    expect(ledgerHome('test', '/repo', { OMNE_TEST_LEDGER_HOME: '/x' })).toBe('/x')
    expect(ledgerHome('acceptance', '/repo', { OMNE_TEST_LEDGER_HOME: '/x' })).toBe(
      '/repo/tmp/acceptance-ledger',
    )
    expect(ledgerHome('acceptance', '/repo', { OMNE_ACCEPTANCE_LEDGER_HOME: '/y' })).toBe('/y')
    expect(ledgerHome('acceptance', '/repo', { OMNE_ACCEPTANCE_LEDGER_HOME: '' })).toBe(
      '/repo/tmp/acceptance-ledger',
    )
  })
})

const AFFECTED_EMPTY = {
  excludeRoots: [],
  globalPaths: [],
  readers: [],
  memberDocuments: [],
  pythonPaths: [],
  residentPaths: [],
  residentBuild: [],
}

describe('并行度', () => {
  const config = parseTestRunsConfig({
    parallel: { memberConcurrency: 2, vitestMaxWorkers: 4 },
    affected: AFFECTED_EMPTY,
    ledger: { slowFileSeconds: 10, nearTimeoutRatio: 0.5, top: 5 },
    triage: { repeats: 3 },
    mutation: { testTimeoutSeconds: 60 },
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
        affected: AFFECTED_EMPTY,
        ledger: { slowFileSeconds: 10, nearTimeoutRatio: 0.5, top: 5 },
        triage: { repeats: 3 },
        mutation: { testTimeoutSeconds: 60 },
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
          assertionResults: [
            { fullName: 'c', status: 'passed', duration: 1500 },
            { fullName: 'c 不设时限', status: 'passed', duration: 9000 },
          ],
        },
      ],
    },
    timing: {
      files: [
        {
          file: '/repo/packages/core/mid/tests/c.spec.ts',
          collectSeconds: 0.8,
          tests: [
            { fullName: 'c', timeoutSeconds: 2, tags: [] },
            { fullName: 'c', timeoutSeconds: 60, tags: [] },
            { fullName: 'c 不设时限', timeoutSeconds: 0, tags: ['slow'] },
          ],
        },
      ],
    },
  },
  { member: 'apps/top', exitCode: 137, wallSeconds: 1 },
]

describe('耗时账本', () => {
  const ledger = buildLedger(RUNS, '/repo', 0.5)

  it('成员一级：文件数、用例数、失败数、文件耗时之和；有计时报告的另记导入耗时之和', () => {
    expect(ledger.members[0]).toEqual({
      member: 'packages/core/leaf',
      exitCode: 1,
      wallSeconds: 30,
      files: 2,
      tests: 2,
      skipped: 0,
      failed: 1,
      fileSeconds: 12.5,
    })
    expect(ledger.members[1]?.collectSeconds).toBe(0.8)
  })

  it('文件按耗时从大到小，路径相对仓库根；有计时报告的文件带导入耗时', () => {
    expect(ledger.files.map(item => [item.file, item.seconds, item.collectSeconds])).toEqual([
      ['packages/core/leaf/tests/a.spec.ts', 12, undefined],
      ['packages/core/mid/tests/c.spec.ts', 2, 0.8],
      ['packages/core/leaf/tests/b.spec.ts', 0.5, undefined],
    ])
  })

  it('耗时达到自身时限一半的用例列入账本，按占时限的比例排；同名取第一条的时限；时限 0 不列；拿不到时限按 5 秒并标明', () => {
    expect(
      ledger.nearTimeout.map(item => [
        item.test,
        item.seconds,
        item.timeoutSeconds,
        item.timeoutAssumed,
      ]),
    ).toEqual([
      ['a 慢而且红', 11, 5, true],
      ['c', 1.5, 2, false],
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

  it('跳过、待写与被层过滤掉的用例不计入「用例」，另计「没跑」', () => {
    const filtered = buildLedger(
      [
        {
          member: 'packages/core/mid',
          exitCode: 0,
          wallSeconds: 2,
          report: {
            testResults: [
              {
                name: '/repo/packages/core/mid/tests/d.spec.ts',
                status: 'passed',
                startTime: 0,
                endTime: 10,
                assertionResults: [
                  { fullName: '跑了', status: 'passed', duration: 10 },
                  { fullName: '被滤掉', status: 'skipped', duration: 0 },
                  { fullName: '待写', status: 'todo', duration: 0 },
                ],
              },
            ],
          },
        },
      ],
      '/repo',
      0.5,
    )
    expect(filtered.members[0]).toMatchObject({ tests: 1, skipped: 2 })
    expect(filtered.files[0]?.tests).toBe(1)
    expect(
      ledgerSummary(filtered, {
        wallSeconds: 2,
        slowFileSeconds: 10,
        nearTimeoutRatio: 0.5,
        top: 2,
        runDir: '/out',
      })[0],
    ).toContain('1 个成员、1 个文件、1 条用例（另有 2 条没跑），墙钟 2 秒；全部通过')
  })

  it('归层漂移：快层超出的文件、快层贴线的用例、全归慢层却其实很快的文件', () => {
    const file = (
      name: string,
      results: [string, number][],
      slow: string[],
      timeouts: Readonly<Record<string, number>> = {},
    ) => ({
      result: {
        name: `/repo/packages/core/x/tests/${name}`,
        status: 'passed',
        startTime: 0,
        endTime: results.reduce((sum, [, ms]) => sum + ms, 0),
        assertionResults: results.map(([fullName, duration]) => ({
          fullName,
          status: 'passed',
          duration,
        })),
      },
      timing: {
        file: `/repo/packages/core/x/tests/${name}`,
        collectSeconds: 0.1,
        tests: results.map(([fullName]) => ({
          fullName,
          timeoutSeconds: timeouts[fullName] ?? (slow.includes(fullName) ? 120 : 5),
          tags: slow.includes(fullName) ? ['slow'] : [],
        })),
      },
    })
    const files = [
      file(
        'heavy.spec.ts',
        [
          ['重 1', 6_000],
          ['重 2', 6_000],
        ],
        [],
      ),
      file(
        'edge.spec.ts',
        [
          ['贴线', 3_000],
          ['快', 10],
        ],
        [],
      ),
      // 自带 30 秒时限、跑 3 秒：没贴自己的线，却超了快层的单条预算。
      file('loose.spec.ts', [['自带宽时限', 3_000]], [], { 自带宽时限: 30 }),
      file('needless.spec.ts', [['其实很快', 200]], ['其实很快']),
      // 每条都不到 2.5 秒、整份不到 10 秒，但没低过一半：不提示回快层，免得负载一变就来回点名。
      file(
        'borderline.spec.ts',
        [
          ['略慢 1', 2_000],
          ['略慢 2', 4_000],
        ],
        ['略慢 1', '略慢 2'],
      ),
      file('real-slow.spec.ts', [['真慢', 70_000]], ['真慢']),
    ]
    const drift = buildLedger(
      [
        {
          member: 'packages/core/x',
          exitCode: 0,
          wallSeconds: 90,
          report: { testResults: files.map(item => item.result) },
          timing: { files: files.map(item => item.timing) },
        },
      ],
      '/repo',
      0.5,
    )
    expect(drift.nearTimeout.map(test => [test.test, test.slow])).toEqual([
      ['重 1', false],
      ['重 2', false],
      ['贴线', false],
      ['真慢', true],
    ])
    expect(drift.fastOverBudget.map(test => test.test)).toEqual([
      '重 1',
      '重 2',
      '贴线',
      '自带宽时限',
    ])
    const lines = ledgerSummary(drift, {
      wallSeconds: 90,
      slowFileSeconds: 10,
      nearTimeoutRatio: 0.5,
      top: 5,
      runDir: '/out',
    })
    expect(lines).toContain(
      '归层：快层用例合计超过 10 秒的文件 1 个、快层里超过单条预算（2.5 秒）的用例 4 条；全归慢层、却每条不到 1.25 秒且整份不到 5 秒的文件 1 个',
    )
    expect(lines).toContain('  快层超出的文件：packages/core/x/tests/heavy.spec.ts 12 秒')
    expect(lines).toContain('  慢层里很快的文件：packages/core/x/tests/needless.spec.ts 0.2 秒')
  })

  it('有报告、退出码非零、却没有失败的用例或文件：单列一条，不当作通过', () => {
    const typecheckOnly = buildLedger([{ ...RUNS[1]!, exitCode: 1 }], '/repo', 0.5)
    expect(typecheckOnly.failures).toHaveLength(1)
    expect(typecheckOnly.failures[0]?.message).toContain('报告里没有失败的用例或文件')
  })

  it('摘要说清总数、失败、最慢的成员、超线的文件、导入最多的成员与贴着时限的用例', () => {
    const summary = ledgerSummary(ledger, {
      wallSeconds: 31.2,
      slowFileSeconds: 10,
      nearTimeoutRatio: 0.5,
      top: 2,
      runDir: '/out',
    }).join('\n')
    expect(summary).toContain('3 个成员、3 个文件、4 条用例，墙钟 31 秒；2 个成员未通过，失败 3 处')
    expect(summary).toContain('✗ packages/core/leaf/tests/a.spec.ts › a 慢而且红')
    expect(summary).toContain('最慢的成员：packages/core/leaf 30 秒、packages/core/mid 4 秒')
    expect(summary).toContain('超过 10 秒的文件 1 个：packages/core/leaf/tests/a.spec.ts 12 秒')
    expect(summary).toContain('导入耗时（各文件累计）最多的成员：packages/core/mid 1 秒')
    expect(summary).toContain(
      '贴着时限（耗时 ≥ 自身时限 × 0.5）的用例 2 条（其中 1 条没拿到时限，按 vitest 默认 5 秒算）：' +
        'packages/core/leaf/tests/a.spec.ts › a 慢而且红 11／5 秒；packages/core/mid/tests/c.spec.ts › c 1.5／2 秒',
    )
  })

  it('全过时摘要写「全部通过」；没有计时报告时不写导入一行', () => {
    const { timing: _timing, ...withoutTiming } = RUNS[1]!
    const green = buildLedger([withoutTiming], '/repo', 0.9)
    const summary = ledgerSummary(green, {
      wallSeconds: 4,
      slowFileSeconds: 10,
      nearTimeoutRatio: 0.9,
      top: 2,
      runDir: '/out',
    })
    expect(summary[0]).toContain('全部通过')
    expect(summary).toContain(
      '贴着时限（耗时 ≥ 自身时限 × 0.9）的用例 1 条（其中 1 条没拿到时限，按 vitest 默认 5 秒算）：packages/core/mid/tests/c.spec.ts › c 不设时限 9／5 秒',
    )
    expect(summary.some(line => line.startsWith('导入耗时'))).toBe(false)
  })
})

describe('计时报告器（真起一次 vitest）', { timeout: 60_000 }, () => {
  it('每个文件写导入耗时；每条用例写与 JSON 报告同一拼法的全名、解析后的时限与标签', () => {
    const project = mkdtempSync(join(tmpdir(), 'timing-reporter-'))
    try {
      writeFileSync(
        join(project, 'x.spec.ts'),
        [
          "describe('外层', () => {",
          "  describe('里层', () => {",
          "    test('带时限', { timeout: 1234 }, () => {})",
          '  })',
          "  test('默认时限', () => {})",
          '})',
          "test('顶层', () => {})",
        ].join('\n'),
      )
      const timingPath = join(project, 'timing.json')
      const ran = spawnSync(
        VITEST,
        ['run', '--root', project, '--globals', `--reporter=${TIMING_REPORTER}`],
        { cwd: project, encoding: 'utf8', env: { ...process.env, [TIMING_FILE_ENV]: timingPath } },
      )
      expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
      const timing = JSON.parse(readFileSync(timingPath, 'utf8')) as TimingReport
      expect(timing.files).toHaveLength(1)
      expect(timing.files[0]?.file).toBe(join(project, 'x.spec.ts'))
      expect(timing.files[0]?.collectSeconds).toBeGreaterThanOrEqual(0)
      expect(timing.files[0]?.tests).toEqual([
        { fullName: '外层 里层 带时限', timeoutSeconds: 1.234, tags: [] },
        { fullName: '外层 默认时限', timeoutSeconds: 5, tags: [] },
        { fullName: '顶层', timeoutSeconds: 5, tags: [] },
      ])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
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
