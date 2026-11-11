import { tenantCodec } from '@omne-harness/legal-identity'
import { contentDigest } from '@omne-harness/server-entry/cordis'
import { SESSION_MODES_PUBLICATION } from '@omne-harness/session-adapters'
import {
  encodeInitialContextRegistration,
  sessionInquiryBinding,
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

export type ModesCreation = Parameters<SessionManagement<unknown>['create']>[0]
const OWNER = '@omne-harness/harness-server'
const ITEM = 'session.modes'

const encoded = encodeInitialContextRegistration(
  {
    definition: SESSION_MODES_PUBLICATION,
    key: sessionInquiryBinding.key,
    bindings: [sessionInquiryBinding],
    parameters: undefined,
  },
  adoptedContextDefinitions,
)
if ('failure' in encoded) throw new Error(`invalid application modes adoption: ${encoded.failure}`)
const materials = encoded.ok
const source: Extract<InitializationSource, { kind: 'context-registration' }> = Object.freeze({
  kind: 'context-registration',
  owner: OWNER,
  item: ITEM,
  protocol: SESSION_MODES_PUBLICATION,
  input: materials,
})

export function modesPreparationRecord(
  input: ModesCreation,
  observed: Readonly<{
    coverage: 'full' | 'declaration-independent'
    currentRevision: number
  }> = { coverage: 'full', currentRevision: 0 },
) {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) throw new TypeError('mode initialization requires a minted tenant')
  const decision: InitializationRegistration = {
    tenant: tenant.value,
    scope: contextScopeOf({ ...input, generation: '1' }),
    key: ITEM,
    commit: initializationRegistrationCommit({
      ...input,
      createOperation: input.operation,
      owner: OWNER,
      item: ITEM,
    }),
    basedOn: 0,
    revision: 1,
    creating: true,
    required: true,
    ...materials,
  }
  return Object.freeze({
    tenant: tenant.value,
    session: input.session,
    createOperation: input.operation,
    source,
    definition: SESSION_MODES_PUBLICATION,
    decision,
    coverage: observed.coverage,
    currentRevision: observed.currentRevision,
  })
}

export type ModesPreparationRecord = ReturnType<typeof modesPreparationRecord>

export function modesPreparationEvidence(record: ModesPreparationRecord): DurableEvidence {
  return {
    owner: OWNER,
    record: `session-initialization/${record.decision.commit}`,
    revision: '1',
    digest: contentDigest(record),
  }
}

export function modesInitialization(input: ModesCreation) {
  const preparation = modesPreparationRecord(input)
  const prepared = modesPreparationEvidence(preparation)
  const result = {
    owner: OWNER,
    item: ITEM,
    result: { kind: 'ready' as const, evidence: prepared },
  }
  const outcome: InitializationGuardResult = {
    owner: OWNER,
    item: ITEM,
    result,
    consequence: { kind: 'context-registration', prepared, decision: preparation.decision },
  }
  return { source, preparation, outcome, initialization: { sources: [source], results: [result] } }
}
