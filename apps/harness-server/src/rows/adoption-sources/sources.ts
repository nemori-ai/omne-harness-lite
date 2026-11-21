import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
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
} from '../agent-adoptions/definition-mappings.ts'
import {
  INITIALIZATION_PROTOCOL,
  type AdoptionEvidenceCommand,
  type DurableEvidence,
  type GuardCommand,
  type InitialAdoption,
  type InitializationGuardFacts,
  type InitializationPlanItem,
  type InitializationRequirement,
  type ResidentAdoption,
  type SessionAccess,
  type SessionAdoptionSource,
  type SessionCreation,
} from '@omne-harness/session-contract'
import {
  contextInitialization,
  type ContextPreparationRecord,
} from '../../assembly/session-context-initialization.ts'
import { prepareInitialContext, type PreparedBlock } from './initial-context.ts'
import { jsonOf } from './json.ts'
import { recallInitialContext } from './recall-context.ts'
import { plannedResidents } from './residents.ts'
import { adoptRunSources, type RunSourcesPorts } from './run-sources.ts'

const OWNER = '@omne-harness/harness-server'

export const MAPPING_EVIDENCE_PROTOCOL = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-evidence',
  revision: '1',
  digest: 'harness-server:definition-mapping-evidence/1',
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
  const named = new Set(entry.residentCapabilities ?? [])
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

function runSourcesOf(ctx: Context): RunSourcesPorts {
  const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
  const logger = ctx.logger('adoption-sources')
  return {
    readWork: access => coordinator.get(sessionKey)?.work.readWork(access),
    sources: () => ctx.get(workspaceSourcesKey),
    categories: () => ctx.get(assetCategoriesKey)?.view,
    report: reason => logger.warn('the run starts without a workspace layer: %s', reason),
  }
}

async function definitionEvidence<P>(
  runSources: RunSourcesPorts,
  mappings: DefinitionMappings,
  command: Extract<AdoptionEvidenceCommand, { kind: 'startRun' | 'reload' }>,
  access: SessionAccess<P> | undefined,
): Promise<Prepared> {
  const entry = mappings.byCandidate(command.input.candidate)
  if (entry === undefined)
    return invalid('candidate', 'the candidate is not a definition adoption of this deployment')
  if (command.kind === 'startRun')
    await adoptRunSources(runSources, command, access as SessionAccess<unknown> | undefined)
  return succeed([materialOf(mappings, command.kind, entry)])
}

async function prepareFrom<P>(
  ctx: Context,
  runSources: RunSourcesPorts,
  mappings: DefinitionMappings,
  command: AdoptionEvidenceCommand,
  access: SessionAccess<P> | undefined,
): Promise<Prepared> {
  switch (command.kind) {
    case 'create': {
      const recalled = await recallInitialContext(ctx, command, access, MAPPING_ENTRY_SCHEMA)
      if ('failure' in recalled) return recalled
      if (recalled.ok !== undefined) return initializationMaterial(recalled.ok)
      const { creation } = command.input
      const entry = mappings.byName(creation.definition.name)
      if (entry === undefined)
        return invalid('definition', 'the definition name is not in the deployment mapping')
      const mismatch = creationMismatch(entry, creation)
      if (mismatch !== undefined)
        return invalid(mismatch, 'the creation does not match the mapping entry of its definition')
      const undeclared = undeclaredByMapping(entry, command)
      if (undeclared !== undefined) return undeclared
      const residents = await plannedResidents(ctx, entry.residentCapabilities ?? [], access)
      if ('failure' in residents) return residents
      const preparation = await prepareInitialContext(ctx, command, access)
      if ('failure' in preparation) return preparation
      return initializationGuardOf(mappings, command, entry, residents.ok, preparation.ok)
    }
    case 'startRun':
    case 'reload':
      return definitionEvidence(runSources, mappings, command, access)
    case 'completeInitialization':
    case 'change':
    case 'freeze':
      return succeed([])
  }
}

export class AdoptionSourcesImpl extends SessionAdoptionSourceService {
  readonly mappings: DefinitionMappings

  readonly prepare: SessionAdoptionSource['prepare']

  constructor(ctx: Context, mappings: DefinitionMappings) {
    super(ctx)
    this.mappings = mappings
    const runSources = runSourcesOf(ctx)
    this.prepare = (command, access) => prepareFrom(ctx, runSources, mappings, command, access)
  }
}
