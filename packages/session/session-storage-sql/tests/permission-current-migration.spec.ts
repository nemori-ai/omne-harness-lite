import { describe, expect, it } from 'vitest'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import migration from '../src/worker/permission-current-migration.ts'
import { app, TENANT_A, textOf } from './fixtures/app.ts'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import {
  batchEvidence,
  commandDigest,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { PermissionDefinition } from '@omne-harness/permissions'
import participant from '../src/worker/participant.ts'
import { sessionCommandFacts, sessionCommitDigest } from '../src/participants.ts'
import { readState, writeState } from '../src/worker/state-rows.ts'
import { readEntryText, writeEntryText } from '../src/entry-codec.ts'
import { rowsOf, text } from '../src/worker/support.ts'

async function beforeMigration(withAssignment = false) {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  const access = a.access(TENANT_A)
  expect(
    await a.port.commit({
      access,
      guards: [],
      command: {
        kind: 'change',
        input: {
          tenant: TENANT_A,
          session: access.session,
          operation: operationId('mode-before-upgrade'),
          declaration: {
            kind: 'permission-mode',
            value: 'never',
            authorization: evidence('mode-fixture'),
          },
        },
      },
    }),
  ).toHaveProperty('ok')
  const port = {
    execute: (sql: string, params: readonly SqlValue[]) => a.provider.select('dom_0', sql, params),
  }
  if (withAssignment) {
    const definition: PermissionDefinition = {
      reference: {
        origin: { kind: 'independent', providerId: 'calendar', definitionRef: 'calendar-v1' },
        itemId: 'create',
        revision: '1',
      },
      capabilityId: 'calendar',
      enforcementKey: 'create',
      title: 'Create',
      description: 'Create a schedule',
      approvalEffect: 'May create',
      supportedScopes: [{ kind: 'session', description: 'This session' }],
      assignmentLayers: ['session'],
      values: [
        { id: 'allow', title: 'Allow', description: 'May create', permitsOperation: true },
        { id: 'deny', title: 'Deny', description: 'Must not create', permitsOperation: false },
      ],
      comparison: null,
      defaultRule: { pick: 'deny', allowedSet: null },
      settings: null,
    }
    const command: SessionCommand = {
      kind: 'change',
      input: {
        tenant: TENANT_A,
        session: access.session,
        operation: operationId('assignment-before-upgrade'),
        declaration: {
          kind: 'permission-assignment',
          capabilityId: 'calendar',
          enforcementKey: 'create',
          definition: definition.reference,
          rule: { pick: 'deny', allowedSet: null },
          expectedRevision: '1',
          authorization: evidence('permission-write-fixture'),
        },
      },
    }
    const facts = sessionCommandFacts(command, [])
    // This is a named qualification fixture for the original writer, not a login-policy test.
    const basis = {
      kind: 'permission-change',
      commandsDigest: sessionCommitDigest([facts]),
      coordination: evidence('migration-fixture'),
      permissionChange: {
        operation: command.input.operation,
        commandDigest: commandDigest(command),
        revision: '1',
        definition,
        authority: evidence('permission-write-fixture'),
      },
    }
    port.execute('BEGIN', [])
    try {
      const reply = participant.execute(facts.facts, {
        ...port,
        requireFact: () => basis,
        provideFact: () => undefined,
      })
      expect(reply, JSON.stringify(reply)).toMatchObject({ kind: 'participated' })
      port.execute('COMMIT', [])
    } catch (error) {
      port.execute('ROLLBACK', [])
      throw error
    }
  }
  const expected = port.execute('SELECT * FROM sl_permission_head LIMIT 10', [])
  const entries = port.execute('SELECT * FROM sl_entry ORDER BY position LIMIT 100', [])
  const operations = port.execute('SELECT * FROM sl_operation ORDER BY operation LIMIT 100', [])
  const assignments = port.execute(
    'SELECT * FROM sl_permission_assignment ORDER BY capability, enforcement LIMIT 100',
    [],
  )
  port.execute('DROP TABLE sl_permission_assignment', [])
  port.execute('DROP TABLE sl_permission_head', [])
  return { a, port, expected, entries, operations, assignments }
}

describe('permission relation migration from the original event log', () => {
  it('rebuilds a nonempty deny assignment with its original definition and source', async () => {
    const w = await beforeMigration(true)
    expect(w.assignments.rows).toHaveLength(1)
    migration.up(w.port)
    expect(w.port.execute('SELECT * FROM sl_permission_head LIMIT 10', [])).toEqual(w.expected)
    expect(
      w.port.execute(
        'SELECT * FROM sl_permission_assignment ORDER BY capability, enforcement LIMIT 100',
        [],
      ),
    ).toEqual(w.assignments)
    expect(w.port.execute('SELECT * FROM sl_entry ORDER BY position LIMIT 100', [])).toEqual(
      w.entries,
    )
    expect(w.port.execute('SELECT * FROM sl_operation ORDER BY operation LIMIT 100', [])).toEqual(
      w.operations,
    )
  })
  it('upgrades a named predecessor snapshot without permissions and preserves its original event bytes', async () => {
    const w = await beforeMigration()
    const tenant = textOf(TENANT_A)
    const scope = { tenant, session: 'session-1' }
    const head = w.port.execute(
      'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
      [tenant, scope.session],
    )
    const tail = BigInt(String(head.rows[0]![0]))
    const stored = readState(w.port, tenant, scope.session, tail)
    if (stored === 'behind') throw new Error('fixture snapshot')
    const digest = 'sha256:3abcec48c42a0f45922018403bc73b3c57490af537ae8a4257980350fa7f5875'
    // This fixture represents the supported pre-assignment format; it is not an archived production database.
    const original = rowsOf(
      w.port,
      'SELECT entry FROM sl_entry WHERE tenant = ? AND session = ? ORDER BY position LIMIT 100',
      [tenant, scope.session],
    ).map(row => {
      const entry = readEntryText(text(row['entry']))
      return { ...entry, schema: { ...entry.schema, digest } }
    })
    for (const entry of original) {
      const bytes = writeEntryText(entry)
      w.port.execute(
        'UPDATE sl_entry SET entry = ?, bytes = ? WHERE tenant = ? AND session = ? AND position = ?',
        [bytes, BigInt(Buffer.byteLength(bytes)), tenant, scope.session, BigInt(entry.id)],
      )
    }
    const source = batchEvidence(
      {
        revision: stored.snapshot.revision,
        entries: original.filter(row => row.revision === stored.snapshot.revision),
      },
      scope.session,
    )
    const legacy = {
      ...stored.snapshot,
      permissions: undefined,
      interpreter: { ...stored.snapshot.interpreter, digest },
      source,
    }
    writeState(
      w.port,
      { ...scope, covered: tail },
      stored.snapshot,
      legacy as unknown as WorkSnapshot,
    )
    const before = w.port.execute('SELECT entry FROM sl_entry ORDER BY position LIMIT 100', [])
    migration.up(w.port)
    expect(w.port.execute('SELECT entry FROM sl_entry ORDER BY position LIMIT 100', [])).toEqual(
      before,
    )
    const after = readState(w.port, tenant, scope.session, tail)
    if (after === 'behind') throw new Error('upgraded snapshot')
    expect(after.snapshot.permissions).toEqual({ revision: '1', assignments: [] })
    expect(after.snapshot.source).toEqual(source)
    expect(after.snapshot.interpreter.digest).not.toBe(digest)
    expect(
      w.port.execute('SELECT revision, override FROM sl_permission_head LIMIT 1', []).rows[0],
    ).toEqual([
      1n,
      JSON.stringify({
        value: 'never',
        source: original.find(row => row.kind === 'session.mode-changed')!.origin.source,
      }),
    ])
  })

  it('rejects an unknown event interpreter instead of treating it as no assignments', async () => {
    const w = await beforeMigration()
    const row = rowsOf(
      w.port,
      "SELECT entry FROM sl_entry WHERE kind = 'session.mode-changed' LIMIT 1",
    )[0]!
    const entry = readEntryText(text(row['entry']))
    const altered = writeEntryText({
      ...entry,
      schema: { ...entry.schema, digest: 'sha256:' + 'f'.repeat(64) },
    })
    w.port.execute('UPDATE sl_entry SET entry = ? WHERE position = ?', [altered, BigInt(entry.id)])
    expect(() => migration.up(w.port)).toThrow('unsupported or mixed')
  })

  it('rejects contradictory existing values even when their revision matches', async () => {
    const w = await beforeMigration()
    migration.up(w.port)
    const row = rowsOf(w.port, 'SELECT override FROM sl_permission_head LIMIT 1')[0]!
    const override = JSON.parse(text(row['override']))
    w.port.execute('UPDATE sl_permission_head SET override = ?', [
      JSON.stringify({ ...override, value: 'bypass-permissions' }),
    ])
    expect(() => migration.up(w.port)).toThrow('contradictory current values')
  })

  it('reconstructs an existing mode and revision without changing original log or receipts', async () => {
    const w = await beforeMigration()
    migration.up(w.port)
    expect(migration.verify(w.port)).toEqual({ kind: 'verified' })
    expect(w.port.execute('SELECT * FROM sl_permission_head LIMIT 10', [])).toEqual(w.expected)
    expect(w.port.execute('SELECT * FROM sl_entry ORDER BY position LIMIT 100', [])).toEqual(
      w.entries,
    )
    expect(w.port.execute('SELECT * FROM sl_operation ORDER BY operation LIMIT 100', [])).toEqual(
      w.operations,
    )
    migration.up(w.port)
    expect(w.port.execute('SELECT * FROM sl_permission_head LIMIT 10', [])).toEqual(w.expected)
    expect(await w.a.port.readWork(w.a.access(TENANT_A))).toMatchObject({
      ok: { permissions: { revision: '1', assignments: [] } },
    })
  })

  it('fails and rolls back rather than inventing empty permissions when creation evidence is missing', async () => {
    const w = await beforeMigration()
    w.port.execute("DELETE FROM sl_entry WHERE tenant = ? AND kind = 'session.created'", [
      textOf(TENANT_A),
    ])
    w.port.execute('BEGIN', [])
    try {
      expect(() => migration.up(w.port)).toThrow()
    } finally {
      w.port.execute('ROLLBACK', [])
    }
    expect(migration.verify(w.port)).toMatchObject({ kind: 'failed' })
  })
})
