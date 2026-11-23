import type { Adoption, ModelCountingBasis } from '@omne-harness/model-contract'
import { recordAdoption, recordProvider } from '@omne-harness/pi-ai-transport'
import { KIMI_OWNER } from './owner.ts'
import type { KimiRecord } from './record.ts'

export type RecordComponent =
  | 'representation'
  | 'meter'
  | 'prompt'
  | 'projection'
  | 'media'
  | 'replay'
  | 'evidence'

export function componentAdoption(record: KimiRecord, component: RecordComponent): Adoption {
  const { digest } = recordAdoption(KIMI_OWNER, record)
  return Object.freeze({
    owner: KIMI_OWNER,
    name: `${record.name}#${component}`,
    revision: record.revision,
    digest,
  })
}

export function countingBasis(record: KimiRecord): ModelCountingBasis {
  return Object.freeze({
    supplier: Object.freeze({
      adoption: recordAdoption(KIMI_OWNER, record),
      provider: recordProvider(record),
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
