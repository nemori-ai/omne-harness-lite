// 可信 runner 的临时仓库：本仓库安装的依赖预设、最小解析配置与回路配置，没有 constraints.json。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { temporaryDirectory, write } from './loop-canary/repository.ts'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TOOLCHAIN_CONFIG = 'repo-toolchain.config.json'
const PRESET = `module.exports = require(${JSON.stringify(join(REPOSITORY_ROOT, 'node_modules/@omne-harness/repo-config/dependency-cruiser.cjs'))})\n`

export function runner(): string {
  const root = temporaryDirectory('omne-runner-')
  write(root, '.dependency-cruiser.cjs', PRESET)
  // TypeScript 不接受没有输入文件的配置，所以列一个空文件。
  write(root, 'stub.ts', 'export {}\n')
  write(root, 'tsconfig.base.json', JSON.stringify({ files: ['stub.ts'] }))
  write(root, TOOLCHAIN_CONFIG, readFileSync(join(REPOSITORY_ROOT, TOOLCHAIN_CONFIG), 'utf8'))
  return root
}
