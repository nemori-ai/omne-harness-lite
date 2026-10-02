// 对一个成员调用 Stryker：成员目录为工作目录，vitest runner，只跑快层；sandbox 放在与成员同深度的被忽略目录，跑完删掉。
// 同深度是因为不少测试用 `import.meta.dirname` 拼相对路径读成员外的文件（规格、根配置），sandbox 换了深度就读不到。
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEST_TIER_ENV } from '../testing/config.ts'
import { slugOf, spawnLogged, type SpawnResult } from '../testing/run.ts'
import { mutateEntries, type MutationTarget } from './scope.ts'

/** sandbox 里的构建脚本从这个环境变量拿到成员的原目录。 */
export const MEMBER_DIR_ENV = 'OMNE_MUTATION_MEMBER_DIR'

const require = createRequire(import.meta.url)
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
  readonly nonce: string
}

export function strykerConfig(target: MutationTarget, run: StrykerRun): Record<string, unknown> {
  const paths = strykerPaths()
  const slug = slugOf(target.member.path)
  return {
    testRunner: 'vitest',
    plugins: [paths.vitestRunner],
    vitest: { configFile: 'vitest.config.ts' },
    mutate: mutateEntries(target),
    // 成员的 node_modules 要先软链进 sandbox，构建才找得到依赖；所以不让 Stryker 自己链。
    // buildCommand 不经 shell：按空格切开、引号原样保留，路径里的空格只能用反斜杠转义。
    buildCommand: `node --experimental-strip-types ${SANDBOX_BUILD.replaceAll(' ', '\\ ')}`,
    symlinkNodeModules: false,
    tempDirName: sandboxContainer(run.root, target.member.path, run.nonce),
    cleanTempDir: true,
    incremental: false,
    concurrency: run.concurrency,
    reporters: ['json', 'progress-append-only'],
    jsonReporter: { fileName: join(run.runDir, `${slug}.mutation.json`) },
    thresholds: { high: 80, low: 60, break: null },
  }
}

export interface StrykerResult extends SpawnResult {
  readonly reportPath: string
  readonly logPath: string
}

export async function runStryker(target: MutationTarget, run: StrykerRun): Promise<StrykerResult> {
  const slug = slugOf(target.member.path)
  const config = strykerConfig(target, run)
  const configPath = join(run.runDir, `${slug}.stryker.json`)
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  const memberDir = join(run.root, target.member.path)
  const logPath = join(run.runDir, `${slug}.log`)
  const result = await spawnLogged(process.execPath, [strykerPaths().bin, 'run', configPath], {
    cwd: memberDir,
    // 日志落文件，不要终端颜色码。
    env: { ...process.env, [TEST_TIER_ENV]: 'fast', [MEMBER_DIR_ENV]: memberDir, FORCE_COLOR: '0' },
    logPath,
  })
  // Stryker 清掉 sandbox 后留下空的容器目录；被杀时连 sandbox 一起留下。两种都不留。
  const container = config['tempDirName'] as string
  if (existsSync(container)) rmSync(container, { recursive: true, force: true })
  return { ...result, reportPath: join(run.runDir, `${slug}.mutation.json`), logPath }
}
