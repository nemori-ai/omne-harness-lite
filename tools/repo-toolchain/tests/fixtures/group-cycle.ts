// 组环例外测试共用的临时仓库：runner（可信，带预设与可选的 constraints.json）与被检树（组 context ↔ 组 tool 成环）分开建。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repository, temporaryDirectory, write } from './loop-canary/repository.ts'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TOOLCHAIN_CONFIG = 'repo-toolchain.config.json'
export const CONSTRAINTS = 'docs/architecture/constraints.json'
const PRESET = `module.exports = require(${JSON.stringify(join(REPOSITORY_ROOT, 'node_modules/@omne-harness/repo-config/dependency-cruiser.cjs'))})\n`
export const RULING =
  'https://github.com/nemori-ai/omne-harness-lite/issues/675#issuecomment-6480475331'

export interface ExceptionRow {
  readonly id: string
  readonly groups: readonly string[]
}
export const CONTEXT_TOOL: ExceptionRow = {
  id: 'GCX-CONTEXT-TOOL',
  groups: ['packages/tool', 'packages/context'],
}

export const policy = (exceptions: readonly ExceptionRow[]) =>
  JSON.stringify({
    schemaVersion: 3,
    domains: [],
    roles: [],
    rules: [],
    groupCycleExceptions: exceptions.map(row => ({
      ...row,
      ruling: RULING,
      reason: '上下文组装感知工具',
    })),
  })

/** 可信 runner：本仓库安装的预设、最小解析配置与回路配置（loop:status 从 runner 读）；`exceptions` 为 null 时没有 constraints.json。 */
export function runner(exceptions: readonly ExceptionRow[] | null): string {
  const root = temporaryDirectory('omne-group-cycle-runner-')
  write(root, '.dependency-cruiser.cjs', PRESET)
  // TypeScript 不接受没有输入文件的配置，所以列一个空文件。
  write(root, 'stub.ts', 'export {}\n')
  write(root, 'tsconfig.base.json', JSON.stringify({ files: ['stub.ts'] }))
  write(root, TOOLCHAIN_CONFIG, readFileSync(join(REPOSITORY_ROOT, TOOLCHAIN_CONFIG), 'utf8'))
  if (exceptions !== null) write(root, CONSTRAINTS, policy(exceptions))
  return root
}

const source = (imports: readonly string[]) =>
  `${imports.map((path, index) => `import { v as v${index} } from '${path}'`).join('\n')}\nexport const v = ${imports.length === 0 ? '1' : imports.map((_, index) => `v${index}`).join(' + ')}\n`

/**
 * 被检树：组 context 的 x → 组 tool 的 y → 组 context 的 z，组成环、成员不成环。
 * `wider` 再让 y → 组 agent 的 w → z，分量变成三个组；`memberCycle` 让 y 改为导入 x 的另一个文件，
 * 成员也成环，文件不成环。
 */
export function tree(options: { wider?: boolean; memberCycle?: boolean } = {}): string {
  const root = repository()
  write(root, 'tsconfig.base.json', '{}\n')
  write(root, 'packages/context/x/src/index.ts', source(['../../../tool/y/src/index.ts']))
  write(
    root,
    'packages/tool/y/src/index.ts',
    source([
      options.memberCycle === true
        ? '../../../context/x/src/leaf.ts'
        : '../../../context/z/src/index.ts',
      ...(options.wider === true ? ['../../../agent/w/src/index.ts'] : []),
    ]),
  )
  write(root, 'packages/context/z/src/index.ts', source([]))
  write(root, 'packages/context/x/src/leaf.ts', source([]))
  if (options.wider === true)
    write(root, 'packages/agent/w/src/index.ts', source(['../../../context/z/src/index.ts']))
  return root
}
