// Stryker 的 buildCommand，在 sandbox（当前目录）里执行：先把成员的 node_modules 软链进来，
// 再写一份 vitest 配置：展开成员自己的那份并固定 mode 为 fast（只跑快层），放宽默认用例时限，关掉 preParse，
// 成员有 `build` 脚本就构建一遍（不少测试跑的是成员自己的 dist），最后用这份配置在 sandbox 里跑一遍快层。
// 关 preParse：Stryker 逐个变异体按用例名过滤，preParse 只认字面量用例名，`it.each` 等生成名字的用例所在文件会被
// 整份滤掉，快层的 passWithNoTests 又让这次运行算成功，变异体就被记成存活（#405）。层照旧由 tagsFilter 在运行时分。
// 跑一遍快层（预检）：测试文件在 sandbox 里加载失败（比如相对路径出了成员、在副本里指到不存在的目录）时，
// Stryker 的 vitest runner 只看用例与 vitest 的全局错误、不看文件级结果，初跑照样算成功，只由那份文件守着的
// 变异体全被记成存活（#481）。vitest 自己的退出码算上了文件级失败；没跑通或超时就写标记、退出非零，Stryker 不开始变异。
// 快层没有用例时 passWithNoTests 让它退出 0，不当成加载失败。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MEMBER_DIR_ENV,
  PREFLIGHT_FAILED_ENV,
  PREFLIGHT_TIMEOUT_MS,
  SANDBOX_VITEST_CONFIG,
  TEST_TIMEOUT_ENV,
} from './stryker.ts'

const member = process.env[MEMBER_DIR_ENV]
if (member === undefined || member === '') throw new Error(`环境变量 ${MEMBER_DIR_ENV} 没设`)
const preflightMark = process.env[PREFLIGHT_FAILED_ENV]
if (preflightMark === undefined || preflightMark === '')
  throw new Error(`环境变量 ${PREFLIGHT_FAILED_ENV} 没设`)
const timeout = process.env[TEST_TIMEOUT_ENV]
if (timeout === undefined || !/^[1-9]\d*$/u.test(timeout))
  throw new Error(`环境变量 ${TEST_TIMEOUT_ENV} 须为正整数毫秒，现在是 ${timeout}`)
if (!existsSync('node_modules')) symlinkSync(join(member, 'node_modules'), 'node_modules', 'dir')
writeFileSync(
  SANDBOX_VITEST_CONFIG,
  [
    "import { defineConfig, mergeConfig } from 'vitest/config'",
    "import member from './vitest.config.ts'",
    `import CollectionReporter from ${JSON.stringify(fileURLToPath(new URL('./collection-reporter.ts', import.meta.url)))}`,
    'export default defineConfig(env => {',
    // 成员配置不是按 mode 的函数时选不了层，报错，不悄悄两层都跑。
    "  if (typeof member !== 'function') throw new Error('vitest.config.ts 须写成 defineConfig(({ mode }) => …)，否则选不了快层')",
    "  const own = member({ ...env, mode: 'fast' })",
    `  return mergeConfig(own, { test: { reporters: [...(own.test?.reporters ? [] : ['default']), new CollectionReporter()], testTimeout: ${timeout}, experimental: { preParse: false } } })`,
    '})',
    '',
  ].join('\n'),
)
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, unknown>
}
if (typeof manifest.scripts?.['build'] === 'string') {
  const built = spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit' })
  if (built.status !== 0) process.exit(built.status ?? 1)
}
// 直接用 node 起 vitest：pnpm 的 .bin shim 含相对路径，随 node_modules 软链进 sandbox 后不一定还对。
// 池、并行与覆盖按 Stryker 的 vitest runner 起初跑时的选项给：同一份文件在 forks 里能加载、在 worker_threads 里
// 不能（比如顶层 process.chdir）时，用默认的 forks 预检会放过它。时限取 Stryker 初跑的缺省时限。
const checked = spawnSync(
  process.execPath,
  [
    join('node_modules', 'vitest', 'vitest.mjs'),
    'run',
    '--config',
    SANDBOX_VITEST_CONFIG,
    '--pool',
    'threads',
    '--maxWorkers',
    '1',
    '--maxConcurrency',
    '1',
    '--coverage.enabled',
    'false',
  ],
  { stdio: 'inherit', timeout: PREFLIGHT_TIMEOUT_MS },
)
// 起不来或被信号打断（含用户中断）不是测试的结论：不写标记，按构建失败退出，由入口记为 Stryker 出错。
if (checked.error !== undefined && (checked.error as NodeJS.ErrnoException).code !== 'ETIMEDOUT') {
  console.error(`sandbox 预检：vitest 没起来：${checked.error.message}`)
  process.exit(1)
}
const timedOut = checked.error !== undefined
if (!timedOut && checked.signal !== null) {
  console.error(`sandbox 预检：vitest 被信号 ${checked.signal} 打断`)
  process.exit(1)
}
if (timedOut || checked.status !== 0) {
  writeFileSync(preflightMark, '')
  console.error(
    timedOut
      ? `sandbox 预检：快层测试在 sandbox 里 ${PREFLIGHT_TIMEOUT_MS / 60_000} 分钟没跑完，不做变异`
      : `sandbox 预检：快层测试在 sandbox 里没跑通（vitest 退出码 ${checked.status}），不做变异`,
  )
  process.exit(1)
}
