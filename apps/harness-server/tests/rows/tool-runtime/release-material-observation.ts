import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import type { LedgerRecord } from '@omne-harness/tool'

/** One result record of the Tool ledger as the release leaves it (physical, read-only). */
export type ObservedResult = Readonly<{
  delivery: string
  original: 'none' | 'offloaded'
  /** The content blocks still held in the record. */
  content: readonly unknown[]
  /** The summary of the offloaded original, or `null` for an inline result. */
  summary: readonly unknown[] | null
  attachments: number
}>

/**
 * Read-only physical evidence from the isolated test database: every result record of the one
 * Tool ledger. Never drives model reads.
 */
export function observeToolResults(storageRoot: string): readonly ObservedResult[] {
  const directory = join(storageRoot, 'domains')
  const found: ObservedResult[][] = []
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sqlite'))) {
    const db = new DatabaseSync(join(directory, name), { readOnly: true })
    try {
      if (!db.prepare("SELECT name FROM sqlite_schema WHERE name='tl_record'").get()) continue
      const records = db
        .prepare('SELECT record FROM tl_record')
        .all()
        .map(row => JSON.parse(unpackText(row['record'] as Uint8Array)) as LedgerRecord)
      found.push(
        records.flatMap(record =>
          record.kind === 'result'
            ? [
                {
                  delivery: record.result.delivery.kind,
                  original: record.result.value.original.kind,
                  content: record.result.value.content,
                  summary:
                    record.result.value.original.kind === 'offloaded'
                      ? record.result.value.original.summary
                      : null,
                  attachments: record.result.value.attachments.length,
                },
              ]
            : [],
        ),
      )
    } finally {
      db.close()
    }
  }
  if (found.length !== 1 || found[0] === undefined) throw new Error('expected one Tool database')
  return found[0]
}

/**
 * Every result is released and holds only what the release leaves (C6): no attachments, an inline
 * result holds no content, an offloaded result holds exactly the summary of its original. The
 * ledger holds `offloaded` offloaded results and at least one result.
 */
export function resultsReleased(results: readonly ObservedResult[], offloaded: 0 | 1): boolean {
  return (
    results.length > 0 &&
    results.filter(result => result.original === 'offloaded').length === offloaded &&
    results.every(
      result =>
        result.delivery === 'released' &&
        result.attachments === 0 &&
        (result.original === 'none'
          ? result.content.length === 0
          : JSON.stringify(result.content) === JSON.stringify(result.summary)),
    )
  )
}
