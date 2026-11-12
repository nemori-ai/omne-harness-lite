// The production in-memory catalog store (SPEC CS1–CS7). It keeps whole records by the
// canonical text of the catalog key for one run; nothing is durable. Memory is always
// available, so it never answers `unavailable` (CS8 does not apply).
import type { ActionCatalogRecord } from '@omne-harness/mcp-contract'
import type { CatalogStore } from '@omne-harness/mcp-contract/provider'
import { catalogKeyTextOf } from '../internal/text.ts'

export function createInMemoryCatalogStore(): CatalogStore {
  const records = new Map<string, ActionCatalogRecord>()
  return {
    async read(key) {
      return { ok: records.get(catalogKeyTextOf(key)) ?? 'absent' }
    },
    async write(key, record, expected) {
      const text = catalogKeyTextOf(key)
      const current = records.get(text)?.revision ?? 'absent'
      if (current !== expected) return { failure: 'revision-conflict' }
      records.set(text, record)
      return { ok: true }
    },
  }
}
