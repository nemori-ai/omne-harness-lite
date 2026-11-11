import { succeed } from '@omne-harness/operation-result'
import type { ToolBindingKey } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource, ToolListingSource } from '@omne-harness/tool-host-local'

export const catalogSearch = { k1: 1.2, b: 0.75, maxCachedCorpora: 2 }

/** Test-only disclosure authority. Production assemblies must supply their own adopted view. */
export function catalogView<P>(
  registry: ToolListingSource<P> | null,
): LocalToolCatalogViewSource<P> {
  return {
    read: async access => {
      const listed = registry?.listings(access)
      return succeed({
        scope: {
          owner: 'test',
          record: JSON.stringify(access.tenant),
          revision: '1',
          digest: 'test',
        },
        revision: '1',
        entries:
          listed !== undefined && 'ok' in listed
            ? listed.ok.map(row => ({ key: row.entry.key, resident: false }))
            : [],
      })
    },
  }
}

export function fixedCatalogView<P>(
  keys: readonly ToolBindingKey[],
): LocalToolCatalogViewSource<P> {
  return {
    read: async () =>
      succeed({
        scope: { owner: 'test', record: 'fixture', revision: '1', digest: 'test' },
        revision: '1',
        entries: keys.map(key => ({ key, resident: false })),
      }),
  }
}
