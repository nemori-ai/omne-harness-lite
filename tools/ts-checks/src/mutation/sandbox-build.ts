// Stryker 的 buildCommand，在 sandbox（当前目录）里执行：先把成员的 node_modules 软链进来，
// 再写一份只放宽默认用例时限的 vitest 配置（展开成员自己的那份），
// 成员有 `build` 脚本就构建一遍（不少测试跑的是成员自己的 dist），没有就到此为止。
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
    "import { mergeConfig } from 'vitest/config'",
    "import member from './vitest.config.ts'",
    `export default mergeConfig(member, { test: { testTimeout: ${timeout} } })`,
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
