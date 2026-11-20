import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { createGovernanceLocal } from '../src/provider.ts'
import { definitionKey } from '../src/encoding.ts'
import { selectionDigest } from '../src/adoption-plan.ts'
import { GOVERNANCE_TABLES } from '../src/migration.ts'
import { openProviderWorld } from './provider-world.ts'
import { openRegistrarWorld } from './registrar-world.ts'

type World = Awaited<ReturnType<typeof openRegistrarWorld>>
const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

function query(w: World, sql: string): Record<string, unknown>[] {
  const name = Buffer.from(w.activation.domain.transactionDomain).toString('hex')
  const db = new DatabaseSync(join(w.activation.root, 'domains', `${name}.sqlite`), {
    readOnly: true,
  })
  try {
    return db.prepare(sql).all() as Record<string, unknown>[]
  } finally {
    db.close()
  }
}

function storedBytes(w: World) {
  let bytes = 0
  for (const table of [...GOVERNANCE_TABLES, '_sql_receipt'])
    for (const row of query(w, `SELECT * FROM ${table}`))
      for (const value of Object.values(row))
        bytes +=
          typeof value === 'string'
            ? Buffer.byteLength(value)
            : value instanceof Uint8Array
              ? Buffer.byteLength(unpackText(value))
              : value === null
                ? 0
                : 8
  return bytes
}

const receiptCount = (w: World) => Number(query(w, 'SELECT count(*) n FROM _sql_receipt')[0]?.n)

async function cycle(world: Awaited<ReturnType<typeof openProviderWorld>>) {
  const { w, options, definition } = world
  const made = await createGovernanceLocal(options)
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const registered = await made.service.contribute(w.context, w.command(`c-${made.epoch}`))
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const members = [
    {
      candidate: {
        contribution: registered.contribution,
        declaration: definition,
        definitionKey: definitionKey(definition.reference),
      },
      targets: [],
    },
  ]
  const [scope] = query(w, 'SELECT adoption_revision FROM gc_scope')
  const expected = { scope: w.scope, expectedDeclarationRevision: registered.declarationRevision }
  expect(
    await made.service.adopt(w.context, {
      scope: w.scope,
      operationId: `a-${made.epoch}`,
      expectedAdoptionRevision: Number(scope?.adoption_revision),
      expectedDeclarationRevision: registered.declarationRevision,
      collection: {
        scope: w.scope,
        declarationRevision: registered.declarationRevision,
        digest: selectionDigest(expected, members),
      },
      complete: [{ contribution: registered.contribution, selectedTargets: [] }],
    }),
  ).toMatchObject({ kind: 'adopted' })
  expect(
    await w.services().sql.accept({
      principalRef: w.principalRef,
      epoch: made.epoch,
      transactionDomain: w.activation.domain.transactionDomain,
      request: { owner: 'contribute', command: w.command(`p-${made.epoch}`) },
    }),
  ).toMatchObject({ kind: 'found', record: { state: 'accepted' } })
  expect(await made.close()).toEqual({ kind: 'closed' })
  return made.epoch
}

it('drops the stages of an operation when it ends and recalls the original result from its record', async () => {
  const w = await openRegistrarWorld()
  worlds.push(w)
  const { registrar, sql } = w.services()
  const first = await registrar.contribute(w.context, w.command('ended'))
  expect(first).toMatchObject({ kind: 'registered', state: 'active' })
  expect(query(w, 'SELECT stage FROM gc_sql_stage ORDER BY stage')).toEqual([
    { stage: 'standing-seal' },
    { stage: 'standing-settled' },
  ])
  expect(await registrar.contribute(w.context, w.command('ended'))).toEqual(first)
  expect(await sql.observe(w.binding('ended'))).toMatchObject({ record: { state: 'committed' } })
})

it('keeps only the current epoch and at most one earlier epoch of operations, with bounded receipts', async () => {
  const world = await openProviderWorld()
  worlds.push(world.w)
  const receipts: number[] = []
  let last = ''
  for (let index = 0; index < 3; index++) {
    last = await cycle(world)
    receipts.push(receiptCount(world.w))
  }
  const reopened = await createGovernanceLocal(world.options)
  if (reopened.kind !== 'created') throw new Error(JSON.stringify(reopened))
  const epochs = query(world.w, 'SELECT DISTINCT accepted_epoch e FROM gc_operation').map(
    row => row.e,
  )
  expect(epochs.every(epoch => epoch === last || epoch === reopened.epoch)).toBe(true)
  expect(receipts[2]).toBe(receipts[1])
  expect(await reopened.close()).toEqual({ kind: 'closed' })
})

it('does not grow the governance records with the number of restarts', async () => {
  const world = await openProviderWorld()
  worlds.push(world.w)
  const after: number[] = []
  for (let index = 0; index < 6; index++) {
    await cycle(world)
    after.push(storedBytes(world.w))
  }
  expect(after[5]).toBe(after[1])
})

it('stops reading the contributions of a closed epoch and reads the current ones', async () => {
  const { w, options } = await openProviderWorld()
  worlds.push(w)
  const { sql } = w.services()
  const first = await createGovernanceLocal(options)
  if (first.kind !== 'created') throw new Error(JSON.stringify(first))
  const old = await first.service.contribute(w.context, w.command(`c-${first.epoch}`))
  if (old.kind !== 'registered') throw new Error(JSON.stringify(old))
  expect(await first.close()).toEqual({ kind: 'closed' })
  const second = await createGovernanceLocal(options)
  if (second.kind !== 'created') throw new Error(JSON.stringify(second))
  const current = await second.service.contribute(w.context, w.command(`c-${second.epoch}`))
  if (current.kind !== 'registered') throw new Error(JSON.stringify(current))
  expect(await sql.contribution(old.contribution, w.principalRef)).toEqual({ kind: 'denied' })
  expect(await sql.contribution(current.contribution, w.principalRef)).toMatchObject({
    kind: 'found',
    state: 'active',
  })
  expect(query(w, 'SELECT DISTINCT epoch FROM gc_contribution')).toEqual([{ epoch: second.epoch }])
  expect(await second.close()).toEqual({ kind: 'closed' })
})
