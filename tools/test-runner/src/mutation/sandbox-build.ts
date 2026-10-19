// Stryker 的 buildCommand，在 sandbox（当前目录）里执行：先把成员的 node_modules 软链进来，
// 再写一份 vitest 配置：展开成员自己的那份并固定 mode 为 fast（只跑快层），放宽默认用例时限，关掉 preParse，
// 成员有 `build` 脚本就构建一遍（不少测试跑的是成员自己的 dist），没有就到此为止。
// 关 preParse：Stryker 逐个变异体按用例名过滤，preParse 只认字面量用例名，`it.each` 等生成名字的用例所在文件会被
// 整份滤掉，快层的 passWithNoTests 又让这次运行算成功，变异体就被记成存活（#405）。层照旧由 tagsFilter 在运行时分。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEMBER_DIR_ENV, SANDBOX_VITEST_CONFIG, TEST_TIMEOUT_ENV } from './stryker.ts'

const member = process.env[MEMBER_DIR_ENV]
if (member === undefined || member === '') throw new Error(`环境变量 ${MEMBER_DIR_ENV} 没设`)
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
  process.exit(built.status ?? 1)
}
