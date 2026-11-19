import { describe, expect, it } from 'vitest'
import { storeConformanceCases } from '@omne-harness/workspace/testing'
import participant from '../../src/storage/participant.ts'
import reader from '../../src/storage/read.ts'
import migration from '../../src/storage/migration.ts'
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
