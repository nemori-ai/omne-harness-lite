import type { VisibleBlock } from './call-surface.ts'
import type { ModelBlock } from './result.ts'
import { equalStreamValues } from './model-stream-values-tree.ts'

type BlockFailure = 'block-order' | 'block-removal' | 'block-conflict'
type Growing = Extract<VisibleBlock, { kind: 'growing' }>

function ordered(blocks: readonly VisibleBlock[]): boolean {
  let previous = -1
  for (const { index } of blocks) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(index)) return false
    const numeric = Number(index)
    if (!Number.isSafeInteger(numeric) || numeric <= previous) return false
    previous = numeric
  }
  return true
}

function extendsValue(before: Growing, value: string): boolean {
  return before.mode === 'replace' || value.startsWith(before.value)
}

function seals(before: Growing, block: ModelBlock): boolean {
  switch (before.content) {
    case 'text':
    case 'thinking':
      return block.kind === before.content && extendsValue(before, block.text)
    case 'voice':
      return block.kind === 'voice' && ('ref' in block || extendsValue(before, block.inline))
    case 'tool-arguments':
      return block.kind === 'tool_call'
  }
}

function compatible(before: VisibleBlock, after: VisibleBlock): boolean {
  if (before.kind === 'sealed')
    return after.kind === 'sealed' && equalStreamValues(before.block, after.block)
  if (after.kind === 'sealed') return seals(before, after.block)
  return (
    before.mode === after.mode &&
    before.content === after.content &&
    extendsValue(before, after.value)
  )
}

export function checkStreamBlocks(
  before: readonly VisibleBlock[],
  after: readonly VisibleBlock[],
  delta: readonly VisibleBlock[],
): BlockFailure | null {
  if (!ordered(before) || !ordered(after) || !ordered(delta)) return 'block-order'
  const previous = new Map(before.map(block => [block.index, block]))
  const next = new Map(after.map(block => [block.index, block]))
  if (before.some(block => !next.has(block.index))) return 'block-removal'
  const last = before.at(-1)
  if (
    last &&
    after.some(block => !previous.has(block.index) && Number(block.index) <= Number(last.index))
  )
    return 'block-order'
  if (
    before.some(block => {
      const target = next.get(block.index)
      return target !== undefined && !compatible(block, target)
    })
  )
    return 'block-conflict'
  return null
}

export function mergeStreamBlocks(
  before: readonly VisibleBlock[],
  delta: readonly VisibleBlock[],
): readonly VisibleBlock[] {
  const updates = new Map(delta.map(block => [block.index, block]))
  const existing = new Set(before.map(block => block.index))
  return [
    ...before.map(block => updates.get(block.index) ?? block),
    ...delta.filter(block => !existing.has(block.index)),
  ]
}

export function changedStreamBlocks(
  before: readonly VisibleBlock[],
  after: readonly VisibleBlock[],
): readonly VisibleBlock[] {
  const previous = new Map(before.map(block => [block.index, block]))
  return after.filter(block => !equalStreamValues(previous.get(block.index), block))
}
