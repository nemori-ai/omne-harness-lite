import { afterEach, expect, it } from 'vitest'
import { openRegistrarWorld } from './registrar-world.ts'

const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function setup() {
  const w = await openRegistrarWorld()
  worlds.push(w)
  return w
}

it('retires the exact original lease after revocation, preserving its sibling and original receipt', async () => {
  const w = await setup(),
    { registrar, sql } = w.services()
  const first = await registrar.contribute(w.context, w.command('first'))
  const sibling = await registrar.contribute(w.context, w.command('sibling'))
  if (first.kind !== 'registered' || sibling.kind !== 'registered')
    throw new Error('Expected registrations')
  expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
  expect(
    await registrar.withdraw(w.context, {
      operationId: 'unauthorized',
      contribution: first.contribution,
    }),
  ).toEqual({ kind: 'denied' })
  expect(await sql.retireContribution(w.binding('first'))).toMatchObject({
    kind: 'applied',
    response: { kind: 'retired', binding: w.binding('first'), epoch: 'first' },
  })
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    kind: 'found',
    state: 'released',
  })
  expect(await sql.contribution(sibling.contribution, w.principalRef)).toMatchObject({
    kind: 'found',
    state: 'active',
  })
  expect(await sql.observe(w.binding('first'))).toMatchObject({
    record: { state: 'committed', result: first },
  })
  expect(await sql.retireContribution(w.binding('first'))).toMatchObject({
    kind: 'applied',
    response: { kind: 'retired' },
  })
  expect(await sql.contribution(sibling.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
})

it('seals a pending original and prevents a late registration from reviving it', async () => {
  const w = await setup(),
    { sql, standing, registrar } = w.services()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('pending') },
  })
  await standing.reserve(
    { operation: w.binding('pending'), destination: w.destination, required: [] },
    w.principal,
  )
  expect(await sql.retireContribution(w.binding('pending'))).toMatchObject({
    kind: 'applied',
    response: { kind: 'retired' },
  })
  expect(await sql.observe(w.binding('pending'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'held' },
  })
  expect(await standing.settle(w.binding('pending'))).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await registrar.contribute(w.context, w.command('pending'))).toEqual({
    kind: 'conflict',
    reason: 'basis',
  })
})

it('does not poison an absent original or allow a different digest to retire a registered lease', async () => {
  const w = await setup(),
    { sql, registrar } = w.services()
  expect(await sql.retireContribution(w.binding('later'))).toEqual({ kind: 'absent' })
  const registered = await registrar.contribute(w.context, w.command('later'))
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  expect(
    await sql.retireContribution({ ...w.binding('later'), requestDigest: 'b'.repeat(64) }),
  ).toEqual({ kind: 'conflict', reason: 'operation' })
  expect(await sql.contribution(registered.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
  expect(await sql.retireContribution(w.binding('later'))).toMatchObject({
    kind: 'applied',
    response: { kind: 'retired' },
  })
  expect(await sql.contribution(registered.contribution, w.principalRef)).toMatchObject({
    state: 'released',
  })
})

it('cannot use an old cleanup to change a successor epoch', async () => {
  const w = await setup(),
    { sql, registrar } = w.services()
  const old = await registrar.contribute(w.context, w.command('old'))
  expect(old).toMatchObject({ kind: 'registered' })
  await w.activation.control({
    kind: 'bootstrap',
    input: { scope: w.scope, epoch: 'second', previousEpoch: 'first' },
  })
  const successor = w.services({ epoch: 'second' })
  const current = await successor.registrar.contribute(w.context, w.command('current'))
  if (current.kind !== 'registered') throw new Error(JSON.stringify(current))
  expect(await sql.retireContribution(w.binding('old'))).toMatchObject({
    kind: 'applied',
    response: { kind: 'retired' },
  })
  expect(await successor.sql.contribution(current.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
})
