// @module-tag slow
// The `agent-host` row: the real local Agent host (`agentHostPlugin` of
// `@omne-harness/agent-host-local/cordis`) on a real Cordis, carried by the row body in the
// `business` phase. The row is ACTIVE and provides the host faces once all fourteen injects of the
// assembly page are present; with any one absent it stays PENDING and names that key. The injects
// are test stand-ins: the ports of `@omne-harness/agent/testing` behind the abstract services of
// `agent-cordis-contract`, the three receiving keys (`agentJournalEntries`, `agentMaterials`,
// `agentAccountOutlet`) as services nobody calls, and the host principal as a root object. The real
// providers are other rows and the assembly entry. The host has no ordered stop yet: its handle
// answers `incomplete` and says so; it never claims `settled`.
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import {
  AgentAccessCheckService,
  AgentAccountOutletService,
  AgentAdoptionsService,
  AgentClockService,
  AgentJournalEntriesService,
  AgentJournalService,
  AgentMaterialsService,
  CurrentConditionsService,
  MessageHandoffService,
  ModelContextReaderService,
  ModelSelectionService,
  RequestPreparationService,
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentPublicationAuthorityKey,
  type AgentInstanceProvisionService,
} from '@omne-harness/agent-cordis-contract/cordis'
import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import { ModelRuntimeService } from '@omne-harness/model-cordis-contract/cordis'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'
import { agentHostRow } from '../../../src/rows/agent-host/index.ts'
import { agentInstancesRow } from '../../../src/rows/agent-instances/index.ts'
import type { EntryObjectModule, RowId } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}
const tenant = tenantOf(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)
const scope = { owner: 'session', record: 'slot-session', revision: '1', digest: 'sha256:s' }
const definition = { owner: 'agents', name: 'planner', revision: '1', digest: 'sha256:first' }

const hostConfig = {
  observerBufferBytes: 1024,
  reconciliationDelayMs: 0,
  reconciliationBatchLimit: 8,
  denialBackoffMs: 0,
  toolConcurrency: 1,
  jointCommits: [] as string[],
  coordination: 'standalone',
  loopGuardPolicy: { owner: 'agents', name: 'loop-guard', revision: '1', digest: 'sha256:guard' },
  instanceIdleMs: 60_000,
}

/** The fourteen injects of the row, in the order of the assembly page. */
const INJECTS = [
  'agentJournal',
  'agentJournalEntries',
  'agentMaterials',
  'agentAccessCheck',
  'agentAdoptions',
  'agentConditions',
  'agentRequests',
  'agentModelSelection',
  'agentModelContext',
  'agentMessageHandoff',
  'agentAccountOutlet',
  'modelRuntime',
  'agentClock',
  'agentHostPrincipal',
] as const
type Inject = (typeof INJECTS)[number]

type Constructor = new (ctx: Context) => object
// The definition classes are abstract only to TypeScript; the stand-in gives each its members.
const definitions: Readonly<Record<Exclude<Inject, 'agentHostPrincipal'>, unknown>> = {
  agentJournal: AgentJournalService,
  agentJournalEntries: AgentJournalEntriesService,
  agentMaterials: AgentMaterialsService,
  agentAccessCheck: AgentAccessCheckService,
  agentAdoptions: AgentAdoptionsService,
  agentConditions: CurrentConditionsService,
  agentRequests: RequestPreparationService,
  agentModelSelection: ModelSelectionService,
  agentModelContext: ModelContextReaderService,
  agentMessageHandoff: MessageHandoffService,
  agentAccountOutlet: AgentAccountOutletService,
  modelRuntime: ModelRuntimeService,
  agentClock: AgentClockService,
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

function principalObject(): EntryObjectModule {
  return {
    name: 'agentHostPrincipal',
    implementation: 'contract-double',
    install(installScope: Context) {
      installScope.provide('agentHostPrincipal', 'agent-host-maintainer')
    },
  }
}

/** One stand-in row that provides every service key of the injects except `omit`. */
function doubleRow(omit: Inject | null) {
  const { dependencies, controls } = createTestAgentDependencies<string>()
  controls.access.check.always(input => ({
    kind: 'allowed',
    evidence: { ...scope, record: `access/${input.operation}` },
  }))
  const ports: Readonly<Record<Exclude<Inject, 'agentHostPrincipal'>, object>> = {
    agentJournal: controls.journal.port,
    agentJournalEntries: {},
    agentMaterials: {},
    agentAccessCheck: controls.access.port,
    agentAdoptions: controls.adoptions.port,
    agentConditions: controls.conditions.port,
    agentRequests: controls.requests.port,
    agentModelSelection: controls.selection.port,
    agentModelContext: controls.modelContext.port,
    agentMessageHandoff: controls.handoff.port,
    agentAccountOutlet: {},
    modelRuntime: dependencies.models,
    agentClock: controls.clock.port,
  }
  const keys = (Object.keys(definitions) as (keyof typeof definitions)[]).filter(
    key => key !== omit,
  )
  return declared(
    defineRow({
      row: 'agent-host-doubles',
      implementation: 'contract-double',
      manifest: { provides: keys, injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'agent-host-doubles',
        apply(ctx: Context) {
          for (const key of keys) {
            const Definition = definitions[key] as Constructor
            Object.assign(new Definition(ctx), ports[key])
          }
        },
      },
    }),
  )
}

async function start(options: {
  omit: Inject | null
  config?: unknown
  directory?: boolean
}): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const complete = options.omit === null
  const tree = await loadTree({
    base,
    rows: [
      doubleRow(options.omit),
      declared(agentHostRow, options.config ?? hostConfig),
      ...(options.directory === true ? [declared(agentInstancesRow)] : []),
    ],
    entryObjects: options.omit === 'agentHostPrincipal' ? [] : [principalObject()],
    readinessTimeoutMs: complete && options.config === undefined ? 10_000 : 1500,
  })
  release.push(() => tree.dispose())
  return tree
}

type Schema = { '~standard': { validate(value: unknown): { issues?: unknown } } }
function accepts(value: unknown): boolean {
  const config = agentHostRow.Config as Schema | undefined
  expect(config).toBeDefined()
  return config?.['~standard'].validate(value).issues === undefined
}

describe('the agent-host row: declaration', () => {
  it('is the real row and equals the table row of the assembly page, in the business phase', () => {
    const declaration = rowDeclarationOf(agentHostRow)
    expect(declaration).toEqual({
      row: 'agent-host',
      implementation: 'real',
      manifest: {
        provides: [
          'agentPublicationAuthority',
          'agentExecutionRecovery',
          'agentExecutionControl',
          'agentInstanceProvision',
        ],
        injects: [...INJECTS],
        phase: 'business',
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'body', phase: 'business' },
    })
    const table = serveProfile().stubManifests.get('agent-host' as RowId)
    expect(declaration?.manifest).toEqual(table)
  })

  it('accepts the factory configuration with `instanceIdleMs` and `jointCommits`', () => {
    expect(accepts(hostConfig)).toBe(true)
    expect(accepts({ ...hostConfig, jointCommits: ['message', 'custody'] })).toBe(true)
  })

  it('refuses a missing configuration, an unknown field, a zero idle time and a repeated kind', () => {
    expect(accepts(undefined)).toBe(false)
    expect(accepts({ ...hostConfig, tenant: 'org' })).toBe(false)
    expect(accepts({ ...hostConfig, instanceIdleMs: 0 })).toBe(false)
    expect(accepts({ ...hostConfig, jointCommits: ['message', 'message'] })).toBe(false)
  })
})

describe('the agent-host row: on test stand-ins of its fourteen injects', () => {
  it('is ACTIVE and provides the faces of the page', { timeout: 60_000 }, async () => {
    const tree = await start({ omit: null })
    expect(tree.allActive).toBe(true)
    expect(tree.state('agent-host')).toMatchObject({ state: 'ACTIVE', missing: [] })
    for (const key of [
      agentPublicationAuthorityKey,
      agentExecutionRecoveryKey,
      agentExecutionControlKey,
      agentInstanceProvisionKey,
    ])
      expect(tree.service(key), key).toBeDefined()
  })

  it.each(INJECTS)(
    'without `%s` stays PENDING and names exactly that key',
    { timeout: 60_000 },
    async key => {
      const tree = await start({ omit: key })
      expect(tree.state('agent-host')).toMatchObject({ state: 'PENDING', missing: [key] })
      expect(tree.service(agentInstanceProvisionKey)).toBeUndefined()
      expect(tree.service(agentPublicationAuthorityKey)).toBeUndefined()
    },
  )

  it('acquires an instance through the provision face', { timeout: 60_000 }, async () => {
    // The real `agent-instances` row is the directory the host publishes into.
    const tree = await start({ omit: null, directory: true })
    const provision =
      tree.service<AgentInstanceProvisionService<string>>(agentInstanceProvisionKey)!
    const acquired = await provision.acquire({
      principal: 'caller-a',
      tenant,
      scope,
      definition,
    })
    expect(acquired).toMatchObject({ ok: { instance: expect.any(String) } })
  })

  it('fails the row on a configuration the plugin refuses', { timeout: 60_000 }, async () => {
    const tree = await start({ omit: null, config: { ...hostConfig, instanceIdleMs: 0 } })
    expect(tree.state('agent-host').state).toBe('FAILED')
    expect(tree.service(agentInstanceProvisionKey)).toBeUndefined()
  })

  it(
    'registers a business-phase handle that does not claim an ordered stop it lacks',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ omit: null })
      const report = await tree.shutdown()
      const outcome = report.outcomes.find(entry => entry.row === 'agent-host')
      expect(outcome?.phase).toBe('business')
      expect(outcome?.result.kind).toBe('incomplete')
      expect(report.overall).toBe('incomplete')
    },
  )
})
