import type { ModelProvenance } from './values.ts'
export const UNKNOWN_MODEL_PROVENANCE = '@omne-harness/session-contract/unknown-model-provenance'

/** A mixed summary inherits every input source; no textual guessing can separate its authors. */
export function summarizeModelProvenance(
  inputs: readonly (readonly ModelProvenance[] | undefined)[],
  blocks: readonly string[],
): readonly ModelProvenance[] {
  const refs = new Map<string, Pick<ModelProvenance, 'owner' | 'key'>>()
  for (const sources of inputs) {
    const values = sources ?? [
      { owner: UNKNOWN_MODEL_PROVENANCE, key: 'unproven-input', blocks: [] },
    ]
    for (const { owner, key } of values) refs.set(JSON.stringify([owner, key]), { owner, key })
  }
  return [...refs.values()].map(ref => ({ ...ref, blocks }))
}

export function projectModelProvenance(
  sources: readonly ModelProvenance[] | undefined,
  withdrawn: ReadonlySet<string>,
): readonly ModelProvenance[] | undefined {
  return sources?.flatMap(source => {
    const blocks = source.blocks.filter(block => !withdrawn.has(block))
    return blocks.length === 0 ? [] : [{ ...source, blocks }]
  })
}
