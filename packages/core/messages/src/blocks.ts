import type { ContentBlock, JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { isObject } from './json.ts'

/** Only block-bearing edges are traversed; arguments, payload and opaque are data. */
export function rawBlockTree(roots: readonly JsonValue[]): readonly JsonObject[] {
  const result: JsonObject[] = []
  const pending = [...roots]
  while (pending.length > 0) {
    const value = pending.pop()
    if (!isObject(value)) continue
    result.push(value)
    if (value.kind === 'tool_result' && Array.isArray(value.blocks)) pending.push(...value.blocks)
    if (Array.isArray(value.renderings)) {
      for (const rendering of value.renderings) {
        if (isObject(rendering) && Array.isArray(rendering.blocks))
          pending.push(...rendering.blocks)
      }
    }
  }
  return result
}
export interface LocatedBlock {
  readonly block: ContentBlock
  readonly path: readonly ContentBlock[]
}
export function locateBlock(
  blockId: string,
  roots: readonly ContentBlock[],
): LocatedBlock | undefined {
  const pending = roots.map(block => ({ block, path: [block] }))
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) continue
    if (current.block.id === blockId) return current
    for (const child of children(current.block))
      pending.push({ block: child, path: [...current.path, child] })
  }
  return undefined
}
function children(block: ContentBlock): readonly ContentBlock[] {
  if (block.kind === 'tool_result') return block.blocks
  if (
    (block.kind === 'voice' || block.kind === 'image' || block.kind === 'file') &&
    block.renderings !== undefined
  )
    return block.renderings.flatMap(rendering => rendering.blocks)
  return []
}
