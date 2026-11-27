import type { Adoption, ModelModality, ModelProfileDefinition } from '@omne-harness/model-contract'
import { bindDecisions, type DecisionsRecordData } from '../decisions/binding.ts'
import type { PiDecisionsBinding } from '../family.ts'
import {
  defineFamily,
  recordAdoption,
  recordProvider,
  type PiFamily,
  type PiModelRecordHead,
} from '../family-table.ts'

/** A decisions record: where it is served, what it takes and gives, and the evidence of each fact. */
export type DecisionsRecord = PiModelRecordHead &
  DecisionsRecordData &
  Readonly<{
    profile: Readonly<{
      input: readonly [ModelModality, ...ModelModality[]]
      output: readonly [ModelModality, ...ModelModality[]]
      evidence: string
    }>
  }>

/** A family of decisions records. A record is data: binding one holds no resource. */
export function defineDecisionsFamily(
  spec: Readonly<{ owner: string; records: readonly DecisionsRecord[] }>,
): PiFamily<PiDecisionsBinding> {
  const { owner, records } = spec
  return defineFamily({
    owner,
    records,
    acquire: async (record, supplier) => ({ ok: bindDecisions(owner, record, supplier) }),
  })
}

/** The official profile of every current decisions record. */
export function officialDecisionsProfilesOf(
  owner: string,
  records: readonly DecisionsRecord[],
  input: Readonly<{ retryPolicy: Adoption }>,
): readonly ModelProfileDefinition<'decisions'>[] {
  return records
    .filter(record => record.status === 'current')
    .map(record => ({
      kind: 'decisions',
      suppliers: [
        {
          adoption: recordAdoption(owner, record),
          provider: recordProvider(record),
          model: record.route.model,
        },
      ],
      fallback: false,
      input: record.profile.input,
      output: record.profile.output,
      maxQuestions: record.decisions.maxQuestions,
      retryPolicy: input.retryPolicy,
    }))
}
