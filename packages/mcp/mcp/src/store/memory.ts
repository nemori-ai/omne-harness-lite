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
