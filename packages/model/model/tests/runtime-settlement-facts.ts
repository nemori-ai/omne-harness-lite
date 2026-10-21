import { writeJsonText } from '@omne-harness/json-text'
import type { ResultPart, TransportFact } from '@omne-harness/model-contract'

/** Supplies only upstream facts. The real sender, receiver and driver still own every write. */
export function resultFacts(parts: readonly ResultPart[]): TransportFact[] {
  return parts.flatMap((part, position): TransportFact[] => {
    const index = String(position)
    if (part.kind === 'partial')
      return [
        { kind: 'block-open', index, mode: 'replace', content: part.content },
        { kind: 'block-replace', index, value: part.value },
        ...part.trims.map(trim => ({ kind: 'trim' as const, index, ...trim })),
      ]
    const block = part.block
    if (block.kind === 'image' || block.kind === 'file')
      return [{ kind: 'block-seal', index, block }]
    return [
      {
        kind: 'block-open',
        index,
        mode: 'replace',
        content:
          block.kind === 'tool_call'
            ? 'tool-arguments'
            : block.kind === 'text'
              ? 'text'
              : block.kind === 'thinking'
                ? 'thinking'
                : 'voice',
      },
      {
        kind: 'block-replace',
        index,
        value:
          block.kind === 'tool_call'
            ? writeJsonText(block.arguments)
            : 'text' in block
              ? block.text
              : 'inline' in block
                ? block.inline
                : '',
      },
      ...part.trims.map(trim => ({ kind: 'trim' as const, index, ...trim })),
      { kind: 'block-seal', index, block },
    ]
  })
}
