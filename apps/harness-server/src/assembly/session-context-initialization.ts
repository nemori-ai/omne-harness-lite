import { tenantCodec } from '@omne-harness/legal-identity'
import { contentDigest } from '../rows/agent-adoptions/definition-mappings.ts'
import {
  SESSION_WORKSPACE_GUIDANCE,
  SESSION_MODES_PUBLICATION,
  SESSION_WORKING_DIRECTORY,
} from '@omne-harness/session-adapters'
import {
  encodeInitialContextRegistration,
  sessionModesBindings,
  sessionModesDescriptor,
  sessionModesProducer,
  workspaceGuidanceBindings,
  workspaceGuidanceDescriptor,
  workingDirectoryBindings,
  workingDirectoryDescriptor,
} from '@omne-harness/session-adapters/cordis'
import {
  contextScopeOf,
  initializationRegistrationCommit,
  type SessionManagement,
  type InitializationRegistration,
  type InitializationSource,
  type InitializationGuardResult,
  type DurableEvidence,
} from '@omne-harness/session-contract'
import { adoptedContextDefinitions } from './context-definitions.ts'

export type ContextCreation = Parameters<SessionManagement<unknown>['create']>[0]
const OWNER = '@omne-harness/harness-server'

// The blocks a session registers when it is created, in the order their revisions follow.
const DECLARED = [
  {
    definition: SESSION_MODES_PUBLICATION,
    bindings: sessionModesBindings,
    descriptor: sessionModesDescriptor,
    producer: sessionModesProducer,
  },
  {
    definition: SESSION_WORKING_DIRECTORY,
    bindings: workingDirectoryBindings,
    descriptor: workingDirectoryDescriptor,
  },
  {
    definition: SESSION_WORKSPACE_GUIDANCE,
    bindings: workspaceGuidanceBindings,
    descriptor: workspaceGuidanceDescriptor,
  },
] as const

type Declared = (typeof DECLARED)[number]
type Source = Extract<InitializationSource, { kind: 'context-registration' }>

function blockOf(declared: Declared, basedOn: number) {
  const item = declared.descriptor.key
  const encoded = encodeInitialContextRegistration(
    {
      definition: declared.definition,
      key: item,
      bindings: declared.bindings,
      parameters: undefined,
      ...(declared.descriptor.kind === 'stateful' ? { declaration: declared.descriptor } : {}),
    },
    adoptedContextDefinitions,
  )
  if ('failure' in encoded)
    throw new Error(`invalid application adoption of ${item}: ${encoded.failure}`)
  const source: Source = Object.freeze({
    kind: 'context-registration',
    owner: OWNER,
    item,
    protocol: declared.definition,
    input: encoded.ok,
  })
  return Object.freeze({ ...declared, item, basedOn, materials: encoded.ok, source })
}

export type InitialBlock = ReturnType<typeof blockOf>
export const INITIAL_BLOCKS: readonly InitialBlock[] = Object.freeze(DECLARED.map(blockOf))

export function contextPreparationRecord(
  block: InitialBlock,
  input: ContextCreation,
  observed: Readonly<{
    coverage: 'full' | 'declaration-independent'
    currentRevision: number
  }> = { coverage: 'full', currentRevision: 0 },
) {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) throw new TypeError('context initialization requires a minted tenant')
  const decision: InitializationRegistration = {
    tenant: tenant.value,
    scope: contextScopeOf({ ...input, generation: '1' }),
    key: block.item,
    commit: initializationRegistrationCommit({
      ...input,
      createOperation: input.operation,
      owner: OWNER,
      item: block.item,
    }),
    basedOn: block.basedOn,
    revision: block.basedOn + 1,
    creating: true,
    required: true,
    ...block.materials,
  }
  return Object.freeze({
    tenant: tenant.value,
    session: input.session,
    createOperation: input.operation,
    source: block.source,
    definition: block.definition,
    decision,
    coverage: observed.coverage,
    currentRevision: observed.currentRevision,
  })
}

export type ContextPreparationRecord = ReturnType<typeof contextPreparationRecord>

export function contextPreparationEvidence(record: ContextPreparationRecord): DurableEvidence {
  return {
    owner: OWNER,
    record: `session-initialization/${record.decision.commit}`,
    revision: '1',
    digest: contentDigest(record),
  }
}

function initialized(block: InitialBlock, input: ContextCreation) {
  const preparation = contextPreparationRecord(block, input)
  const prepared = contextPreparationEvidence(preparation)
  const result = {
    owner: OWNER,
    item: block.item,
    result: { kind: 'ready' as const, evidence: prepared },
  }
  const outcome: InitializationGuardResult = {
    owner: OWNER,
    item: block.item,
    result,
    consequence: { kind: 'context-registration', prepared, decision: preparation.decision },
  }
  return { block, preparation, result, outcome }
}

/** What a creation carries so that its scope registers every initial block. */
export function contextInitialization(input: ContextCreation) {
  const blocks = INITIAL_BLOCKS.map(block => initialized(block, input))
  return {
    blocks,
    initialization: {
      sources: blocks.map(item => item.block.source),
      results: blocks.map(item => item.result),
    },
  }
}
