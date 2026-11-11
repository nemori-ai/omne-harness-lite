import { z } from 'zod'
import type {
  GovernanceBasis,
  GovernanceCatalogItem,
  GovernanceCatalogPage,
} from '@omne-harness/governance-contract'
import type { CatalogBinding, CatalogCurrent } from './catalog-schema.ts'
import { canonical, digest, equal } from './encoding.ts'
const cursorSchema = z.strictObject({
  protocol: z.literal('governance-page/1'),
  binding: z.string(),
  witness: z.string(),
  after: z.string(),
})
const ordered = (values: readonly unknown[]) => values.map(canonical).sort()
function cursorBasis(binding: CatalogBinding, current: CatalogCurrent, basis: GovernanceBasis) {
  return {
    binding: digest({
      scope: binding.scope,
      principalRef: binding.principalRef,
      mode: binding.request.mode,
      targets: ordered(binding.request.targets),
    }),
    witness: digest({
      basis,
      targets: ordered(current.targets),
      enforcement: ordered(current.enforcementBindings),
      unavailableOwners: [...current.unavailableOwners].sort(),
    }),
  }
}
function afterKey(cursor: string | null, expected: ReturnType<typeof cursorBasis>) {
  if (cursor === null) return { kind: 'after' as const, key: '' }
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const parsed = cursorSchema.parse(raw)
    if (
      equal(parsed, raw) &&
      parsed.binding === expected.binding &&
      parsed.witness === expected.witness
    )
      return { kind: 'after' as const, key: parsed.after }
  } catch {
    /* A cursor is untrusted transport. */
  }
  return { kind: 'conflict' as const, reason: 'basis' as const }
}
type CatalogEntry = Readonly<{ key: string; item: GovernanceCatalogItem }>
function pagePrefix(entries: readonly CatalogEntry[], limit: number, envelopeBytes: number) {
  const items: GovernanceCatalogItem[] = []
  let last: string | null = null
  let bytes = envelopeBytes
  for (const entry of entries) {
    if (items.length === limit) break
    const cost = Buffer.byteLength(canonical(entry.item)) + (items.length === 0 ? 0 : 1)
    if (bytes + cost > 1024 * 1024) {
      if (items.length === 0) return { kind: 'limited' as const, resource: 'catalog-item-bytes' }
      break
    }
    bytes += cost
    items.push(entry.item)
    last = entry.key
  }
  return { kind: 'prefix' as const, items, last }
}
export function catalogPage(
  binding: CatalogBinding,
  current: CatalogCurrent,
  basis: GovernanceBasis,
  entries: readonly Readonly<{ key: string; item: GovernanceCatalogItem }>[],
) {
  const expected = cursorBasis(binding, current, basis)
  const after = afterKey(binding.request.cursor, expected)
  if (after.kind !== 'after') return after
  if (after.key !== '' && !entries.some(entry => entry.key === after.key))
    return { kind: 'conflict' as const, reason: 'basis' as const }
  const remaining = entries.filter(entry => entry.key > after.key)
  const page: GovernanceCatalogPage = {
    kind: 'page',
    items: [],
    snapshot: basis,
    completeness: current.unavailableOwners.length ? 'partial' : 'complete',
    unavailableOwners: [...new Set(current.unavailableOwners)].sort(),
    nextCursor: null,
  }
  const prefix = pagePrefix(
    remaining,
    binding.request.limit,
    Buffer.byteLength(canonical({ ...page, nextCursor: 'x'.repeat(8192) })),
  )
  if (prefix.kind !== 'prefix') return prefix
  const { items } = prefix
  const nextCursor =
    items.length < remaining.length
      ? Buffer.from(
          canonical({
            protocol: 'governance-page/1',
            ...expected,
            after: prefix.last ?? after.key,
          }),
        ).toString('base64url')
      : null
  if (nextCursor !== null && nextCursor.length > 8192)
    return { kind: 'limited' as const, resource: 'catalog-cursor' }
  return { ...page, items, nextCursor }
}
