import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import {
  SessionAdoptionSourceService,
  sessionKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { workspaceSourcesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import {
  canonicalText,
  contentDigest,
  modesAdoptionOf,
  type DefinitionMappingEntry,
  type DefinitionMappings,
  type DefinitionReading,
} from '../agent-adoptions/definition-mappings.ts'
import {
  INITIALIZATION_PROTOCOL,
  type Adoption,
  type AdoptionEvidenceCommand,
  type AdoptionNote,
  type DurableEvidence,
  type GuardCommand,
  type InitialAdoption,
  type InitializationGuardFacts,
  type InitializationPlanItem,
  type InitializationRequirement,
  type ResidentAdoption,
  type RunAdoption,
  type RunAdoptionInput,
  type SessionAccess,
  type SessionAdoptionSource,
  type SessionCreation,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  contextInitialization,
  type ContextPreparationRecord,
} from '../../assembly/session-context-initialization.ts'
import { prepareInitialContext, type PreparedBlock } from './initial-context.ts'
import { jsonOf } from './json.ts'
import { recallInitialContext } from './recall-context.ts'
import { lastTurnOf, madeFrom, type Turn } from '../tenant-assets/turn.ts'
import { plannedResidents, type PlannedResidents, type ResidentReport } from './residents.ts'
import { TOOL_CATEGORY } from '../agent-adoptions/table.ts'
import { adoptForStartedRun, adoptWorkspace, type RunSourcesPorts } from './run-sources.ts'

const OWNER = '@omne-harness/harness-server'

export const MAPPING_EVIDENCE_PROTOCOL = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-evidence',
  revision: '1',
  digest: 'harness-server:definition-mapping-evidence/1',
})

/** What a freeze, or a note that a run waits, is committed on: the answer the adoption point gave, as it was given. */
export const RUN_ADOPTION_EVIDENCE_PROTOCOL = Object.freeze({
  owner: OWNER,
  name: 'run-adoption-evidence',
  revision: '1',
  digest: 'harness-server:run-adoption-evidence/1',
})

export const MAPPING_LOOKUP_SCHEMA = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-lookup',
  revision: '1',
  digest: 'harness-server:definition-mapping-lookup/1',
})

export const MAPPING_ENTRY_SCHEMA = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-entry',
  revision: '2',
  digest: 'harness-server:definition-mapping-entry/2',
})

type Facts = GuardCommand['facts']
type Prepared = Awaited<ReturnType<SessionAdoptionSource['prepare']>>
type CreateCommand = Extract<AdoptionEvidenceCommand, { kind: 'create' }>

const same = (a: unknown, b: unknown): boolean => canonicalText(a) === canonicalText(b)

function invalid(field: string, reason: string): Prepared {
  return fail({ kind: 'invalid', field, reason })
}

function creationMismatch(
  entry: DefinitionMappingEntry,
  creation: SessionCreation,
): string | undefined {
  if (!same(creation.definition.candidate, entry.candidate)) return 'definition.candidate'
  if (!same(creation.execution, entry.execution)) return 'execution'
  if (!same(creation.entryContract, entry.entryContract)) return 'entryContract'
  if (!same(creation.requiredIdentities, entry.requiredIdentities)) return 'requiredIdentities'
  const modes = creation.modes
  const expected =
    modes.kind === 'tenant-default'
      ? same(modes.source, modesAdoptionOf(entry))
      : same(modes.value, entry.modes)
  return expected ? undefined : 'modes'
}

function undeclaredByMapping(
  entry: DefinitionMappingEntry,
  command: CreateCommand,
): Prepared | undefined {
  const creation = command.input.creation
  const initialization = creation.initialization
  if (
    initialization !== undefined &&
    (initialization.sources.length > 0 || initialization.results.length > 0) &&
    !same(
      initialization,
      contextInitialization({ ...command.input, principal: undefined }).initialization,
    )
  )
    return invalid(
      'initialization',
      'the initialization does not match the application context adoption',
    )
  const declared = creation.residentAdoption
  if (declared === undefined) return undefined
  const named = new Set(
    (entry.residentReferences ?? [])
      .filter(reference => reference.category === TOOL_CATEGORY)
      .map(reference => reference.name),
  )
  const capabilities = [...declared.residents, ...declared.keys].map(item => item.capability)
  if (capabilities.some(capability => !named.has(capability)))
    return invalid(
      'residentAdoption',
      'the deployment mapping does not adopt a resident tool that the creation declares',
    )
  return undefined
}

function materialOf(
  mappings: DefinitionMappings,
  command: AdoptionEvidenceCommand['kind'],
  entry: DefinitionMappingEntry,
): GuardCommand {
  return {
    owner: 'definition-mapping',
    participant: 'session-evidence',
    protocol: MAPPING_EVIDENCE_PROTOCOL,
    facts: jsonOf({
      version: 1,
      command,
      definition: entry.name,
      candidate: entry.candidate,
      table: mappings.identity,
      entry: contentDigest(entry),
    }),
  }
}

const entryEvidence = (entry: DefinitionMappingEntry): DurableEvidence => ({
  owner: OWNER,
  record: `definition-mapping/${entry.name}`,
  revision: '1',
  digest: contentDigest(entry),
})

const tableEvidence = (mappings: DefinitionMappings): DurableEvidence => ({
  owner: OWNER,
  record: 'definition-mappings',
  revision: '1',
  digest: mappings.identity,
})

function initialAdoptionOf(
  mappings: DefinitionMappings,
  entry: DefinitionMappingEntry,
  residents: ResidentAdoption,
  preparations: readonly ContextPreparationRecord[],
): InitialAdoption {
  return {
    definitionName: entry.name,
    candidate: entry.candidate,
    adopted: entry.candidate,
    source: entryEvidence(entry),
    boundary: tableEvidence(mappings),
    inputSnapshot: { schema: MAPPING_LOOKUP_SCHEMA, value: jsonOf({ definition: entry.name }) },
    capabilities: {
      schema: MAPPING_ENTRY_SCHEMA,
      value: jsonOf({
        ...entry,
        contextPreparations: preparations.map(canonicalText),
      }),
    },
    residentBindings: residents.keys,
    newResidents: residents.residents,
    ...(residents.segments === undefined ? {} : { newSegments: residents.segments }),
  }
}

function planOf(
  entry: DefinitionMappingEntry,
  preparations: readonly ContextPreparationRecord[],
): readonly InitializationPlanItem[] {
  const identity: InitializationPlanItem[] = entry.requiredIdentities.map(
    ({ capability, name }) => ({
      kind: 'identity',
      owner: capability,
      item: name,
      protocol: entry.entryContract,
      originalInput: jsonOf({ capability, name }),
    }),
  )
  return [
    ...identity,
    ...preparations.map(({ source }): InitializationPlanItem => ({
      kind: 'context-registration',
      owner: source.owner,
      item: source.item,
      protocol: source.protocol,
      originalInput: jsonOf(source.input),
    })),
  ]
}

function requirementsOf(
  entry: DefinitionMappingEntry,
  plan: readonly InitializationPlanItem[],
): readonly InitializationRequirement[] {
  return plan.map(item => ({
    kind: item.kind === 'context-registration' ? 'context-registration' : 'identity',
    key: canonicalText([item.owner, item.item]),
    requirement:
      item.kind === 'context-registration'
        ? {
            owner: item.protocol.owner,
            record: item.protocol.name,
            revision: item.protocol.revision,
            digest: item.protocol.digest,
          }
        : entryEvidence(entry),
    resolution: { kind: 'planned', owner: item.owner, item: item.item },
  }))
}

function commandInputOf(command: CreateCommand, tenant: string, workspace: string | null): Facts {
  return jsonOf({
    ...command.input,
    tenant,
    creation: { ...command.input.creation, workspace },
  })
}

function initializationGuardOf(
  mappings: DefinitionMappings,
  command: CreateCommand,
  entry: DefinitionMappingEntry,
  residents: ResidentAdoption,
  blocks: readonly PreparedBlock[],
): Prepared {
  const { creation } = command.input
  const tenant = tenantCodec.encode(command.input.tenant)
  if (!tenant.ok) return invalid('tenant', 'the tenant is not minted by its codec')
  const workspace = creation.workspace === null ? null : workspaceCodec.encode(creation.workspace)
  if (workspace !== null && !workspace.ok)
    return invalid('workspace', 'the workspace is not minted by its codec')
  const preparations = blocks.map(block => block.record)
  const plan = planOf(entry, preparations)
  const facts: InitializationGuardFacts = {
    version: 1,
    command: 'create',
    binding: {
      tenant: tenant.value,
      session: command.input.session,
      operation: command.input.operation,
      createOperation: command.input.operation,
    },
    input: commandInputOf(command, tenant.value, workspace === null ? null : workspace.value),
    initialAdoption: initialAdoptionOf(mappings, entry, residents, preparations),
    requirements: requirementsOf(entry, plan),
    plan,
    results: blocks.map(block => block.outcome),
  }
  return initializationMaterial(facts)
}

function initializationMaterial(facts: InitializationGuardFacts): Prepared {
  return succeed([
    {
      owner: 'session-initialization',
      participant: 'session-evidence',
      protocol: INITIALIZATION_PROTOCOL,
      facts: jsonOf(facts),
    },
  ])
}

type AdoptionPorts = RunSourcesPorts & Readonly<{ leftOut: ResidentReport }>

function runSourcesOf(ctx: Context, leftOut: ResidentReport | undefined): AdoptionPorts {
  const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
  const logger = ctx.logger('adoption-sources')
  return {
    readWork: access => coordinator.get(sessionKey)?.work.readWork(access),
    sources: () => ctx.get(workspaceSourcesKey),
    categories: () => ctx.get(assetCategoriesKey)?.view,
    report: reason => logger.warn('the run starts without a workspace layer: %s', reason),
    leftOut:
      leftOut ?? (reason => logger.warn('a resident is left out of the session: %s', reason)),
  }
}

type Mappings = DefinitionMappings & DefinitionReading

const unreadable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, owner: OWNER, diagnostic })

async function definitionEvidence<P>(
  runSources: RunSourcesPorts,
  mappings: Mappings,
  command: Extract<AdoptionEvidenceCommand, { kind: 'startRun' | 'reload' }>,
  access: SessionAccess<P> | undefined,
): Promise<Prepared> {
  if (command.kind === 'startRun' && command.input.note?.kind === 'waiting')
    return succeed([noteMaterial(command.input.note)])
  const given = access as SessionAccess<unknown> | undefined
  const key =
    command.kind === 'startRun' ? await adoptForStartedRun(runSources, command, given) : null
  const turn = given === undefined || key === null ? {} : { turn: { access: given, key } }
  const read = await mappings.adopted(
    { tenant: command.input.tenant, ...turn },
    command.input.candidate,
  )
  if (read.kind === 'unavailable') return unreadable(read.diagnostic)
  if (read.kind === 'absent') return invalid('candidate', read.reason)
  return succeed([materialOf(mappings, command.kind, read.entry)])
}

/** A note that a run waits rests on the answer the adoption source gave: it adopts nothing. */
const noteMaterial = (note: AdoptionNote): GuardCommand => ({
  owner: 'run-adoption',
  participant: 'session-evidence',
  protocol: RUN_ADOPTION_EVIDENCE_PROTOCOL,
  facts: jsonOf({ version: 1, command: 'startRun', note }),
})

const sameKeys = (left: ResidentAdoption['keys'], right: ResidentAdoption['keys']) =>
  left.length === right.length &&
  left.every(pair =>
    right.some(other => other.capability === pair.capability && other.key === pair.key),
  )

/** What the residents of the definition come to now, judged over the ones the session keeps; nothing when nothing changed. */
async function judgedResidents<P>(
  ctx: Context,
  work: WorkSnapshot,
  entry: DefinitionMappingEntry,
  access: SessionAccess<P>,
  turn: Turn | null,
  report: ResidentReport,
): Promise<Outcome<PlannedResidents | undefined, SessionFailure>> {
  const planned = await plannedResidents(
    ctx,
    entry.residentReferences ?? [],
    access,
    report,
    turn,
    work,
  )
  if ('failure' in planned) return planned
  const { residents, segments, keys, verdict } = planned.ok
  const unchanged =
    verdict === undefined &&
    residents.length === 0 &&
    segments === undefined &&
    sameKeys(keys, work.residentKeys ?? [])
  return succeed(unchanged ? undefined : planned.ok)
}

/** A version in force that cannot be used: the set the session stands at, while it still applies; else none. */
async function notAdopted(
  mappings: Mappings,
  asker: Parameters<Mappings['adopted']>[0],
  pinned: Adoption,
  read: Readonly<{ reason: string; held?: true }>,
): Promise<RunAdoption> {
  if (read.held === undefined) return { kind: 'none', reason: read.reason }
  const standing = await mappings.adopted(asker, pinned)
  if (standing.kind === 'found') return { kind: 'keep', reason: read.reason }
  const why = standing.kind === 'absent' ? standing.reason : standing.diagnostic
  return { kind: 'none', reason: `${read.reason}; the one the session stands at: ${why}` }
}

/** What a run that starts now adopts: the version in force under the name of its definition. */
async function runAdoption<P>(
  ctx: Context,
  runSources: AdoptionPorts,
  mappings: Mappings,
  access: SessionAccess<P>,
  { work, run }: RunAdoptionInput,
): Promise<Outcome<RunAdoption, SessionFailure>> {
  const { name, adopted: pinned } = work.definition
  let entry = mappings.byName(name)
  let turn: Turn | null = null
  if (entry === undefined) {
    const given = access as SessionAccess<unknown>
    const failed = await adoptWorkspace(runSources, given, work, run)
    if (failed !== null) runSources.report(failed)
    turn = { access: given, key: run }
    const read = await mappings.named({ tenant: access.tenant, turn }, name)
    if (read.kind === 'unavailable') return unreadable(read.diagnostic)
    if (read.kind === 'absent')
      return succeed(await notAdopted(mappings, { tenant: access.tenant, turn }, pinned, read))
    entry = read.entry
  }
  const residents = await judgedResidents(ctx, work, entry, access, turn, runSources.leftOut)
  if ('failure' in residents && !same(entry.candidate, pinned)) {
    const why =
      'diagnostic' in residents.failure ? residents.failure.diagnostic : 'cannot be planned'
    const asker = { tenant: access.tenant, ...(turn === null ? {} : { turn }) }
    const reason = `the new version of ${name} cannot be adopted: ${why}`
    return succeed(await notAdopted(mappings, asker, pinned, { reason, held: true }))
  }
  if ('failure' in residents) return residents
  return succeed({
    kind: 'adopt',
    candidate: same(entry.candidate, pinned) ? pinned : entry.candidate,
    ...(residents.ok === undefined ? {} : { residentAdoption: residents.ok }),
  })
}

async function prepareFrom<P>(
  ctx: Context,
  runSources: AdoptionPorts,
  mappings: Mappings,
  command: AdoptionEvidenceCommand,
  access: SessionAccess<P> | undefined,
): Promise<Prepared> {
  switch (command.kind) {
    case 'create': {
      const recalled = await recallInitialContext(ctx, command, access, MAPPING_ENTRY_SCHEMA)
      if ('failure' in recalled) return recalled
      if (recalled.ok !== undefined) return initializationMaterial(recalled.ok)
      const { creation, tenant } = command.input
      // A session made from another is made as that one's turn saw things: its workspace is read too.
      const from = madeFrom(creation.relation)
      const turn = from === null ? null : await lastTurnOf(ctx, tenant, from)
      if (turn === undefined) return unreadable('the session this one is made from cannot be read')
      const asker = turn === null ? { tenant } : { tenant, turn }
      const read = await mappings.named(asker, creation.definition.name)
      if (read.kind === 'unavailable') return unreadable(read.diagnostic)
      if (read.kind === 'absent')
        return invalid('definition', 'the definition name is not in the deployment mapping')
      const { entry } = read
      const mismatch = creationMismatch(entry, creation)
      if (mismatch !== undefined)
        return invalid(mismatch, 'the creation does not match the mapping entry of its definition')
      const undeclared = undeclaredByMapping(entry, command)
      if (undeclared !== undefined) return undeclared
      const residents = await plannedResidents(
        ctx,
        entry.residentReferences ?? [],
        access,
        runSources.leftOut,
        turn,
      )
      if ('failure' in residents) return residents
      const preparation = await prepareInitialContext(ctx, command, access)
      if ('failure' in preparation) return preparation
      return initializationGuardOf(mappings, command, entry, residents.ok, preparation.ok)
    }
    case 'startRun':
    case 'reload':
      return definitionEvidence(runSources, mappings, command, access)
    case 'freeze': {
      const { verdict } = command.input
      return succeed([
        {
          owner: 'resident-adoption',
          participant: 'session-evidence',
          protocol: RUN_ADOPTION_EVIDENCE_PROTOCOL,
          facts: jsonOf({
            version: 1,
            command: 'freeze',
            cause: verdict.cause,
            capability: verdict.capability,
            evidence: verdict.evidence,
          }),
        },
      ])
    }
    case 'completeInitialization':
    case 'change':
      return succeed([])
  }
}

export class AdoptionSourcesImpl extends SessionAdoptionSourceService {
  readonly mappings: Mappings

  readonly prepare: SessionAdoptionSource['prepare']
  readonly forRun: NonNullable<SessionAdoptionSource['forRun']>

  constructor(ctx: Context, mappings: Mappings, leftOut?: ResidentReport) {
    super(ctx)
    this.mappings = mappings
    const runSources = runSourcesOf(ctx, leftOut)
    this.prepare = (command, access) => prepareFrom(ctx, runSources, mappings, command, access)
    this.forRun = (access, input) => runAdoption(ctx, runSources, mappings, access, input)
  }
}
