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
 * vitest 4.1.11 命令行里带值的选项（`<值>` 与 `[值]` 两种），不带点的那些，名字按驼峰写；核对自它的 `createCLI`。
 * 带点的选项（`--coverage.include x`）一律按带值算。
 */
const VALUED_OPTIONS = new Set([
  '-r',
  '-c',
  '-u',
  '-t',
  'root',
  'config',
  'update',
  'testNamePattern',
  'dir',
  'api',
  'silent',
  'reporter',
  'outputFile',
  'mode',
  'browser',
  'pool',
  'execArgv',
  'vmMemoryLimit',
  'maxWorkers',
  'environment',
  'shard',
  'changed',
  'sequence',
  'inspect',
  'inspectBrk',
  'testTimeout',
  'hookTimeout',
  'bail',
  'retry',
  'diff',
  'exclude',
  'project',
  'slowTestThreshold',
  'teardownTimeout',
  'maxConcurrency',
  'attachmentsDir',
  'configLoader',
  'mergeReports',
  'listTags',
  'tagsFilter',
  'experimental',
])
const TEST_NAME_OPTIONS = new Set(['-t', 'testNamePattern'])

/** 选项名：长选项去掉 `--` 并把短横线写法换成驼峰（`--max-workers` → `maxWorkers`），短选项原样。 */
function optionName(flag: string): string {
  if (!flag.startsWith('--')) return flag
  return flag.slice(2).replaceAll(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())
}

/**
 * 交给 vitest 解析的词：只认 vitest 自己的入口（`vitest.mjs`），Stryker 等经 API 起 vitest 时命令行不是 vitest 的，
 * 按没有词算；去掉子命令，`--` 之后的不算。
 */
function vitestWords(argv: readonly string[]): readonly string[] {
  const entry = argv[1]
  if (entry === undefined || basename(entry) !== 'vitest.mjs') return []
  const rest = argv.slice(2)
  const words = rest[0] !== undefined && SUBCOMMANDS.has(rest[0]) ? rest.slice(1) : rest
  const end = words.indexOf('--')
  return end === -1 ? words : words.slice(0, end)
}

interface Option {
  readonly name: string
  readonly value: string | undefined
  /** 值是不是取自下一个词。 */
  readonly consumed: boolean
}

/**
 * 读一个选项与它的值：`--x=值`；带值的选项吞下后面的一个词；布尔选项与 vitest 一样只吞 `true`、`false`。
 * 其余后面的词留给调用方当文件过滤：认错了只会多判成有过滤，不会把没选中的运行放过去。
 */
function readOption(word: string, next: string | undefined): Option {
  const equals = word.indexOf('=')
  if (equals !== -1)
    return {
      name: optionName(word.slice(0, equals)),
      value: word.slice(equals + 1),
      consumed: false,
    }
  const name = optionName(word)
  const consumes =
    next !== undefined &&
    !next.startsWith('-') &&
    (name.includes('.') || VALUED_OPTIONS.has(name) || next === 'true' || next === 'false')
  return { name, value: consumes ? next : undefined, consumed: consumes }
}

/**
 * 从启动 vitest 的命令行读出过滤（vitest 的配置函数拿不到它们）：`-t` 的值是用例名过滤，
 * 不是选项、也不是选项的值的词是文件过滤。带点的布尔选项用空格接文件过滤（`--typecheck.enabled tests/x`）时，
 * 文件过滤会被当成它的值而认不出；写成 `--typecheck.enabled=true` 就认得出。
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
    if (TEST_NAME_OPTIONS.has(option.name) && option.value !== undefined)
      testNames.push(option.value)
  }
  return { testNames, files }
}

/** 成员在报告目录里的文件名前缀：成员相对仓库根的路径，`/` 换成 `__`。 */
export function reportSlug(memberDirectory: string): string {
  return relative(REPOSITORY_ROOT, resolve(memberDirectory))
    .replaceAll('\\', '/')
    .replaceAll('/', '__')
}

/** 设了报告目录时挂上的报告器、报告路径与测试进程的环境。 */
/** 挂报告器时给的选项：计时报告器要输出路径，过滤守卫要过滤条件。 */
type ReporterEntry =
  | string
  | [string, { outputFile: string }]
  | [string, { testNames: string[]; files: string[] }]

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
