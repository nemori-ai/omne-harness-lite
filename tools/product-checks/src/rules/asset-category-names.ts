import { isTestPath, type Rule } from '@omne-harness/repo-toolchain/core/rule'
import { scanCode } from '@omne-harness/repo-toolchain/core/source-text'

/** The asset entry points that serve every category the same way. */
export const CATEGORY_BLIND_SOURCES = [
  'packages/assets/assets-protocol/src/',
  'packages/assets/assets-access/src/',
  'packages/assets/assets-ui/src/',
  'apps/cli/src/asset-command.ts',
  'apps/cli/src/setting-command.ts',
] as const

/** The categories this repository contributes, and the two its server tests add. */
export const CATEGORY_NAMES = [
  'AgentDefinition',
  'converter',
  'fixture',
  'fixture-bundle',
  'loop-extension',
  'mcp',
  'model-provider',
  'plugin',
  'prompt',
  'skill',
  'skin',
  'tool',
] as const

const blind = (path: string): boolean =>
  !isTestPath(path) &&
  CATEGORY_BLIND_SOURCES.some(source =>
    source.endsWith('/') ? path.startsWith(source) : path === source,
  )

const NAMED = new RegExp(`(['"\`])(${CATEGORY_NAMES.join('|')})\\1`)

export const assetCategoryNames: Rule = {
  id: 'asset-category-names',
  source: 'packages/assets/SPEC.md AS-22',
  description:
    '资产的协议契约、接入插件、界面模块与命令行的资产命令里不写任何类别名：加一个类别不改它们',
  check(files) {
    return scanCode(
      this.id,
      files,
      blind,
      NAMED,
      match => `写了类别名 ${match[2] ?? ''}；资产的入口对每个类别一视同仁，类别的事交给类别自己`,
    )
  },
}
