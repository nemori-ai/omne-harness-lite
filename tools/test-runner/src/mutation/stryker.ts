// 对一个成员调用 Stryker：成员目录为工作目录，vitest runner，只跑快层；sandbox 放在与成员同深度的被忽略目录，跑完删掉。
// 同深度是因为不少测试用 `import.meta.dirname` 拼相对路径读成员外的文件（规格、根配置），sandbox 换了深度就读不到。
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slugOf, spawnLogged, type SpawnResult } from '../testing/run.ts'
import { RUN_LOG_ENV } from './run-reporter.ts'
import { mutateEntries, type MutationTarget } from './scope.ts'

/** sandbox 里的构建脚本从这个环境变量拿到成员的原目录。 */
export const MEMBER_DIR_ENV = 'OMNE_MUTATION_MEMBER_DIR'
/** 构建脚本把它写进 sandbox 的那份 vitest 配置，作为没写自己时限的用例的时限（毫秒）。 */
export const TEST_TIMEOUT_ENV = 'OMNE_MUTATION_TEST_TIMEOUT_MS'
/**
 * 构建脚本在 sandbox 里写的 vitest 配置：展开成员自己的配置，放宽默认用例时限，关掉 preParse（#405）。
 * 只在副本里，成员的配置不动。
 */
export const SANDBOX_VITEST_CONFIG = 'vitest.stryker-sandbox.config.mts'
/** 构建脚本在 sandbox 里跑快层没跑通时，在这个环境变量给的路径写一个标记文件（#481）。 */
export const PREFLIGHT_FAILED_ENV = 'OMNE_MUTATION_PREFLIGHT_FAILED'
/** 预检的时限，取 Stryker 初跑的缺省时限（dryRunTimeoutMinutes 为 5）。 */
export const PREFLIGHT_TIMEOUT_MS = 5 * 60_000

const require = createRequire(import.meta.url)
const GUARDED_VITEST = fileURLToPath(new URL('./guarded-vitest.ts', import.meta.url))
const SANDBOX_BUILD = fileURLToPath(new URL('./sandbox-build.ts', import.meta.url))

function packageDir(name: string): string {
  return dirname(require.resolve(`${name}/package.json`))
}

/** Stryker 的入口与 vitest runner 插件，取 ts-checks 自己锁定的那一份。 */
export function strykerPaths(): { readonly bin: string; readonly vitestRunner: string } {
  return {
    bin: join(packageDir('@stryker-mutator/core'), 'bin', 'stryker.js'),
    vitestRunner: require.resolve('@stryker-mutator/vitest-runner'),
  }
}

/**
 * sandbox 的容器目录：Stryker 在它下面建 `sandbox-<随机>/` 放成员的副本，
 * 所以容器放在成员的上两级，副本就与成员同深度。名字以 `.stryker-tmp` 开头，被 `.gitignore` 忽略。
 */
export function sandboxContainer(root: string, member: string, nonce: string): string {
  return join(dirname(dirname(join(root, member))), `.stryker-tmp-${slugOf(member)}-${nonce}`)
}

export interface StrykerRun {
  readonly root: string
  readonly runDir: string
  /** Stryker 同时起几个工作进程（每个进程里 vitest 只用一个线程）。 */
  readonly concurrency: number
  /** 没写自己时限的用例在变异时的时限。 */
  readonly testTimeoutSeconds: number
  readonly nonce: string
  /**
   * 第一遍开 Stryker 的 incremental：`file` 是交给它读、它跑完又写回的 incremental 文件，`force` 时不复用、全部重跑。
   * 不给时与没有增量时一样（`incremental: false`）。复核不开增量。
   */
  readonly incremental?: { readonly file: string; readonly force: boolean }
}

/**
 * 复核（#649）：第一遍里只因时限到了而超时的变异体，单独再跑一遍。只变异这几处，一个工作进程，
 * 时限在 Stryker 自己的估算上再加 `timeoutMS`。第二遍的判定取代第一遍的超时。
 */
export interface Recheck {
  /** Stryker 的 mutate 条目，精确到行列，见 `exactEntry`。 */
  readonly mutate: readonly string[]
  /** Stryker 的 `timeoutMS`：加在「timeoutFactor × 净耗时 + 初跑额外开销」上的毫秒数。 */
  readonly timeoutMS: number
}

/** 一遍运行的文件名前缀：第一遍是成员的 slug，复核加 `.recheck`。 */
function passName(target: MutationTarget, recheck: Recheck | undefined): string {
  const slug = slugOf(target.member.path)
  return recheck === undefined ? slug : `${slug}.recheck`
}

export function strykerConfig(
  target: MutationTarget,
  run: StrykerRun,
  recheck?: Recheck,
): Record<string, unknown> {
  const name = passName(target, recheck)
  return {
    testRunner: 'omne-vitest',
    plugins: [GUARDED_VITEST],
    // 不按「直接导入了被变异文件」挑测试：不少成员的测试按自己的包名导入，走的是 sandbox 里重新构建的 dist，
    // vitest 认不出它们与 src 的关系，挑出来就漏了（只用包名导入的成员一条测试都不跑）。初跑跑全部快层，
    // 每个变异体该跑哪些测试仍由逐条覆盖决定。
    vitest: { configFile: SANDBOX_VITEST_CONFIG, related: false },
    mutate: recheck === undefined ? mutateEntries(target) : [...recheck.mutate],
    // 成员的 node_modules 要先软链进 sandbox，构建才找得到依赖；所以不让 Stryker 自己链。
    // buildCommand 不经 shell：按空格切开、引号原样保留，路径里的空格只能用反斜杠转义。
    buildCommand: `node --experimental-strip-types ${SANDBOX_BUILD.replaceAll(' ', '\\ ')}`,
    symlinkNodeModules: false,
    tempDirName: sandboxContainer(
      run.root,
      target.member.path,
      recheck === undefined ? run.nonce : `${run.nonce}-recheck`,
    ),
    cleanTempDir: true,
    ...(recheck === undefined && run.incremental !== undefined
      ? { incremental: true, incrementalFile: run.incremental.file, force: run.incremental.force }
      : { incremental: false }),
    concurrency: recheck === undefined ? run.concurrency : 1,
    ...(recheck === undefined ? {} : { timeoutMS: recheck.timeoutMS }),
    reporters: ['json', 'progress-append-only'],
    jsonReporter: { fileName: join(run.runDir, `${name}.mutation.json`) },
    thresholds: { high: 80, low: 60, break: null },
  }
}

export interface StrykerResult extends SpawnResult {
  readonly reportPath: string
  readonly logPath: string
  /** 每次 vitest 运行一行的记录（`RunRecord`），供核对类型测试。 */
  readonly runLogPath: string
  /** 构建脚本在 sandbox 里跑快层没跑通，Stryker 没有开始变异。 */
  readonly preflightFailed: boolean
}

export async function runStryker(
  target: MutationTarget,
  run: StrykerRun,
  recheck?: Recheck,
): Promise<StrykerResult> {
  const slug = passName(target, recheck)
  const reportPath = join(run.runDir, `${slug}.mutation.json`)
  if (existsSync(reportPath)) {
    const history = mkdtempSync(join(run.runDir, `${slug}.history-`))
    renameSync(reportPath, join(history, `${slug}.mutation.json`))
  }
  const config = strykerConfig(target, run, recheck)
  const configPath = join(run.runDir, `${slug}.stryker.json`)
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  const memberDir = join(run.root, target.member.path)
  const logPath = join(run.runDir, `${slug}.log`)
  const preflightMark = join(run.runDir, `${slug}.preflight-failed`)
  const runLogPath = join(run.runDir, `${slug}.runs.jsonl`)
  // `--out` 给的目录可能留着上一次的标记与运行记录。
  rmSync(preflightMark, { force: true })
  rmSync(runLogPath, { force: true })
  const result = await spawnLogged(process.execPath, [strykerPaths().bin, 'run', configPath], {
    cwd: memberDir,
    // 日志落文件，不要终端颜色码。
    env: {
      ...process.env,
      [MEMBER_DIR_ENV]: memberDir,
      [TEST_TIMEOUT_ENV]: String(Math.round(run.testTimeoutSeconds * 1000)),
      [PREFLIGHT_FAILED_ENV]: preflightMark,
      [RUN_LOG_ENV]: runLogPath,
      FORCE_COLOR: '0',
    },
    logPath,
  })
  // Stryker 清掉 sandbox 后留下空的容器目录；被杀时连 sandbox 一起留下。两种都不留。
  const container = config['tempDirName'] as string
  if (existsSync(container)) rmSync(container, { recursive: true, force: true })
  return {
    ...result,
    reportPath,
    logPath,
    runLogPath,
    preflightFailed: existsSync(preflightMark),
  }
}
