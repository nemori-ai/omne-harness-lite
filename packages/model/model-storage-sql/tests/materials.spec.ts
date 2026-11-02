// The static materials (sql-contract §4): one participant `model`, its migration and the two read
// handlers, each module named by its file URL and the SHA-256 of the file bytes. A provider loads
// every module by the default export of that file, so each case here loads it the same way. The
// fixture of the other suites also takes its participant, migration and handlers from these files,
// so every ModelCommands case runs through them.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CALL_HANDLER,
  MIGRATION,
  MODEL_PARTICIPANT,
  MODEL_TABLES,
  PENDING_HANDLER,
  PROTOCOL,
  modelStorageMaterials,
} from '@omne-harness/model-storage-sql'
import type {
  MigrationModule,
  ParticipantModule,
  ReadHandlerModule,
} from '@omne-harness/sql-contract/worker'
import { callId, opId, sqlCommands, tenantOf, unbox } from './fixture.ts'

const materials = modelStorageMaterials()

const sha256 = (url: string) =>
  createHash('sha256')
    .update(readFileSync(fileURLToPath(url)))
    .digest('hex')

async function defaultOf<T>(url: string): Promise<T> {
  return ((await import(/* @vite-ignore */ url)) as { default: T }).default
}

describe('the materials of the Model records', () => {
  it('describe one participant `model` that owns the four `md_` tables, and its migration', () => {
    expect(materials.participants.map(item => item.participant)).toEqual([MODEL_PARTICIPANT])
    expect(materials.participants[0]?.ownedTables).toEqual(MODEL_TABLES)
    for (const table of MODEL_TABLES) expect(table).toMatch(/^md_/u)
    expect(materials.migrations.map(item => [item.owner, item.id])).toEqual([
      [MIGRATION.owner, MIGRATION.id],
    ])
  })

  it('describe the two read handlers, each in its own module file, reading only `md_` tables', () => {
    expect(materials.readHandlers.map(item => item.handler)).toEqual([
      CALL_HANDLER,
      PENDING_HANDLER,
    ])
    const [call, pending] = materials.readHandlers
    expect(call?.moduleUrl).not.toBe(pending?.moduleUrl)
    for (const handler of materials.readHandlers) {
      expect(handler.protocol).toBe(PROTOCOL)
      expect(handler.requiresMigrations).toEqual([{ owner: MIGRATION.owner, id: MIGRATION.id }])
      expect(handler.maxOutputBytes).toBeLessThanOrEqual(4 * 1024 * 1024)
      for (const table of handler.readTables) expect(MODEL_TABLES).toContain(table)
    }
  })

  it('name every module by a file URL whose bytes have the stated SHA-256', () => {
    const modules = [
      ...materials.participants.map(item => [item.moduleUrl, item.codeDigest] as const),
      ...materials.migrations.map(item => [item.moduleUrl, item.checksum] as const),
      ...materials.readHandlers.map(item => [item.moduleUrl, item.codeDigest] as const),
    ]
    expect(new Set(modules.map(([url]) => url)).size).toBe(4)
    for (const [url, digest] of modules) {
      expect(url.startsWith('file:')).toBe(true)
      expect(sha256(url)).toBe(digest)
    }
  })
})

describe('loading by the default export of each module file', () => {
  it('gives the participant, the migration and the handler that each descriptor names', async () => {
    const [participant] = materials.participants
    const [migration] = materials.migrations
    if (participant === undefined || migration === undefined) throw new Error('no materials')
    const loadedParticipant = await defaultOf<ParticipantModule>(participant.moduleUrl)
    expect([loadedParticipant.participant, loadedParticipant.protocol]).toEqual([
      participant.participant,
      participant.protocol,
    ])
    const loadedMigration = await defaultOf<MigrationModule>(migration.moduleUrl)
    expect([loadedMigration.owner, loadedMigration.id]).toEqual([migration.owner, migration.id])
    for (const handler of materials.readHandlers) {
      const loaded = await defaultOf<ReadHandlerModule>(handler.moduleUrl)
      expect([loaded.handler, loaded.protocol]).toEqual([handler.handler, handler.protocol])
      expect(typeof loaded.read).toBe('function')
    }
  })

  it('serves the reads of the commands on node:sqlite through the loaded handlers', async () => {
    const A = tenantOf('a')
    const { commands, core } = sqlCommands([A])
    const admitted = unbox(await commands.admit(core.admitOf(A, callId('one'), opId('admit-one'))))
    expect(admitted.recovered).toBe(false)
    const access = { principal: core.admitOf(A, callId('one'), opId('x')).principal, tenant: A }
    // `model.call` answers the recall; `model.pending` answers the scan.
    const recalled = unbox(
      await commands.recall({ ...access, call: callId('one'), admission: opId('admit-one') }),
    )
    expect(recalled.kind).toBe('found')
    expect(await commands.scanPending({ ...access, after: null, limit: 2 })).toEqual({
      ok: { calls: [callId('one')], next: null },
    })
  })
})
