import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import type { LedgerRecord } from '@omne-harness/tool'

export type ObservedResult = Readonly<{
  delivery: string
  original: 'none' | 'offloaded'
  content: readonly unknown[]
  summary: readonly unknown[] | null
  attachments: number
}>

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
