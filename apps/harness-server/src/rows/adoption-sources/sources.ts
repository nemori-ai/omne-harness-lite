// The adoption source of Session over the deployment mapping. It reads the table that the
// `agent-adoptions` row provides and no other data. It prepares guard material only: it holds no
// transaction port and writes nothing. A definition that the table does not hold gets a failure and
// no material, so the caller has nothing to commit.
//
// For `create` the material is Session's initialization guard (session-contract「初始化守卫编码」):
// the initial adoption is the mapping entry of the named definition, the plan and the requirements
// are the required identities of that entry, and the sources and results are empty, because the
// mapping holds none. The resident tools are the ones the entry names (`residentCapabilities`),
// planned from Tool's registry with the release's first definitions (`residents.ts`); an entry that
// names none gets none. A creation that declares what the mapping does not hold (sources, results,
// a resident tool the entry does not name) gets `invalid`, not a guard that vouches for it. A named
// resident that cannot be planned fails the creation with `unavailable`.
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  SessionAdoptionSourceService,
  sessionKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  canonicalText,
  contentDigest,
  modesAdoptionOf,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from '@omne-harness/server-entry/cordis'
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
import { loginConfirmationOf, type SessionWorkReads } from './login-entry.ts'
import { plannedResidents } from './residents.ts'

const OWNER = '@omne-harness/harness-server'

/** The protocol of the material of this source. It names the shape of `facts`, not an authority. */
export const MAPPING_EVIDENCE_PROTOCOL = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-evidence',
  revision: '1',
  digest: 'harness-server:definition-mapping-evidence/1',
})

/** The schema of `initialAdoption.inputSnapshot`: the lookup of one definition name in the table. */
export const MAPPING_LOOKUP_SCHEMA = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-lookup',
  revision: '1',
  digest: 'harness-server:definition-mapping-lookup/1',
})

/** The schema of `initialAdoption.capabilities`: the complete mapping entry of the deployment. */
export const MAPPING_ENTRY_SCHEMA = Object.freeze({
  owner: OWNER,
  name: 'definition-mapping-entry',
  revision: '1',
  digest: 'harness-server:definition-mapping-entry/1',
})

type Facts = GuardCommand['facts']
type Prepared = Awaited<ReturnType<SessionAdoptionSource['prepare']>>
type CreateCommand = Extract<AdoptionEvidenceCommand, { kind: 'create' }>

const same = (a: unknown, b: unknown): boolean => canonicalText(a) === canonicalText(b)

function jsonOf(plain: unknown): Facts {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') return { kind: 'number', lexeme: String(plain) }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(jsonOf) }
  const entries = Object.entries(plain as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: jsonOf(value) }))
  return { kind: 'object', entries }
}

function invalid(field: string, reason: string): Prepared {
  return fail({ kind: 'invalid', field, reason })
}

/** The first part of a created session that disagrees with the entry, or `undefined`. */
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

/** What the creation declares and the mapping does not hold, or `undefined`. */
function undeclaredByMapping(
  entry: DefinitionMappingEntry,
  creation: SessionCreation,
): Prepared | undefined {
  const initialization = creation.initialization
  if (
    initialization !== undefined &&
    (initialization.sources.length > 0 || initialization.results.length > 0)
  )
    return invalid(
      'initialization',
      'the deployment mapping holds no initialization sources or results; this source plans none',
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

/** The durable evidence of one mapping entry: its digest changes with any part of the entry. */
const entryEvidence = (entry: DefinitionMappingEntry): DurableEvidence => ({
  owner: OWNER,
  record: `definition-mapping/${entry.name}`,
  revision: '1',
  digest: contentDigest(entry),
})

/** The durable evidence of the whole table: the boundary within which the entry is adopted. */
const tableEvidence = (mappings: DefinitionMappings): DurableEvidence => ({
  owner: OWNER,
  record: 'definition-mappings',
  revision: '1',
  digest: mappings.identity,
})

/**
 * The initial adoption that the mapping states: the entry is the deployment's adoption of the
 * definition, and the resident tools are the planned material of the residents the entry names
 * (both lists empty when it names none).
 */
function initialAdoptionOf(
  mappings: DefinitionMappings,
  entry: DefinitionMappingEntry,
  residents: ResidentAdoption,
): InitialAdoption {
  return {
    definitionName: entry.name,
    candidate: entry.candidate,
    adopted: entry.candidate,
    source: entryEvidence(entry),
    boundary: tableEvidence(mappings),
    inputSnapshot: { schema: MAPPING_LOOKUP_SCHEMA, value: jsonOf({ definition: entry.name }) },
    capabilities: { schema: MAPPING_ENTRY_SCHEMA, value: jsonOf(entry) },
    residentBindings: residents.keys,
    newResidents: residents.residents,
  }
}

/**
 * The plan of the creation (SPEC「初始化来源与提交」, the identity items): one item per required
 * identity, owner = capability, item = name, protocol = the entry contract. The mapping has no
 * other sources, and a creation that declares some was refused before this.
 */
function planOf(entry: DefinitionMappingEntry): readonly InitializationPlanItem[] {
  return entry.requiredIdentities.map(({ capability, name }) => ({
    kind: 'identity',
    owner: capability,
    item: name,
    protocol: entry.entryContract,
    originalInput: jsonOf({ capability, name }),
  }))
}

/**
 * The requirements the mapping declares: one per required identity, planned to its item, with the
 * entry as the evidence of the requirement. The entry contract and the execution type of the
 * mapping declare no other requirement, so none is asserted satisfied.
 */
function requirementsOf(
  entry: DefinitionMappingEntry,
  plan: readonly InitializationPlanItem[],
): readonly InitializationRequirement[] {
  return plan.map(item => ({
    kind: 'identity',
    key: canonicalText([item.owner, item.item]),
    requirement: entryEvidence(entry),
    resolution: { kind: 'planned', owner: item.owner, item: item.item },
  }))
}

/**
 * The complete fixed input of the command, as `initializationCommandInput` of session-contract
 * encodes it: the tenant and the workspace as their codec texts, everything else as given.
 */
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
): Prepared {
  const { creation } = command.input
  const tenant = tenantCodec.encode(command.input.tenant)
  if (!tenant.ok) return invalid('tenant', 'the tenant is not minted by its codec')
  const workspace = creation.workspace === null ? null : workspaceCodec.encode(creation.workspace)
  if (workspace !== null && !workspace.ok)
    return invalid('workspace', 'the workspace is not minted by its codec')
  const plan = planOf(entry)
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
    initialAdoption: initialAdoptionOf(mappings, entry, residents),
    requirements: requirementsOf(entry, plan),
    plan,
    results: [],
  }
  return succeed([
    {
      owner: 'session-initialization',
      participant: 'session-evidence',
      protocol: INITIALIZATION_PROTOCOL,
      facts: jsonOf(facts),
    },
  ])
}

/**
 * The Session work face, taken from the row context on every call as a `coordinator` (the class of
 * the caller of `startRun`; the access check of the read is the Session's own). It is not an
 * `inject`: Session injects this source through the evidence bridge, so a static `session` here
 * would wait for itself. An absent face is `undefined`, and the start is then `unavailable`.
 */
function sessionWorkOf<P>(ctx: Context): SessionWorkReads<P> | undefined {
  const work = ctx.intercept(sessionKey, { caller: 'coordinator' }).get(sessionKey, false)?.work
  return work === undefined
    ? undefined
    : {
        readWork: access => work.readWork(access as never),
        readInput: input => work.readInput(input as never),
      }
}

async function prepareFrom<P>(
  ctx: Context,
  mappings: DefinitionMappings,
  command: AdoptionEvidenceCommand,
  access: SessionAccess<P> | undefined,
): Promise<Prepared> {
  switch (command.kind) {
    case 'create': {
      const { creation } = command.input
      const entry = mappings.byName(creation.definition.name)
      if (entry === undefined)
        return invalid('definition', 'the definition name is not in the deployment mapping')
      const mismatch = creationMismatch(entry, creation)
      if (mismatch !== undefined)
        return invalid(mismatch, 'the creation does not match the mapping entry of its definition')
      const undeclared = undeclaredByMapping(entry, creation)
      if (undeclared !== undefined) return undeclared
      const residents = await plannedResidents(ctx, entry.residentCapabilities ?? [], access)
      if ('failure' in residents) return residents
      return initializationGuardOf(mappings, command, entry, residents.ok)
    }
    case 'startRun': {
      const entry = mappings.byCandidate(command.input.candidate)
      if (entry === undefined)
        return invalid('candidate', 'the candidate is not a definition adoption of this deployment')
      const login = await loginConfirmationOf(sessionWorkOf<P>(ctx), command, access)
      if ('failure' in login) return login
      const mapping = materialOf(mappings, command.kind, entry)
      return succeed(login.ok === null ? [mapping] : [mapping, login.ok])
    }
    case 'reload': {
      const entry = mappings.byCandidate(command.input.candidate)
      if (entry === undefined)
        return invalid('candidate', 'the candidate is not a definition adoption of this deployment')
      return succeed([materialOf(mappings, command.kind, entry)])
    }
    // These commands carry no definition to evaluate. The adoption that they rely on was recorded
    // when the session was created or the run started, and is not read again from the table.
    case 'completeInitialization':
    case 'change':
    case 'freeze':
      return succeed([])
  }
}

export class AdoptionSourcesImpl extends SessionAdoptionSourceService {
  /** The table that this source reads. It is the `definitionMappings` service of the same row tree. */
  readonly mappings: DefinitionMappings

  readonly prepare: SessionAdoptionSource['prepare']

  constructor(ctx: Context, mappings: DefinitionMappings) {
    super(ctx)
    this.mappings = mappings
    // The row's own context: the Tool services and the release are read through it on every call.
    this.prepare = (command, access) => prepareFrom(ctx, mappings, command, access)
  }
}
