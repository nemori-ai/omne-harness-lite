import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CALL_HANDLER,
  DIAGNOSTICS_HANDLER,
  DISPATCH_FACT,
  DISPATCH_FACTS_HANDLER,
  DISPATCH_FACTS_PAGE_MAX,
  FACT_MIGRATION,
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
  it('describe one participant `model` that owns the `md_` tables, the record migration and the facts migration after it', () => {
    expect(materials.participants.map(item => item.participant)).toEqual([MODEL_PARTICIPANT])
    expect(materials.participants[0]?.ownedTables).toEqual([...MODEL_TABLES, DISPATCH_FACT.name])
    for (const table of materials.participants[0]?.ownedTables ?? []) expect(table).toMatch(/^md_/u)
    expect(materials.migrations.map(item => [item.owner, item.id, item.requires])).toEqual([
      [MIGRATION.owner, MIGRATION.id, []],
      [FACT_MIGRATION.owner, FACT_MIGRATION.id, [{ owner: MIGRATION.owner, id: MIGRATION.id }]],
    ])
  })

  it('describe the five read handlers, each in its own module file, reading only `md_` tables', () => {
    expect(materials.readHandlers.map(item => item.handler)).toEqual([
      CALL_HANDLER,
      'model.request',
      PENDING_HANDLER,
      DIAGNOSTICS_HANDLER,
      DISPATCH_FACTS_HANDLER,
    ])
    expect(new Set(materials.readHandlers.map(item => item.moduleUrl)).size).toBe(5)
    const record = { owner: MIGRATION.owner, id: MIGRATION.id }
    const facts = { owner: FACT_MIGRATION.owner, id: FACT_MIGRATION.id }
    for (const handler of materials.readHandlers) {
      expect(handler.protocol).toBe(PROTOCOL)
      expect(handler.requiresMigrations).toEqual(
        handler.handler === DISPATCH_FACTS_HANDLER ? [record, facts] : [record],
      )
      expect(handler.maxOutputBytes).toBeLessThanOrEqual(4 * 1024 * 1024)
      if (handler.handler === DISPATCH_FACTS_HANDLER)
        expect(handler.maxRowsRead).toBe(DISPATCH_FACTS_PAGE_MAX + 2)
      for (const table of handler.readTables)
        expect([...MODEL_TABLES, DISPATCH_FACT.name]).toContain(table)
    }
  })

  it('name every module by a file URL whose bytes have the stated SHA-256', () => {
    const modules = [
      ...materials.participants.map(item => [item.moduleUrl, item.codeDigest] as const),
      ...materials.migrations.map(item => [item.moduleUrl, item.checksum] as const),
      ...materials.readHandlers.map(item => [item.moduleUrl, item.codeDigest] as const),
    ]
    expect(new Set(modules.map(([url]) => url)).size).toBe(8)
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
    for (const each of materials.migrations) {
      const loadedMigration = await defaultOf<MigrationModule>(each.moduleUrl)
      expect([loadedMigration.owner, loadedMigration.id]).toEqual([each.owner, each.id])
    }
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
    const recalled = unbox(
      await commands.recall({ ...access, call: callId('one'), admission: opId('admit-one') }),
    )
    expect(recalled.kind).toBe('found')
    expect(await commands.scanPending({ ...access, after: null, limit: 2 })).toEqual({
      ok: { calls: [callId('one')], next: null },
    })
  })
})
