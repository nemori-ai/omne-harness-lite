import { sameFactValue } from './evidence.ts'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { Attachment, ToolFailure } from '@omne-harness/tool-contract'
import { invalid } from './boundary.ts'
import { bodyOf } from './ledger-body-custody.ts'
import type { Snapshot } from './ledger-decider.ts'

import { materialContent } from './ledger-material-content.ts'
import type { PreparedBody } from './ledger-result-material.ts'
import type { BodyPolicy } from './result-offloading.ts'

export function authorBody(
  snapshot: Snapshot,
  source: Attachment,
): Outcome<Readonly<{ prepared: PreparedBody; policy: BodyPolicy }>, ToolFailure> {
  const record = [...snapshot.bodyPreparations.values()].find(
    record =>
      record.state.kind === 'sealed' && sameFactValue(materialContent(record.state.seal), source),
  )
  if (record === undefined || record.state.kind !== 'sealed')
    return invalid('original.source', 'same-call-sealed-body-required')
  const material = snapshot.materials.get(record.operation)
  if (
    material?.purpose !== 'body' ||
    material.state.kind !== 'sealed' ||
    !sameFactValue(material.state.seal, record.state.seal)
  )
    return invalid('original.source', 'body-material-unavailable')
  const body = bodyOf(record)
  if ('failure' in body) return body
  return succeed({
    policy: record.policy,
    prepared: {
      seal: record.state.seal,
      retentionMs: record.policy.retentionMs,
      policy: record.policy.adoption,
      description: {
        source: body.ok.source,
        bodyId: body.ok.bodyId,
        representation: body.ok.representation,
        bodyBytes: body.ok.bodyBytes,
        previewKind: 'author-summary',
      },
    },
  })
}
