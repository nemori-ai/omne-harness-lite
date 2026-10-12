import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import type { BlockNode } from './types.ts'
export function children(block: ContentBlock): readonly ContentBlock[] {
  if (block.kind === 'tool_result') return block.blocks
  if ('renderings' in block && block.renderings !== undefined)
    return block.renderings.flatMap(value => value.blocks)
  return []
}
interface MutableNode {
  readonly block: ContentBlock
  readonly children: MutableNode[]
  readonly parent: MutableNode | null
  readonly readable: boolean
  readonly pendingAncestor: boolean
  hasPending: boolean
}
export function indexBlocks(
  roots: readonly ContentBlock[],
  pending: ReadonlySet<string>,
): {
  readonly roots: readonly BlockNode[]
  readonly byId: ReadonlyMap<string, BlockNode>
  readonly count: number
} {
  const indexed: MutableNode[] = [],
    byId = new Map<string, MutableNode>(),
    order: MutableNode[] = []
  const work: {
    readonly block: ContentBlock
    readonly parent: MutableNode | null
    readonly target: MutableNode[]
  }[] = []
  for (const block of roots) work.push({ block, parent: null, target: indexed })
  while (work.length > 0) {
    const item = work.pop()!,
      { block, parent } = item
    const named = pending.has(block.id)
    const node: MutableNode = {
      block,
      children: [],
      parent,
      readable: (parent?.readable ?? true) && block.visibility.toModel,
      pendingAncestor: (parent?.pendingAncestor ?? false) || named,
      hasPending: named,
    }
    item.target.push(node)
    byId.set(block.id, node)
    order.push(node)
    const nested = children(block)
    for (let i = nested.length - 1; i >= 0; i--)
      work.push({ block: nested[i]!, parent: node, target: node.children })
  }
  // Root stack entries were pushed in natural order. Restore only that reversed level.
  indexed.reverse()
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i]!
    if (node.hasPending && node.parent !== null) node.parent.hasPending = true
  }
  return { roots: indexed, byId, count: order.length }
}
function rebuilt(
  node: BlockNode,
  selected: ReadonlyMap<BlockNode, ContentBlock | null>,
): ContentBlock {
  const block = node.block
  if (block.kind === 'tool_result')
    return Object.freeze({
      ...block,
      blocks: Object.freeze(node.children.flatMap(child => selected.get(child) ?? [])),
    }) as ContentBlock
  if ('renderings' in block && block.renderings !== undefined) {
    let offset = 0
    const renderings = block.renderings.map(rendering => {
      const blocks = rendering.blocks.flatMap(() => selected.get(node.children[offset++]!) ?? [])
      return Object.freeze({ ...rendering, blocks: Object.freeze(blocks) })
    })
    return Object.freeze({ ...block, renderings: Object.freeze(renderings) }) as ContentBlock
  }
  return block
}
export function selectBlocks(
  roots: readonly BlockNode[],
  silenced: ReadonlySet<string>,
): { readonly blocks: readonly ContentBlock[]; readonly ids: readonly string[] } {
  const selected = new Map<BlockNode, ContentBlock | null>(),
    order: BlockNode[] = [],
    blocked = new Set<BlockNode>()
  const stack = [...roots]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (
      !node.readable ||
      silenced.has(node.block.id) ||
      (node.parent !== null && blocked.has(node.parent))
    )
      blocked.add(node)
    order.push(node)
    for (const child of node.children) stack.push(child)
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i]!
    selected.set(node, blocked.has(node) ? null : rebuilt(node, selected))
  }
  return {
    blocks: Object.freeze(roots.flatMap(node => selected.get(node) ?? [])),
    ids: Object.freeze(order.filter(node => !blocked.has(node)).map(node => node.block.id)),
  }
}
