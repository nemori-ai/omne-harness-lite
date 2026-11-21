// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { storeConformanceCases } from '@omne-harness/workspace/testing'
import { openSqlWorld, type SqlWorld } from './world.ts'

const open: SqlWorld[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map(world => world.close()))
})
async function world(options: Parameters<typeof openSqlWorld>[0] = {}): Promise<SqlWorld> {
  const opened = await openSqlWorld(options)
  open.push(opened)
  return opened
}

const REGISTER = {
  tenant: 'alice',
  operation: 'r1',
  digest: 'd',
  workspace: 'wsp_1',
  instance: 'wsi_00000000000000000000000001' as never,
  type: 'directory' as never,
  node: 'node-1',
  occupancy: '/a',
  address: '/a',
  material: { scope: { root: '/a' } },
}

describe('the SQL store conforms to the repository contract', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => (await world()).store)).resolves.toBeUndefined()
  })
})

describe('the facts are durable', () => {
  it('a registration is there after the storage is closed and opened again, and is still recalled', async () => {
    const first = await openSqlWorld()
    const made = await first.store.register(REGISTER)
    await first.close()
    const second = await world({ root: first.root })
    expect(await second.store.state('alice', 'wsp_1')).toMatchObject({
      kind: 'read',
      value: {
        workspace: { revision: 1 },
        relation: { role: 'owner' },
        instances: [{ address: '/a' }],
      },
    })
    expect(await second.store.register({ ...REGISTER, workspace: 'wsp_other' })).toEqual({
      kind: 'committed',
      value: { ...(made.kind === 'committed' ? made.value : {}), changed: false },
    })
    expect(await second.store.register({ ...REGISTER, digest: 'another' })).toEqual({
      kind: 'committed',
      value: { kind: 'conflict' },
    })
  })
})

describe('the adoptions are durable', () => {
  const lamp = (version: string) => ({
    category: 'gadget',
    namespace: 'gadgets',
    name: 'lamp',
    root: 'shared' as const,
    version,
    entries: [{ path: 'MAIN.md', bytes: 2, digest: `f:${version}` }],
  })
  const adopt = (key: string, version: string) => ({
    tenant: 'alice',
    workspace: 'wsp_1',
    key,
    instance: REGISTER.instance,
    read: { kind: 'read' as const, packages: [lamp(version)] },
  })

  it('a key and its reading are there after the storage opens again, and the count does not go back', async () => {
    const first = await openSqlWorld()
    await first.store.register(REGISTER)
    const made = await first.store.adopt(adopt('k1', 'v1'))
    const counted = await first.store.sourceRevision('alice', 'wsp_1')
    await first.close()
    const second = await world({ root: first.root })
    expect(await second.store.sourceRevision('alice', 'wsp_1')).toEqual(counted)
    expect(await second.store.adopt(adopt('k1', 'v2'))).toEqual(made)
    await second.store.adopt(adopt('k2', 'v2'))
    expect(await second.store.sourceRevision('alice', 'wsp_1')).toEqual({
      kind: 'read',
      value: (counted as { value: number }).value + 1,
    })
  })
})

describe('what the storage did not do', () => {
  const failing = (commit: 'unknown' | 'rejected' | 'throws') => (raw: SqlStorage) =>
    ({
      ...raw,
      registerCombination: raw.registerCombination,
      query: raw.query,
      database: raw.database,
      read: async () => {
        throw new Error('read is down')
      },
      commit: async () => {
        if (commit === 'throws') throw new Error('commit is down')
        return commit === 'unknown'
          ? { kind: 'unknown' }
          : { kind: 'rejected_before_accept', reason: 'capacity' }
      },
    }) as unknown as SqlStorage

  it.each([
    ['unknown', 'unknown'],
    ['throws', 'unknown'],
    ['rejected', 'rolled-back'],
  ] as const)('a commit that answers %s is %s', async (commit, kind) => {
    const opened = await world({ wrap: failing(commit) })
    expect(await opened.store.register(REGISTER)).toEqual({ kind })
    expect(await opened.store.state('alice', 'wsp_1')).toEqual({ kind: 'unavailable' })
  })
})
