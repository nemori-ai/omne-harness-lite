// The adoptions that a record fixes besides its own: the profile, the meter and the components of
// the counting basis. Each one names the record and a component and carries the record digest,
// so it changes exactly when the record changes and resolves to one record of this package.
import type { Adoption, ModelCountingBasis } from '@omne-harness/model-contract'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { ANTHROPIC_OWNER } from './owner.ts'
import type { AnthropicRecord } from './record.ts'

/** The parts of a record that have their own adoption. */
export type RecordComponent =
  | 'representation'
  | 'meter'
  | 'prompt'
  | 'projection'
  | 'media'
  | 'replay'
  | 'evidence'

/** `<record name>#<component>` at the record revision, with the record digest. */
export function componentAdoption(record: AnthropicRecord, component: RecordComponent): Adoption {
  const { digest } = recordAdoption(ANTHROPIC_OWNER, record)
  return Object.freeze({
    owner: ANTHROPIC_OWNER,
    name: `${record.name}#${component}`,
    revision: record.revision,
    digest,
  })
}

/** The counting basis of a record: one fixed combination of supplier, rules and evidence. */
export function countingBasis(record: AnthropicRecord): ModelCountingBasis {
  return Object.freeze({
    supplier: Object.freeze({
      adoption: recordAdoption(ANTHROPIC_OWNER, record),
      recipient: record.route.recipient,
      model: record.route.model,
      replay: record.replay.declaration,
    }),
    meter: componentAdoption(record, 'meter'),
    tokenization: Object.freeze({ kind: 'local', definition: record.meter.tokenizer }),
    prompt: Object.freeze({
      kind: 'provider-private',
      estimation: componentAdoption(record, 'prompt'),
    }),
    projection: componentAdoption(record, 'projection'),
    mediaTransform: componentAdoption(record, 'media'),
    replay: componentAdoption(record, 'replay'),
    evidence: componentAdoption(record, 'evidence'),
  })
}
