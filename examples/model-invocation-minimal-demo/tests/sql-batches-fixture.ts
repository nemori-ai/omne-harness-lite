import { DatabaseSync } from 'node:sqlite'
import {
  readJsonStrict,
  writeJsonLossless,
  copyJsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { readModelLogEnvelope } from '@omne-harness-lite/model-request-runtime'

/** Test-only inspection of actual SQL batch ids. Adjacency alone is not the atomicity oracle. */
export function physicalBatches<T = unknown>(
  file: string,
): {
  readonly entries: {
    readonly dedupeKey: string | undefined
    readonly physical: JsonObject
    readonly physicalPayload: JsonObject
    readonly payload: { readonly category: string; readonly value: T }
  }[]
}[] {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = db
      .prepare(
        'select session, batch, value from sl_entry order by session, position_length, position',
      )
      .all()
    const batches = new Map<string, ReturnType<typeof physicalBatches<T>>[number]>()
    for (const row of rows) {
      if (typeof row.value !== 'string') throw new Error('SQL row fixture is not text')
      const parsed = readJsonStrict(row.value)
      if (
        'failed' in parsed ||
        typeof parsed.ok !== 'object' ||
        parsed.ok === null ||
        Array.isArray(parsed.ok)
      )
        throw new Error('corrupt physical entry')
      const physicalPayload = (parsed.ok as JsonObject).payload
      if (
        typeof physicalPayload !== 'object' ||
        physicalPayload === null ||
        Array.isArray(physicalPayload)
      )
        throw new Error('physical entry is not a log payload')
      const decoded = readModelLogEnvelope(physicalPayload)
      const key = JSON.stringify([row.session, row.batch])
      const batch = batches.get(key) ?? { entries: [] }
      batch.entries.push({
        dedupeKey:
          typeof (parsed.ok as JsonObject).dedupeKey === 'string'
            ? ((parsed.ok as JsonObject).dedupeKey as string)
            : undefined,
        physical: parsed.ok as JsonObject,
        physicalPayload: physicalPayload as JsonObject,
        payload:
          'kind' in decoded && decoded.kind === 'model'
            ? { category: decoded.envelope.category, value: decoded.envelope.value as T }
            : { category: 'other', value: physicalPayload as T },
      })
      batches.set(key, batch)
    }
    return [...batches.values()]
  } finally {
    db.close()
  }
}

/** Decoded model values grouped by actual SQL batch ids; this view is never persisted. */
export function modelBatchText(file: string): string {
  return physicalBatches(file)
    .map(batch =>
      writeJsonLossless({
        entries: batch.entries.map(entry => ({
          ...entry.physical,
          payload: entry.payload as unknown as JsonObject,
        })),
      }),
    )
    .join('\n')
}

export function journalBatchText(file: string, session: string): string {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = db
      .prepare(
        'select batch, value from sl_entry where session=? order by position_length, position',
      )
      .all(session)
    const groups = new Map<string, string[]>()
    for (const row of rows) {
      if (typeof row.batch !== 'string' || typeof row.value !== 'string')
        throw Error('invalid SQL batch row')
      const group = groups.get(row.batch) ?? []
      group.push(row.value)
      groups.set(row.batch, group)
    }
    return [...groups.values()].map(entries => `{"entries":[${entries.join(',')}]}`).join('\n')
  } finally {
    db.close()
  }
}
/** Controlled closed-database fixture state at a whole original SQL batch boundary. */
export function retainJournalBatchesThrough(
  file: string,
  session: string,
  finalKind: string,
): void {
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE')
    const rows = db
      .prepare(
        'select position, batch, value from sl_entry where session=? order by position_length, position',
      )
      .all(session)
      .map(row => {
        if (
          typeof row.position !== 'string' ||
          typeof row.batch !== 'string' ||
          typeof row.value !== 'string'
        )
          throw Error('invalid journal fixture row')
        return { position: row.position, batch: row.batch, value: row.value }
      })
    const cut = rows.find(row => {
      if (typeof row.value !== 'string') throw Error('invalid journal fixture row')
      const entry = JSON.parse(row.value)
      return (
        entry.payload?.kind === 'fact' &&
        (entry.payload.value?.value?.kind ?? entry.payload.value?.kind) === finalKind
      )
    })
    if (cut === undefined || typeof cut.batch !== 'string')
      throw Error('required original batch absent')
    const boundary = rows.findLastIndex(row => row.batch === cut.batch)
    const retained = rows.slice(0, boundary + 1)
    for (const row of rows.slice(boundary + 1)) {
      db.prepare('delete from sl_read_key where session=? and position=?').run(
        session,
        row.position,
      )
      db.prepare('delete from sl_entry where session=? and position=?').run(session, row.position)
    }
    const last = retained.at(-1)
    if (last === undefined) throw Error('retained fixture prefix is empty')
    db.prepare('update sl_journal set tail=? where session=?').run(last.position, session)
    db.prepare('delete from sl_attempt where session=?').run(session)
    const attempts = new Map<string, number>()
    for (const row of retained) {
      const entry = JSON.parse(row.value)
      if (typeof entry.run === 'string' && typeof entry.attempt === 'number')
        attempts.set(entry.run, Math.max(attempts.get(entry.run) ?? 0, entry.attempt))
    }
    for (const [run, attempt] of attempts)
      db.prepare('insert into sl_attempt(session,run,attempt) values(?,?,?)').run(
        session,
        run,
        String(attempt),
      )
    db.exec('COMMIT')
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}
