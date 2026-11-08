import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import { invalid, judgeAdoptionField, judgeEvidenceField } from './boundary.ts'
import { fixAttachment } from './ledger-content.ts'
import { historyObject } from './history-source.ts'
import type { HistoricalTextInterpretation } from './history-contract.ts'

/** Decodes trusted configuration without inferring an interpretation from current tool declarations. */
export function decodeHistoricalTextInterpretation(
  value: unknown,
): Outcome<HistoricalTextInterpretation, ToolFailure> {
  if (
    !historyObject(value) ||
    !historyObject(value.representation) ||
    value.representation.kind !== 'text' ||
    Object.keys(value).some(
      key =>
        !['tool', 'rawCodec', 'source', 'interpretation', 'representation', 'basis'].includes(key),
    ) ||
    Object.keys(value.representation).some(key => !['kind', 'codec'].includes(key))
  )
    return invalid('interpretations', 'encoding')
  const tool = judgeAdoptionField(value.tool, 'tool')
  const rawCodec = judgeAdoptionField(value.rawCodec, 'rawCodec')
  const interpretation = judgeAdoptionField(value.interpretation, 'interpretation')
  const codec = judgeAdoptionField(value.representation.codec, 'codec')
  const basis = judgeEvidenceField(value.basis, 'basis')
  const source = fixAttachment(value.source)
  if (
    'failure' in tool ||
    'failure' in rawCodec ||
    'failure' in interpretation ||
    'failure' in codec ||
    'failure' in basis ||
    'failure' in source
  )
    return invalid('interpretations', 'encoding')
  return succeed({
    tool: tool.ok,
    rawCodec: rawCodec.ok,
    interpretation: interpretation.ok,
    source: source.ok,
    basis: basis.ok,
    representation: { kind: 'text', codec: codec.ok },
  })
}
