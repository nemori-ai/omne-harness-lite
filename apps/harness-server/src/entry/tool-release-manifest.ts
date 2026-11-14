import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
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
import { toolPermissionRelease, toolPermissionReleaseSchema } from './tool-permission-release.ts'

export const TOOL_RELEASE_FORMAT = 'omne-harness/tool-release/2'
export const TOOL_RELEASE_FILE = 'tool-release.json'
export const TOOL_RELEASE_OWNER = '@omne-harness/harness-server'
export const TOOL_DEFINITIONS_PACKAGE = '@omne-harness/tool-definitions' as const

export const RELEASE_TOOLS = Object.freeze([
  Object.freeze({
    name: 'Shell',
    export: 'shellToolModule',
    construction: Object.freeze(['resultMaxBytes', 'executable', 'argsPrefix', 'cwd', 'env']),
  }),
  Object.freeze({
    name: 'Files',
    export: 'filesToolModule',
    construction: Object.freeze(['resultMaxBytes', 'cwd']),
  }),
  Object.freeze({
    name: 'Tools',
    export: 'toolsToolModule',
    construction: Object.freeze(['resultMaxBytes', 'outputModalities']),
  }),
  Object.freeze({
    name: 'TodoItems',
    export: 'todoItemsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Ask',
    export: 'askToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Web',
    export: 'webToolModule',
    construction: Object.freeze(['resultMaxBytes', 'maxSearchResults']),
  }),
] as const)

export type ReleaseToolName = (typeof RELEASE_TOOLS)[number]['name']
export type ReleaseToolExport = (typeof RELEASE_TOOLS)[number]['export']
export type ReleaseModule = ToolImplementationModule<unknown, ToolMessageContentBlock>
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
      governance: toolPermissionReleaseSchema,
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

export const ADOPTION_FIELDS = Object.freeze(['owner', 'name', 'revision', 'digest'] as const)
export const EVIDENCE_FIELDS = Object.freeze(['owner', 'record', 'revision', 'digest'] as const)

export function sameFields(left: unknown, right: object, fields: readonly string[]): boolean {
  return (
    typeof left === 'object' &&
    left !== null &&
    fields.every(field => Reflect.get(left, field) === Reflect.get(right, field))
  )
}

export const sameAdoption = (left: unknown, right: object): boolean =>
  sameFields(left, right, ADOPTION_FIELDS)
export const sameEvidence = (left: unknown, right: object): boolean =>
  sameFields(left, right, EVIDENCE_FIELDS)

export const CONSTRUCTION_LIMITS = Object.freeze({
  maxBytes: 65536,
  maxDepth: 8,
  maxItems: 4096,
  maxMembers: 1024,
  maxStringLength: 32768,
  maxNumberLength: 32,
})

export function constructionTree(value: unknown): JsonValue | undefined {
  const text = JSON.stringify(value)
  if (typeof text !== 'string') return undefined
  const read = readJsonText(text, CONSTRUCTION_LIMITS)
  return read.kind === 'ok' ? read.value : undefined
}

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
  return module as ReleaseModule
}

export async function importReleaseModules(packageRoot: string): Promise<ReleaseModules> {
  const namespace: unknown = await import(pathToFileURL(join(packageRoot, RELEASE_ENTRY_FILE)).href)
  if (typeof namespace !== 'object' || namespace === null)
    throw new Error('tool-release: the release entry has no exports')
  return Object.freeze({
    shellToolModule: releaseModuleOf(namespace, 'shellToolModule'),
    filesToolModule: releaseModuleOf(namespace, 'filesToolModule'),
    toolsToolModule: releaseModuleOf(namespace, 'toolsToolModule'),
    todoItemsToolModule: releaseModuleOf(namespace, 'todoItemsToolModule'),
    askToolModule: releaseModuleOf(namespace, 'askToolModule'),
    webToolModule: releaseModuleOf(namespace, 'webToolModule'),
  })
}

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
    } catch {}
    const parent = dirname(dir)
    if (parent === dir)
      throw new Error(`tool-release: ${TOOL_DEFINITIONS_PACKAGE} is not installed`)
    dir = parent
  }
}

export function governanceOf(entry: Pick<ToolReleaseEntry, 'asset' | 'requiredCapabilities'>) {
  return Object.freeze({
    asset: entry.asset,
    requiredCapabilities: entry.requiredCapabilities,
  }) satisfies ToolGovernance
}

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
    const core = {
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
    return {
      ...core,
      governance: toolPermissionRelease({
        name: tool.name,
        adoption: core.asset.adoption,
        module,
        definition,
      }),
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

export const manifestText = (manifest: ToolReleaseManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`

export type ToolReleaseSnapshot =
  | Readonly<{
      kind: 'trusted'
      generation: string
      manifest: ToolReleaseManifest
      modules: ReleaseModules
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export async function loadToolRelease(input: {
  manifestPath: string
  packageRoot: () => Promise<string>
  version: () => Promise<string>
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
