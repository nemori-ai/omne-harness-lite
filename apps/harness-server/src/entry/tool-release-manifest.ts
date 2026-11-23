import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
import {
  releasedGateSchema,
  releasedGatesOf,
  toolPermissionRelease,
  toolPermissionReleaseSchema,
  type ReleasedGate,
} from './tool-permission-release.ts'

export const TOOL_RELEASE_FORMAT = 'omne-harness/tool-release/4'
export const TOOL_RELEASE_FILE = 'tool-release.json'
export const TOOL_RELEASE_MANIFEST_PATH = fileURLToPath(
  new URL(`../../config/${TOOL_RELEASE_FILE}`, import.meta.url),
)
export const TOOL_RELEASE_OWNER = '@omne-harness/harness-server'
export const TOOL_DEFINITIONS_PACKAGE = '@omne-harness/tool-definitions' as const
export const CALENDAR_TOOLS_PACKAGE = '@omne-harness/calendar-tools' as const
export const SCHEDULE_TOOLS_PACKAGE = '@omne-harness/schedule-tools' as const
export const NOTIFICATION_TOOLS_PACKAGE = '@omne-harness/notification-tools' as const
export const SESSION_TOOLS_PACKAGE = '@omne-harness/session-tools' as const
export const DISPATCH_TOOLS_PACKAGE = '@omne-harness/dispatch-tools' as const
export const WORKSPACE_TOOLS_PACKAGE = '@omne-harness/workspace-tools' as const
export const PLUGIN_TOOLS_PACKAGE = '@omne-harness/plugin-tools' as const
/** The packages a release tool may come from; each is checked by the digest of its own artifacts. */
export const RELEASE_PACKAGES = Object.freeze([
  TOOL_DEFINITIONS_PACKAGE,
  CALENDAR_TOOLS_PACKAGE,
  SCHEDULE_TOOLS_PACKAGE,
  NOTIFICATION_TOOLS_PACKAGE,
  SESSION_TOOLS_PACKAGE,
  DISPATCH_TOOLS_PACKAGE,
  WORKSPACE_TOOLS_PACKAGE,
  PLUGIN_TOOLS_PACKAGE,
] as const)
export type ReleasePackage = (typeof RELEASE_PACKAGES)[number]

export const RELEASE_TOOLS = Object.freeze([
  Object.freeze({
    name: 'Shell',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'shellToolModule',
    construction: Object.freeze(['resultMaxBytes', 'executable', 'argsPrefix', 'cwd', 'env']),
  }),
  Object.freeze({
    name: 'Files',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'filesToolModule',
    construction: Object.freeze([
      'resultMaxBytes',
      'cwd',
      'openMaxBytes',
      'imageMaxWidth',
      'imageMaxHeight',
      'imageMaxDecodedBytes',
      'imageConcurrency',
    ]),
  }),
  Object.freeze({
    name: 'Tools',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'toolsToolModule',
    construction: Object.freeze(['resultMaxBytes', 'outputModalities']),
  }),
  Object.freeze({
    name: 'TodoItems',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'todoItemsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'BkgToolCalls',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'backgroundCallsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Ask',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'askToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Web',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'webToolModule',
    construction: Object.freeze(['resultMaxBytes', 'maxSearchResults']),
  }),
  Object.freeze({
    name: 'Skills',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'skillsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Calendar',
    package: CALENDAR_TOOLS_PACKAGE,
    capabilities: Object.freeze(['calendar.read']),
    export: 'calendarToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Schedules',
    package: SCHEDULE_TOOLS_PACKAGE,
    capabilities: Object.freeze(['schedule.read', 'schedule.write']),
    export: 'schedulesToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Sessions',
    package: SESSION_TOOLS_PACKAGE,
    capabilities: Object.freeze(['session.read', 'session.search']),
    export: 'sessionsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Agents',
    package: DISPATCH_TOOLS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'agentsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Notifications',
    package: NOTIFICATION_TOOLS_PACKAGE,
    capabilities: Object.freeze(['notification.read', 'notification.write']),
    export: 'notificationsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'SwitchWorkspace',
    package: WORKSPACE_TOOLS_PACKAGE,
    capabilities: Object.freeze(['workspace.switch']),
    export: 'switchWorkspaceToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'OmneExtensionPoints',
    package: PLUGIN_TOOLS_PACKAGE,
    capabilities: Object.freeze([] as string[]),
    export: 'extensionPointsToolModule',
    construction: Object.freeze(['resultMaxBytes']),
  }),
  Object.freeze({
    name: 'Screen',
    package: TOOL_DEFINITIONS_PACKAGE,
    capabilities: Object.freeze(['screen.read']),
    export: 'screenToolModule',
    construction: Object.freeze([
      'resultMaxBytes',
      'captureMaxLongSide',
      'imageMaxWidth',
      'imageMaxHeight',
      'imageMaxDecodedBytes',
      'imageConcurrency',
    ]),
  }),
] as const)

export type ReleaseToolName = (typeof RELEASE_TOOLS)[number]['name']
export type ReleaseToolExport = (typeof RELEASE_TOOLS)[number]['export']

export const RELEASE_UNGATED: Readonly<Partial<Record<string, readonly string[]>>> = Object.freeze({
  Ask: ['ask'],
})
export function namedUngated(tool: string): readonly string[] {
  return RELEASE_UNGATED[tool] ?? []
}
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
const packageSchema = z.enum(RELEASE_PACKAGES)
const artifactsSchema = z.strictObject({
  package: packageSchema,
  files: z.array(
    z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  ),
  digest: digestText,
})
export const manifestSchema = z.strictObject({
  format: z.literal(TOOL_RELEASE_FORMAT),
  generation: digestText,
  artifacts: z.array(artifactsSchema),
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
        package: packageSchema,
        export: z.string().min(1),
        executor: adoptionSchema,
        artifacts: digestText,
      }),
      construction: z.array(z.string().min(1)),
      governance: toolPermissionReleaseSchema,
      settings: adoptionSchema,
      definition: digestText,
      gates: z.array(releasedGateSchema),
      holding: evidenceSchema,
      publication: evidenceSchema,
    }),
  ),
})

export type ToolReleaseManifest = z.infer<typeof manifestSchema>
export type ToolReleaseEntry = ToolReleaseManifest['entries'][number]
export type PackageArtifacts = z.infer<typeof artifactsSchema>
export type ToolReleaseArtifacts = PackageArtifacts[]
export type ReleaseRoots = Readonly<Record<ReleasePackage, string>>

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

export async function importReleaseModules(roots: ReleaseRoots): Promise<ReleaseModules> {
  const namespaces = new Map<ReleasePackage, object>()
  for (const name of RELEASE_PACKAGES) {
    const namespace: unknown = await import(
      pathToFileURL(join(roots[name], RELEASE_ENTRY_FILE)).href
    )
    if (typeof namespace !== 'object' || namespace === null)
      throw new Error(`tool-release: the release entry of ${name} has no exports`)
    namespaces.set(name, namespace)
  }
  return Object.freeze(
    Object.fromEntries(
      RELEASE_TOOLS.map(tool => [
        tool.export,
        releaseModuleOf(namespaces.get(tool.package)!, tool.export),
      ]),
    ) as Record<ReleaseToolExport, ReleaseModule>,
  )
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

async function scanPackage(name: ReleasePackage, packageRoot: string): Promise<PackageArtifacts> {
  const files: { path: string; sha256: string }[] = []
  for (const path of await artifactPaths(packageRoot))
    files.push({ path, sha256: sha256(await readFile(join(packageRoot, path))) })
  return { package: name, files, digest: canonicalDigest({ package: name, files }) }
}

export async function scanArtifacts(roots: ReleaseRoots): Promise<ToolReleaseArtifacts> {
  const all: PackageArtifacts[] = []
  for (const name of RELEASE_PACKAGES) all.push(await scanPackage(name, roots[name]))
  return all
}

async function locatePackage(from: string, name: ReleasePackage): Promise<string> {
  let dir = from
  for (;;) {
    const candidate = join(dir, 'node_modules', ...name.split('/'))
    try {
      const root = await realpath(candidate)
      const manifest: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      if (
        typeof manifest === 'object' &&
        manifest !== null &&
        Reflect.get(manifest, 'name') === name
      )
        return root
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`tool-release: ${name} is not installed`)
    dir = parent
  }
}

/** The installed root of every release package, resolved from the member that ships the release. */
export async function locateReleasePackages(from: string): Promise<ReleaseRoots> {
  const roots: Partial<Record<ReleasePackage, string>> = {}
  for (const name of RELEASE_PACKAGES) roots[name] = await locatePackage(from, name)
  return roots as ReleaseRoots
}

export function governanceOf(entry: Pick<ToolReleaseEntry, 'asset' | 'requiredCapabilities'>) {
  return Object.freeze({
    asset: entry.asset,
    requiredCapabilities: entry.requiredCapabilities,
  }) satisfies ToolGovernance
}

export type ReleasedDefinition = Readonly<{ digest: string; gates: readonly ReleasedGate[] }>

export function releasedDefinition(
  module: ReleaseModule,
  governance: ToolGovernance,
  construction: JsonValue,
): ReleasedDefinition {
  const created = module.createAuthor(construction)
  if ('failure' in created)
    throw new Error(`tool-release: construction refused (${created.failure.field})`)
  const definition = judgeToolDefinition(deriveDefinition(governance, created.ok.facts))
  if ('failure' in definition)
    throw new Error(`tool-release: definition refused (${definition.failure.field})`)
  return {
    digest: canonicalDigest(definition.ok),
    gates: releasedGatesOf(definition.ok, namedUngated(governance.asset.name)),
  }
}

const evidence = (record: string, generation: string, content: unknown): DurableEvidence => ({
  owner: TOOL_RELEASE_OWNER,
  record: `${TOOL_RELEASE_FILE}#${record}`,
  revision: generation,
  digest: canonicalDigest({ generation, record, content }),
})

type ConsumerStatement = Pick<ToolReleaseManifest['consumer'], 'input' | 'output' | 'attachments'>
type ReleaseCore = Omit<ToolReleaseEntry, 'holding' | 'publication'>

function releaseGeneration(
  input: Readonly<{
    artifacts: ToolReleaseArtifacts
    consumer: ConsumerStatement
    entries: readonly ReleaseCore[]
  }>,
): string {
  return canonicalDigest({
    format: TOOL_RELEASE_FORMAT,
    artifacts: input.artifacts,
    consumer: input.consumer,
    entries: input.entries,
  })
}

export function manifestGeneration(manifest: ToolReleaseManifest): string {
  const { input, output, attachments } = manifest.consumer
  return releaseGeneration({
    artifacts: manifest.artifacts,
    consumer: { input, output, attachments },
    entries: manifest.entries.map(
      ({ holding: _holding, publication: _publication, ...core }) => core,
    ),
  })
}

export function composeManifest(input: {
  version: string
  artifacts: ToolReleaseArtifacts
  modules: ReleaseModules
  definitions: Readonly<Record<string, ReleasedDefinition>>
}): ToolReleaseManifest {
  const { version, artifacts, modules, definitions } = input
  const cores = RELEASE_TOOLS.map(tool => {
    const own = artifacts.find(item => item.package === tool.package)
    if (own === undefined) throw new Error(`tool-release: no artifacts for ${tool.package}`)
    const module = {
      package: tool.package as ReleasePackage,
      export: tool.export,
      executor: { ...modules[tool.export].executor } satisfies Adoption,
      artifacts: own.digest,
    }
    const construction = [...tool.construction]
    const released = definitions[tool.name]
    if (released === undefined)
      throw new Error(`tool-release: no definition digest for ${tool.name}`)
    const { digest: definition, gates } = released
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
      requiredCapabilities: [...tool.capabilities],
      module,
      construction,
      settings: {
        owner: TOOL_RELEASE_OWNER,
        name: `${tool.name}.settings`,
        revision: version,
        digest: canonicalDigest({ name: tool.name, construction }),
      },
      definition,
      gates: gates.map(gate => ({ ...gate, commands: [...gate.commands] })),
    }
    return {
      ...core,
      governance: toolPermissionRelease({
        name: tool.name,
        adoption: core.asset.adoption,
        module,
        definition,
        gates,
      }),
    }
  })
  const statement = {
    input: ['text' as const],
    output: ['text' as const],
    attachments: false as const,
  }
  const generation = releaseGeneration({ artifacts, consumer: statement, entries: cores })
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
  packageRoots: () => Promise<ReleaseRoots>
  version: () => Promise<string>
  importModules: (roots: ReleaseRoots) => Promise<ReleaseModules>
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
  let roots: ReleaseRoots
  try {
    roots = await input.packageRoots()
    artifacts = await scanArtifacts(roots)
  } catch {
    return unavailable('artifacts unreadable')
  }
  if (canonicalDigest(artifacts) !== canonicalDigest(manifest.artifacts))
    return unavailable('artifacts differ from the manifest')
  if (!artifacts.every(own => own.files.some(file => file.path === RELEASE_ENTRY_FILE)))
    return unavailable('the release entry file is not in the artifacts')
  try {
    // The very roots whose artifacts were just checked; never a second resolution.
    const modules = await input.importModules(roots)
    const definitions = Object.fromEntries(
      manifest.entries.map(entry => [
        entry.asset.name,
        { digest: entry.definition, gates: entry.gates },
      ]),
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
