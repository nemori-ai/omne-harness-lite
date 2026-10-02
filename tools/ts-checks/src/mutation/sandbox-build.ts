// Stryker 的 buildCommand，在 sandbox（当前目录）里执行：先把成员的 node_modules 软链进来，
// 成员有 `build` 脚本就构建一遍（不少测试跑的是成员自己的 dist），没有就到此为止。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { MEMBER_DIR_ENV } from './stryker.ts'

const member = process.env[MEMBER_DIR_ENV]
if (member === undefined || member === '') throw new Error(`环境变量 ${MEMBER_DIR_ENV} 没设`)
if (!existsSync('node_modules')) symlinkSync(join(member, 'node_modules'), 'node_modules', 'dir')
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, unknown>
}
if (typeof manifest.scripts?.['build'] === 'string') {
  const built = spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit' })
  process.exit(built.status ?? 1)
}
