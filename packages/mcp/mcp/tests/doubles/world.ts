// Test helper: the five ports as in-memory doubles plus the scripted transport factory, with the
// adoptions and credentials that most cases start from.
import type {
  ActionCatalogRecord,
  CatalogKey,
  CatalogState,
  ConnectionTarget,
  CredentialBinding,
  EndpointRef,
  EndpointSettings,
  McpConfig,
  McpPorts,
  Millis,
  SettingValue,
  StopScope,
} from '@omne-harness/mcp-contract'
import { completeListing, mergeListing } from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint, ProcessSetting } from '@omne-harness/mcp-contract/provider'
import {
  createMemoryCatalogStore,
  type MemoryCatalogStore,
} from '@omne-harness/mcp-contract/testing'
import {
  countedAdoption,
  countedCredentials,
  countedEligibility,
  countedOutputCheck,
  scriptedLanding,
  type Counted,
  type CountedCredentials,
  type CountedOutputCheck,
  type ScriptedLanding,
} from './ports.ts'
import { scriptedTransports, type ScriptedTransports, type Step } from './scripted-transport.ts'
import type { MemoryAdoptionView, MemoryUseEligibility } from '@omne-harness/mcp-contract/testing'
import {
  credentialBindingOf,
  generationOf,
  jsonOf,
  millisOf,
  peerIdentityOf,
  connectionTargetOf,
} from '@omne-harness/mcp-contract/testing'
import { alice, home, principalKey } from './identities.ts'
import type { Principal } from './identities.ts'

export type World = Readonly<{
  ports: McpPorts<Principal, string>
  config: McpConfig<Principal>
  adoption: Counted<MemoryAdoptionView<Principal, string>>
  eligibility: Counted<MemoryUseEligibility<Principal>>
  credentials: CountedCredentials
  landing: ScriptedLanding
  store: MemoryCatalogStore
  transports: ScriptedTransports
  /** The output validator and its call count. */
  checks: CountedOutputCheck
  /** The close-order events of transports, processes and credential handles, in order. */
  trace: readonly string[]
}>

export const TARGET: ConnectionTarget = connectionTargetOf('https://files.example.test/mcp')
export const MAIN: CredentialBinding = credentialBindingOf('main')
export const TIMEOUT: Millis = millisOf(30_000)

export const CONFIG: McpConfig<Principal> = {
  principalKey,
  maxListingPages: 3,
  maxActions: 50,
  instructionsByteLimit: 4096,
}

export function world(
  options: Readonly<{
    script?: readonly Step[]
    stop?: StopScope
    facilities?: readonly string[]
    config?: Partial<McpConfig<Principal>>
  }> = {},
): World {
  const trace: string[] = []
  const record = (event: string) => {
    trace.push(event)
  }
  const adoption = countedAdoption()
  const eligibility = countedEligibility()
  const credentials = countedCredentials(record)
  const landing = scriptedLanding({
    facilities: options.facilities ?? [],
    trace: record,
    ...(options.stop === undefined ? {} : { stop: options.stop }),
  })
  const store = createMemoryCatalogStore()
  const transports = scriptedTransports(options.script ?? [], record)
  const checks = countedOutputCheck()
  return {
    ports: {
      adoption,
      eligibility,
      credentials,
      landing,
      store,
      transports,
      checkOutput: checks.check,
      clock: { now: () => new Date('2026-11-03T12:00:00Z') },
    },
    config: { ...CONFIG, ...options.config },
    adoption,
    eligibility,
    credentials,
    landing,
    store,
    transports,
    checks,
    trace,
  }
}

const ABSENT: SettingValue<never> = { kind: 'absent' }

export type Settings = Partial<EndpointSettings>

export function settingsOf(given: Settings = {}): EndpointSettings {
  return {
    target: given.target ?? ABSENT,
    credential: given.credential ?? ABSENT,
    connectTimeout: given.connectTimeout ?? ABSENT,
  }
}

export const VALUE = <T>(value: T): SettingValue<T> => ({ kind: 'value', value })
export const INVALID: SettingValue<never> = { kind: 'invalid', text: 'nonsense' }

/** The ports a case adopts into: the world's, or the peer world's of `peer.ts`. */
export type Adopting = Pick<World, 'adoption' | 'eligibility' | 'credentials'>

/** A ready-to-use stdio adoption for alice: `files`, `auth` none unless given, granted. */
export function adoptStdio(
  w: Adopting,
  ref: EndpointRef,
  options: Readonly<{
    auth?: 'none' | 'static'
    env?: readonly Readonly<{ name: string; source: 'setting' | 'credential' }>[]
    processEnv?: readonly ProcessSetting[]
    settings?: Settings
    facilities?: readonly string[]
    scope?: string
  }> = {},
): AdoptedEndpoint {
  const auth = options.auth ?? 'none'
  const adopted = w.adoption.adopt({
    tenant: home,
    scope: options.scope ?? 'ws',
    ref,
    body: jsonOf({
      name: ref.name,
      transport: 'stdio',
      auth,
      launch: {
        command: 'mcp-files',
        env: options.env ?? [],
        facilities: options.facilities ?? [],
      },
    }),
    settings: settingsOf({
      connectTimeout: VALUE(TIMEOUT),
      ...(auth === 'none' ? {} : { credential: VALUE(MAIN) }),
      ...options.settings,
    }),
    processEnv: options.processEnv ?? [],
  })
  w.eligibility.grant(alice, ref)
  if (auth !== 'none')
    w.credentials.store({ tenant: home, holding: ref.holding, binding: MAIN, secret: 'hunter2' })
  return adopted
}

/** A ready-to-use Streamable HTTP adoption for alice, `auth` static unless given, granted. */
export function adoptHttp(
  w: Adopting,
  ref: EndpointRef,
  options: Readonly<{
    auth?: 'none' | 'static' | 'oauth'
    settings?: Settings
    scope?: string
  }> = {},
): AdoptedEndpoint {
  const auth = options.auth ?? 'static'
  const adopted = w.adoption.adopt({
    tenant: home,
    scope: options.scope ?? 'ws',
    ref,
    body: jsonOf({ name: ref.name, transport: 'streamable-http', auth }),
    settings: settingsOf({
      target: VALUE(TARGET),
      connectTimeout: VALUE(TIMEOUT),
      ...(auth === 'none' ? {} : { credential: VALUE(MAIN) }),
      ...options.settings,
    }),
  })
  w.eligibility.grant(alice, ref)
  if (auth !== 'none')
    w.credentials.store({ tenant: home, holding: ref.holding, binding: MAIN, secret: 'hunter2' })
  return adopted
}

/** One `tools/list` page with the named tools. */
export function page(names: readonly string[], nextCursor?: string) {
  const tools = names.map(name => jsonOf({ name, inputSchema: { type: 'object' } }))
  return nextCursor === undefined ? { tools } : { tools, nextCursor }
}

/** The usual lawful script: open, discover, one page. */
export function usualScript(names: readonly string[] = ['read']): Step[] {
  return [{ discover: peerIdentityOf() }, { listActions: page(names) }]
}

/** A record of revision `revision` built by the public functions, written into the store. */
export async function storedRecord(
  w: Pick<World, 'store'>,
  key: CatalogKey,
  names: readonly string[],
): Promise<ActionCatalogRecord> {
  const state: CatalogState = { kind: 'not-acquired' }
  const listing = completeListing({
    basedOn: 'absent',
    pages: [{ ok: page(names) }],
    basis: {
      generation: generationOf(1),
      protocolVersion: peerIdentityOf().protocolVersion,
      capabilities: jsonOf({ tools: {} }),
    },
    acquiredAt: '2026-11-03T00:00:00Z',
    limits: { maxPages: 1, maxActions: names.length },
  })
  if ('failure' in listing) throw new TypeError(listing.failure)
  const merged = mergeListing(state, listing.ok)
  if ('failure' in merged) throw new TypeError(merged.failure)
  const written = await w.store.write(key, merged.ok, 'absent')
  if ('failure' in written) throw new TypeError(written.failure)
  return merged.ok
}
