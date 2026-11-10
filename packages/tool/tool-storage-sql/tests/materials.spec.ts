// A9: the static materials (sql-contract §4). One participant named `tool`, one migration and the
// read handlers, all on `tl_` tables, each module described by its build-fixed file URL and the
// SHA-256 of its bytes. The materials form a valid combination alone, and beside a stand-in of the
// Session participant of the same shape; a stand-in that owns a `tl_` table is refused, which
// shows that the combination check does look at the tables.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  combinationManifest,
  type ParticipantDescriptor,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { TOOL_PARTICIPANT, toolStorageMaterials } from '../src/index.ts'

const materials = toolStorageMaterials()

function catalogOf(extra: readonly ParticipantDescriptor[]): SqlMaterialCatalog {
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [...materials.participants, ...extra],
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }
}

const sessionStandIn = (tables: readonly string[]): ParticipantDescriptor => ({
  participant: 'session',
  protocol: '1',
  moduleUrl: 'file:///session/participant.js',
  codeDigest: 'b'.repeat(64),
  ownedTables: tables,
  readTables: [],
  requiresFacts: [],
  providesFacts: [],
  allowedFunctions: [],
  grouping: 'singleton',
})

const sha256 = (url: string) =>
  createHash('sha256')
    .update(readFileSync(fileURLToPath(url)))
    .digest('hex')

describe('the materials of the Tool storage', () => {
  it('describe one participant `tool` that owns only `tl_` tables', () => {
    expect(materials.participants.map(item => item.participant)).toEqual([TOOL_PARTICIPANT])
    expect(TOOL_PARTICIPANT).toBe('tool')
    const [participant] = materials.participants
    expect(participant?.ownedTables.length).toBeGreaterThan(0)
    for (const table of participant?.ownedTables ?? []) expect(table).toMatch(/^tl_/u)
  })

  it('name every module by a file URL whose bytes have the stated SHA-256', () => {
    const modules = [
      ...materials.participants.map(item => [item.moduleUrl, item.codeDigest] as const),
      ...materials.migrations.map(item => [item.moduleUrl, item.checksum] as const),
      ...materials.readHandlers.map(item => [item.moduleUrl, item.codeDigest] as const),
    ]
    expect(modules.length).toBe(5)
    for (const [url, digest] of modules) {
      expect(url.startsWith('file:')).toBe(true)
      expect(sha256(url)).toBe(digest)
    }
  })

  it('read the ledger domain in domain-serial order and the custody in snapshots, within the read bound', () => {
    const ordering = Object.fromEntries(
      materials.readHandlers.map(item => [item.handler, item.ordering]),
    )
    expect(ordering).toEqual({
      'tool.ledger.read': 'domain-serial',
      'tool.custody.manifest': 'snapshot',
      'tool.custody.chunk': 'snapshot',
    })
    for (const handler of materials.readHandlers) {
      expect(handler.maxOutputBytes).toBeLessThanOrEqual(4_194_304)
      for (const table of handler.readTables) expect(table).toMatch(/^tl_/u)
    }
  })
})

describe('combination validity', () => {
  it('the Tool participant alone is a valid combination', () => {
    expect(
      combinationManifest({ catalog: catalogOf([]), participants: [TOOL_PARTICIPANT] }).kind,
    ).toBe('manifest')
  })

  it('beside a Session stand-in of the same shape there is no table conflict', () => {
    const catalog = catalogOf([sessionStandIn(['sl_journal', 'sl_entry'])])
    expect(
      combinationManifest({ catalog, participants: ['session', TOOL_PARTICIPANT] }),
    ).toMatchObject({
      kind: 'manifest',
    })
  })

  it('a stand-in that owns a table of the Tool participant is refused', () => {
    const catalog = catalogOf([sessionStandIn(['sl_journal', 'tl_record'])])
    expect(
      combinationManifest({ catalog, participants: ['session', TOOL_PARTICIPANT] }),
    ).toMatchObject({
      kind: 'combination_invalid',
      problems: [{ kind: 'table_owned_twice', table: 'tl_record' }],
    })
  })
})
