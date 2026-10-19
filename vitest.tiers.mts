// 测试分层的唯一定义：慢层标签与它的时限，以及把 vitest 的 mode 翻成过滤条件。
// 每个成员的 vitest 配置写成 `defineConfig(({ mode }) => …)`，在 `test` 里先展开 `testTiers(mode)`，
// 成员自己的设置写在它后面；`typecheck` 里同样先展开 `testTiers(mode).typecheck`。`exclude`、`reporters`、`outputFile`
// 与 `env` 归这里，成员不要覆盖：覆盖了就会跑归档目录里的测试、丢报告，或把报告目录漏给测试起的子进程。
// 成员脚本 `test:fast` 是 `vitest run --mode fast`，`test:slow` 是 `vitest run --mode slow --typecheck.enabled=false`，
// `test` 不给 mode，两层都跑。
// 层只经 mode 传递，不读环境变量：turbo 的 Strict Mode 会滤掉未声明的变量，外面环境里的残留也不会漏进来。
// 归慢层：整个测试文件在开头的注释里写 `@module-tag slow`，单条用例写 `{ tags: ['slow'] }`，
// 并写一句为什么慢（起子进程、真实等待、重 CPU、网络）。怎么划、谁来跑见 docs/verification.md「测试分层」。
import { join, relative, resolve } from 'node:path'
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

/** 成员在报告目录里的文件名前缀：成员相对仓库根的路径，`/` 换成 `__`。 */
export function reportSlug(memberDirectory: string): string {
  return relative(REPOSITORY_ROOT, resolve(memberDirectory))
    .replaceAll('\\', '/')
    .replaceAll('/', '__')
}

/** 设了报告目录时挂上的报告器、报告路径与测试进程的环境。 */
interface Reporting {
  readonly reporters?: (string | [string, { outputFile: string }])[]
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
): TestTiers {
  if (mode !== DEFAULT_MODE && !(TEST_TIERS as readonly string[]).includes(mode))
    throw new Error(`vitest 的 mode 只能是 ${TEST_TIERS.join('、')} 或不给，现在是 ${mode}`)
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
    ...reporting(env[TEST_REPORT_DIR_ENV], memberDirectory),
    ...(mode === DEFAULT_MODE
      ? {}
      : {
          tagsFilter: [mode === 'fast' ? '!slow' : 'slow'],
          // 一层里可能一个测试都不剩（成员没有慢测试，或全是慢测试）：那不是失败。
          passWithNoTests: true,
          // 整个文件都被滤掉时不导入它；要求标签与用例名是字面量，静态看不出的文件照常导入、照常过滤。
          experimental: { preParse: true },
        }),
  }
}
