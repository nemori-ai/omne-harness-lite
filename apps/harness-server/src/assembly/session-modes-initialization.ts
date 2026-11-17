import { tenantCodec } from '@omne-harness/legal-identity'
import {
  ENABLED_EXTENSIONS_BLOCK,
  ENABLED_EXTENSIONS_PUBLICATION,
  enabledExtensionsBinding,
} from '@omne-harness/loop-extension-contract'
import type { ContextBlockKey, NeedBinding } from '@omne-harness/runtime-context-contract'
import { contentDigest } from '../rows/agent-adoptions/definition-mappings.ts'
import { SESSION_MODES_PUBLICATION } from '@omne-harness/session-adapters'
import {
  encodeInitialContextRegistration,
  sessionInquiryBinding,
  sessionModesBindings,
} from '@omne-harness/session-adapters/cordis'
import {
  contextScopeOf,
  initializationRegistrationCommit,
  type Adoption,
  type SessionManagement,
  type InitializationRegistration,
  type InitializationSource,
  type InitializationGuardResult,
  type DurableEvidence,
} from '@omne-harness/session-contract'
import { adoptedContextDefinitions } from './context-definitions.ts'

export type ModesCreation = Parameters<SessionManagement<unknown>['create']>[0]
const OWNER = '@omne-harness/harness-server'

/** The blocks every session registers when it is created, in the order of their registration revisions. */
export const INITIAL_BLOCKS: readonly Readonly<{
  key: ContextBlockKey
  definition: Adoption
  bindings: readonly NeedBinding[]
}>[] = [
  {
    key: sessionInquiryBinding.key,
    definition: SESSION_MODES_PUBLICATION,
    bindings: sessionModesBindings,
  },
  {
    key: ENABLED_EXTENSIONS_BLOCK,
    definition: ENABLED_EXTENSIONS_PUBLICATION,
    bindings: [enabledExtensionsBinding],
  },
]

const registrations = INITIAL_BLOCKS.map(block => {
  const encoded = encodeInitialContextRegistration(
    { ...block, parameters: undefined },
    adoptedContextDefinitions,
  )
  if ('failure' in encoded)
    throw new Error(`invalid application adoption of ${block.key}: ${encoded.failure}`)
  const source: Extract<InitializationSource, { kind: 'context-registration' }> = Object.freeze({
    kind: 'context-registration',
    owner: OWNER,
    item: block.key,
    protocol: block.definition,
    input: encoded.ok,
  })
  return { block, materials: encoded.ok, source }
})

export type Observed = Readonly<{
  coverage: 'full' | 'declaration-independent'
  currentRevision: number
}>

const AS_PLANNED: Observed = { coverage: 'full', currentRevision: 0 }

/** One record for each initial block. `observed` is what the preparation of each block saw; absent means as planned. */
export function modesPreparationRecords(input: ModesCreation, observed: readonly Observed[] = []) {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) throw new TypeError('mode initialization requires a minted tenant')
  return registrations.map(({ block, materials, source }, index) => {
    const decision: InitializationRegistration = {
      tenant: tenant.value,
      scope: contextScopeOf({ ...input, generation: '1' }),
      key: block.key,
      commit: initializationRegistrationCommit({
        ...input,
        createOperation: input.operation,
        owner: OWNER,
        item: block.key,
      }),
      basedOn: index,
      revision: index + 1,
      creating: true,
      required: true,
      ...materials,
    }
    const seen = observed[index] ?? AS_PLANNED
    return Object.freeze({
      tenant: tenant.value,
      session: input.session,
      createOperation: input.operation,
      source,
      definition: block.definition,
      decision,
      coverage: seen.coverage,
      currentRevision: seen.currentRevision,
    })
  })
}

export type ModesPreparationRecord = ReturnType<typeof modesPreparationRecords>[number]

export function modesPreparationEvidence(record: ModesPreparationRecord): DurableEvidence {
  return {
    owner: OWNER,
    record: `session-initialization/${record.decision.commit}`,
    revision: '1',
    digest: contentDigest(record),
  }
}

export function modesInitialization(input: ModesCreation) {
  const preparations = modesPreparationRecords(input)
  const outcomes = preparations.map((preparation): InitializationGuardResult => {
    const prepared = modesPreparationEvidence(preparation)
    const { owner, item } = preparation.source
    const result = { owner, item, result: { kind: 'ready' as const, evidence: prepared } }
    const consequence = {
      kind: 'context-registration' as const,
      prepared,
      decision: preparation.decision,
    }
    return { owner, item, result, consequence }
  })
  const sources = preparations.map(preparation => preparation.source)
  const results = outcomes.map(outcome => outcome.result)
  return { preparations, outcomes, initialization: { sources, results } }
}
