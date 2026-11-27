import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildReadMaterials,
  closeProviders,
  commitOf,
  readRequest,
  readyProvider,
} from './read-support.ts'
import { DOMAIN, identity, makeWorkspace, type Built, type Workspace } from './support.ts'

let workspace: Workspace
let built: Built

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace, {})
})

afterEach(async () => {
  await closeProviders()
  await workspace.remove()
})

const NONE = { reads: [], commits: [], participants: [], queries: [] }

const WAL_HEADER = 32
const FRAME_HEADER = 24

/** The commit frames in the WAL of a domain: a frame whose header carries the size of the database after it. */
function commitFrames(storageRoot: string, domain: string): number {
  const file = join(storageRoot, 'domains', `${Buffer.from(domain).toString('hex')}.sqlite-wal`)
  if (!existsSync(file)) return 0
  const wal = readFileSync(file)
  if (wal.length < WAL_HEADER) return 0
  const frame = FRAME_HEADER + wal.readUInt32BE(8)
  let commits = 0
  for (let at = WAL_HEADER; at + frame <= wal.length; at += frame)
    if (wal.readUInt32BE(at + 4) !== 0) commits += 1
  return commits
}

describe('the readings a provider keeps of its own reads, commits and queries', () => {
  it('starts with nothing counted', async () => {
    const { control } = await readyProvider(workspace, built)
    expect(control.readings()).toEqual(NONE)
  })

  it('counts each read under its domain and handler, by how it was answered', async () => {
    const { storage, control } = await readyProvider(workspace, built, {}, 1)
    await storage.read(readRequest('page'))
    await storage.read(readRequest('page'))
    const absent = {
      scope: { kind: 'tenant' as const, tenant: 'tenant-a' },
      transactionDomain: 'x',
    }
    await storage.read({ ...readRequest('page'), domain: absent })
    expect(control.readings().reads).toEqual([
      { domain: DOMAIN, handler: 'page', read: 2, unavailable: 0, cancelled: 0 },
      { domain: 'x', handler: 'page', read: 0, unavailable: 1, cancelled: 0 },
    ])
  })

  it('counts a read of a handler the catalog does not have under no handler', async () => {
    const { storage, control } = await readyProvider(workspace, built, {}, 1)
    await storage.read(readRequest('nobody-registered-this'))
    expect(control.readings().reads).toEqual([
      { domain: DOMAIN, handler: '', read: 0, unavailable: 1, cancelled: 0 },
    ])
  })

  it('counts a commit once, with its bytes, and once under each participant it carried', async () => {
    const { storage, control } = await readyProvider(workspace, built)
    expect((await storage.commit(commitOf(built, 'one'))).kind).toBe('committed')
    const { commits, participants } = control.readings()
    expect(commits).toEqual([
      {
        domain: DOMAIN,
        committed: 1,
        recalled: 0,
        rolledBack: 0,
        unknown: 0,
        conflicted: 0,
        rejected: 0,
        bytes: expect.any(Number),
      },
    ])
    expect(commits[0]?.bytes).toBeGreaterThan(0)
    expect(participants).toEqual([
      { domain: DOMAIN, participant: 'auditor', committed: 1 },
      { domain: DOMAIN, participant: 'ledger', committed: 1 },
    ])
  })

  it('counts the same operation sent again as recalled, not as a second commit', async () => {
    const { storage, control } = await readyProvider(workspace, built)
    await storage.commit(commitOf(built, 'one'))
    const again = await storage.commit(commitOf(built, 'one'))
    expect(again).toMatchObject({ kind: 'committed', recalled: true })
    expect(control.readings().commits).toMatchObject([{ committed: 1, recalled: 1 }])
    expect(control.readings().participants.map(item => item.committed)).toEqual([1, 1])
  })

  it('counts a commit refused before it was accepted as rejected, with no bytes', async () => {
    const { storage, control } = await readyProvider(workspace, built)
    const refused = await storage.commit({ ...commitOf(built, 'bad'), commands: [] })
    expect(refused.kind).toBe('rejected_before_accept')
    expect(control.readings().commits).toMatchObject([{ committed: 0, rejected: 1, bytes: 0 }])
    expect(control.readings().participants).toEqual([])
  })

  it('counts a query apart from the reads', async () => {
    const { storage, control } = await readyProvider(workspace, built)
    await storage.commit(commitOf(built, 'one'))
    await storage.query(identity({ operationKey: 'one' }))
    await storage.query(identity({ operationKey: 'never-sent' }))
    const [queried, ...rest] = control.readings().queries
    expect(rest).toEqual([])
    expect(queried?.domain).toBe(DOMAIN)
    expect((queried?.answered ?? 0) + (queried?.unknown ?? 0)).toBe(2)
    expect(queried?.answered).toBeGreaterThanOrEqual(1)
    expect(control.readings().reads).toEqual([])
  })

  it('counts as many commits as the WAL of the domain gained commit frames, whatever else went on', async () => {
    const { storage, control } = await readyProvider(workspace, built, {}, 1)
    const frames = commitFrames(workspace.storageRoot, DOMAIN)
    const counted = control.readings().commits[0]?.committed ?? 0
    for (const key of ['a', 'b', 'c', 'd', 'e']) await storage.commit(commitOf(built, key))
    await storage.commit(commitOf(built, 'c'))
    await storage.read(readRequest('page'))
    await storage.query(identity({ operationKey: 'e' }))
    expect((control.readings().commits[0]?.committed ?? 0) - counted).toBe(5)
    expect(commitFrames(workspace.storageRoot, DOMAIN) - frames).toBe(5)
  })

  it('hands out a reading that later work does not change', async () => {
    const { storage, control } = await readyProvider(workspace, built, {}, 1)
    await storage.read(readRequest('page'))
    const before = control.readings()
    await storage.read(readRequest('page'))
    expect(before.reads).toMatchObject([{ read: 1 }])
    expect(control.readings().reads).toMatchObject([{ read: 2 }])
  })
})
