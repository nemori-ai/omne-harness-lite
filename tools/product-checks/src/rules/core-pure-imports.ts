import ts from '@typescript/typescript6'
import { productSourceIn } from '../layout.ts'
import type { Rule, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { lineAt, resolveRelative } from '@omne-harness/repo-toolchain/core/source-text'
import { syntaxImports, syntaxOf } from '@omne-harness/repo-toolchain/core/syntax'

export const CORE_PURE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  storage: [],
  'session-runtime': [
    'content-blocks',
    'identity-values',
    'call-accounts',
    'messages',
    'session-log',
    'session-tenancy',
    'storage',
    'offer-expiry',
  ],
  'model-message-projection': [
    'content-blocks',
    'identity-values',
    'messages',
    'session-log',
    'session-runtime',
    'model-request-runtime',
  ],
  'agent-loop': [
    'call-accounts',
    'content-blocks',
    'loop-extension',
    'session-log',
    'session-runtime',
    'identity-values',
  ],
  'cordis-plugin-tree': ['assembly-lifecycle'],
  'offer-expiry': ['identity-values'],
  'organization-governance': ['storage', 'identity-values', 'offer-expiry', 'kernel-basis'],
  'model-request-runtime': [
    'image-codec',
    'content-blocks',
    'call-accounts',
    'tool-definition',
    'identity-values',
    'messages',
    'session-log',
    'model-response',
    'offer-expiry',
    'arrival-events',
    'model-profile',
    'stream-assembly',
    'model-profile-directory',
    'asset-registry',
    'loop-extension',
    'storage',
    'session-runtime',
    'session-tenancy',
    'asset-evaluation',
  ],
  'session-log': [
    'call-accounts',
    'content-blocks',
    'identity-values',
    'messages',
    'session-tenancy',
    'execution-environments',
    'storage',
  ],
  'session-tenancy': ['identity-values', 'messages'],
  'assembly-manifest': [
    'asset-model',
    'asset-evaluation',
    'content-blocks',
    'identity-values',
    'offer-expiry',
    'call-accounts',
    'tool-definition',
  ],
  'asset-registry': [
    'asset-model',
    'asset-evaluation',
    'assembly-manifest',
    'tool-definition',
    'skill-package',
    'loop-extension',
    'content-blocks',
    'call-accounts',
    'offer-expiry',
    'identity-values',
  ],
  'model-profile-directory': [
    'asset-model',
    'content-blocks',
    'identity-values',
    'model-profile',
    'offer-expiry',
    'storage',
  ],
  'loop-extension-runner': [
    'asset-registry',
    'tool-admission',
    'loop-extension',
    'messages',
    'session-log',
    'call-accounts',
    'content-blocks',
    'identity-values',
    'model-request-runtime',
    'assembly-manifest',
    'asset-evaluation',
    'session-tenancy',
    'asset-model',
  ],
  'runtime-context': ['content-blocks', 'session-tenancy', 'offer-expiry'],
  'execution-environments': [
    'content-blocks',
    'runtime-context',
    'session-tenancy',
    'identity-values',
    'tool-definition',
  ],
  'tool-execution-runtime': [
    'storage',
    'assembly-lifecycle',
    'loop-extension-runner',
    'session-log',
    'identity-values',
    'offer-expiry',
    'content-blocks',
    'call-accounts',
    'arrival-events',
    'tool-definition',
    'stream-assembly',
    'session-tenancy',
    'runtime-context',
    'execution-environments',
    'tool-admission',
    'messages',
  ],
  'tool-admission': [
    'content-blocks',
    'loop-extension',
    'session-tenancy',
    'asset-registry',
    'call-accounts',
    'session-log',
    'tool-definition',
  ],
  'content-blocks': ['identity-values'],
  'asset-model': ['identity-values', 'offer-expiry', 'content-blocks'],
  'agent-definition': [
    'content-blocks',
    'asset-model',
    'tool-definition',
    'model-profile',
    'identity-values',
    'offer-expiry',
  ],
  'model-profile': ['content-blocks', 'identity-values', 'offer-expiry'],
  'call-accounts': ['content-blocks', 'asset-model', 'identity-values', 'offer-expiry'],
  messages: [
    'content-blocks',
    'call-accounts',
    'model-profile',
    'tool-definition',
    'identity-values',
    'offer-expiry',
  ],
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
    'mcp-endpoint',
    'skill-package',
    'slash-command',
  ],
  'skill-package': ['asset-model', 'content-blocks', 'tool-definition'],
  connector: ['asset-model', 'messages', 'content-blocks', 'offer-expiry', 'identity-values'],
  'mcp-endpoint': [
    'asset-model',
    'tool-definition',
    'identity-values',
    'offer-expiry',
    'content-blocks',
  ],
  'arrival-events': ['content-blocks', 'call-accounts', 'loop-extension', 'identity-values'],
  'model-response': [
    'call-accounts',
    'content-blocks',
    'messages',
    'model-profile',
    'loop-extension',
    'offer-expiry',
    'identity-values',
    'asset-model',
    'tool-definition',
    'mcp-endpoint',
    'skill-package',
    'slash-command',
  ],
  'slash-command': ['asset-model', 'content-blocks', 'identity-values', 'skill-package'],
  'stream-assembly': ['arrival-events', 'content-blocks', 'call-accounts'],
  'asset-evaluation': [
    'offer-expiry',
    'agent-definition',
    'call-accounts',
    'model-profile',
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
  storage: ['node:util'],
  'asset-model': ['node:crypto', 'node:buffer', 'node:path'],
  'arrival-events': ['node:buffer'],
  'stream-assembly': ['node:buffer'],
  'asset-evaluation': ['node:crypto'],
  messages: ['node:crypto'],
}

const CORDIS_DEFINITION_OWNERS = new Set([
  'session-runtime',
  'storage',
  'offer-expiry',
  'organization-governance',
  'model-request-runtime',
  'asset-evaluation',
  'session-log',
  'session-tenancy',
  'assembly-manifest',
  'asset-registry',
  'model-profile-directory',
  'loop-extension-runner',
  'runtime-context',
  'execution-environments',
  'tool-execution-runtime',
  'tool-admission',
])

const SCHEMA_JUDGE_OWNERS = new Set([
  'organization-governance',
  'content-blocks',
  'asset-model',
  'agent-definition',
  'model-profile',
  'call-accounts',
  'messages',
  'tool-definition',
  'loop-extension',
  'skill-package',
  'connector',
  'mcp-endpoint',
  'arrival-events',
  'model-response',
  'slash-command',
])

export const PUBLIC_SUBPATHS: Readonly<Record<string, readonly string[]>> = {
  'content-blocks': ['schema-runtime', 'schema/v2'],
  messages: ['schema/v2', 'schema/v3', 'schema/v6'],
  'model-profile': ['schema/v2', 'schema/v3', 'schema/v6'],
  'call-accounts': ['schema/v2'],
  'model-response': [],
  'loop-extension': ['schema/v2', 'schema/v3'],
  'asset-evaluation': [],
  'tool-definition': ['schema/v2'],
  'asset-model': ['schema/v2', 'schema/connector/v2'],
  'skill-package': ['v2', 'schema/v2'],
  'offer-expiry': ['schema/v1'],
}

const FIXED_SCHEMA_MODULE_SITES = new Set([
  'core/tool-execution-runtime/src/journal-values.ts',
  'core/runtime-context/src/decode.ts',
  'core/offer-expiry/src/validate.ts',
  'core/offer-expiry/src/schema-inputs.ts',
  'core/content-blocks/src/schema.ts',
  'core/content-blocks/src/exact-schema.ts',
  'core/content-blocks/src/schema-runtime.ts',
  'core/content-blocks/src/schema-compiler.ts',
  'core/content-blocks/src/schema-codegen.ts',
  'core/messages/src/schema.ts',
  'core/agent-definition/src/schema.ts',
  'core/arrival-events/src/schema.ts',
  'core/tool-definition/src/schema.ts',
  'core/loop-extension/src/schema.ts',
  'core/model-response/src/schema.ts',
  'core/model-profile/src/schema.ts',
  'core/skill-package/src/schema.ts',
  'core/call-accounts/src/schema.ts',
  'core/mcp-endpoint/src/schema.ts',
  'core/slash-command/src/schema.ts',
])

const treeBindingPath = (path: string): boolean =>
  ['prepare.ts', 'prepared.ts', 'load.ts', 'cordis.ts'].some(
    name => path === `core/cordis-plugin-tree/src/${name}`,
  )

function ownerImplementationImport(pkg: string, path: string, specifier: string): boolean {
  if (path === 'core/model-request-runtime/src/model-log-history.ts' && specifier === 'immutable')
    return true
  return (
    CORDIS_DEFINITION_OWNERS.has(pkg) &&
    path === `core/${pkg}/src/cordis.ts` &&
    specifier === '@deepseek-ai/cordis'
  )
}

function allowedExternal(
  pkg: string,
  dependencies: readonly string[],
  specifier: string,
  path: string,
): boolean {
  if (pkg === 'cordis-plugin-tree') {
    const binding = treeBindingPath(path)
    if (
      binding &&
      [
        '@deepseek-ai/cordis',
        '@standard-schema/spec',
        '@omne-harness/assembly-lifecycle/cordis',
        '@omne-harness/kernel-basis/cordis',
      ].includes(specifier)
    )
      return true
    if (
      path === 'core/cordis-plugin-tree/src/tree.ts' &&
      ['validate-npm-package-name', '@babel/helper-validator-identifier'].includes(specifier)
    )
      return true
  }
  if (ownerImplementationImport(pkg, path, specifier)) return true
  if (
    (specifier === 'node:module' || specifier === 'module') &&
    FIXED_SCHEMA_MODULE_SITES.has(path)
  )
    return true

  if (
    ['messages', 'model-profile', 'model-response', 'loop-extension'].includes(pkg) &&
    PUBLIC_SUBPATHS[pkg]?.some(
      subpath => subpath.startsWith('schema/') && specifier === `@omne-harness/${pkg}/${subpath}`,
    )
  )
    return true
  if (pkg === 'asset-model' && specifier === '@omne-harness/asset-model/schema/v2') return true
  if (pkg === 'skill-package' && specifier === '@omne-harness/skill-package/schema/v2') return true
  if (SCHEMA_JUDGE_OWNERS.has(pkg) && specifier === `@omne-harness/${pkg}/schema`) return true
  if (
    path === 'core/runtime-context/src/schema-inputs.ts' &&
    specifier === '@omne-harness/runtime-context/schema'
  )
    return true
  if (
    path === 'core/tool-execution-runtime/src/schema-inputs.ts' &&
    specifier === '@omne-harness/tool-execution-runtime/journal-schema'
  )
    return true
  if (
    dependencies.some(
      name =>
        specifier === `@omne-harness/${name}` ||
        specifier === `@omne-harness/${name}/schema` ||
        PUBLIC_SUBPATHS[name]?.some(subpath => specifier === `@omne-harness/${name}/${subpath}`),
    )
  )
    return true
  if (BUILTINS[pkg]?.includes(specifier.startsWith('node:') ? specifier : `node:${specifier}`))
    return true
  if (pkg === 'storage') return specifier === 'kysely' || specifier === 'kysely/migration'
  if (
    path === 'core/loop-extension-runner/src/admission-digest.ts' &&
    (specifier === 'node:crypto' || specifier === 'crypto')
  )
    return true
  if (SCHEMA_JUDGE_OWNERS.has(pkg) && (specifier === 'ajv' || specifier.startsWith('ajv/')))
    return true
  if (pkg === 'skill-package' && specifier === 'yaml') return true
  return pkg === 'tool-definition' && specifier === '@eslint-community/regexpp'
}

export const corePureImports: Rule = {
  id: 'core-pure-imports',
  source:
    'core 节点公开面／依赖 · storage/offer-expiry SPEC · stream-assembly SC-2 · asset-evaluation SC-1',
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
          !(
            pkg === 'cordis-plugin-tree' &&
            treeBindingPath(resolved) &&
            !treeBindingPath(file.path)
          ) &&
          ((resolved.startsWith(`core/${pkg}/src/`) &&
            !(CORDIS_DEFINITION_OWNERS.has(pkg) && resolved === `core/${pkg}/src/cordis.ts`)) ||
            (resolved.startsWith(`core/${pkg}/schema/`) && resolved.endsWith('.json')))
        const boundaryType =
          ((pkg === 'storage' &&
            [
              'core/storage/src/conformance/index.ts',
              'core/storage/src/conformance/atomic.ts',
            ].includes(file.path) &&
            specifier === 'vitest') ||
            (file.path === 'core/offer-expiry/src/validate.ts' && specifier === 'ajv')) &&
          syntaxOf(file).statements.some(
            statement =>
              ts.isImportDeclaration(statement) &&
              statement.getStart(syntaxOf(file)) === ref.index &&
              statement.importClause?.isTypeOnly === true,
          )
        if (
          boundaryType ||
          local ||
          (specifier !== undefined && allowedExternal(pkg, dependencies, specifier, file.path))
        )
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
