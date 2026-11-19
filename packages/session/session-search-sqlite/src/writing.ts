import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { documentRow, type IndexDocument } from '@omne-harness/session-search'
import {
  buildingFile,
  buildingOf,
  currentFile,
  directoryOf,
  fileOf,
  pointerOf,
  syncFile,
  writeJson,
} from './files.ts'
import type { Handle } from './handles.ts'
import { sessionMarker } from './match.ts'
import { SERIALS, type ReadContext, type StoreFailure } from './reading.ts'

export type StoreAppendRequest = Readonly<{
  tenant: string
  generation: number
  session: string
  through: string
  at: number
  documents: readonly Readonly<{
    position: string
    revision: string
    at: number
    document: IndexDocument
  }>[]
}>
/** Testing only: called inside an append, after the rows and before the cover. */
export type AppendFaults = Readonly<{ afterRows?: () => void }>

const SCHEMA = [
  `CREATE VIRTUAL TABLE grams USING fts5(row, tokenize = 'trigram case_sensitive 1', detail = none, content = '', columnsize = 0)`,
  `CREATE VIRTUAL TABLE vocab USING fts5vocab(grams, 'row')`,
  `CREATE TABLE session (ordinal INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, covered INTEGER NOT NULL, last_at INTEGER NOT NULL) STRICT`,
  `CREATE TABLE doc (id INTEGER PRIMARY KEY, session INTEGER NOT NULL, position INTEGER NOT NULL) STRICT`,
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`,
  // Merging is done in small steps by `compact`, not inside whichever append trips over it.
  `INSERT INTO grams(grams, rank) VALUES ('automerge', 0)`,
]

function writeBatch(
  context: ReadContext,
  handle: Handle,
  request: StoreAppendRequest,
  faults: AppendFaults,
): void {
  const prepare = (sql: string) => context.handles.statement(handle, sql)
  prepare('INSERT OR IGNORE INTO session (id, covered, last_at) VALUES (?, 0, 0)').run(
    request.session,
  )
  const row = prepare('SELECT ordinal, covered FROM session WHERE id = ?').get(request.session)!
  const ordinal = Number(row['ordinal'])
  const covered = row['covered'] as bigint
  const marker = sessionMarker(ordinal)
  const serials = new Map<bigint, bigint>()
  const top = prepare('SELECT max(id) AS top FROM doc WHERE id >= ? AND id < ?')
  const addDoc = prepare('INSERT INTO doc (id, session, position) VALUES (?, ?, ?)')
  const addRow = prepare('INSERT INTO grams (rowid, row) VALUES (?, ?)')
  for (const item of request.documents) {
    // At or behind the cover: this commit was written before. Writing it again would double it.
    if (BigInt(item.revision) <= covered) continue
    const position = BigInt(item.position)
    const base = BigInt(item.at) * SERIALS
    const taken = serials.get(base) ?? (top.get(base, base + SERIALS)?.['top'] as bigint | null)
    const id = taken === null || taken === undefined ? base : taken + 1n
    serials.set(base, id)
    addDoc.run(id, ordinal, position)
    addRow.run(id, documentRow(item.document, [marker]))
  }
  faults.afterRows?.()
  const through = BigInt(request.through)
  if (through > covered)
    prepare('UPDATE session SET covered = ?, last_at = ? WHERE ordinal = ?').run(
      through,
      BigInt(request.at),
      ordinal,
    )
}

/** Rows and cover in one transaction: either both are there afterwards, or neither. */
export function appendTo(
  context: ReadContext,
  request: StoreAppendRequest,
  faults: AppendFaults = {},
): null | StoreFailure {
  const directory = directoryOf(context.root, request.tenant)
  const building = buildingOf(directory, context.boot)?.generation
  if (![pointerOf(directory)?.generation, building].includes(request.generation))
    return 'generation-gone'
  let handle: Handle
  try {
    handle = context.handles.handleOf(
      fileOf(directory, request.generation),
      request.generation === building,
    )
    handle.db.exec('BEGIN IMMEDIATE')
  } catch {
    return 'unavailable'
  }
  try {
    writeBatch(context, handle, request, faults)
    handle.db.exec('COMMIT')
    return null
  } catch {
    handle.db.exec('ROLLBACK')
    return 'unavailable'
  }
}

export function beginRebuild(
  context: ReadContext,
  tenant: string,
  total: number,
): Readonly<{ generation: number }> | 'unavailable' {
  try {
    const directory = directoryOf(context.root, tenant)
    mkdirSync(directory, { recursive: true })
    const building = buildingOf(directory, context.boot)
    if (building !== null) return { generation: building.generation }
    const current = pointerOf(directory)?.generation ?? 0
    const taken = readdirSync(directory).map(name => Number(/^g(\d+)\.db/u.exec(name)?.[1] ?? 0))
    const generation = Math.max(current, ...taken) + 1
    for (const name of readdirSync(directory)) {
      const left = Number(/^g(\d+)\.db/u.exec(name)?.[1] ?? current)
      if (left === current) continue
      context.handles.release(fileOf(directory, left))
      rmSync(join(directory, name), { force: true })
    }
    const file = fileOf(directory, generation)
    const { db } = context.handles.handleOf(file, true)
    db.exec('BEGIN')
    for (const sql of SCHEMA) db.exec(sql)
    context.handles
      .prepared(file, `INSERT INTO meta (key, value) VALUES ('extraction', ?)`)
      .run(String(context.extraction))
    db.exec('COMMIT')
    writeJson(buildingFile(directory), { generation, total, boot: context.boot })
    return { generation }
  } catch {
    return 'unavailable'
  }
}

export function adopt(
  context: ReadContext,
  tenant: string,
  generation: number,
): null | StoreFailure {
  const directory = directoryOf(context.root, tenant)
  if (buildingOf(directory, context.boot)?.generation !== generation) return 'generation-gone'
  try {
    const built = fileOf(directory, generation)
    context.handles.handleOf(built, true).db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    context.handles.release(built)
    syncFile(built)
    const earlier = pointerOf(directory)?.generation
    writeJson(currentFile(directory), { generation, extraction: context.extraction })
    rmSync(buildingFile(directory), { force: true })
    // A search bound to the earlier generation keeps its open file; new ones cannot bind to it.
    if (earlier !== undefined && earlier !== generation) {
      const file = fileOf(directory, earlier)
      context.handles.release(file)
      for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
    }
    return null
  } catch {
    return 'unavailable'
  }
}

export function compact(context: ReadContext, tenant: string, pages: number): void {
  const directory = directoryOf(context.root, tenant)
  const building = buildingOf(directory, context.boot)?.generation
  for (const generation of [pointerOf(directory)?.generation, building])
    if (generation !== undefined)
      try {
        const merge = `INSERT INTO grams(grams, rank) VALUES ('merge', ?)`
        context.handles
          .prepared(fileOf(directory, generation), merge, generation === building)
          .run(pages)
      } catch {
        // Left for a later batch.
      }
}
