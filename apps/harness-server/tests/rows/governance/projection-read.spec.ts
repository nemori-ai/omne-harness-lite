import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  combinationManifest,
  manifestDigest,
  type FactCommandV2,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  projectionReadHandler,
  readProjection,
} from '../../../src/rows/governance/projection-read.ts'
import { providerConfig } from '../storage/fixtures/tree.ts'

type Participant = SqlMaterialCatalog['participants'][number]

function fixture(
  name: string,
  tables: Pick<Participant, 'ownedTables' | 'readTables'>,
): Participant {
  const url = new URL(`./projection-read/${name}.mjs`, import.meta.url)
  return {
    participant: `fixture.projection-${name}`,
    protocol: '1',
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
    ...tables,
    requiresFacts: name === 'join' ? [{ key: 'fixture.projection-value', protocol: '1' }] : [],
    providesFacts: name === 'owner' ? [{ key: 'fixture.projection-value', protocol: '1' }] : [],
    allowedFunctions: [],
    grouping: 'groupable',
  }
}

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

async function world(tamper?: (member: Participant) => Participant) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'projection-read-')))
  const owner = fixture('owner', { ownedTables: ['pr_value'], readTables: [] })
  const joiner = fixture('join', { ownedTables: [], readTables: [] })
  const migrationUrl = new URL('./projection-read/migration.mjs', import.meta.url)
  const owners = {
    participants: [owner, joiner],
    migrations: [
      {
        owner: owner.participant,
        id: 'fixture-projection-1',
        moduleUrl: migrationUrl.href,
        checksum: createHash('sha256').update(readFileSync(migrationUrl)).digest('hex'),
        requires: [],
      },
    ],
  }
  const members = [owner, joiner].map(member => tamper?.(member) ?? member)
  const handler = projectionReadHandler('fixture.projection-read', members, owners)
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    ...owners,
    readHandlers: [handler],
    declaredCombinations: { tenant: null, system: null },
  }
  const made = await createSqliteStorage({
    config: providerConfig(root, {
      maxWorkers: 2,
      reservedWriterSlots: 1,
      maxReadWorkersPerDomain: 1,
      groupMaxOperations: 1,
    }),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  closers.push(async () => {
    await made.control.close({ initiator: 'disposal' })
    rmSync(root, { recursive: true, force: true })
  })
  const domain = {
    scope: { kind: 'tenant' as const, tenant: 'tenant-a' },
    transactionDomain: 'projection',
  }
  const names = [owner.participant, joiner.participant]
  const checked = combinationManifest({ catalog: materials, participants: names })
  if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
  const combination = {
    combinationVersion: 'fixture-projection/1',
    manifestDigest: manifestDigest(checked.manifest),
  }
  const registered = await made.storage.registerCombination({
    ...domain,
    ...combination,
    participants: names,
  })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const commit = (commands: readonly FactCommandV2[]) =>
    made.storage.commit({
      identity: {
        ...domain,
        operation: 'projection-test',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      ...combination,
      commands,
    })
  return {
    handler,
    owner,
    commit,
    set: (value: string) =>
      commit([{ participant: owner.participant, facts: { kind: 'set', value } }]),
    read: (commands: readonly FactCommandV2[]) =>
      readProjection(made.storage, domain, handler, commands),
  }
}

const project: FactCommandV2 = {
  participant: 'fixture.projection-owner',
  facts: { kind: 'project' },
}
const joined = (expected?: string): FactCommandV2 => ({
  participant: 'fixture.projection-join',
  facts: expected === undefined ? {} : { expected },
})

it('reads the tables of the members, passes facts between them and answers the last response', async () => {
  const w = await world()
  expect((await w.set('a')).kind).toBe('committed')
  expect(await w.read([project, joined()])).toEqual({
    kind: 'completed',
    response: { joined: 'a' },
  })
  expect((await w.set('b')).kind).toBe('committed')
  expect(await w.read([project, joined()])).toEqual({
    kind: 'completed',
    response: { joined: 'b' },
  })
})

it('gives the same response when a commit runs the same commands', async () => {
  const w = await world()
  await w.set('a')
  const read = await w.read([project, joined('a')])
  const committed = await w.commit([project, joined('a')])
  expect(read).toEqual({ kind: 'completed', response: { joined: 'a' } })
  expect(committed).toMatchObject({ kind: 'committed' })
  if (committed.kind !== 'committed') throw new Error('not committed')
  expect(committed.responses.at(-1)?.reply).toEqual({
    kind: 'participated',
    response: { joined: 'a' },
  })
  await w.set('b')
  expect(await w.read([project, joined('a')])).toEqual({
    kind: 'stopped',
    participant: 'fixture.projection-join',
    reply: { kind: 'conflict', basis: { reason: 'value-changed' } },
  })
  expect(await w.commit([project, joined('a')])).toMatchObject({ kind: 'rolled_back' })
})

it('gives no result on a missing fact or a command of a non-member, and the provider refuses a write', async () => {
  const w = await world()
  await w.set('a')
  expect(await w.read([joined()])).toEqual({
    kind: 'stopped',
    participant: 'fixture.projection-join',
    reply: { kind: 'failed' },
  })
  expect(await w.read([{ participant: 'fixture.other', facts: {} }])).toEqual({
    kind: 'stopped',
    participant: 'fixture.other',
    reply: { kind: 'not-a-member' },
  })
  expect(
    await w.read([{ participant: w.owner.participant, facts: { kind: 'set', value: 'c' } }]),
  ).toEqual({ kind: 'unavailable' })
  expect(await w.read([project, joined()])).toEqual({
    kind: 'completed',
    response: { joined: 'a' },
  })
})

it('declares the tables and migrations of the owners, and binds its protocol to the members', async () => {
  const w = await world()
  expect(w.handler.readTables).toEqual(['pr_value'])
  expect(w.handler.requiresMigrations).toEqual([
    { owner: 'fixture.projection-owner', id: 'fixture-projection-1' },
  ])
  const other = await world(member =>
    member.participant === 'fixture.projection-join'
      ? { ...member, codeDigest: '0'.repeat(64) }
      : member,
  )
  expect(other.handler.protocol).not.toBe(w.handler.protocol)
  await other.set('a')
  expect(await other.read([project, joined()])).toEqual({ kind: 'unavailable' })
})
