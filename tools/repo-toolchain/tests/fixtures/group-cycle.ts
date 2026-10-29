// 组环例外测试共用的临时仓库：runner（可信，带预设与可选的 constraints.json）与被检树（组 context ↔ 组 tool 成环）分开建；
// `selfTree` 把两者建成同一棵树，用来测被检树就是 runner 自己的形态。
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
  readonly edges: readonly { readonly from: string; readonly to: string }[]
}
export const X = 'packages/context/x'
export const Y = 'packages/tool/y'
export const Z = 'packages/context/z'
export const W = 'packages/agent/w'
/** 被检树里 context ↔ tool 的两条成员边。 */
export const X_TO_Y = { from: X, to: Y }
export const Y_TO_Z = { from: Y, to: Z }
/** 登记了被检树里 context → tool、tool → context 两条边：放行 `tree()` 的组环。 */
export const CONTEXT_TOOL: ExceptionRow = {
  id: 'GCX-CONTEXT-TOOL',
  edges: [X_TO_Y, Y_TO_Z],
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

export const Q = 'packages/context/q'
export const S = 'packages/session/s'

export interface TreeOptions {
  /** x → y → w → z：context → tool → agent → context，三个组成环；没有 y → z。 */
  readonly ring?: boolean
  /** 再让 q（组 context）→ y：context → tool 有两条成员边。 */
  readonly twoEdges?: boolean
  /** y 不再导入 z：组环消失，x → y 还在。 */
  readonly broken?: boolean
  /** 再让 s（组 session）→ y：一条不在组环上的跨组边。 */
  readonly extraEdge?: boolean
  /** y 改为导入 x 的另一个文件：成员也成环，文件不成环。 */
  readonly memberCycle?: boolean
}

/**
 * 被检树：组 context 的 x → 组 tool 的 y → 组 context 的 z，两组成环、成员不成环。
 * 选项改出别的形状，见 `TreeOptions`。
 */
export function tree(options: TreeOptions = {}): string {
  const root = repository()
  write(root, 'tsconfig.base.json', '{}\n')
  write(root, 'packages/context/x/src/index.ts', source(['../../../tool/y/src/index.ts']))
  const yImports =
    options.memberCycle === true
      ? ['../../../context/x/src/leaf.ts']
      : options.ring === true
        ? ['../../../agent/w/src/index.ts']
        : options.broken === true
          ? []
          : ['../../../context/z/src/index.ts']
  write(root, 'packages/tool/y/src/index.ts', source(yImports))
  write(root, 'packages/context/z/src/index.ts', source([]))
  write(root, 'packages/context/x/src/leaf.ts', source([]))
  if (options.ring === true)
    write(root, 'packages/agent/w/src/index.ts', source(['../../../context/z/src/index.ts']))
  if (options.twoEdges === true)
    write(root, 'packages/context/q/src/index.ts', source(['../../../tool/y/src/index.ts']))
  if (options.extraEdge === true)
    write(root, 'packages/session/s/src/index.ts', source(['../../../tool/y/src/index.ts']))
  return root
}

/** runner 与被检树是同一棵树：`tree(options)` 加上预设、回路配置与 `exceptions` 登记的 constraints.json。 */
export function selfTree(exceptions: readonly ExceptionRow[], options: TreeOptions = {}): string {
  const root = tree(options)
  write(root, '.dependency-cruiser.cjs', PRESET)
  write(root, TOOLCHAIN_CONFIG, readFileSync(join(REPOSITORY_ROOT, TOOLCHAIN_CONFIG), 'utf8'))
  write(root, CONSTRAINTS, policy(exceptions))
  return root
}
