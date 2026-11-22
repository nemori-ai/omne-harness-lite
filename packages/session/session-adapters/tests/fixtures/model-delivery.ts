import type { Material, ReceivedEntry } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import { evidence } from './common-journal.ts'
import { json, textOf } from './tool-delivery.ts'

// The material a Model delivery is kept as, in the schema the model log consumption adopts.

export const SCHEMA = {
  owner: 'agent',
  name: 'received-model-delivery',
  revision: '1',
  digest: 'agent:received-model-delivery/1',
}
export type Draft = Omit<ReceivedEntry, 'material'>

function deliveryOf(draft: Draft): Record<string, unknown> {
  const { delivery } = draft
  if (delivery.producer !== 'model') throw new Error('fixture: a Model entry')
  return 'accounts' in delivery
    ? {
        kind: 'result',
        key: delivery.key,
        consumer: draft.consumer,
        settlement: {
          version: delivery.key.result,
          termination: { kind: 'completed' },
          cursor: { kind: 'end' },
          source: evidence('settlement'),
        },
        parts: [],
        accounts: delivery.accounts,
      }
    : { kind: 'account', key: delivery.key, consumer: draft.consumer, account: delivery.account }
}

export function materialOf(
  tenant: TenantId,
  draft: Draft,
  change: (value: Record<string, unknown>) => Record<string, unknown> = value => value,
): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: SCHEMA,
    value: json(change({ tenant: textOf(tenant), delivery: deliveryOf(draft) })),
  }
}
