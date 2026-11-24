import type { Adoption, ModelCountingBasis } from '@omne-harness/model-contract'
import { recordAdoption, recordProvider } from '@omne-harness/pi-ai-transport'
import { GLM_OWNER } from './owner.ts'
import type { GlmRecord } from './record.ts'

export type RecordComponent =
  | 'representation'
  | 'meter'
  | 'prompt'
  | 'projection'
  | 'media'
  | 'replay'
  | 'evidence'

export function componentAdoption(record: GlmRecord, component: RecordComponent): Adoption {
  const { digest } = recordAdoption(GLM_OWNER, record)
  return Object.freeze({
    owner: GLM_OWNER,
    name: `${record.name}#${component}`,
    revision: record.revision,
    digest,
  })
}

export function countingBasis(record: GlmRecord): ModelCountingBasis {
  return Object.freeze({
    supplier: Object.freeze({
      adoption: recordAdoption(GLM_OWNER, record),
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
