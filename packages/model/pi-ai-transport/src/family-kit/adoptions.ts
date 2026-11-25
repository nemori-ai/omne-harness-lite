import type { Adoption, ModelCountingBasis } from '@omne-harness/model-contract'
import { recordAdoption, recordProvider } from '../family-table.ts'
import type { GatewayRecord } from './record.ts'

export type RecordComponent =
  | 'representation'
  | 'meter'
  | 'prompt'
  | 'projection'
  | 'media'
  | 'replay'
  | 'evidence'

export function componentAdoption(
  owner: string,
  record: GatewayRecord,
  component: RecordComponent,
): Adoption {
  const { digest } = recordAdoption(owner, record)
  return Object.freeze({
    owner,
    name: `${record.name}#${component}`,
    revision: record.revision,
    digest,
  })
}

export function countingBasis(owner: string, record: GatewayRecord): ModelCountingBasis {
  return Object.freeze({
    supplier: Object.freeze({
      adoption: recordAdoption(owner, record),
      provider: recordProvider(record),
      model: record.route.model,
      replay: record.replay.declaration,
    }),
    meter: componentAdoption(owner, record, 'meter'),
    tokenization: Object.freeze({ kind: 'local', definition: record.meter.tokenizer }),
    prompt: Object.freeze({
      kind: 'provider-private',
      estimation: componentAdoption(owner, record, 'prompt'),
    }),
    projection: componentAdoption(owner, record, 'projection'),
    mediaTransform: componentAdoption(owner, record, 'media'),
    replay: componentAdoption(owner, record, 'replay'),
    evidence: componentAdoption(owner, record, 'evidence'),
  })
}
