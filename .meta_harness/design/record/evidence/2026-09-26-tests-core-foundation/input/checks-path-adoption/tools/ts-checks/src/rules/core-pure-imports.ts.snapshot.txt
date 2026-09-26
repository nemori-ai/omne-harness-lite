import { productSourceIn } from '../layout.ts'
import type { Rule, Violation } from '../rule.ts'
import { lineAt, resolveRelative } from '../source-text.ts'
import { syntaxImports, syntaxOf } from '../syntax.ts'

/** 当前已接受节点 design 的依赖表；工具依赖（如 content-blocks 无损写）也明确登记。 */
export const CORE_PURE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  'content-blocks': ['identity-values'],
  'asset-model': ['identity-values', 'offer-expiry', 'content-blocks'],
  'model-profile': ['content-blocks', 'identity-values', 'offer-expiry'],
  'call-accounts': ['content-blocks', 'asset-model', 'identity-values', 'offer-expiry'],
  messages: ['content-blocks', 'call-accounts', 'model-profile', 'identity-values', 'offer-expiry'],
  'tool-definition': ['content-blocks', 'asset-model'],
  'loop-extension': [
    'content-blocks',
    'messages',
    'call-accounts',
    'model-profile',
    'tool-definition',
    'asset-model',
    'identity-values',
    'offer-expiry',
  ],
  'skill-package': ['asset-model', 'content-blocks', 'tool-definition'],
  connector: ['asset-model', 'messages', 'content-blocks', 'offer-expiry', 'identity-values'],
  'mcp-endpoint': ['asset-model', 'tool-definition', 'identity-values', 'offer-expiry'],
  'arrival-events': ['content-blocks', 'call-accounts', 'loop-extension', 'identity-values'],
  'model-response': [
    'call-accounts',
    'content-blocks',
    'messages',
    'model-profile',
    'loop-extension',
    'offer-expiry',
    'identity-values',
  ],
  'slash-command': ['asset-model', 'content-blocks', 'identity-values', 'skill-package'],
  'stream-assembly': ['arrival-events', 'content-blocks', 'call-accounts'],
  'asset-evaluation': [
    'identity-values',
    'asset-model',
    'mcp-endpoint',
    'tool-definition',
    'loop-extension',
    'skill-package',
    'slash-command',
    'connector',
    'content-blocks',
  ],
}

const BUILTINS: Readonly<Record<string, readonly string[]>> = {
  // S-17：只规范化显式绝对路径的字面形状，不从 cwd 补齐、也不读文件系统。
  'asset-model': ['node:crypto', 'node:buffer', 'node:path'],
  'arrival-events': ['node:buffer'],
  'stream-assembly': ['node:buffer'],
  'asset-evaluation': ['node:crypto'],
}

function allowedExternal(pkg: string, dependencies: readonly string[], specifier: string): boolean {
  if (
    dependencies.some(
      name =>
        specifier === `@omne-harness-lite/${name}` ||
        specifier === `@omne-harness-lite/${name}/schema`,
    )
  )
    return true
  if (BUILTINS[pkg]?.includes(specifier.startsWith('node:') ? specifier : `node:${specifier}`))
    return true
  // 数据节点的既定校验器采用。两个纯 capability 节点不采用 Ajv。
  if (
    pkg !== 'stream-assembly' &&
    pkg !== 'asset-evaluation' &&
    (specifier === 'ajv' || specifier.startsWith('ajv/'))
  )
    return true
  if (pkg === 'skill-package' && specifier === 'yaml') return true
  return pkg === 'tool-definition' && specifier === '@eslint-community/regexpp'
}

/** 一条规则同时承载十五个纯模块边界、SA SC-2 与 AE SC-1 的 import 面。 */
export const corePureImports: Rule = {
  id: 'core-pure-imports',
  source:
    '十五个新 core 节点 design「公开面／依赖」 · stream-assembly SC-2 · asset-evaluation SC-1',
  description: '纯 core 模块只从节点登记的公开入口、本包源码/Schema 与已采用纯构件导入',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      const match = /^core\/([^/]+)\/src\//.exec(file.path)
      const pkg = match?.[1]
      const dependencies = pkg === undefined ? undefined : CORE_PURE_DEPENDENCIES[pkg]
      if (
        pkg === undefined ||
        dependencies === undefined ||
        !productSourceIn(file.path, `core/${pkg}/src/`)
      )
        continue
      for (const ref of syntaxImports(syntaxOf(file))) {
        const specifier = ref.specifier
        const resolved = specifier === undefined ? undefined : resolveRelative(file.path, specifier)
        const local =
          resolved !== undefined &&
          (resolved.startsWith(`core/${pkg}/src/`) ||
            (resolved.startsWith(`core/${pkg}/schema/`) && resolved.endsWith('.json')))
        if (local || (specifier !== undefined && allowedExternal(pkg, dependencies, specifier)))
          continue
        out.push({
          rule: this.id,
          path: file.path,
          line: lineAt(file.text, ref.index),
          message:
            specifier === undefined
              ? '动态模块说明符不是字面量，无法核对纯模块依赖边界'
              : `${pkg} 导入了 ${specifier}；只允许节点登记的公开依赖、本包源码/Schema 与已采用的纯构件`,
        })
      }
    }
    return out
  },
}
