import ts from 'typescript'
import { productSourceIn } from '../layout.ts'
import type { Rule, Violation } from '../rule.ts'
import { lineAt, resolveRelative } from '../source-text.ts'
import { syntaxImports, syntaxOf } from '../syntax.ts'

/** 当前已接受节点 design 的依赖表；工具依赖（如 content-blocks 无损写）也明确登记。 */
export const CORE_PURE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  storage: [],
  // F0: packages/core/session-runtime/SPEC.md owns this public boundary.
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
  // F0: packages/core/model-message-projection/SPEC.md owns this public boundary.
  'model-message-projection': [
    'content-blocks',
    'identity-values',
    'messages',
    'session-log',
    'session-runtime',
    'model-request-runtime',
  ],
  // F0: packages/core/agent-loop/SPEC.md owns this public boundary.
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
  // F0 public model operations and OriginalIssueParticipant own their exact signature dependencies.
  // See core/model-request-runtime/SPEC.md; no concrete provider imports are allowed.
  'model-request-runtime': [
    // Public codec types have one generic owner; the model facade only re-exports types.
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
    // SLP-3 explicitly accepts the public shared StorageUnit.
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
    // B01 SR6: original Tool participation uses public shared Unit types, not a storage backend.
    'storage',
    // TE-25 uses the shared pure close-control types; this does not grant a Cordis face.
    'assembly-lifecycle',
    // Adopted r10 i1/b1: the public runtime factory receives the core RunnerServiceHost read port.
    'loop-extension-runner',
    // Public tool-runtime/1 log codec owns its durable shell and value checks.
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
  // Adopted ar3: ToolActionHistory consumes these definitions, never a concrete driver/provider.
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
  // MS7/MS8 精确依赖 TD3 ModelToolEntry：messages v7-design「精确依赖、资源与绑定」。
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
  // S-17：只规范化显式绝对路径的字面形状，不从 cwd 补齐、也不读文件系统。
  'asset-model': ['node:crypto', 'node:buffer', 'node:path'],
  'arrival-events': ['node:buffer'],
  'stream-assembly': ['node:buffer'],
  'asset-evaluation': ['node:crypto'],
  // MS8 S-56 语义摘要喂 SHA-256：messages v8-acknowledgement-design「编码与依赖」。
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

/** 精确子入口登记不替代上面的包依赖批准，也不准许相邻私有路径。 */
export const PUBLIC_SUBPATHS: Readonly<Record<string, readonly string[]>> = {
  'content-blocks': ['schema-runtime', 'schema/v2'],
  // MS6 原字节供 LC6 固定图：messages v7-design「另需保留 MS6 ./schema/v6」。
  messages: ['schema/v2', 'schema/v3', 'schema/v6'],
  // MP6 原字节供 MS7/MS8 created：model-profile v6-schema-resource-design。
  'model-profile': ['schema/v2', 'schema/v3', 'schema/v6'],
  // 根为 CA4 后 CA2 原字节供 AR2/LC6/SA3：call-accounts v3-design「本包 Schema 与元数据」。
  'call-accounts': ['schema/v2'],
  'model-response': [],
  'loop-extension': ['schema/v2', 'schema/v3'],
  'asset-evaluation': [],
  'tool-definition': ['schema/v2'],
  'asset-model': ['schema/v2', 'schema/connector/v2'],
  // D-069: current AM3/AE3/Slash2 consume the exact Skill2 pure value/body boundary.
  'skill-package': ['v2', 'schema/v2'],
  // D-066 迁移后的消费者仍精确引用 OE1；完整原资源由这个入口公开。
  'offer-expiry': ['schema/v1'],
}

// D-116 native loading/build assembly: finite technical sites only. This does not
// grant module loading to value judges or the compiler-free code-runtime.
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

  // Explicitly retained schema resources share the same owner; no private subpath is opened.
  if (
    ['messages', 'model-profile', 'model-response', 'loop-extension'].includes(pkg) &&
    PUBLIC_SUBPATHS[pkg]?.some(
      subpath => subpath.startsWith('schema/') && specifier === `@omne-harness/${pkg}/${subpath}`,
    )
  )
    return true
  // D-068：AM3 的固定资源图显式纳入本包完整 AM2；只批准这个公开资源入口。
  if (pkg === 'asset-model' && specifier === '@omne-harness/asset-model/schema/v2') return true
  if (pkg === 'skill-package' && specifier === '@omne-harness/skill-package/schema/v2') return true
  if (SCHEMA_JUDGE_OWNERS.has(pkg) && specifier === `@omne-harness/${pkg}/schema`) return true
  if (
    path === 'core/runtime-context/src/schema-inputs.ts' &&
    specifier === '@omne-harness/runtime-context/schema'
  )
    return true
  // tool-runtime/1 is a fixed graph owned by the public journal codec, not a dynamic compiler.
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
  // tk1 / core/loop-extension-runner SPEC TLT-3: deterministic SHA-256 at this one codec site.
  // This import allowance does not establish purity of arbitrary crypto calls.
  if (
    path === 'core/loop-extension-runner/src/admission-digest.ts' &&
    (specifier === 'node:crypto' || specifier === 'crypto')
  )
    return true
  // 数据节点的既定校验器采用。两个纯 capability 节点不采用 Ajv。
  if (SCHEMA_JUDGE_OWNERS.has(pkg) && (specifier === 'ajv' || specifier.startsWith('ajv/')))
    return true
  if (pkg === 'skill-package' && specifier === 'yaml') return true
  return pkg === 'tool-definition' && specifier === '@eslint-community/regexpp'
}

/** 核对已登记纯模块边界及精确的 Cordis 绑定例外。 */
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
        // Existing APIs use these types without loading a test runner or schema compiler.
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
