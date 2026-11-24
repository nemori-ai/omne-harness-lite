import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  SessionHistoryIndexService,
  sessionHistoryIndexKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createSqliteHistoryIndex } from '@omne-harness/session-search-sqlite'
import { z } from 'zod'
import { defineRow, type RowHandle } from '../../row.ts'

export const sessionHistoryIndexRowConfigSchema = z.strictObject({
  /** Where the index files of all tenants live: its own directory, outside the storage root. */
  root: z.string().refine(isAbsolute, 'root must be an absolute path'),
})

class HistoryIndexImpl extends SessionHistoryIndexService {
  readonly index: SessionHistoryIndexService['index']
  constructor(ctx: Context, index: SessionHistoryIndexService['index']) {
    super(ctx)
    this.index = index
  }
}

async function body(ctx: Context, raw: unknown): Promise<RowHandle> {
  const { root } = sessionHistoryIndexRowConfigSchema.parse(raw)
  const index = createSqliteHistoryIndex({ root })
  new HistoryIndexImpl(ctx, index)
  return {
    async stop() {
      await index.close()
      return { kind: 'settled' as const }
    },
  }
}

/** The history index: files and two threads of its own, apart from the storage provider. */
export const sessionHistoryIndexRow = defineRow({
  row: 'session-history-index',
  implementation: 'real',
  manifest: { provides: [sessionHistoryIndexKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: sessionHistoryIndexRowConfigSchema,
  body,
})
