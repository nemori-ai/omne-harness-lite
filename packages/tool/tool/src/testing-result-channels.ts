import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolRenderedResult } from '@omne-harness/tool-contract'
import type { ResultValue } from './ledger-result-material.ts'

export function createTestResultChannels<B extends ContentBlock>(
  input: Readonly<{ value: ToolRenderedResult<B> }>,
): ResultValue {
  if (input.value.original.kind !== 'none')
    throw new Error('offloaded fixtures require real body preparation')
  return { ...input.value, original: input.value.original }
}
