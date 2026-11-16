import { SqliteStoragePlugin } from '@omne-harness/sqlite-provider/cordis'
import { storageHostKey, storageKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export const storageRow = defineRow({
  row: 'storage',
  implementation: 'real',
  manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
  lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
  plugin: SqliteStoragePlugin,
})
