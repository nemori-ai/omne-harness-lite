import { Service, type Context } from '@deepseek-ai/cordis'
import type { Failure, ModelSelection } from '@omne-harness/agent-contract'
import {
  decodeProviderName,
  decodeRevision,
  type Adoption,
  type DurableEvidence,
  type ModalityRequirement,
  type ModelProfile,
  type ProfileResolution,
} from '@omne-harness/model-contract'
import { ModelProfilesService, modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { createScriptedModelProfiles } from '@omne-harness/model-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  SessionModelSelection,
} from '@omne-harness/session-contract'
import { evidence, memoryAccess, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import { SessionService, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import {
  SESSION_EXECUTION_HANDLER,
  SESSION_READ_PROTOCOL,
} from '@omne-harness/session-storage-sql/participants'
import type { JsonValue, ReadResult, TenantDomainLookupResult } from '@omne-harness/sql-contract'
import {
  StorageService,
  TenantDomainLookupService,
  storageKey,
  tenantDomainLookupKey,
} from '@omne-harness/sql-contract/cordis'
import { stubPlugin } from '../../../src/cordis.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow } from '../../../src/row.ts'
import {
  createAgentModelSelectionRow,
  type SelectionBindings,
} from '../../../src/rows/agent-model-selection/index.ts'
import type { RowId, ServiceName } from '../../../src/types.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'

export type SelectInput = Parameters<ModelSelection<unknown>['select']>[0]

export const sessionAccess = memoryAccess({ kind: 'agent-principal' })
export const SESSION: SessionId = sessionAccess.session
export const otherAccess = memoryOtherAccess({ kind: 'other-principal' })
export const EXECUTION = 'execution-1'
export const RUN = 'run-1'

const textOf = (tenant: SessionAccess<unknown>['tenant']): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('the testing tenant is not minted')
  return encoded.value
}
export const TENANT_TEXT = textOf(sessionAccess.tenant)
export const OTHER_TENANT_TEXT = textOf(otherAccess.tenant)

const adoption = (name: string): Adoption => ({
  owner: 'test',
  name,
  revision: '1',
  digest: `sha256:${name}`,
})
const evidenceOf = (label: string): DurableEvidence => ({
  owner: 'test',
  record: label,
  revision: '1',
  digest: `digest-${label}`,
})

export const selectInput: SelectInput = {
  principal: sessionAccess.principal,
  tenant: sessionAccess.tenant,
  advance: {
    execution: EXECUTION as never,
    executionAttachment: 'attachment-1' as never,
    instance: 'instance-1' as never,
    generation: '1',
    source: evidenceOf('advance'),
  },
  scope: evidenceOf('scope'),
  purpose: 'main',
  position: { owner: 'agent', work: 'execution-1/step-1', position: 'I3', purpose: 'main' },
  history: evidenceOf('history'),
  conditions: {
    source: evidenceOf('conditions'),
    configuration: adoption('configuration'),
    progression: undefined as never,
    model: adoption('model'),
    context: evidenceOf('context'),
    bindings: [],
  },
  alterations: [],
}

export const SAVED_SOURCE = evidence('session/model-selected-1')
export const savedSelection = (name: string): SessionModelSelection => ({
  selection: { name, basis: evidence(`basis/${name}`) },
  revision: '7' as never,
  source: SAVED_SOURCE,
})

export type SessionScript = (
  access: Readonly<{ principal: unknown; tenant: unknown; session: string }>,
) => Outcome<SessionModelSelection, SessionFailure>

export type SessionRecord = Readonly<{
  caller: string | undefined
  access: Readonly<{ principal: unknown; tenant: unknown; session: string }>
}>

export type WorkScript = (access: SessionRecord['access']) => Outcome<WorkSnapshot, SessionFailure>

export type SessionTrace = {
  reads: SessionRecord[]
  works: SessionRecord[]
  otherFaces: string[]
}

export function snapshotWith(run: WorkSnapshot['run'], session: string = SESSION): WorkSnapshot {
  return { session, run } as unknown as WorkSnapshot
}

export const activeRun = (run = RUN, execution = EXECUTION): WorkSnapshot['run'] =>
  ({
    kind: 'active',
    run,
    execution: { execution, revision: null, evidence: null, readThrough: '0' },
  }) as unknown as WorkSnapshot['run']

export const holdingWork: WorkScript = () => succeed(snapshotWith(activeRun()))

class SessionDouble extends SessionService<unknown> {
  readonly trace: SessionTrace
  readonly script: SessionScript
  readonly workScript: WorkScript
  constructor(ctx: Context, trace: SessionTrace, script: SessionScript, workScript: WorkScript) {
    super(ctx)
    this.trace = trace
    this.script = script
    this.workScript = workScript
  }

  get work(): SessionService<unknown>['work'] {
    const config: { caller?: string } = this[Service.resolveConfig]()
    const trace = this.trace
    const script = this.script
    const workScript = this.workScript
    return {
      readModelSelection: async (access: SessionRecord['access']) => {
        trace.reads.push({ caller: config.caller, access })
        return script(access)
      },
      readWork: async (access: SessionRecord['access']) => {
        trace.works.push({ caller: config.caller, access })
        return workScript(access)
      },
    } as never
  }
  get management(): SessionService<unknown>['management'] {
    this.trace.otherFaces.push('management')
    return {} as never
  }
  get reconciliation(): SessionService<unknown>['reconciliation'] {
    this.trace.otherFaces.push('reconciliation')
    return {} as never
  }
  get history(): SessionService<unknown>['history'] {
    this.trace.otherFaces.push('history')
    return {} as never
  }
}

export function sessionDoubleRow(
  trace: SessionTrace,
  script: SessionScript,
  workScript: WorkScript = holdingWork,
) {
  return defineRow({
    row: 'session-provider',
    implementation: 'contract-double',
    manifest: { provides: [sessionKey], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'session-double',
      apply(ctx: Context) {
        new SessionDouble(ctx, trace, script, workScript)
      },
    },
  })
}

const must = <T>(outcome: Outcome<T, unknown>): T => {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

export function profileOf(route: string): ModelProfile {
  const upstream = [{ supplier: adoption('supplier'), limit: { kind: 'unknown' } }] as const
  return {
    identity: { scope: { kind: 'factory' }, route },
    adoption: adoption(`profile-${route}`),
    revision: must(decodeRevision('1')),
    updatedAt: '2026-11-01T00:00:00Z',
    availability: 'active',
    definition: {
      suppliers: [
        {
          adoption: adoption('supplier'),
          provider: must(decodeProviderName('recipient')),
          model: 'model',
        },
      ],
      fallback: false,
      input: ['text', 'image'],
      output: ['text'],
      context: {
        window: { provided: '100', upstream },
        input: null,
        output: { provided: '10', upstream },
        compactionTriggerPercent: '80',
      },
      limits: [],
      parameters: [],
      representation: adoption('representation'),
      meter: adoption('meter'),
      retryPolicy: adoption('retry'),
    },
  }
}

export const resolvedOf = (
  profile: ModelProfile,
  over: Partial<Extract<ProfileResolution, { kind: 'resolved' }>> = {},
): ProfileResolution => ({
  kind: 'resolved',
  profile,
  source: evidenceOf(`profile/${profile.identity.route}`),
  selectable: true,
  reasons: [],
  credential: 'available',
  shadowed: [],
  ...over,
})

export const textRequirement: ModalityRequirement = {
  modalities: ['text'],
  source: selectInput.history,
}

export type ProfilesTrace = { resolves: unknown[] }
export type ProfilesTable =
  | Readonly<Record<string, ProfilesAnswer>>
  | ((route: string) => Promise<ProfilesAnswer>)
export type ProfilesAnswer = Awaited<ReturnType<ModelProfilesService<unknown>['resolve']>>

export function profilesDoubleRow(answers: ProfilesTable, trace: ProfilesTrace = { resolves: [] }) {
  const scripted = createScriptedModelProfiles<unknown>()
  scripted.setAccess({ principal: sessionAccess.principal, tenant: sessionAccess.tenant }, 'allow')
  const table = typeof answers === 'function' ? {} : answers
  for (const [route, answer] of Object.entries(table)) {
    scripted.setResolution(
      {
        principal: sessionAccess.principal,
        tenant: sessionAccess.tenant,
        route,
        required: textRequirement,
      },
      answer,
    )
  }
  class ProfilesDouble extends ModelProfilesService<unknown> {
    readonly list: ModelProfilesService<unknown>['list']
    readonly resolve: ModelProfilesService<unknown>['resolve']
    constructor(ctx: Context) {
      super(ctx)
      this.list = input => scripted.profiles.list(input)
      this.resolve = input => {
        trace.resolves.push(input)
        return typeof answers === 'function'
          ? answers(input.route)
          : scripted.profiles.resolve(input)
      }
    }
  }
  return {
    scripted,
    row: defineRow({
      row: 'model-profiles',
      implementation: 'contract-double',
      manifest: { provides: [modelProfilesKey], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'profiles-double',
        apply(ctx: Context) {
          new ProfilesDouble(ctx)
        },
      },
    }),
  }
}

const DOMAINS: Readonly<Record<string, string>> = {
  [TENANT_TEXT]: 'domain-a',
  [OTHER_TENANT_TEXT]: 'domain-b',
}

export type IndexRow = Readonly<{
  tenant: string
  execution: string
  session: string
  run: string
}>

export const INDEX: readonly IndexRow[] = [
  { tenant: TENANT_TEXT, execution: EXECUTION, session: SESSION, run: RUN },
  { tenant: OTHER_TENANT_TEXT, execution: 'execution-b', session: 'session-b', run: 'run-b' },
]

export type IndexScript = Readonly<{
  rows?: readonly IndexRow[]
  read?: () => ReadResult
  lookup?: (tenant: string) => TenantDomainLookupResult
}>

export type IndexTrace = { reads: Readonly<{ domain: string; input: JsonValue }>[] }

const notInFixture = (): never => {
  throw new Error('not in this fixture')
}

function indexRows(script: IndexScript, trace: IndexTrace) {
  const rows = script.rows ?? INDEX
  class IndexStorage extends StorageService {
    readonly database: StorageService['database'] = {}
    readonly registerCombination: StorageService['registerCombination'] = notInFixture
    readonly commit: StorageService['commit'] = notInFixture
    readonly query: StorageService['query'] = notInFixture
    readonly read: StorageService['read'] = async request => {
      trace.reads.push({ domain: request.domain.transactionDomain, input: request.input })
      if (script.read !== undefined) return script.read()
      if (
        request.handler !== SESSION_EXECUTION_HANDLER ||
        request.protocol !== SESSION_READ_PROTOCOL
      )
        return { kind: 'read', requestKey: request.requestKey, output: null }
      const input = request.input as Readonly<{ tenant: string; execution: string }>
      const row = rows.find(
        item =>
          item.tenant === input.tenant &&
          item.execution === input.execution &&
          DOMAINS[item.tenant] === request.domain.transactionDomain,
      )
      return {
        kind: 'read',
        requestKey: request.requestKey,
        output: row === undefined ? null : { session: row.session, run: row.run, position: '1' },
      }
    }
  }
  class Lookup extends TenantDomainLookupService {
    readonly lookup: TenantDomainLookupService['lookup'] = async ({ tenant }) => {
      if (script.lookup !== undefined) return script.lookup(tenant)
      const domain = DOMAINS[tenant]
      return domain === undefined
        ? { kind: 'unregistered' }
        : {
            kind: 'ready',
            domain: { scope: { kind: 'test' } as never, transactionDomain: domain },
          }
    }
  }
  const row = (id: string, key: string, make: (ctx: Context) => void) =>
    defineRow({
      row: id as RowId,
      implementation: 'contract-double',
      manifest: { provides: [key], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: { name: `${id}-double`, apply: make },
    })
  return {
    storage: row('storage', storageKey, ctx => void new IndexStorage(ctx)),
    lookup: row('session-storage', tenantDomainLookupKey, ctx => void new Lookup(ctx)),
  }
}

export function visibilityWithIndex(): ReadonlyMap<RowId, readonly ServiceName[]> {
  return serveProfile().visibility
}

export function visibilityWithoutIndex(): ReadonlyMap<RowId, readonly ServiceName[]> {
  const visibility = new Map(serveProfile().visibility)
  visibility.delete('agent-model-selection' as RowId)
  return visibility
}

export const sessionBinding: Pick<SelectionBindings, 'sessionOf'> = {
  sessionOf: async () => succeed(SESSION),
}

const PROBE = 'selection-probe' as RowId

export type Live = Readonly<{
  select: ModelSelection<unknown>['select']
  session: SessionTrace
  profiles: ProfilesTrace
  index: IndexTrace
}>

export type TreeOptions = Readonly<{
  session?: SessionScript | null
  profiles?: Parameters<typeof profilesDoubleRow>[0] | null
  work?: WorkScript
  bindings?: Partial<SelectionBindings>
  index?: IndexScript
  visible?: boolean
}>

export async function withLiveRow<T>(
  options: TreeOptions,
  use: (live: Live) => Promise<T> | T,
): Promise<{ value: T; run: ServeRun }> {
  const sessionTrace: SessionTrace = { reads: [], works: [], otherFaces: [] }
  const indexTrace: IndexTrace = { reads: [] }
  const profilesTrace: ProfilesTrace = { resolves: [] }
  const stop = new AbortController()
  let ready: (select: ModelSelection<unknown>['select']) => void = () => {}
  const captured = new Promise<ModelSelection<unknown>['select']>(resolve => {
    ready = resolve
  })
  const selectionRow = createAgentModelSelectionRow(options.bindings ?? sessionBinding)
  const probe = defineRow({
    row: PROBE,
    implementation: 'real',
    manifest: { provides: [], injects: ['agentModelSelection'], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'selection-probe',
      inject: ['agentModelSelection'],
      apply(ctx: Context) {
        ready(input => ctx.agentModelSelection.select(input))
      },
    },
  })
  const rows: { id: string; plugin: string; config: unknown }[] = []
  const plugins: Record<string, unknown> = { stubPlugin, selection: selectionRow, probe }
  if (options.session !== null) {
    rows.push({ id: 'session-provider', plugin: 'session', config: {} })
    plugins['session'] = sessionDoubleRow(
      sessionTrace,
      options.session ?? (() => fail({ kind: 'not-ready' })),
      options.work,
    )
  }
  if (options.index !== undefined) {
    const doubles = indexRows(options.index, indexTrace)
    rows.push({ id: 'storage', plugin: 'indexStorage', config: {} })
    rows.push({ id: 'session-storage', plugin: 'indexLookup', config: {} })
    plugins['indexStorage'] = doubles.storage
    plugins['indexLookup'] = doubles.lookup
  }
  if (options.profiles !== null) {
    rows.push({ id: 'model-profiles', plugin: 'profiles', config: {} })
    plugins['profiles'] = profilesDoubleRow(options.profiles ?? {}, profilesTrace).row
  }
  rows.push({ id: 'agent-model-selection', plugin: 'selection', config: {} })
  rows.push({ id: PROBE, plugin: 'probe', config: {} })
  const running = serveOnce({
    distribution: { rows },
    plugins: plugins as never,
    stopAfterStartup: false,
    stop: stop.signal,
    visibility: options.visible === false ? visibilityWithoutIndex() : visibilityWithIndex(),
  })
  try {
    const select = await Promise.race([
      captured,
      running.then(run => {
        throw new Error(`the tree ended before the probe ran: ${JSON.stringify(run.stderr)}`)
      }),
    ])
    const value = await use({
      select,
      session: sessionTrace,
      profiles: profilesTrace,
      index: indexTrace,
    })
    stop.abort('test done')
    return { value, run: await running }
  } catch (error) {
    stop.abort('test failed')
    await running.catch(() => undefined)
    throw error
  }
}

export const failureOf = (outcome: Outcome<unknown, Failure>): Failure | undefined =>
  'failure' in outcome ? outcome.failure : undefined
