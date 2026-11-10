// Shared fixtures of the `agent-adoptions` and `adoption-sources` tests: mapping configurations, a
// probe row that captures the live services of the tree, and a harness that holds the tree open
// while a test calls them.
import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/identity'
import { succeed } from '@omne-harness/operation-result'
import type { DefinitionMappings } from '@omne-harness/server-entry/cordis'
import {
  SessionWorkPrincipalsService,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type {
  AdoptionEvidenceCommand,
  Adoption,
  GuardCommand,
} from '@omne-harness/session-contract'
import { creation, memoryAccess, operationId } from '@omne-harness/session-contract/testing'
import { stubPlugin } from '../../../src/cordis.ts'
import { entryObjects as releaseEntryObjects } from '../../../src/entry/index.ts'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { createSessionWorkPrincipals } from '../../../src/entry/session-work-principals.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow } from '../../../src/row.ts'
import { adoptionSourcesRow } from '../../../src/rows/adoption-sources/index.ts'
import type { AdoptionSourcesImpl } from '../../../src/rows/adoption-sources/sources.ts'
import { agentAdoptionsRow } from '../../../src/rows/agent-adoptions/index.ts'
import type { AgentAdoptionsImpl } from '../../../src/rows/agent-adoptions/services.ts'
import type { EntryObjectModule, RowId } from '../../../src/types.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'

type Plain = Record<string, unknown>

export const adoptionOf = (owner: string, name: string): Adoption => ({
  owner,
  name,
  revision: '1',
  digest: `sha256:${name}`,
})

export const execution = adoptionOf('test-agent', 'generic')
export const entryContract = adoptionOf('test-entry', 'chat')
export const environment = adoptionOf('test-env', 'local')
export const candidateOf = (name: string): Adoption => adoptionOf('test-assets', name)
export const requiredIdentities = [{ capability: 'model', name: 'default' }] as const
export const modesOf = (collaboration: 'co-work' | 'auto-drive' = 'co-work') =>
  ({ permission: 'never', environment, collaboration }) as const

/** One mapping entry as it is written in the distribution file. */
export const entryConfig = (name: string, patch: Plain = {}): Plain => ({
  name,
  candidate: candidateOf(name),
  execution,
  entryContract,
  requiredIdentities,
  modes: modesOf(),
  definition: { category: 'AgentDefinition', name, references: [], attributes: [] },
  extensions: [],
  ...patch,
})

export const mappingConfig = (...entries: Plain[]): Plain => ({
  mappings: entries.length === 0 ? [entryConfig('alpha'), entryConfig('beta')] : entries,
})

/** The services of the tree, as the probe row sees them. */
export type Captured = Readonly<{
  agent: AgentAdoptionsImpl
  mappings: DefinitionMappings
  source: AdoptionSourcesImpl
}>

const PROBE = 'adoptions-probe' as RowId
const PROBE_INJECTS = ['agentAdoptions', 'definitionMappings', 'sessionAdoptionSource']

function probeRow(capture: (captured: Captured) => void) {
  return defineRow({
    row: PROBE,
    implementation: 'real',
    manifest: { provides: [], injects: PROBE_INJECTS, sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'adoptions-probe',
      inject: PROBE_INJECTS,
      apply(ctx: Context) {
        capture({
          agent: ctx.agentAdoptions as unknown as AgentAdoptionsImpl,
          mappings: ctx.definitionMappings,
          source: ctx.sessionAdoptionSource as unknown as AdoptionSourcesImpl,
        })
      },
    },
  })
}

const rows = (config: unknown) => [
  { id: 'agent-adoptions', plugin: 'agentAdoptionsRow', config },
  { id: 'adoption-sources', plugin: 'adoptionSourcesRow', config: {} },
]

const visibility = new Map([...serveProfile().visibility, [PROBE, ['definitionMappings']]])

/**
 * The release entry objects, with the entry's real `sessionWorkPrincipals` reading a Session
 * ownership stand-in that has bound no session: a first creation, before Session committed anything.
 * The work principal is then denied, which tells `create` that there is no original initialization to
 * recall (adoption-sources docs「create 的模式注册」), so the mapping decides.
 */
export const firstCreationEntryObjects: readonly EntryObjectModule[] = releaseEntryObjects.map(
  module =>
    module.name !== sessionWorkPrincipalsKey
      ? module
      : {
          name: sessionWorkPrincipalsKey,
          implementation: 'contract-double',
          install(scope, env) {
            const work = createSessionWorkPrincipals({
              issue: sessionWorkIssuerOf(env),
              readBindings: () => ({ read: async () => succeed({ kind: 'not-bound' as const }) }),
            })
            class Work extends SessionWorkPrincipalsService<Principal> {
              readonly forSession = work.forSession
            }
            new Work(scope)
          },
        },
)

/** Starts the two rows and a probe, runs `use` against the live services, then stops the tree. */
export async function withLiveTree<T>(
  config: unknown,
  use: (captured: Captured) => Promise<T> | T,
  options: Readonly<{ entryObjects?: readonly EntryObjectModule[] }> = {},
): Promise<{ value: T; run: ServeRun }> {
  const stop = new AbortController()
  let ready: (captured: Captured) => void = () => {}
  const captured = new Promise<Captured>(resolve => {
    ready = resolve
  })
  const running = serveOnce({
    distribution: { rows: [...rows(config), { id: PROBE, plugin: 'probe', config: {} }] },
    plugins: { stubPlugin, agentAdoptionsRow, adoptionSourcesRow, probe: probeRow(ready) },
    visibility,
    ...(options.entryObjects === undefined ? {} : { entryObjects: options.entryObjects }),
    stopAfterStartup: false,
    stop: stop.signal,
  })
  try {
    const services = await Promise.race([
      captured,
      running.then(run => {
        throw new Error(`the tree ended before the probe ran: ${JSON.stringify(run.stderr)}`)
      }),
    ])
    const value = await use(services)
    stop.abort('test done')
    return { value, run: await running }
  } catch (error) {
    stop.abort('test failed')
    await running.catch(() => undefined)
    throw error
  }
}

/** Starts only the two rows and returns the whole run (for configurations that must not start). */
export function serveRows(config: unknown): Promise<ServeRun> {
  return serveOnce({
    distribution: { rows: rows(config) },
    plugins: { stubPlugin, agentAdoptionsRow, adoptionSourcesRow },
  })
}

export const access = memoryAccess({ kind: 'test-principal' })
const base = { tenant: access.tenant, session: access.session, operation: operationId('op-1') }

type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>
type StartRun = Extract<AdoptionEvidenceCommand, { kind: 'startRun' }>
type Reload = Extract<AdoptionEvidenceCommand, { kind: 'reload' }>

/** A creation that matches the mapping entry `name` of `entryConfig`, so the source accepts it. */
export function createCommand(
  name: string,
  overrides: Partial<Create['input']['creation']> = {},
): Create {
  return {
    kind: 'create',
    input: {
      ...base,
      creation: creation({
        definition: { name, candidate: candidateOf(name) },
        execution,
        entryContract,
        requiredIdentities,
        modes: { kind: 'explicit', value: modesOf() },
        ...overrides,
      }),
    },
  }
}

export const startRunCommand = (candidate: Adoption): StartRun => ({
  kind: 'startRun',
  input: {
    ...base,
    entry: 'ordinary' as never,
    candidate,
    instance: { owner: 'agent', id: 'instance-1' },
  },
})

export const reloadCommand = (candidate: Adoption): Reload => ({
  kind: 'reload',
  input: {
    ...base,
    run: 'run-1' as never,
    candidate,
    instance: { owner: 'agent', id: 'instance-1' },
    expected: 1 as never,
    handover: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
  },
})

/** The plain value of a JSON tree. A `JsonValue` field inside the facts is itself such a tree. */
export function plainOf(tree: unknown): unknown {
  const node = tree as GuardCommand['facts']
  switch (node.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return node.value
    case 'number':
      return Number(node.lexeme)
    case 'array':
      return node.items.map(plainOf)
    case 'object':
      return Object.fromEntries(node.entries.map(({ key, value }) => [key, plainOf(value)]))
  }
}

/** The plain content of a guard's `facts` tree, for assertions on what the material says. */
export function factsOf(guard: GuardCommand): Plain {
  return plainOf(guard.facts) as Plain
}
