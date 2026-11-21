import { describe, expect, it } from 'vitest'
import { storeConformanceCases } from '@omne-harness/workspace/testing'
import participant from '../../src/storage/participant.ts'
import reader from '../../src/storage/read.ts'
import migration from '../../src/storage/migration.ts'
import sources from '../../src/storage/migration-sources.ts'
import { sqlTxn } from '../../src/storage/facts.ts'
import { select } from '../../src/storage/sql-port.ts'
import { createInProcessStore, portOf } from './in-process.ts'

describe('the participant and the read handler conform to the repository contract', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createInProcessStore())).resolves.toBeUndefined()
  })
})

describe('the tables keep what the scripts rely on', () => {
  it('a second active instance at one position of a node is refused by the table itself', () => {
    const { db } = createInProcessStore()
    const insert = (name: string, active: number) =>
      db
        .prepare(
          "INSERT INTO ws_instances (instance, workspace, node, occupancy, address, material, active) VALUES (?, 'w', 'n', '/a', '/a', '{}', ?)",
        )
        .run(name, active)
    insert('one', 1)
    insert('gone', 0)
    insert('gone-too', 0)
    expect(() => insert('two', 1)).toThrow(/UNIQUE/)
  })

  it('the migration verifies the tables it made, and fails on a database without them', () => {
    const { db } = createInProcessStore()
    expect(migration.verify(portOf(db))).toEqual({ kind: 'verified' })
    db.exec('DROP TABLE ws_operations')
    expect(() => migration.verify(portOf(db))).toThrow()
  })

  it('the second migration verifies the table of source counts, and the first does not depend on it', () => {
    const { db } = createInProcessStore()
    expect(sources.verify(portOf(db))).toEqual({ kind: 'verified' })
    db.exec('DROP TABLE ws_source_revisions')
    expect(() => sources.verify(portOf(db))).toThrow()
    expect(migration.verify(portOf(db))).toEqual({ kind: 'verified' })
  })
})

describe('what the worker modules refuse', () => {
  it('a script that is not one of the three', () => {
    const { db } = createInProcessStore()
    expect(participant.execute({ script: 'drop', command: {} }, portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_workspace_script',
    })
  })

  it.each([
    [null],
    [[]],
    [{ read: 'state' }],
    [{ read: 'toString', args: [] }],
    [{ read: 'state', args: ['alice', 7] }],
    [{ read: 'state', args: 'alice' }],
  ])('a read request %j', input => {
    const { db } = createInProcessStore()
    expect(reader.read(input as never, portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'invalid_workspace_read',
    })
  })

  it('a stored row that does not fit fails the read instead of answering wrongly', async () => {
    const store = createInProcessStore()
    store.db.exec("INSERT INTO ws_workspaces (workspace, type, revision) VALUES ('w', 'plain', 1)")
    store.db.exec(
      "INSERT INTO ws_relations (workspace, tenant, role, super_admin) VALUES ('w', 'alice', 'emperor', 0)",
    )
    expect(await store.state('alice', 'w')).toEqual({ kind: 'unavailable' })
    expect(await store.memberships('alice')).toEqual({ kind: 'unavailable' })
  })

  it('a participant relation is read back with its flag', async () => {
    const store = createInProcessStore()
    store.db.exec("INSERT INTO ws_workspaces (workspace, type, revision) VALUES ('w', 'plain', 4)")
    store.db.exec(
      "INSERT INTO ws_relations (workspace, tenant, role, super_admin) VALUES ('w', 'alice', 'participant', 1), ('w', 'bob', 'participant', 0)",
    )
    expect(await store.state('alice', 'w')).toMatchObject({
      value: { relation: { role: 'participant', superAdmin: true } },
    })
    expect(await store.memberships('bob')).toMatchObject({
      value: [{ relation: { role: 'participant', superAdmin: false } }],
    })
  })
})

describe('the transaction adapter writes and reads back every shape of a fact', () => {
  it('a relation of each kind, replaced when it is put again', () => {
    const txn = sqlTxn(portOf(createInProcessStore().db))
    txn.putRelation('w', 'alice', { role: 'owner' })
    txn.putRelation('w', 'bob', { role: 'participant', superAdmin: false })
    txn.putRelation('w', 'carol', { role: 'participant', superAdmin: true })
    expect(['alice', 'bob', 'carol', 'dave'].map(tenant => txn.relation('w', tenant))).toEqual([
      { role: 'owner' },
      { role: 'participant', superAdmin: false },
      { role: 'participant', superAdmin: true },
      null,
    ])
    txn.putRelation('w', 'bob', { role: 'participant', superAdmin: true })
    txn.putRelation('w', 'carol', { role: 'owner' })
    expect(['bob', 'carol'].map(tenant => txn.relation('w', tenant))).toEqual([
      { role: 'participant', superAdmin: true },
      { role: 'owner' },
    ])
  })

  it('an instance in either state, and its state changed both ways', () => {
    const txn = sqlTxn(portOf(createInProcessStore().db))
    const record = { workspace: 'w', node: 'n', address: '/a', material: { a: [1] } } as const
    txn.insertInstance({
      ...record,
      instance: 'gone' as never,
      occupancy: '/a',
      state: 'dissociated',
    })
    txn.insertInstance({ ...record, instance: 'here' as never, occupancy: '/b', state: 'active' })
    expect(txn.instance('gone')).toEqual({
      ...record,
      instance: 'gone',
      occupancy: '/a',
      state: 'dissociated',
    })
    expect(txn.instance('here')?.state).toBe('active')
    expect(txn.occupant('n', '/a')).toBeNull()
    txn.setInstanceState('gone', 'active')
    txn.setInstanceState('here', 'dissociated')
    expect([txn.instance('gone')?.state, txn.instance('here')?.state]).toEqual([
      'active',
      'dissociated',
    ])
    expect(txn.occupant('n', '/a')?.instance).toBe('gone')
    expect(txn.occupant('n', '/b')).toBeNull()
  })

  it('a statement that returns more rows than its limit fails instead of being cut', () => {
    const { db } = createInProcessStore()
    for (const name of ['a', 'b', 'c'])
      db.exec(
        `INSERT INTO ws_workspaces (workspace, type, revision) VALUES ('${name}', 'plain', 1)`,
      )
    const sql = 'SELECT workspace FROM ws_workspaces ORDER BY workspace'
    expect(select(portOf(db), sql, [], 3).map(row => row[0])).toEqual(['a', 'b', 'c'])
    expect(() => select(portOf(db), sql, [], 2)).toThrow(/more rows/)
  })

  it.each([
    ['a type that is not text', "UPDATE ws_workspaces SET type = x'00' WHERE workspace = 'w'"],
    [
      'a revision that is not an integer',
      "UPDATE ws_workspaces SET revision = 'many' WHERE workspace = 'w'",
    ],
    [
      'a flag that is not an integer',
      "UPDATE ws_relations SET super_admin = 'yes' WHERE workspace = 'w'",
    ],
  ])('%s fails the read', async (_name, damage) => {
    const store = createInProcessStore()
    store.db.exec("INSERT INTO ws_workspaces (workspace, type, revision) VALUES ('w', 'plain', 1)")
    store.db.exec(
      "INSERT INTO ws_relations (workspace, tenant, role, super_admin) VALUES ('w', 'alice', 'participant', 0)",
    )
    expect((await store.state('alice', 'w')).kind).toBe('read')
    store.db.exec(damage)
    expect(await store.state('alice', 'w')).toEqual({ kind: 'unavailable' })
  })
})
