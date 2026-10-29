// @module-tag slow
// 归慢层：真起 vitest、turbo 与 git 子进程，各层跑了什么要真跑才看得到。全量准入快层账本里整份合计 21.9 秒，负载下 51.4 秒，只标超预算的用例，余下仍有 13.1 秒（负载下 30.9 秒），过了 10 秒线（tools/test-runner/README_ZH.md「归层」）。
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
import { createRequire } from 'node:module'
import { devNull, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { configDefaults } from 'vitest/config'
import { parseCLI } from 'vitest/node'
import {
  ARCHIVE_EXCLUDE,
  SLOW_TEST_TIMEOUT_MS,
  TEST_REPORT_DIR_ENV as ROOT_REPORT_DIR_ENV,
  TEST_TIERS,
  VITEST_DEFAULT_EXCLUDE,
  VITEST_BOOLEAN_OPTIONS,
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
// vitest 的 bin 入口本身，由当前 Node 起；`.bin/vitest` 在 Windows 上是 shell 垫片，Node 不经 shell 起不了。
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const CLI = fileURLToPath(new URL('../src/testing/cli.ts', import.meta.url))

/** vitest 命令行定义里的一个选项（cac 的 Option）：这里用到的字段。带值的选项没有 `isBoolean`。 */
interface VitestCliOption {
  readonly names: readonly string[]
  readonly isBoolean?: boolean
  readonly negated: boolean
}

function isVitestCliOption(value: unknown): value is VitestCliOption {
  return (
    typeof value === 'object' &&
    value !== null &&
    'names' in value &&
    Array.isArray(value.names) &&
    value.names.every((name: unknown) => typeof name === 'string') &&
    (!('isBoolean' in value) || typeof value.isBoolean === 'boolean') &&
    'negated' in value &&
    typeof value.negated === 'boolean'
  )
}

/**
 * 安装的 vitest 的命令行选项：`createCLI().globalCommand.options`。`createCLI` 不在公开导出里，
 * 从 `vitest/node` 导出 `parseCLI` 的那个 chunk 里按函数名取；取不到就报错，不猜。
 */
async function vitestCliOptions(): Promise<readonly VitestCliOption[]> {
  const dist = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'dist')
  const entry = readFileSync(join(dist, 'node.js'), 'utf8')
  const chunk = /export \{[^}]*\bparseCLI\b[^}]*\} from '(\.\/chunks\/[^']+\.js)'/u.exec(entry)?.[1]
  if (chunk === undefined)
    throw new Error('vitest/node 里找不到导出 parseCLI 的 chunk，读不到命令行定义')
  const loaded: unknown = await import(pathToFileURL(join(dist, chunk)).href)
  const createCLI =
    typeof loaded === 'object' && loaded !== null
      ? Object.values(loaded).find(
          (value: unknown): value is () => unknown =>
            typeof value === 'function' && value.name === 'createCLI',
        )
      : undefined
  if (createCLI === undefined)
    throw new Error(`vitest 的 ${chunk} 里没有 createCLI，读不到命令行定义`)
  const cli: unknown = createCLI()
  const command: unknown =
    typeof cli === 'object' && cli !== null && 'globalCommand' in cli
      ? cli.globalCommand
      : undefined
  const options: unknown =
    typeof command === 'object' && command !== null && 'options' in command
      ? command.options
      : undefined
  if (!Array.isArray(options) || options.length === 0 || !options.every(isVitestCliOption))
    throw new Error('vitest 的 createCLI().globalCommand.options 形状认不出，读不到命令行定义')
  return options
}

describe('根上的分层定义', () => {
  it('运行器重抄的报告目录变量名与层名与根定义一致', () => {
    expect(TEST_REPORT_DIR_ENV).toBe(ROOT_REPORT_DIR_ENV)
    expect(RUN_TIERS.filter(tier => tier !== 'all')).toEqual([...TEST_TIERS])
  })

  it('重抄的 vitest 缺省 exclude 与 vitest 自己的一致', () => {
    expect([...VITEST_DEFAULT_EXCLUDE]).toEqual(configDefaults.exclude)
    expect([...VITEST_DEFAULT_EXCLUDE]).toEqual(configDefaults.typecheck.exclude)
  })

  it('重抄的布尔选项表与安装的 vitest 命令行定义一致：布尔的都在表里，表里的都是布尔', async () => {
    const options = await vitestCliOptions()
    const booleans = new Set(
      options
        .filter(option => option.isBoolean === true)
        .flatMap(option => option.names.map(name => (name.length === 1 ? `-${name}` : name))),
    )
    const table = new Set<string>(VITEST_BOOLEAN_OPTIONS)
    const missing = [...booleans].filter(name => !table.has(name))
    const extra = [...table].filter(name => !booleans.has(name))
    expect(
      { missing, extra },
      `vitest.tiers.mts 的 VITEST_BOOLEAN_OPTIONS 与安装的 vitest 不一致：表里缺 ${missing.join(' ') || '（无）'}；表里多 ${extra.join(' ') || '（无）'}`,
    ).toEqual({ missing: [], extra: [] })
  })

  it('每个定义了的选项（长名、短名、取反）与没定义的配置键、连写短选项、`=` 写法后面跟一个词：认出的过滤与 vitest 自己的解析一致', async () => {
    const options = await vitestCliOptions()
    const lines: string[][] = [
      ['--typecheck.include', 'x'],
      ['--typecheck.exclude', 'x'],
      ['--outputFile.json', 'x'],
      ['--foo.bar', 'x'],
      ['--fooBar', 'x'],
      ['--no-isolate', 'x'],
      ['--no-isolate', 'false', 'x'],
      ['--no-foo', 'x'],
      ['--file-parallelism', 'x'],
      ['--test-name-pattern', 'y', 'x'],
      ['--isolate=x'],
      ['--isolate=true', 'x'],
      ['--sequence.shuffle=x'],
      ['--typecheck.enabled=false'],
      ['--isolate', '-t', 'y', 'x'],
      ['-tw', 'y'],
      ['-wt', 'y'],
      ['-tw=y', 'x'],
      ['--mode', 'slow', 'run', 'x'],
      ['--isolate', 'run', 'x'],
    ]
    for (const option of options) {
      // `--help`、`--version` 只打印、不跑测试，解析时还会往输出里打印帮助。
      if (option.names.includes('help') || option.names.includes('version')) continue
      for (const name of option.names)
        lines.push([name.length === 1 ? `-${name}` : `--${name}`, 'probe'])
      lines.push([`--no-${option.names.at(-1) ?? ''}`, 'probe'])
    }
    const disagreements: string[] = []
    for (const words of lines) {
      let parsed: ReturnType<typeof parseCLI>
      try {
        parsed = parseCLI(['vitest', 'run', ...words])
      } catch {
        // vitest 拒绝这条命令行（比如 `--silent probe`）：不会跑起来，没有过滤可言。
        continue
      }
      const pattern: unknown = parsed.options.testNamePattern
      const expected = {
        testNames: [pattern].flat().filter(name => typeof name === 'string'),
        files: parsed.filter.map(String),
      }
      const actual = cliFilters(['node', '/r/node_modules/vitest/vitest.mjs', 'run', ...words])
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        disagreements.push(
          `${words.join(' ')}：vitest 读出 ${JSON.stringify(expected)}，认出 ${JSON.stringify(actual)}`,
        )
    }
    expect(disagreements, disagreements.join('\n')).toEqual([])
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

  it('布尔选项后面的词仍是文件过滤（布尔值 true、false 除外），其余选项吞下后面的词', () => {
    const vitest = (...words: string[]) => ['node', '/r/node_modules/vitest/vitest.mjs', ...words]
    const files = (...words: string[]) => cliFilters(vitest('run', ...words)).files
    expect(files('--no-isolate', 'tests/x')).toEqual(['tests/x'])
    expect(files('--typecheck', 'tests/x')).toEqual(['tests/x'])
    expect(files('--coverage.enabled', 'false', '--isolate', 'true')).toEqual([])
    // 运行器逐成员运行的写法：`--exclude` 带值，它的 glob 不是过滤。
    expect(files('--exclude', '**/*.legacy/**', '--reporter=json')).toEqual([])
    // 带点的选项同样照布尔表分。
    expect(files('--max-workers', '2', '--coverage.reportsDirectory', 'out/cov')).toEqual([])
    expect(files('--sequence.shuffle', 'tests/x')).toEqual(['tests/x'])
    expect(files('--typecheck.only', 'true', '--coverage.thresholds.100', 'tests/y')).toEqual([
      'tests/y',
    ])
    // 表外的选项（vitest 命令行没定义的配置键）与 vitest 一样按带值算。
    expect(files('--typecheck.include', 'tests/**/*.spec-d.ts')).toEqual([])
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
    // 报告路径由 path.join 拼出，期望同样按本机分隔符拼。
    expect(tiers).toMatchObject({
      reporters: [
        'default',
        'json',
        [
          expect.stringMatching(/timing-reporter\.ts$/u),
          { outputFile: join('/runs/1', 'packages__common__json-text.timing.json') },
        ],
      ],
      outputFile: { json: join('/runs/1', 'packages__common__json-text.json') },
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
    expect(typecheckArgs(['@a/x'], false, 5)).toContain('--cache=local:rw')
    expect(typecheckArgs(['@a/x'], true, 5)).toContain('--cache=local:w')
    expect(typecheckArgs(['@a/x'], true, 5)).toContain('--concurrency=5')
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
      // file URL：Windows 上的绝对路径作 ESM 说明符时，盘符会被当成 URL 协议。
      `import { testTiers } from ${JSON.stringify(pathToFileURL(ROOT_DEFINITION).href)}`,
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
    process.execPath,
    [
      VITEST,
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

/**
 * 夹具没拿到 MARKER 时（失败归因经成员脚本重跑，不传它）写进的空设备，写成 JS 字符串字面量。
 * Windows 上没有 `/dev/null`（会解析成当前盘的 `\dev\null`），用 `os.devNull`。
 */
const NULL_DEVICE = JSON.stringify(devNull)

/** 被导入时往 MARKER 文件里记一行自己的名字。 */
const MARK = (name: string) => [
  "import { appendFileSync } from 'node:fs'",
  `appendFileSync(process.env['MARKER'] ?? ${NULL_DEVICE}, ${JSON.stringify(`${name}\n`)})`,
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
  const ran = spawnSync(process.execPath, [VITEST, 'run', ...args], {
    cwd: root,
    encoding: 'utf8',
    env,
  })
  return {
    status: ran.status,
    output: `${ran.stdout}${ran.stderr}`,
    ran: existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').sort() : [],
  }
}

/** 用例跑起来时往 MARKER 文件里记一行名字。 */
const RAN = [
  "import { appendFileSync } from 'node:fs'",
  "const ran = (name: string) => appendFileSync(process.env['MARKER'] ?? " +
    NULL_DEVICE +
    ', `${name}\\n`)',
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
    for (const flag of ['--no-isolate', '--typecheck', '--sequence.shuffle']) {
      const result = vitestWith(root, ['--mode', 'slow', flag, 'tests/quick.spec.ts'])
      expect(result.status, result.output).not.toBe(0)
      expect(result.ran).toEqual([])
      expect(result.output).toContain('没有选中任何用例')
    }
  })

  it('只跑类型测试时，布尔选项后面的文件过滤选不中：非零退出', () => {
    const result = vitestWith(root, ['--mode', 'slow', '--typecheck.only', 'tests/quick.spec.ts'])
    expect(result.status, result.output).not.toBe(0)
    expect(result.ran).toEqual([])
  })

  it('带点的带值选项吞下它的值：不当成文件过滤，没有慢用例的项目在慢层仍退出 0', () => {
    const quickOnly = project({ 'only.spec.ts': [RAN, "test('快', () => ran('快'))"].join('\n') })
    const result = vitestWith(quickOnly, ['--mode', 'slow', '--coverage.reportsDirectory', 'cov'])
    expect(result.status, result.output).toBe(0)
    expect(result.ran).toEqual([])
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
          // 两段路径都加双引号：成员脚本经 shell 运行，Windows 路径里的反斜杠在引号里原样保留。
          scripts: { test: `${JSON.stringify(process.execPath)} ${JSON.stringify(VITEST)} run` },
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
    'packages:\n  - packages/*/*\n  - apps/*\n  - tools/*\n  - packages.0.0.1.legacy/core/*\n',
  )
  // 计划经 turbo 选成员，turbo 要读被检查仓库根的 package.json 与 packageManager。
  writeFileSync(
    join(subject, 'package.json'),
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  // 影响面规则点名的成员都要在，否则计划报错；外加一个退役目录里的成员。
  for (const path of [
    'packages/common/legal-identity',
    'packages/agent/agent',
    'packages/agent/agent-cordis-contract',
    'packages/common/message',
    'packages/model/pi-ai-transport',
    'apps/m2-contract-skeleton',
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
