import {
  capabilityId,
  createCategoryPoint,
  type BodyContract,
  type CapabilityId,
  type CategoryContribution,
  type ChangeImpact,
  type HeldFiles,
  type HoldingOutcome,
  type JsonValue,
  type ManagedAsset,
  type RecalledOperation,
  type PackageReader,
  type Placement,
  type TenantManagement,
  type TenantPublishing,
  type TenantPublishOutcome,
} from '@omne-harness/assets'
import {
  answerExtensions,
  attachExtensionsSource,
  createExtensionsAuthor,
  extensionsToolModule,
  type ExtensionsCallSource,
  type HeldSetting,
  type HeldSettings,
  type Placed,
  type SettingWritten,
} from '@omne-harness/assets-tools'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { createIndependentToolScope } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { commandArguments, deriveDefinition } from '@omne-harness/tool-contract/provider'

export const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 262_144,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 65_536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

export const id = (category: string, name: string): CapabilityId => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('identity')
  return made.id
}

/** A body is a note when it has a text; the category says why not, in its own words. */
const note: BodyContract = {
  category: 'note',
  schema: json({ type: 'object' }),
  judge: body =>
    JSON.stringify(body).includes('"text"')
      ? { ok: true }
      : { ok: false, rejected: 'category note says: a note needs a text' },
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
}

/** A bundle is a directory with a bundle.json at its top. */
const bundle: BodyContract = {
  category: 'bundle',
  schema: json({ type: 'object' }),
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
  layout: {
    namespace: 'bundles',
    limits: { files: 8, fileBytes: 1024, totalBytes: 4096 },
    async inspect(reader) {
      const manifest = await reader.manifest()
      if ('failure' in manifest)
        return { failure: { kind: 'source-failed', failure: 'unavailable' } }
      return manifest.ok.entries.some(entry => entry.path === 'bundle.json')
        ? { ok: json({}) }
        : {
            failure: {
              kind: 'invalid-package',
              reason: 'bundle.json: client.members[0].point "shell.token" is not a point now',
            },
          }
    },
  },
}

const kit: BodyContract = { ...note, category: 'kit' }

export const NOTE: CategoryContribution = {
  contract: note,
  display: { title: '笔记', summary: '一段短文。', creation: 'a body with a text' },
  point: 'notes.items',
}
export const BUNDLE: CategoryContribution = {
  contract: bundle,
  display: {
    title: '包',
    summary: '一组成员。',
    creation: 'a directory with bundle.json on top',
    authoring: 'bundle.json, whole:\n{"members":[]}',
  },
  point: 'bundles.items',
}
export const KIT: CategoryContribution = {
  contract: kit,
  display: { title: '套件', summary: '随部署安装。' },
  generalCreation: 'closed',
  point: 'kits.items',
}

export function directoryOf(files: Readonly<Record<string, string>>): PackageReader {
  return {
    manifest: async () => ({
      ok: {
        entries: Object.entries(files).map(([path, text]) => ({
          path,
          bytes: text.length,
          digest: `d-${text}`,
        })),
      },
    }),
    open: async () => ({ failure: 'entry-not-found' }),
  }
}

type Principal = Readonly<{ tenant: string }>
type Holding = {
  ref: string
  capability: CapabilityId
  version: string
  enabled: boolean
  removed: boolean
  body?: JsonValue
}
type Operation = Readonly<{ input: string; recall: RecalledOperation }>

export type Call = Readonly<{
  method: string
  tenant: string
  principal: unknown
  operationId?: string
}>

/** The management and publishing services of one tenant layer, in memory, as the assets answer them. */
export function services(categories = createCategoryPoint()) {
  const holdings = new Map<string, Holding>()
  const operations = new Map<string, Operation>()
  const calls: Call[] = []
  const script: { next?: 'unknown' | 'throws' | 'conflict' } = {}
  /** Keys of holdings the deployment installed; a scripted answer of files replaces the service's. */
  const official = new Set<string>()
  const filesOver: { answer?: () => Promise<HeldFiles | Readonly<{ kind: 'denied' }>> } = {}
  let made = 0
  const admitted = (input: Readonly<{ tenant: string; principal: unknown }>) =>
    (input.principal as Principal).tenant === input.tenant
  const keyOf = (capability: CapabilityId) => `${capability.category}/${capability.name}`
  /** A scripted answer replaces what the service would have answered; an unknown one is still done. */
  function scripted<T>(operationId: string, answer: T): T | TenantPublishOutcome {
    const next = script.next
    delete script.next
    if (next === 'throws') throw new Error('the reply was lost')
    if (next === 'unknown') return { kind: 'unknown', operationId }
    if (next === 'conflict') return { kind: 'conflict' }
    return answer
  }
  const publishing: TenantPublishing<unknown> = {
    async publish(request) {
      const { tenant, principal, operationId, capability, content } = request
      calls.push({ method: 'publish', tenant, principal, operationId })
      if (!admitted(request)) return { kind: 'denied' }
      const listing = categories.describe(capability.category)
      if (listing === undefined) return { kind: 'unknown-category' }
      if ('unusable' in listing) return { kind: 'unavailable' }
      const body = content.kind === 'data' ? writeJsonText(content.body) : 'directory'
      const input = `${keyOf(capability)} ${content.kind} ${body}`
      const earlier = operations.get(operationId)
      if (earlier !== undefined)
        return earlier.input === input && earlier.recall.kind === 'publish'
          ? earlier.recall.outcome
          : { kind: 'operation-conflict' }
      if (listing.creation === 'none') return { kind: 'invalid', reason: 'creation-closed' }
      if (listing.creation === 'data' && content.kind === 'directory')
        return { kind: 'invalid', reason: 'not-a-directory-category' }
      if (listing.creation === 'directory' && content.kind === 'data')
        return { kind: 'invalid', reason: 'a-directory-category' }
      const contract = categories.lookup(capability.category)
      if (content.kind === 'data') {
        const judged = contract?.judge(content.body)
        if (judged !== undefined && !judged.ok) return { kind: 'invalid', reason: judged.rejected }
      } else {
        const inspected = await contract?.layout?.inspect(content.from)
        if (inspected !== undefined && 'failure' in inspected)
          return {
            kind: 'invalid',
            reason:
              inspected.failure.kind === 'invalid-package'
                ? inspected.failure.reason
                : inspected.failure.kind,
          }
      }
      made += 1
      const version = `sha256:v${made}`
      const held = holdings.get(keyOf(capability))
      const fresh = { ref: `held-${made}`, capability, version, enabled: true, removed: false }
      const holding = {
        ...(held === undefined || held.removed ? fresh : { ...held, version }),
        ...(content.kind === 'data' ? { body: content.body } : {}),
      }
      holdings.set(keyOf(capability), holding)
      const outcome: TenantPublishOutcome = {
        kind: 'published',
        version,
        holdingRef: holding.ref,
        changed: true,
      }
      operations.set(operationId, {
        input,
        recall: { kind: 'publish', capability, version, outcome },
      })
      return scripted(operationId, outcome)
    },
  }
  function change(
    method: 'setEnabled' | 'remove',
    input: Readonly<{
      tenant: string
      principal: unknown
      operationId: string
      holding: string
      enabled?: boolean
    }>,
  ): HoldingOutcome {
    calls.push({
      method,
      tenant: input.tenant,
      principal: input.principal,
      operationId: input.operationId,
    })
    if (!admitted(input)) return { kind: 'denied' }
    const key = `${method} ${input.holding} ${input.enabled}`
    const earlier = operations.get(input.operationId)
    if (earlier !== undefined)
      return earlier.input === key && earlier.recall.kind !== 'publish'
        ? earlier.recall.outcome
        : { kind: 'operation-conflict' }
    const holding = [...holdings.values()].find(one => one.ref === input.holding)
    if (holding === undefined) return { kind: 'absent' }
    if (holding.removed)
      return method === 'remove'
        ? { kind: 'no-change' }
        : { kind: 'not-writable', reason: 'removed' }
    if (method === 'setEnabled' && holding.enabled === input.enabled) return { kind: 'no-change' }
    if (method === 'remove') holding.removed = true
    else holding.enabled = input.enabled === true
    const outcome: HoldingOutcome = { kind: 'changed' }
    const capability = holding.capability
    operations.set(input.operationId, {
      input: key,
      recall:
        method === 'remove'
          ? { kind: 'remove', holding: holding.ref, capability, outcome }
          : {
              kind: 'setEnabled',
              holding: holding.ref,
              capability,
              enabled: holding.enabled,
              outcome,
            },
    })
    return scripted(input.operationId, outcome) as HoldingOutcome
  }
  const management = {
    async list(input) {
      calls.push({ method: 'list', tenant: input.tenant, principal: input.principal })
      if (!admitted(input)) return { kind: 'denied' }
      if (categories.describe(input.category) === undefined) return { kind: 'unknown-category' }
      const rows = [...holdings.values()]
        .filter(one => !one.removed && one.capability.category === input.category)
        .sort((left, right) => (left.capability.name < right.capability.name ? -1 : 1))
        .filter(one => input.after === null || one.capability.name > input.after)
      const items = rows.slice(0, input.limit).map(one => rowOf(one))
      const next = rows.length > input.limit ? (items.at(-1)?.capability.name ?? null) : null
      return { kind: 'page', items, next, completeness: 'complete' }
    },
    async describe(input): Promise<ManagedAsset> {
      calls.push({ method: 'describe', tenant: input.tenant, principal: input.principal })
      if (!admitted(input)) return { kind: 'denied' }
      const held = holdings.get(keyOf(input.capability))
      if (held === undefined || held.removed) return { kind: 'absent' }
      return {
        kind: 'asset',
        row: rowOf(held),
        revision: 1,
        content:
          held.capability.category === 'bundle'
            ? {
                kind: 'directory',
                entries: [
                  { path: 'bundle.json', bytes: 2 },
                  { path: 'a.js', bytes: 9 },
                ],
              }
            : { kind: 'data', body: held.body ?? json({ text: 'hi' }) },
        standing: held.enabled ? { kind: 'selected' } : { kind: 'filtered', reason: 'disabled' },
        settings: false,
      }
    },
    async files(input) {
      calls.push({ method: 'files', tenant: input.tenant, principal: input.principal })
      if (filesOver.answer !== undefined) return filesOver.answer()
      if (!admitted(input)) return { kind: 'denied' }
      const held = holdings.get(keyOf(input.capability))
      if (held === undefined || held.removed) return { kind: 'absent' }
      return held.capability.category === 'bundle'
        ? {
            kind: 'files',
            version: held.version,
            from: directoryOf({ 'bundle.json': '{}', 'a.js': 'let a = 1' }),
          }
        : { kind: 'body', version: held.version, body: held.body ?? json({ text: 'hi' }) }
    },
    setEnabled: async input => change('setEnabled', input),
    remove: async input => change('remove', input),
    async recallById(input) {
      calls.push({
        method: 'recallById',
        tenant: input.tenant,
        principal: input.principal,
        operationId: input.operationId,
      })
      if (!admitted(input)) return { kind: 'denied' }
      return operations.get(input.operationId)?.recall ?? { kind: 'absent' }
    },
  } satisfies Partial<TenantManagement<unknown>> as unknown as TenantManagement<unknown>
  function rowOf(one: Holding) {
    return {
      capability: one.capability,
      layer: 'tenant' as const,
      asset: keyOf(one.capability),
      version: one.version,
      selection: 'follow' as const,
      enabled: one.enabled,
      holding: one.ref,
      origin: official.has(keyOf(one.capability)) ? ('official' as const) : ('customized' as const),
      summary:
        one.capability.name === 'plain'
          ? null
          : {
              title: one.capability.name,
              description: `${one.capability.name} 的简介。`,
              facts: [],
            },
    }
  }
  const writes = () =>
    calls.filter(call => ['publish', 'setEnabled', 'remove'].includes(call.method))
  return {
    categories,
    publishing,
    management,
    calls,
    writes,
    script,
    holdings,
    official,
    filesOver,
  }
}

export const PLACED: Awaited<ReturnType<Placement['of']>> = {
  kind: 'placed',
  places: [
    {
      point: 'shell.part-style',
      key: 'session.composer.send',
      standing: 'in effect',
      says: 'shadows built-in',
    },
  ],
  clients: [{ label: 'desktop, connected', says: 'loaded' }],
  advice: null,
}

export function author(maximum = 65_536) {
  const created = createExtensionsAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const registration = read
  const definition = deriveDefinition(
    {
      asset: { name: 'OmneExtensions', adoption: extensionsToolModule.executor },
      requiredCapabilities: [],
    },
    created.ok.facts,
  )
  /** Cuts the params of the named command out of a whole call and parses them, as the binding does. */
  function decode(command: string, params: unknown) {
    const operation = registration.operations.find(([name]) => name === command)?.[1]
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in cut) return cut
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    return operation.author.parameters.parse(cut.ok)
  }
  return { definition, registration, decode }
}

const tool = author()

export type World = ReturnType<typeof services> & {
  faces: 'present' | 'absent' | 'throws'
  revision: string | null
  directories: Map<string, PackageReader | 'outside' | 'unavailable'>
  impact: ChangeImpact
  impactAsked: Parameters<ChangeImpact['of']>[0][]
  placement: Placement
  place: ExtensionsCallSource['place']
  placeAsked: Readonly<{ dir: string; from: PackageReader }>[]
  settings: SettingsScript
}

/** The settings of the held assets as the tenant layer answers them; a write changes the item it names. */
export type SettingsScript = {
  face: 'present' | 'absent'
  items: Map<string, HeldSetting[]>
  read?: 'denied' | 'unavailable'
  next?: SettingWritten
  written: Parameters<HeldSettings['write']>[0][]
}

export const DOCS_SETTINGS: readonly HeldSetting[] = [
  {
    kind: 'ordinary',
    item: 'target',
    title: '连接目标',
    revision: '4',
    schema: { type: 'string' },
    own: { kind: 'set', value: 'https://docs.example/mcp' },
    effective: { kind: 'set', value: 'https://docs.example/mcp' },
    source: 'tenant',
    writable: 'yes',
  },
  {
    kind: 'ordinary',
    item: 'program-calls',
    title: '程序调用',
    revision: '4',
    schema: { type: 'boolean' },
    own: { kind: 'unset' },
    effective: { kind: 'set', value: false },
    source: 'default',
    writable: 'yes',
  },
  {
    kind: 'ordinary',
    item: 'region',
    title: '区域',
    revision: '4',
    schema: { enum: ['eu', 'us'] },
    own: { kind: 'unset' },
    effective: { kind: 'set', value: 'eu' },
    source: 'organization',
    writable: 'locked',
  },
  { kind: 'secret', item: 'credential', title: '凭据', revision: '0', configured: 'yes' },
  { kind: 'permission', item: 'invoke', title: '调用这个接入点的动作', revision: '4' },
]

function settingsFace(script: SettingsScript): HeldSettings {
  const keyOf = (asset: Readonly<{ category: string; name: string }>) =>
    `${asset.category}/${asset.name}`
  return {
    async list(asset) {
      return script.read ?? script.items.get(keyOf(asset)) ?? 'not-held'
    },
    async write(input) {
      script.written.push(input)
      const { next } = script
      delete script.next
      if (next !== undefined && next !== 'written') return next
      const items = script.items.get(keyOf(input.asset)) ?? []
      const at = items.findIndex(one => one.item === input.item)
      const found = items[at]
      if (found?.kind !== 'ordinary') return 'invalid'
      const own = input.change.kind === 'set' ? input.change : ({ kind: 'unset' } as const)
      items[at] = { ...found, own, effective: own, source: 'tenant', revision: '5' }
      return 'written'
    },
  }
}

export function world(over: Partial<World> = {}): World {
  const categories = createCategoryPoint()
  categories.contribute(NOTE)
  categories.contribute(BUNDLE)
  categories.contribute(KIT)
  const made = services(categories)
  const impactAsked: Parameters<ChangeImpact['of']>[0][] = []
  const placeAsked: World['placeAsked'][number][] = []
  return {
    ...made,
    faces: 'present',
    revision: '7c1f.41',
    directories: new Map<string, PackageReader | 'outside' | 'unavailable'>([
      ['plugins/pill-send', directoryOf({ 'bundle.json': '{}' })],
      ['plugins/broken', directoryOf({ 'README.md': 'x' })],
      ['plugins/far', 'unavailable'],
      ['/elsewhere/skin', 'outside'],
    ]),
    impactAsked,
    impact: {
      async of(input) {
        impactAsked.push(input)
        return { kind: 'changes', lines: [], loads: null, advice: null }
      },
    },
    placement: { of: async () => PLACED },
    placeAsked,
    settings: { face: 'present', items: new Map(), written: [] },
    /** Writes into a fresh directory: as many files and bytes as the manifest says. */
    async place(dir, from) {
      placeAsked.push({ dir, from })
      const manifest = await from.manifest()
      if ('failure' in manifest) return { kind: 'unavailable' }
      const entries = manifest.ok.entries
      const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
      return { kind: 'written', files: entries.length, bytes } satisfies Placed
    },
    ...over,
  }
}

export const ALICE = {
  tenant: 'tenant-a',
  principal: { tenant: 'tenant-a', agent: 'agent-7' },
} as const

/** A call source over a world the test changes in place. */
export function bound(w: World) {
  const source: ExtensionsCallSource = {
    ...ALICE,
    faces() {
      if (w.faces === 'throws') throw new Error('the assets are not there')
      return w.faces === 'absent'
        ? undefined
        : { categories: w.categories, management: w.management, publishing: w.publishing }
    },
    async directory(path) {
      return w.directories.get(path) ?? 'absent'
    },
    impact: { of: input => w.impact.of(input) },
    placement: { of: input => w.placement.of(input) },
    place: (dir, from) => w.place(dir, from),
    settings: () => (w.settings.face === 'absent' ? undefined : settingsFace(w.settings)),
    revision: () => w.revision,
  }
  const execution = attachExtensionsSource(scope(), source)
  async function run(command: string, params: unknown = {}) {
    const parsed = tool.decode(command, params)
    if ('failure' in parsed) return { failure: parsed.failure }
    return answerExtensions(parsed.ok as never, execution.context)
  }
  async function text(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    return answer.ok
  }
  async function failure(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if (!('failure' in answer)) throw new Error(`expected a failure, got ${answer.ok}`)
    return answer.failure as { kind: string; reason: string; operation?: string }
  }
  return { run, text, failure, source }
}

export function scope() {
  const created = createIndependentToolScope({
    signal: new AbortController().signal,
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    process: null,
    waits: null,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  return created.ok
}

export type { JsonValue }
