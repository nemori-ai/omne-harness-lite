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
it('discloses the original registration after withdrawal without rewriting its state', async () => {
  const w = await setup(),
    { registrar } = w.services()
  const registered = await registrar.contribute(w.context, w.command('register'))
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  expect(
    await registrar.withdraw(w.context, {
      operationId: 'withdraw',
      contribution: registered.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
  expect(
    await registrar.queryOperation(w.context, {
      scope: w.scope,
      owner: 'contribute',
      operationId: 'register',
    }),
  ).toEqual({
    kind: 'committed',
    original: { owner: 'contribute', result: registered },
  })
  expect(await registrar.contribute(w.context, w.command('register'))).toEqual({
    ...registered,
    state: 'released',
  })
  await w.reopen()
  w.setSourceAvailable(false)
  expect(
    await w.services().registrar.queryOperation(w.context, {
      scope: w.scope,
      owner: 'contribute',
      operationId: 'register',
    }),
  ).toEqual({
    kind: 'committed',
    original: { owner: 'contribute', result: registered },
  })
})
it('requires actual SqlStorage absence evidence and retains unknown when that evidence is unavailable', async () => {
  const w = await setup()
  const query = { scope: w.scope, owner: 'adopt' as const, operationId: 'missing' }
  expect(await w.services().registrar.queryOperation(w.context, query)).toMatchObject({
    kind: 'not-committed',
    sealRef: expect.stringMatching(/^sql-proof\//),
  })
  const wrapped = {
    ...w.activation.storage,
    query: async (identity: Parameters<typeof w.activation.storage.query>[0]) => ({
      kind: 'unknown' as const,
      identity,
      diagnostic: null,
    }),
  }
  expect(
    await w.services({ storage: wrapped }).registrar.queryOperation(w.context, query),
  ).toMatchObject({ kind: 'unknown' })
})
it('observes pending and sealed operations without executing or settling them', async () => {
  const w = await setup(),
    { registrar, sql } = w.services()
  const request = { owner: 'contribute' as const, command: w.command('pending') }
  expect(
    await sql.accept({
      principalRef: w.principalRef,
      epoch: 'first',
      transactionDomain: w.activation.domain.transactionDomain,
      request,
    }),
  ).toMatchObject({ kind: 'found' })
  const query = { scope: w.scope, owner: 'contribute' as const, operationId: 'pending' }
  expect(await registrar.queryOperation(w.context, query)).toMatchObject({ kind: 'pending' })
  expect(await sql.observe(w.binding('pending'))).toMatchObject({
    standing: null,
    record: { state: 'accepted' },
  })
  await sql.executeControl(w.binding('pending'), { kind: 'seal', binding: w.binding('pending') })
  expect(await registrar.queryOperation(w.context, query)).toMatchObject({
    kind: 'not-committed',
    sealRef: expect.stringMatching(/^governance-seal\//),
  })
})
it('rechecks disclosure qualification and scope on every query', async () => {
  const w = await setup(),
    { registrar } = w.services()
  await registrar.contribute(w.context, w.command('one'))
  const query = { scope: w.scope, owner: 'contribute' as const, operationId: 'one' }
  expect(
    await registrar.queryOperation(w.context, {
      ...query,
      scope: { ...w.scope, logicalServiceId: 'foreign' },
    }),
  ).toEqual({ kind: 'denied' })
  expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
  expect(await registrar.queryOperation(w.context, query)).toEqual({ kind: 'denied' })
})
