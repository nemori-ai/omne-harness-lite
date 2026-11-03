// 发行内置 Tool 清单（R2-D66、简报 B3-T2a 第 1、2 项）：`config/tool-release.json` 的形状、构成与核对。
// 清单由 `scripts/tool-release.mjs write` 从已构建的 `@omne-harness/tool-definitions` 生成；本模块是生成与核对的
// 唯一实现，脚本与启动快照都调用它。启动快照按包产物清单重算已安装产物的摘要，再按同一规则重建整份清单，
// 与磁盘上的清单规范化后全等才受信。读不到、形状不对、任何一处不等，快照都是 `unavailable`，不放行。
import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { JsonValue } from '@omne-harness/json-text'
import { canonicalDigest } from '@omne-harness/tool'
import type { Adoption, DurableEvidence } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  judgeToolDefinition,
  type ToolGovernance,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'

export const TOOL_RELEASE_FORMAT = 'omne-harness/tool-release/1'
/** 清单文件名，也是 holding、publication 与消费者证据 `record` 的定位前缀。 */
export const TOOL_RELEASE_FILE = 'tool-release.json'
/** 发行资产、设置采用与清单证据的拥有者（简报第 1 项）。 */
export const TOOL_RELEASE_OWNER = '@omne-harness/harness-server'
export const TOOL_DEFINITIONS_PACKAGE = '@omne-harness/tool-definitions' as const

/** 发行内置的两个作者与它们的固定导出、运维者层构造字段（L-TOOL 事实清单 §1）。表外的作者不进清单。 */
export const RELEASE_TOOLS = Object.freeze([
  Object.freeze({
    name: 'Shell',
    export: 'shellToolModule',
    construction: Object.freeze(['resultMaxBytes', 'executable', 'argsPrefix', 'cwd', 'env']),
  }),
  Object.freeze({
    name: 'Files',
    export: 'filesToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
] as const)

export type ReleaseToolName = (typeof RELEASE_TOOLS)[number]['name']
export type ReleaseToolExport = (typeof RELEASE_TOOLS)[number]['export']
export type ReleaseModule = ToolImplementationModule<unknown, ToolMessageContentBlock>
/** 固定导出名到模块。由调用方在核对产物之后从 `@omne-harness/tool-definitions` 取得。 */
export type ReleaseModules = Readonly<Record<ReleaseToolExport, ReleaseModule>>

const digestText = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const adoptionSchema = z.strictObject({
  owner: z.string().min(1),
  name: z.string().min(1),
  revision: z.string().min(1),
  digest: z.string().min(1),
})
const evidenceSchema = z.strictObject({
  owner: z.string().min(1),
  record: z.string().min(1),
  revision: z.string().min(1),
  digest: digestText,
})
const manifestSchema = z.strictObject({
  format: z.literal(TOOL_RELEASE_FORMAT),
  generation: digestText,
  artifacts: z.strictObject({
    package: z.literal(TOOL_DEFINITIONS_PACKAGE),
    files: z.array(
      z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
    ),
    digest: digestText,
  }),
  consumer: z.strictObject({
    input: z.array(z.literal('text')),
    output: z.array(z.literal('text')),
    attachments: z.literal(false),
    capabilities: evidenceSchema,
    conversion: z.null(),
    attachmentAccess: evidenceSchema,
  }),
  entries: z.array(
    z.strictObject({
      asset: z.strictObject({ name: z.string().min(1), adoption: adoptionSchema }),
      requiredCapabilities: z.array(z.string()),
      module: z.strictObject({
        package: z.literal(TOOL_DEFINITIONS_PACKAGE),
        export: z.string().min(1),
        executor: adoptionSchema,
        artifacts: digestText,
      }),
      construction: z.array(z.string().min(1)),
      settings: adoptionSchema,
      definition: digestText,
      holding: evidenceSchema,
      publication: evidenceSchema,
    }),
  ),
})

export type ToolReleaseManifest = z.infer<typeof manifestSchema>
export type ToolReleaseEntry = ToolReleaseManifest['entries'][number]
export type ToolReleaseArtifacts = ToolReleaseManifest['artifacts']

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** 被 import 的入口文件，相对包根。它必须在包产物清单里（R2-D82 D2）。 */
export const RELEASE_ENTRY_FILE = 'dist/index.js'

function releaseModuleOf(namespace: object, name: ReleaseToolExport): ReleaseModule {
  const module: unknown = Reflect.get(namespace, name)
  if (
    typeof module !== 'object' ||
    module === null ||
    typeof Reflect.get(module, 'executor') !== 'object' ||
    typeof Reflect.get(module, 'createAuthor') !== 'function'
  )
    throw new Error(`tool-release: ${name} is not an implementation module`)
  // The assembly fixes the environment type; the release table erases it to unknown.
  return module as ReleaseModule
}

/**
 * 从已核对的包根 import 固定模块：直接 import `packageRoot/dist/index.js` 的文件 URL，不经包名解析，
 * 所以 import 的正是被核对的那份产物，不受 `--conditions` 等解析条件影响（R2-D82 D2）。
 */
export async function importReleaseModules(packageRoot: string): Promise<ReleaseModules> {
  const namespace: unknown = await import(pathToFileURL(join(packageRoot, RELEASE_ENTRY_FILE)).href)
  if (typeof namespace !== 'object' || namespace === null)
    throw new Error('tool-release: the release entry has no exports')
  return Object.freeze({
    shellToolModule: releaseModuleOf(namespace, 'shellToolModule'),
    filesToolModule: releaseModuleOf(namespace, 'filesToolModule'),
  })
}

/** 包根之下的全部 `dist` 文件加 `package.json`（`exports` 决定实际装载哪个文件），按 POSIX 路径排序。 */
async function artifactPaths(packageRoot: string): Promise<string[]> {
  const found: string[] = ['package.json']
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) found.push(relative(packageRoot, path).split(sep).join('/'))
      else throw new Error(`tool-release: unexpected artifact entry ${entry.name}`)
    }
  }
  await walk(join(packageRoot, 'dist'))
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** 按包产物清单重算已安装产物：文件列表、各自 sha256 与总摘要。 */
export async function scanArtifacts(packageRoot: string): Promise<ToolReleaseArtifacts> {
  const files: { path: string; sha256: string }[] = []
  for (const path of await artifactPaths(packageRoot))
    files.push({ path, sha256: sha256(await readFile(join(packageRoot, path))) })
  return {
    package: TOOL_DEFINITIONS_PACKAGE,
    files,
    digest: canonicalDigest({ package: TOOL_DEFINITIONS_PACKAGE, files }),
  }
}

/** 从 `from` 起按 Node 的 node_modules 查找规则找到已安装的 tool-definitions 包根（解开链接）。 */
export async function locateToolDefinitions(from: string): Promise<string> {
  let dir = from
  for (;;) {
    const candidate = join(dir, 'node_modules', ...TOOL_DEFINITIONS_PACKAGE.split('/'))
    try {
      const root = await realpath(candidate)
      const manifest: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      if (
        typeof manifest === 'object' &&
        manifest !== null &&
        Reflect.get(manifest, 'name') === TOOL_DEFINITIONS_PACKAGE
      )
        return root
    } catch {
      // Not installed at this level; keep walking up.
    }
    const parent = dirname(dir)
    if (parent === dir)
      throw new Error(`tool-release: ${TOOL_DEFINITIONS_PACKAGE} is not installed`)
    dir = parent
  }
}

/** 发行内置作者的治理面：资产版本，没有额外能力要求，不可编程调用。 */
export function governanceOf(entry: Pick<ToolReleaseEntry, 'asset' | 'requiredCapabilities'>) {
  return Object.freeze({
    asset: entry.asset,
    requiredCapabilities: entry.requiredCapabilities,
  }) satisfies ToolGovernance
}

/**
 * 作者定义的规范化摘要：`createAuthor(construction)` 的事实经 `deriveDefinition` 与 `judgeToolDefinition`
 * 得到定义，再取 `canonicalDigest`。装载时的 schemas 检查对 `loaded.definition` 取同一个摘要。
 */
export function definitionDigest(
  module: ReleaseModule,
  governance: ToolGovernance,
  construction: JsonValue,
): string {
  const created = module.createAuthor(construction)
  if ('failure' in created)
    throw new Error(`tool-release: construction refused (${created.failure.field})`)
  const definition = judgeToolDefinition(deriveDefinition(governance, created.ok.facts))
  if ('failure' in definition)
    throw new Error(`tool-release: definition refused (${definition.failure.field})`)
  return canonicalDigest(definition.ok)
}

const evidence = (record: string, generation: string, content: unknown): DurableEvidence => ({
  owner: TOOL_RELEASE_OWNER,
  record: `${TOOL_RELEASE_FILE}#${record}`,
  revision: generation,
  digest: canonicalDigest({ generation, record, content }),
})

/** 构成整份清单。`definitions` 是每个作者的定义摘要，由调用方给出（生成时现算，核对时取自磁盘清单）。 */
export function composeManifest(input: {
  version: string
  artifacts: ToolReleaseArtifacts
  modules: ReleaseModules
  definitions: Readonly<Record<string, string>>
}): ToolReleaseManifest {
  const { version, artifacts, modules, definitions } = input
  const cores = RELEASE_TOOLS.map(tool => {
    const module = {
      package: TOOL_DEFINITIONS_PACKAGE as typeof TOOL_DEFINITIONS_PACKAGE,
      export: tool.export,
      executor: { ...modules[tool.export].executor } satisfies Adoption,
      artifacts: artifacts.digest,
    }
    const construction = [...tool.construction]
    const definition = definitions[tool.name]
    if (definition === undefined)
      throw new Error(`tool-release: no definition digest for ${tool.name}`)
    return {
      asset: {
        name: tool.name,
        adoption: {
          owner: TOOL_RELEASE_OWNER,
          name: tool.name,
          revision: version,
          digest: canonicalDigest({ name: tool.name, module }),
        },
      },
      requiredCapabilities: [] as string[],
      module,
      construction,
      settings: {
        owner: TOOL_RELEASE_OWNER,
        name: `${tool.name}.settings`,
        revision: version,
        digest: canonicalDigest({ name: tool.name, construction }),
      },
      definition,
    }
  })
  const statement = {
    input: ['text' as const],
    output: ['text' as const],
    attachments: false as const,
  }
  const generation = canonicalDigest({
    format: TOOL_RELEASE_FORMAT,
    artifacts,
    consumer: statement,
    entries: cores,
  })
  return {
    format: TOOL_RELEASE_FORMAT,
    generation,
    artifacts,
    consumer: {
      ...statement,
      capabilities: evidence('consumer/capabilities', generation, statement),
      conversion: null,
      attachmentAccess: evidence('consumer/attachment-access', generation, statement),
    },
    entries: cores.map(core => ({
      ...core,
      holding: evidence(`${core.asset.name}/holding`, generation, core),
      publication: evidence(`${core.asset.name}/publication`, generation, core),
    })),
  }
}

/** 清单文件的确切文本。`check` 逐字节比较它，手改格式也算不一致。 */
export const manifestText = (manifest: ToolReleaseManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`

/** 受信快照：清单与已安装产物全等时的当前发行代次与两项条目，加上核过的模块。 */
export type ToolReleaseSnapshot =
  | Readonly<{
      kind: 'trusted'
      generation: string
      manifest: ToolReleaseManifest
      modules: ReleaseModules
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * 启动快照：读清单，按包产物清单重算已安装产物，核对通过后才由 `importModules` 从同一包根取得固定模块，再按同一规则
 * 重建清单，规范化后与磁盘清单全等才返回 `trusted`。任何异常、读不到或不等都返回 `unavailable`，只带固定诊断。
 */
export async function loadToolRelease(input: {
  manifestPath: string
  packageRoot: () => Promise<string>
  version: () => Promise<string>
  /** 从同一个已核对的包根取得固定模块。 */
  importModules: (packageRoot: string) => Promise<ReleaseModules>
}): Promise<ToolReleaseSnapshot> {
  const unavailable = (diagnostic: string): ToolReleaseSnapshot =>
    Object.freeze({ kind: 'unavailable', diagnostic })
  let manifest: ToolReleaseManifest
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(await readFile(input.manifestPath, 'utf8')))
    if (!parsed.success) return unavailable('manifest shape')
    manifest = parsed.data
  } catch {
    return unavailable('manifest unreadable')
  }
  let artifacts: ToolReleaseArtifacts
  let packageRoot: string
  try {
    packageRoot = await input.packageRoot()
    artifacts = await scanArtifacts(packageRoot)
  } catch {
    return unavailable('artifacts unreadable')
  }
  if (canonicalDigest(artifacts) !== canonicalDigest(manifest.artifacts))
    return unavailable('artifacts differ from the manifest')
  if (!artifacts.files.some(file => file.path === RELEASE_ENTRY_FILE))
    return unavailable('the release entry file is not in the artifacts')
  try {
    // The very root whose artifacts were just checked; never a second resolution.
    const modules = await input.importModules(packageRoot)
    const definitions = Object.fromEntries(
      manifest.entries.map(entry => [entry.asset.name, entry.definition]),
    )
    const expected = composeManifest({
      version: await input.version(),
      artifacts,
      modules,
      definitions,
    })
    if (canonicalDigest(expected) !== canonicalDigest(manifest))
      return unavailable('manifest differs from its recomputation')
    return Object.freeze({
      kind: 'trusted',
      generation: manifest.generation,
      manifest: deepFreeze(manifest),
      modules,
    })
  } catch {
    return unavailable('release recomputation failed')
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) deepFreeze(member)
    Object.freeze(value)
  }
  return value
}
