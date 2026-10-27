// 测试分层的唯一定义：慢层标签与它的时限，以及把 vitest 的 mode 翻成过滤条件。
// 每个成员的 vitest 配置写成 `defineConfig(({ mode }) => …)`，在 `test` 里先展开 `testTiers(mode)`，
// 成员自己的设置写在它后面；`typecheck` 里同样先展开 `testTiers(mode).typecheck`。`exclude`、`reporters`、`outputFile`
// 与 `env` 归这里，成员不要覆盖：覆盖了就会跑归档目录里的测试、丢报告，或把报告目录漏给测试起的子进程。
// 成员脚本 `test:fast` 是 `vitest run --mode fast`，`test:slow` 是 `vitest run --mode slow --typecheck.enabled=false`，
// `test` 不给 mode，两层都跑。
// 层只经 mode 传递，不读环境变量：turbo 的 Strict Mode 会滤掉未声明的变量，外面环境里的残留也不会漏进来。
// 命令行带了过滤（`-t` 用例名或文件）时，这一次运行要么选中用例，要么非零退出（#737），见 `cliFilters`。
// 归慢层：整个测试文件在开头的注释里写 `@module-tag slow`，单条用例写 `{ tags: ['slow'] }`，
// 并写一句为什么慢（起子进程、真实等待、重 CPU、网络）。怎么划、谁来跑见 docs/verification.md「测试分层」。
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEST_TIERS = ['fast', 'slow'] as const
export type TestTier = (typeof TEST_TIERS)[number]

/** 不给 `--mode` 时 vitest 用的 mode：两层都跑。 */
const DEFAULT_MODE = 'test'

/**
 * 慢层用例的时限（毫秒）。它盖过成员配置的 `testTimeout`；用例自己写的时限（选项里的 `timeout`
 * 或 `test(名字, 函数, 毫秒)`）又盖过它。快层用 vitest 的默认时限。负责人 2026-10-02 定的初值。
 */
export const SLOW_TEST_TIMEOUT_MS = 120_000

/** 嵌套归档目录：名字以 `.legacy` 结尾的目录里的测试既不运行，也不做类型测试。 */
export const ARCHIVE_EXCLUDE = '**/*.legacy/**'

/**
 * vitest 的 `configDefaults.exclude`，也是它类型测试的缺省 exclude。成员一写 exclude 就盖掉缺省值，所以连同它一起写。
 * 仓库根不依赖 vitest，这里不导入它；test-runner 的测试核对两者一致。
 */
export const VITEST_DEFAULT_EXCLUDE = ['**/node_modules/**', '**/.git/**'] as const

/**
 * 运行器设了它时，每个成员的 vitest 在这个目录里写 `<成员路径，/ 换成 __>.json`（JSON 报告）与
 * `.timing.json`（计时报告），供账本与失败归因读取。只改报告的落点，不改测试结果。
 */
export const TEST_REPORT_DIR_ENV = 'OMNE_TEST_REPORT_DIR'

const REPOSITORY_ROOT = fileURLToPath(new URL('.', import.meta.url))
const TIMING_REPORTER = join(REPOSITORY_ROOT, 'tools/test-runner/src/testing/timing-reporter.ts')
const FILTER_GUARD = join(REPOSITORY_ROOT, 'tools/test-runner/src/testing/filter-guard.ts')

/** vitest 命令行上的过滤：`-t`（`--testNamePattern`）给的用例名，与位置参数给的文件过滤。 */
export interface CliFilters {
  readonly testNames: readonly string[]
  readonly files: readonly string[]
}

const SUBCOMMANDS = new Set(['run', 'watch', 'dev', 'related', 'bench', 'list'])

/**
 * vitest 命令行里的布尔选项：短选项写成 `-w`，长选项写名字，带点的照写（`sequence.shuffle`）。
 * 来源：vitest 4.1.11 的 `createCLI().globalCommand.options` 里 `isBoolean` 为真的那些，取各自的 `names`；
 * 仓库根不依赖 vitest，这里不导入它，test-runner 的测试与安装的 vitest 对账。
 * 表外的选项（带值的、命令行没定义的配置键如 `--typecheck.include`）与 vitest 一样按带值算。
 * vitest 升级新增布尔选项而表没跟上时，它后面的文件过滤会被当成它的值而漏认；对账测试在升级时就失败，挡住这种情形。
 */
export const VITEST_BOOLEAN_OPTIONS = [
  '-v',
  'version',
  '-w',
  'watch',
  'ui',
  'open',
  'hideSkippedTests',
  'coverage',
  'isolate',
  'globals',
  'dom',
  'fileParallelism',
  'passWithNoTests',
  'logHeapUsage',
  'detectAsyncLeaks',
  'allowOnly',
  'dangerouslyIgnoreUnhandledErrors',
  'expandSnapshotDiff',
  'disableConsoleIntercept',
  'typecheck',
  'cache',
  'expect',
  'printConsoleTrace',
  'includeTaskLocation',
  'run',
  'color',
  'clearScreen',
  'standalone',
  'clearCache',
  'strictTags',
  '-h',
  'help',
  'api.strictPort',
  'api.allowExec',
  'api.allowWrite',
  'coverage.enabled',
  'coverage.clean',
  'coverage.cleanOnRerun',
  'coverage.reportOnFailure',
  'coverage.allowExternal',
  'coverage.skipFull',
  'coverage.thresholds.100',
  'coverage.thresholds.perFile',
  'coverage.excludeAfterRemap',
  'browser.enabled',
  'browser.headless',
  'browser.api.strictPort',
  'browser.api.allowExec',
  'browser.api.allowWrite',
  'browser.isolate',
  'browser.ui',
  'browser.fileParallelism',
  'browser.trackUnhandledErrors',
  'browser.locators.exact',
  'sequence.shuffle',
  'sequence.shuffle.files',
  'sequence.shuffle.tests',
  'sequence.concurrent',
  'diff.expand',
  'diff.includeChangeCounts',
  'diff.omitAnnotationLines',
  'diff.printBasicPrototype',
  'typecheck.enabled',
  'typecheck.only',
  'typecheck.allowJs',
  'typecheck.ignoreSourceErrors',
  'expect.requireAssertions',
  'expect.poll',
  'experimental.fsModuleCache',
  'experimental.importDurations',
  'experimental.importDurations.failOnDanger',
  'experimental.importDurations.thresholds',
  'experimental.viteModuleRunner',
  'experimental.nodeLoader',
  'experimental.preParse',
] as const
const BOOLEAN_OPTIONS: ReadonlySet<string> = new Set(VITEST_BOOLEAN_OPTIONS)

/** 用例名过滤的选项；长选项按 vitest 的写法先把短横线换成驼峰（`--test-name-pattern` 也是它）。 */
const TEST_NAME_OPTIONS = new Set(['-t', 'testNamePattern'])

/**
 * 交给 vitest 解析的词：只认 vitest 自己的入口（`vitest.mjs`），Stryker 等经 API 起 vitest 时命令行不是 vitest 的，
 * 按没有词算；`--` 之后的不算。
 */
function vitestWords(argv: readonly string[]): readonly string[] {
  const entry = argv[1]
  if (entry === undefined || basename(entry) !== 'vitest.mjs') return []
  const words = argv.slice(2)
  const end = words.indexOf('--')
  return end === -1 ? words : words.slice(0, end)
}

/** 一个选项词读出的结果：它给出的值落在哪里。 */
interface Option {
  /** 取值的键：长选项是名字原样（vitest 用的 mri 按原样查布尔，不转驼峰）；短选项连写时取最后一个字母，写成 `-x`。 */
  readonly key: string
  /** `=` 后面或吞下的那个词；没有值时为 undefined。 */
  readonly value: string | undefined
  /** 值是不是取自下一个词。 */
  readonly consumed: boolean
}

/**
 * 照 vitest 用的 mri 读一个选项词：`--no-x` 不取值；`=` 后面非空时取它；否则后面一个不以 `-` 开头的词就是它的值，
 * 布尔选项也一样先吞下，值不是 `true`、`false` 时再由调用方当成文件过滤。
 */
function readOption(word: string, next: string | undefined): Option {
  const dashes = word.length - word.replace(/^-+/u, '').length
  const equals = word.indexOf('=', dashes + 1)
  const name = word.slice(dashes, equals === -1 ? undefined : equals)
  const key = dashes === 2 ? name : `-${name.slice(-1)}`
  const inline = equals === -1 ? '' : word.slice(equals + 1)
  if (/^-+no-/u.test(word)) return { key, value: undefined, consumed: false }
  if (inline !== '') return { key, value: inline, consumed: false }
  const consumed = next !== undefined && !next.startsWith('-')
  return { key, value: consumed ? next : undefined, consumed }
}

/** 选项的值算什么：布尔选项的值不是 `true`、`false` 时是文件过滤；用例名选项的值是用例名过滤。 */
function filterOf(option: Option): { readonly file?: string; readonly testName?: string } {
  const { key, value } = option
  if (value === undefined) return {}
  if (BOOLEAN_OPTIONS.has(key)) return value === 'true' || value === 'false' ? {} : { file: value }
  const name = key.replaceAll(
    /([a-z])-([a-z])/gu,
    (_, before: string, after: string) => before + after.toUpperCase(),
  )
  return TEST_NAME_OPTIONS.has(name) ? { testName: value } : {}
}

/**
 * 从启动 vitest 的命令行读出过滤（vitest 的配置函数拿不到它们），读法与 vitest 自己的命令行解析一致：
 * `-t` 的值是用例名过滤；不是选项、也不是带值选项的值的词是文件过滤，第一个这样的词是子命令时去掉它。
 * 只有 `VITEST_BOOLEAN_OPTIONS` 里的选项不把后面的词当值，其余选项都吞下后面一个词。
 */
export function cliFilters(argv: readonly string[]): CliFilters {
  const words = vitestWords(argv)
  const testNames: string[] = []
  const files: string[] = []
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? ''
    if (!word.startsWith('-')) {
      files.push(word)
      continue
    }
    const option = readOption(word, words[index + 1])
    if (option.consumed) index += 1
    const { file, testName } = filterOf(option)
    if (file !== undefined) files.push(file)
    if (testName !== undefined) testNames.push(testName)
  }
  const [first, ...rest] = files
  return { testNames, files: first !== undefined && SUBCOMMANDS.has(first) ? rest : files }
}

/** 成员在报告目录里的文件名前缀：成员相对仓库根的路径，`/` 换成 `__`。 */
export function reportSlug(memberDirectory: string): string {
  return relative(REPOSITORY_ROOT, resolve(memberDirectory))
    .replaceAll('\\', '/')
    .replaceAll('/', '__')
}

/** 挂报告器时给的选项：计时报告器要输出路径，过滤守卫要过滤条件。 */
type ReporterEntry =
  | string
  | [string, { outputFile: string }]
  | [string, { testNames: string[]; files: string[] }]

/** 设了报告目录时挂上的报告器、报告路径与测试进程的环境。 */
interface Reporting {
  readonly reporters?: ReporterEntry[]
  readonly outputFile?: { readonly json: string }
  readonly env?: Readonly<Record<string, string>>
}

/** 成员配置在 `test` 里展开的部分；根目录不依赖 vitest，这里只写结构（数组不标 readonly，vitest 的配置类型要可变数组）。 */
export interface TestTiers extends Reporting {
  readonly tags: {
    readonly name: string
    readonly description: string
    readonly timeout: number
  }[]
  readonly exclude: string[]
  readonly typecheck: { readonly exclude: string[] }
  readonly tagsFilter?: string[]
  readonly passWithNoTests?: boolean
  readonly experimental?: { readonly preParse: boolean }
}

/**
 * 有过滤时挂上过滤守卫：过滤后一条用例都没有跑时让这次运行失败，并说明过滤条件。
 * 只在有过滤时挂：设了 `reporters` 就不再由 vitest 自己挑缺省报告器，所以这时显式带上 `default`。
 * 命令行给了 `--reporter` 时 vitest 用它替换配置里的全部报告器，守卫随之不在；
 * 这时有过滤、文件全被滤掉的情形仍由 `passWithNoTests: false` 判失败，用例全被跳过的情形不再判失败。
 * test-runner 自己起的 vitest（`run.ts` 的逐成员运行、`triage.ts` 的单独重跑）每次都传 `--reporter`，守卫不在场；
 * 这些路径读 JSON 报告归类，没选中的记为没跑到。
 */
function guarded(base: Reporting, filters: CliFilters): Reporting {
  if (filters.testNames.length === 0 && filters.files.length === 0) return base
  return {
    ...base,
    reporters: [
      ...(base.reporters ?? ['default']),
      [FILTER_GUARD, { testNames: [...filters.testNames], files: [...filters.files] }],
    ],
  }
}

function reporting(reportDirectory: string | undefined, memberDirectory: string): Reporting {
  if (reportDirectory === undefined || reportDirectory === '') return {}
  const prefix = join(reportDirectory, reportSlug(memberDirectory))
  return {
    reporters: ['default', 'json', [TIMING_REPORTER, { outputFile: `${prefix}.timing.json` }]],
    outputFile: { json: `${prefix}.json` },
    // 报告目录只给这一轮的 vitest：测试进程及其子进程里置空，测试起的夹具 vitest 不往这里写报告。
    env: { [TEST_REPORT_DIR_ENV]: '' },
  }
}

export function testTiers(
  mode: string = DEFAULT_MODE,
  env: Readonly<Record<string, string | undefined>> = process.env,
  memberDirectory: string = process.cwd(),
  argv: readonly string[] = process.argv,
): TestTiers {
  if (mode !== DEFAULT_MODE && !(TEST_TIERS as readonly string[]).includes(mode))
    throw new Error(`vitest 的 mode 只能是 ${TEST_TIERS.join('、')} 或不给，现在是 ${mode}`)
  const filters = cliFilters(argv)
  const filtered = filters.testNames.length > 0 || filters.files.length > 0
  return {
    tags: [
      {
        name: 'slow',
        description: '慢层：起子进程、真实等待、重 CPU 或网络，耗时超出快层预算',
        timeout: SLOW_TEST_TIMEOUT_MS,
      },
    ],
    exclude: [...VITEST_DEFAULT_EXCLUDE, ARCHIVE_EXCLUDE],
    typecheck: { exclude: [...VITEST_DEFAULT_EXCLUDE, ARCHIVE_EXCLUDE] },
    ...guarded(reporting(env[TEST_REPORT_DIR_ENV], memberDirectory), filters),
    ...(mode === DEFAULT_MODE
      ? {}
      : {
          tagsFilter: [mode === 'fast' ? '!slow' : 'slow'],
          // 不带过滤时，一层里可能一个测试都不剩（成员没有慢测试，或全是慢测试）：那不是失败。
          // 带了过滤还一个文件都不剩，是过滤没选中：判失败。
          passWithNoTests: !filtered,
          // 整个文件都被滤掉时不导入它。它静态地读标签与用例名：标签要写成字面量；按用例名过滤时，
          // `test.each` 生成的名字与变量给的名字它匹配不到，会把整个文件滤掉（#737），所以带 `-t` 时关掉。
          experimental: { preParse: filters.testNames.length === 0 },
        }),
  }
}
