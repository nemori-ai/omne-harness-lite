// Stryker 的 buildCommand，在 sandbox（当前目录）里执行：先把成员的 node_modules 软链进来，
// 再写一份 vitest 配置：展开成员自己的那份并固定 mode 为 fast（只跑快层），放宽默认用例时限，关掉 preParse，
// 成员有 `build` 脚本就构建一遍（不少测试跑的是成员自己的 dist），最后用这份配置在 sandbox 里跑一遍快层。
// 关 preParse：Stryker 逐个变异体按用例名过滤，preParse 只认字面量用例名，`it.each` 等生成名字的用例所在文件会被
// 整份滤掉，快层的 passWithNoTests 又让这次运行算成功，变异体就被记成存活（#405）。层照旧由 tagsFilter 在运行时分。
// 跑一遍快层（预检）：测试文件在 sandbox 里加载失败（比如相对路径出了成员、在副本里指到不存在的目录）时，
// Stryker 的 vitest runner 只看用例与 vitest 的全局错误、不看文件级结果，初跑照样算成功，剩下的用例守不住的
// 变异体全被记成存活（#481）。vitest 自己的退出码算上了文件级失败；没跑通就写标记、退出非零，Stryker 不开始变异。
// 快层没有用例时 passWithNoTests 让它退出 0，不当成加载失败。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MEMBER_DIR_ENV,
  PREFLIGHT_FAILED_ENV,
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
    'export default defineConfig(env => {',
    // 成员配置不是按 mode 的函数时选不了层，报错，不悄悄两层都跑。
    "  if (typeof member !== 'function') throw new Error('vitest.config.ts 须写成 defineConfig(({ mode }) => …)，否则选不了快层')",
    "  const own = member({ ...env, mode: 'fast' })",
    `  return mergeConfig(own, { test: { testTimeout: ${timeout}, experimental: { preParse: false } } })`,
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
const checked = spawnSync(
  process.execPath,
  [join('node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', SANDBOX_VITEST_CONFIG],
  { stdio: 'inherit' },
)
if (checked.status !== 0) {
  writeFileSync(preflightMark, '')
  console.error(
    `sandbox 预检：快层测试在 sandbox 里没跑通（vitest 退出码 ${checked.status ?? checked.signal}），不做变异`,
  )
  process.exit(1)
}
