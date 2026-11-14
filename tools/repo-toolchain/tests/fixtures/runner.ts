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
  write(root, 'stub.ts', 'export {}\n')
  write(root, 'tsconfig.base.json', JSON.stringify({ files: ['stub.ts'] }))
  write(root, TOOLCHAIN_CONFIG, readFileSync(join(REPOSITORY_ROOT, TOOLCHAIN_CONFIG), 'utf8'))
  return root
}
