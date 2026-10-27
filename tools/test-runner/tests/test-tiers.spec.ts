// 测试分层：仓库根的分层定义、运行器交给 turbo 的任务，以及真起 vitest 时三种层各跑了什么、导入了什么。
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { configDefaults } from 'vitest/config'
import {
  ARCHIVE_EXCLUDE,
  SLOW_TEST_TIMEOUT_MS,
  TEST_REPORT_DIR_ENV as ROOT_REPORT_DIR_ENV,
  TEST_TIERS,
  VITEST_DEFAULT_EXCLUDE,
  cliFilters,
  reportSlug,
  testTiers,
} from '../../../vitest.tiers.mts'
import { RUN_TIERS } from '../src/testing/config.ts'
import {
  TEST_REPORT_DIR_ENV,
  TIER_TASKS,
  turboTestCommand,
  typecheckArgs,
} from '../src/testing/turbo.ts'
import { slugOf } from '../src/testing/run.ts'
import { triage, triageSummary } from '../src/testing/triage.ts'
import { fileTree, listWorkspaceMembers } from '@omne-harness/repo-toolchain/core/workspace'

const ROOT_DEFINITION = fileURLToPath(new URL('../../../vitest.tiers.mts', import.meta.url))
const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url))
const VITEST = fileURLToPath(new URL('../node_modules/.bin/vitest', import.meta.url))
const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

describe('根上的分层定义', () => {
  it('运行器重抄的报告目录变量名与层名与根定义一致', () => {
    expect(TEST_REPORT_DIR_ENV).toBe(ROOT_REPORT_DIR_ENV)
    expect(RUN_TIERS.filter(tier => tier !== 'all')).toEqual([...TEST_TIERS])
  })

  it('重抄的 vitest 缺省 exclude 与 vitest 自己的一致', () => {
    expect([...VITEST_DEFAULT_EXCLUDE]).toEqual(configDefaults.exclude)
    expect([...VITEST_DEFAULT_EXCLUDE]).toEqual(configDefaults.typecheck.exclude)
  })

  /** 不带过滤的 vitest 命令行：单测不随运行它的那条命令变。 */
  const PLAIN = ['node', '/x/node_modules/vitest/vitest.mjs', 'run', '--mode', 'fast']

  it('不给 mode：声明 slow 标签及其时限、排除嵌套归档目录，不过滤', () => {
    const tiers = testTiers(undefined, {}, REPOSITORY, PLAIN)
    expect(tiers).toEqual({
      tags: [expect.objectContaining({ name: 'slow', timeout: SLOW_TEST_TIMEOUT_MS })],
      exclude: [...VITEST_DEFAULT_EXCLUDE, ARCHIVE_EXCLUDE],
      typecheck: { exclude: [...VITEST_DEFAULT_EXCLUDE, ARCHIVE_EXCLUDE] },
    })
    expect(testTiers('test', {}, REPOSITORY, PLAIN)).toEqual(tiers)
  })

  it('快层滤掉 slow，慢层只留 slow；两层都允许一个测试也不剩、都开 preParse', () => {
    expect(testTiers('fast', {}, REPOSITORY, PLAIN)).toMatchObject({
      tagsFilter: ['!slow'],
      passWithNoTests: true,
      experimental: { preParse: true },
    })
    expect(testTiers('fast', {}, REPOSITORY, PLAIN)).not.toHaveProperty('reporters')
    expect(testTiers('slow', {}, REPOSITORY, PLAIN)).toMatchObject({ tagsFilter: ['slow'] })
  })

  it('从 vitest 命令行读出用例名与文件过滤；选项的值不当成文件过滤，别的入口不算', () => {
    const vitest = (...words: string[]) => ['node', '/r/node_modules/vitest/vitest.mjs', ...words]
    expect(cliFilters(vitest('run', '--mode', 'slow', '--typecheck.enabled=false'))).toEqual({
      testNames: [],
      files: [],
    })
    expect(
      cliFilters(vitest('run', '--mode', 'slow', 'tests/a.spec.ts', '-t', '名 甲', 'b')),
    ).toEqual({ testNames: ['名 甲'], files: ['tests/a.spec.ts', 'b'] })
    expect(cliFilters(vitest('run', '--testNamePattern=x', '--test-name-pattern', 'y'))).toEqual({
      testNames: ['x', 'y'],
      files: [],
    })
    // 不带子命令时第一个词就是文件过滤；`--` 之后的不算。
    expect(cliFilters(vitest('tests/a', '--', 'c'))).toEqual({ testNames: [], files: ['tests/a'] })
    // sandbox 预检的写法：带值的选项用空格分开，没有过滤。
    expect(
      cliFilters(vitest('run', '--config', 'c.mts', '--pool', 'threads', '--maxWorkers', '1')),
    ).toEqual({ testNames: [], files: [] })
    expect(cliFilters(['node', '/r/stryker/worker.js', 'run', 'x'])).toEqual({
      testNames: [],
      files: [],
    })
  })

  it('只有带值的选项吞下后面的词：布尔选项后面的词仍是文件过滤，布尔值 true、false 除外', () => {
    const vitest = (...words: string[]) => ['node', '/r/node_modules/vitest/vitest.mjs', ...words]
    const files = (...words: string[]) => cliFilters(vitest('run', ...words)).files
    expect(files('--no-isolate', 'tests/x')).toEqual(['tests/x'])
    expect(files('--typecheck', 'tests/x')).toEqual(['tests/x'])
    expect(files('--coverage.enabled', 'false', '--isolate', 'true')).toEqual([])
    // 运行器逐成员运行的写法：`--exclude` 带值，它的 glob 不是过滤。
    expect(files('--exclude', '**/*.legacy/**', '--reporter=json')).toEqual([])
    // 短横线写法与驼峰同一个选项；带点的选项按带值算。
    expect(files('--max-workers', '2', '--typecheck.include', 'tests/**/*.spec-d.ts')).toEqual([])
    expect(cliFilters(vitest('run', '--test-name-pattern', 'y', 'tests/a')).testNames).toEqual([
      'y',
    ])
  })

  it('带过滤：不让一个文件都不剩算通过、挂过滤守卫；带用例名时关 preParse', () => {
    const named = ['node', '/r/vitest.mjs', 'run', '--mode', 'slow', '-t', '名']
    expect(testTiers('slow', {}, REPOSITORY, named)).toMatchObject({
      passWithNoTests: false,
      experimental: { preParse: false },
      reporters: [
        'default',
        [expect.stringMatching(/filter-guard\.ts$/u), { testNames: ['名'], files: [] }],
      ],
    })
    const file = ['node', '/r/vitest.mjs', 'run', '--mode', 'fast', 'tests/a.spec.ts']
    expect(testTiers('fast', {}, REPOSITORY, file)).toMatchObject({
      passWithNoTests: false,
      experimental: { preParse: true },
    })
    // 报告目录与守卫同时生效：守卫追加在后面，不替换账本要的报告器。
    expect(
      testTiers('fast', { [ROOT_REPORT_DIR_ENV]: '/runs/1' }, REPOSITORY, file).reporters,
    ).toEqual([
      'default',
      'json',
      [expect.stringMatching(/timing-reporter\.ts$/u), expect.anything()],
      [expect.stringMatching(/filter-guard\.ts$/u), { testNames: [], files: ['tests/a.spec.ts'] }],
    ])
  })

  it('认不出的 mode 报错，不悄悄全跑', () => {
    expect(() => testTiers('medium', {})).toThrow('medium')
  })

  it('设了报告目录：按成员路径写 JSON 报告与计时报告；没设或空串不挂报告器', () => {
    const member = join(REPOSITORY, 'packages/common/json-text')
    expect(reportSlug(member)).toBe('packages__common__json-text')
    const tiers = testTiers('fast', { [ROOT_REPORT_DIR_ENV]: '/runs/1' }, member, PLAIN)
    expect(tiers).toMatchObject({
      reporters: [
        'default',
        'json',
        [
          expect.stringMatching(/timing-reporter\.ts$/u),
          { outputFile: '/runs/1/packages__common__json-text.timing.json' },
        ],
      ],
      outputFile: { json: '/runs/1/packages__common__json-text.json' },
      env: { [ROOT_REPORT_DIR_ENV]: '' },
    })
    expect(testTiers('fast', { [ROOT_REPORT_DIR_ENV]: '' }, member, PLAIN)).not.toHaveProperty(
      'reporters',
    )
  })

  it('成员配置写报告用的文件名与运行器读报告用的一致：每个成员都对得上', () => {
    const members = listWorkspaceMembers(fileTree(REPOSITORY), [])
    expect(members.length).toBeGreaterThan(0)
    for (const { path } of members) expect(reportSlug(join(REPOSITORY, path))).toBe(slugOf(path))
  })
})

describe('运行器交给 turbo 的命令', () => {
  const parallel = { memberConcurrency: 3, vitestMaxWorkers: 2 }

  it('每层一个任务，与成员脚本同名', () => {
    expect(TIER_TASKS).toEqual({ fast: 'test:fast', slow: 'test:slow', all: 'test' })
  })

  it('不构建时只跑点名成员的这一层（--only），一个失败不拦其余的；报告目录与工作进程数经环境变量传下去', () => {
    const command = turboTestCommand(['@a/x', '@a/y'], 'slow', parallel, '/runs/2', {
      build: false,
      admission: false,
    })
    expect(command.args.slice(0, 4)).toEqual(['run', 'test:slow', '--filter=@a/x', '--filter=@a/y'])
    expect(command.args).toEqual(
      expect.arrayContaining([
        '--only',
        '--continue=dependencies-successful',
        '--concurrency=3',
        '--summarize',
      ]),
    )
    expect(command.env[TEST_REPORT_DIR_ENV]).toBe('/runs/2')
    expect(command.env['VITEST_MAX_WORKERS']).toBe('2')
  })

  it('要构建时不带 --only，由 turbo 按依赖构建；准入模式下构建缓存只写不读', () => {
    const args = (admission: boolean) =>
      turboTestCommand(['@a/x'], 'fast', parallel, '/runs/3', { build: true, admission }).args
    expect(args(false)).not.toContain('--only')
    expect(args(false)).toContain('--cache=local:rw')
    expect(args(true)).toContain('--cache=local:w')
  })

  it('类型检查按输入缓存：依赖上游的 typecheck，成员目录外经相对路径读到的文件在全局依赖里；准入模式下缓存只写不读', () => {
    const turbo = JSON.parse(readFileSync(join(REPOSITORY, 'turbo.json'), 'utf8')) as {
      globalDependencies?: string[]
      tasks: Record<string, { dependsOn?: string[]; cache?: boolean }>
    }
    const typecheck = turbo.tasks['typecheck']
    expect(typecheck?.cache).not.toBe(false)
    expect(typecheck?.dependsOn).toContain('^typecheck')
    expect(turbo.globalDependencies).toEqual(
      expect.arrayContaining([
        'vitest.tiers.mts',
        'tools/repo-toolchain/src/**',
        'tools/repo-toolchain/tests/fixtures/**',
      ]),
    )
    expect(typecheckArgs(['@a/x'], false)).toContain('--cache=local:rw')
    expect(typecheckArgs(['@a/x'], true)).toContain('--cache=local:w')
  })

  it('三个测试任务的 env 与 passThroughEnv 各是同一份', () => {
    const turbo = JSON.parse(readFileSync(join(REPOSITORY, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { env?: string[]; passThroughEnv?: string[] }>
    }
    for (const key of ['env', 'passThroughEnv'] as const) {
      const [first, ...rest] = Object.values(TIER_TASKS).map(task => turbo.tasks[task]?.[key])
      for (const list of rest) expect(list).toEqual(first)
    }
  })

  it('三个测试任务都把这两个变量列进 passThroughEnv：turbo 的 Strict Mode 会滤掉没声明的变量', () => {
    const turbo = JSON.parse(readFileSync(join(REPOSITORY, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { passThroughEnv?: string[]; cache?: boolean }>
    }
    for (const task of Object.values(TIER_TASKS)) {
      expect(turbo.tasks[task]?.passThroughEnv).toEqual(
        expect.arrayContaining([TEST_REPORT_DIR_ENV, 'VITEST_MAX_WORKERS']),
      )
      expect(turbo.tasks[task]?.cache).toBe(false)
    }
  })
})

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** 一个小 vitest 项目：配置展开根上的分层定义；不导入 vitest（用全局 API），所以放在系统临时目录也跑得起来。 */
function project(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'test-tiers-')))
  temporaries.push(root)
  writeFileSync(
    join(root, 'vitest.config.mjs'),
    [
      `import { testTiers } from ${JSON.stringify(ROOT_DEFINITION)}`,
      "export default ({ mode }) => ({ test: { ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'] } })",
    ].join('\n'),
  )
  mkdirSync(join(root, 'tests'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'tests', name), text)
  return root
}

function vitest(root: string, tier: string) {
  const report = join(root, `report-${tier || 'all'}.json`)
  const marker = join(root, `imported-${tier || 'all'}.txt`)
  // 不把运行器的报告目录传给夹具：它的报告不进这一轮的账本。
  const env: NodeJS.ProcessEnv = { ...process.env, MARKER: marker }
  delete env[ROOT_REPORT_DIR_ENV]
  const ran = spawnSync(
    VITEST,
    [
      'run',
      ...(tier === '' ? [] : ['--mode', tier]),
      '--reporter=json',
      `--outputFile.json=${report}`,
    ],
    { cwd: root, encoding: 'utf8', env },
  )
  const passed = existsSync(report)
    ? (
        JSON.parse(readFileSync(report, 'utf8')) as {
          testResults: { assertionResults: { title: string; status: string }[] }[]
        }
      ).testResults
        .flatMap(file => file.assertionResults)
        .filter(test => test.status === 'passed')
        .map(test => test.title)
        .sort()
    : []
  return {
    status: ran.status,
    output: `${ran.stdout}${ran.stderr}`,
    report: existsSync(report) ? readFileSync(report, 'utf8') : '',
    passed,
    imported: existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n') : [],
  }
}

/** 被导入时往 MARKER 文件里记一行自己的名字。 */
const MARK = (name: string) => [
  "import { appendFileSync } from 'node:fs'",
  `appendFileSync(process.env['MARKER'] ?? '/dev/null', ${JSON.stringify(`${name}\n`)})`,
]

describe('真起 vitest：各层跑了什么、导入了什么', { timeout: 60_000 }, () => {
  const root = project({
    'quick.spec.ts': [
      ...MARK('quick'),
      "test('快的', () => {})",
      "test('单条归慢', { tags: ['slow'] }, () => {})",
    ].join('\n'),
    'heavy.spec.ts': [
      '/**',
      // vitest 扫描整个文件找这条声明，字符串里的也算：拆开写，免得本文件自己被归进慢层。
      ` * @module-${'tag'} slow`,
      ' * 归慢层：夹具，整文件归慢。',
      ' */',
      ...MARK('heavy'),
      "describe('一组', () => { test('整文件归慢', () => {}) })",
    ].join('\n'),
  })

  it('不设层：两层全跑，两个文件都导入', () => {
    const result = vitest(root, '')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual(['单条归慢', '快的', '整文件归慢'])
    expect(result.imported.sort()).toEqual(['heavy', 'quick'])
  })

  it('快层：只跑没归慢的；整文件归慢的那份不导入', () => {
    const result = vitest(root, 'fast')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual(['快的'])
    expect(result.imported).toEqual(['quick'])
  })

  it('慢层：只跑归慢的，整文件的与单条的都在', () => {
    const result = vitest(root, 'slow')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual(['单条归慢', '整文件归慢'])
  })

  it('没有慢测试的项目在慢层下退出 0', () => {
    const quickOnly = project({ 'only.spec.ts': "test('只有快的', () => {})" })
    const result = vitest(quickOnly, 'slow')
    expect(result.status, result.output).toBe(0)
    expect(result.passed).toEqual([])
  })

  it('用了没声明的标签：vitest 报错退出，不会静默当成快层', () => {
    const typo = project({ 'typo.spec.ts': "test('拼错了', { tags: ['slwo'] }, () => {})" })
    const result = vitest(typo, '')
    expect(result.status).not.toBe(0)
    expect(result.report).toContain('slwo')
  })
})

/** 不带 `--reporter` 起夹具的 vitest（命令行给的报告器会替换配置里的），返回退出码、输出与跑到的用例。 */
function vitestWith(root: string, args: readonly string[]) {
  const marker = join(root, `ran-${temporaries.length}-${Date.now()}.txt`)
  const env: NodeJS.ProcessEnv = { ...process.env, MARKER: marker, NO_COLOR: '1' }
  delete env[ROOT_REPORT_DIR_ENV]
  delete env['FORCE_COLOR']
  const ran = spawnSync(VITEST, ['run', ...args], { cwd: root, encoding: 'utf8', env })
  return {
    status: ran.status,
    output: `${ran.stdout}${ran.stderr}`,
    ran: existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').sort() : [],
  }
}

/** 用例跑起来时往 MARKER 文件里记一行名字。 */
const RAN = [
  "import { appendFileSync } from 'node:fs'",
  "const ran = (name: string) => appendFileSync(process.env['MARKER'] ?? '/dev/null', `${name}\\n`)",
].join('\n')

describe('真起 vitest：带过滤的运行要么选中要么失败（#737）', { timeout: 60_000 }, () => {
  const root = project({
    'each.spec.ts': [
      RAN,
      // 用例名由 test.each 生成：preParse 只认字面量名字，静态匹配不到。
      "test.each(['甲', '乙'])('生成的慢用例 %s', { tags: ['slow'] }, value => ran(`慢 ${value}`))",
      "test.each(['丙'])('生成的快用例 %s', value => ran(`快 ${value}`))",
    ].join('\n'),
    'quick.spec.ts': [RAN, "test('只有快的', () => ran('只有快的'))"].join('\n'),
  })

  it('慢层按 test.each 生成的用例名过滤：选中并运行它', () => {
    const result = vitestWith(root, ['--mode', 'slow', '-t', '生成的慢用例 甲'])
    expect(result.status, result.output).toBe(0)
    expect(result.ran).toEqual(['慢 甲'])
    expect(result.output).not.toContain('No test files found')
  })

  it('慢层同时给文件与 test.each 用例名：选中并运行它', () => {
    const result = vitestWith(root, [
      '--mode',
      'slow',
      'tests/each.spec.ts',
      '--testNamePattern=生成的慢用例 乙',
    ])
    expect(result.status, result.output).toBe(0)
    expect(result.ran).toEqual(['慢 乙'])
  })

  it('快层按 test.each 生成的用例名过滤：同样选中', () => {
    const result = vitestWith(root, ['--mode', 'fast', '-t', '生成的快用例 丙'])
    expect(result.status, result.output).toBe(0)
    expect(result.ran).toEqual(['快 丙'])
  })

  it('用例名过滤后一条也没选中：非零退出并说明过滤条件', () => {
    const result = vitestWith(root, ['--mode', 'slow', '-t', '不存在的名字'])
    expect(result.status, result.output).not.toBe(0)
    expect(result.ran).toEqual([])
    expect(result.output).toContain('没有选中任何用例')
    expect(result.output).toContain('不存在的名字')
  })

  it('文件过滤后一条也没选中（文件里只有快层用例）：慢层非零退出并说明', () => {
    const result = vitestWith(root, ['--mode', 'slow', 'tests/quick.spec.ts'])
    expect(result.status, result.output).not.toBe(0)
    expect(result.ran).toEqual([])
    expect(result.output).toContain('没有选中任何用例')
    expect(result.output).toContain('tests/quick.spec.ts')
  })

  it('文件过滤认不出任何文件：非零退出', () => {
    const result = vitestWith(root, ['--mode', 'slow', 'tests/没有这个文件.spec.ts'])
    expect(result.status, result.output).not.toBe(0)
    expect(result.ran).toEqual([])
  })

  it('布尔选项后面紧跟的文件过滤也认得：选不中时非零退出', () => {
    for (const flag of ['--no-isolate', '--typecheck']) {
      const result = vitestWith(root, ['--mode', 'slow', flag, 'tests/quick.spec.ts'])
      expect(result.status, result.output).not.toBe(0)
      expect(result.ran).toEqual([])
      expect(result.output).toContain('没有选中任何用例')
    }
  })

  it('过滤到的文件加载失败：非零退出，只报加载错误，不说没有选中用例', () => {
    const broken = project({
      'broken.spec.ts': ["import '../nope.ts'", "test('坏的', { tags: ['slow'] }, () => {})"].join(
        '\n',
      ),
    })
    const result = vitestWith(broken, ['--mode', 'slow', 'tests/broken.spec.ts'])
    expect(result.status, result.output).not.toBe(0)
    expect(result.output).toContain('nope.ts')
    expect(result.output).not.toContain('没有选中任何用例')
  })

  it('不带过滤：慢层照常只跑慢的，没有慢用例的项目仍退出 0', () => {
    const slow = vitestWith(root, ['--mode', 'slow'])
    expect(slow.status, slow.output).toBe(0)
    expect(slow.ran).toEqual(['慢 乙', '慢 甲'])
    const quickOnly = project({ 'only.spec.ts': [RAN, "test('快', () => ran('快'))"].join('\n') })
    const none = vitestWith(quickOnly, ['--mode', 'slow'])
    expect(none.status, none.output).toBe(0)
    expect(none.ran).toEqual([])
  })

  it(
    '现状：失败归因经成员脚本与同一配置重跑时，选中生成的用例名，选不中的归为未能单独重跑',
    // 刻画现状，不是回归：triage 走成员脚本 `test`（不给 mode，不开 preParse），#682 的现象没有经过这条路。
    // 它传 `--reporter`，过滤守卫不在场，归类只靠 JSON 报告。
    // 归慢层：经 pnpm 起成员脚本、每处再起一次 vitest，约数秒。
    { tags: ['slow'] },
    async () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'triage-fixture',
          private: true,
          scripts: { test: `${VITEST} run` },
        }),
      )
      const failures = [
        { member: '.', file: 'tests/each.spec.ts', test: '生成的慢用例 甲', message: '原运行失败' },
        { member: '.', file: 'tests/each.spec.ts', test: '不存在的名字', message: '原运行失败' },
      ]
      const triageDir = join(root, 'triage')
      const entries = await triage(root, 'test', failures, 1, triageDir, () => {})
      expect(entries.map(entry => [entry.test, entry.outcomes, entry.class])).toEqual([
        ['生成的慢用例 甲', ['passed'], 'passes-alone'],
        ['不存在的名字', ['not-run'], 'not-isolated'],
      ])
      const summary = triageSummary(entries, triageDir)
      const notIsolated = summary.findIndex(line => line.startsWith('未能单独重跑'))
      expect(summary[notIsolated + 1]).toContain('不存在的名字')
      const passesAlone = summary.findIndex(line => line.startsWith('隔离稳定通过'))
      expect(summary[passesAlone + 1]).toContain('生成的慢用例 甲')
      expect(summary.filter(line => line.includes('不存在的名字'))).toHaveLength(1)
    },
  )
})

describe('入口的层参数', { timeout: 60_000 }, () => {
  const subject = realpathSync(mkdtempSync(join(tmpdir(), 'test-tier-cli-')))
  afterAll(() => rmSync(subject, { recursive: true, force: true }))
  writeFileSync(
    join(subject, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*/*\n  - tools/*\n  - packages.0.0.1.legacy/core/*\n',
  )
  // 计划经 turbo 选成员，turbo 要读被检查仓库根的 package.json 与 packageManager。
  writeFileSync(
    join(subject, 'package.json'),
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  // 影响面规则点名的成员都要在，否则计划报错；外加一个退役目录里的成员。
  for (const path of [
    'packages/common/legal-identity',
    'tools/repo-toolchain',
    'tools/dev-flow',
    'tools/product-checks',
    'tools/test-runner',
    'packages.0.0.1.legacy/core/identity-values',
  ]) {
    mkdirSync(join(subject, path), { recursive: true })
    writeFileSync(
      join(subject, path, 'package.json'),
      JSON.stringify({
        name: `@fixture/${path.split('/').at(-1)}`,
        scripts: { test: 'vitest run' },
      }),
    )
  }
  execFileSync('git', ['init', '-q'], { cwd: subject })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ],
    { cwd: subject },
  )
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, OMNE_SUBJECT_ROOT: subject },
    })

  it('受影响范围缺省快层，--tier 可改；--plan-only 打印层', () => {
    expect(cli('run', '--base', 'HEAD', '--plan-only').stdout).toContain('层：快层（fast）')
    expect(cli('run', '--base', 'HEAD', '--tier', 'slow', '--plan-only').stdout).toContain(
      '层：慢层（slow）',
    )
    expect(cli('run', '--all', '--plan-only').stdout).toContain('层：两层（all）')
  })

  it('构建缺省：受影响范围与全量验收先构建，全量测试不构建；--build、--no-build 改写，同给退出 2', () => {
    const built = '构建：先构建这些成员及其依赖'
    const notBuilt = '构建：不构建（调用方已构建）'
    expect(cli('run', '--base', 'HEAD', '--plan-only').stdout).toContain(built)
    expect(cli('run', '--base', 'HEAD', '--no-build', '--plan-only').stdout).toContain(notBuilt)
    expect(cli('run', '--all', '--plan-only').stdout).toContain(notBuilt)
    expect(cli('run', '--all', '--build', '--plan-only').stdout).toContain(built)
    expect(cli('run', '--all', '--script', 'acceptance', '--plan-only').stdout).toContain(built)
    expect(
      cli('run', '--all', '--script', 'acceptance', '--no-build', '--plan-only').stdout,
    ).toContain(notBuilt)
    expect(cli('run', '--all', '--build', '--no-build', '--plan-only').status).toBe(2)
  })

  it('不给 --base 与 --all：基线取 main（没有任务上下文时）', () => {
    execFileSync('git', ['update-ref', 'refs/heads/main', 'HEAD'], { cwd: subject })
    const ran = cli('run', '--plan-only')
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('影响面（基线 main')
  })

  it('认不出的层、给验收指定层：退出 2 并说明', () => {
    const bad = cli('run', '--all', '--tier', 'medium', '--plan-only')
    expect(bad.status).toBe(2)
    expect(bad.stderr).toContain('--tier 只能是')
    const acceptance = cli(
      'run',
      '--all',
      '--script',
      'acceptance',
      '--tier',
      'fast',
      '--plan-only',
    )
    expect(acceptance.status).toBe(2)
    expect(acceptance.stderr).toContain('可执行验收不分层')
  })
})
