import type { AssetEntry, AssetListRequest } from './layers.ts'

const orderOf = (category: string, name: string): string => JSON.stringify([category, name])

type Page<T> = Readonly<{ items: readonly T[]; next: string | null }>

/** A page of the ledger with the definitions plugins placed that it does not hold, in the ledger's order; the cursor stays a name. */
export function withPlaced<T extends AssetEntry, P extends Page<T>>(
  page: P,
  placed: readonly T[],
  request: AssetListRequest,
): P {
  const keyOf = ({ capability }: AssetEntry) => orderOf(capability.category, capability.name)
  const after = request.after === null ? '' : orderOf(request.category, request.after)
  const last = page.items.at(-1)
  const bound = page.next === null || last === undefined ? undefined : keyOf(last)
  const held = new Set(page.items.map(each => each.capability.name))
  const extra = placed.filter(
    each =>
      each.capability.category === request.category &&
      !held.has(each.capability.name) &&
      keyOf(each) > after &&
      (bound === undefined || keyOf(each) <= bound),
  )
  if (extra.length === 0) return page
  const items = [...page.items, ...extra].sort((left, right) =>
    keyOf(left) < keyOf(right) ? -1 : 1,
  )
  if (items.length <= request.limit) return { ...page, items }
  const kept = items.slice(0, request.limit)
  return { ...page, items: kept, next: kept.at(-1)?.capability.name ?? null }
}
