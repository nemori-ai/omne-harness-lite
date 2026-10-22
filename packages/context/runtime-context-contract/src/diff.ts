import type { DescriptorCatalog } from './descriptor.js'
import type { Snapshot, Changes, ChangeMaterial } from './reader.js'
export type DiffInput = Readonly<{
  previous: Snapshot | null
  next: Snapshot | Changes
  descriptors: DescriptorCatalog
}>
export function diffForReminder(input: DiffInput): readonly ChangeMaterial[] {
  const before = new Map(input.previous?.blocks.map(block => [block.key, block]) ?? [])
  const entries = 'blocks' in input.next ? input.next.blocks : input.next.entries
  return entries.flatMap(entry => {
    const descriptor = input.descriptors.get(entry.key)
    if (
      !descriptor ||
      descriptor.volatility === 'per-request' ||
      !descriptor.consumers.includes('model')
    )
      return []
    const previous = before.get(entry.key)
    if (previous && entry.revision <= previous.revision) return []
    const material: ChangeMaterial = {
      key: entry.key,
      from: previous?.revision ?? null,
      to: entry.revision,
      previous:
        descriptor.carriesPrevious && previous?.state.kind === 'value'
          ? { kind: 'value', value: previous.state.value }
          : { kind: 'withheld' },
    }
    return [material]
  })
}
