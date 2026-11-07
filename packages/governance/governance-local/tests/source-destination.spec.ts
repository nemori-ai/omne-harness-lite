import { afterEach, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createGovernanceLocalSourceDestination } from '../src/provider.ts'
import { GovernanceSourceDestination } from '../src/source-destination.ts'
import { SqlOperationCoordinator } from '../src/sql-coordinator.ts'
import { openActivation } from './activation-world.ts'
import { binding, scope } from './operation-world.ts'
import { capture } from './permission-capture-world.ts'

const worlds: Awaited<ReturnType<typeof openActivation>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function setup() {
  const w = await openActivation()
  worlds.push(w)
  await w.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const { combinationVersion, manifestDigest } = w.combination('metadata')
  const sql = new SqlOperationCoordinator({
    storage: w.storage,
    domain: w.domain,
    metadata: { combinationVersion, manifestDigest },
  })
  const input = capture(),
    operation = binding(input)
  expect(await sql.accept(input)).toMatchObject({ kind: 'found' })
  const current = await sql.observe(operation)
  if (current.kind !== 'found' || current.source.kind !== 'requested')
    throw new Error(JSON.stringify(current))
  const destination = createGovernanceLocalSourceDestination({
    storage: w.storage,
    domain: w.domain,
    metadata: { combinationVersion, manifestDigest },
    sourceRoute: input.request.command.sourceRoute,
  })
  return { w, sql, operation, request: current.source.request, destination }
}
it('recognizes only the exact durable source request and seals its original operation', async () => {
  const { sql, operation, request, destination } = await setup()
  expect(await destination.recognize(request)).toEqual({ kind: 'known', request })
  expect(await destination.seal(request)).toEqual({ kind: 'terminal', request, outcome: 'aborted' })
  expect(await sql.observe(operation)).toMatchObject({
    record: { state: 'aborted' },
    source: { kind: 'requested' },
  })
  expect(await destination.seal(request)).toEqual({ kind: 'terminal', request, outcome: 'aborted' })
})
it('rejects altered owner, route, domain, principal, attempt, digest and source without sealing the original', async () => {
  const { sql, operation, request, destination } = await setup()
  const original = request.destination
  const changed = [
    { ...request, destination: { ...original, ownerRef: 'settings' } },
    { ...request, destination: { ...original, route: 'other' } },
    { ...request, destination: { ...original, attemptId: 'other' } },
    { ...request, destination: { ...original, commandDigest: 'a'.repeat(64) } },
    {
      ...request,
      destination: { ...original, identity: { ...original.identity, principalRef: 'other' } },
    },
    {
      ...request,
      destination: {
        ...original,
        identity: {
          ...original.identity,
          domain: { ...original.identity.domain, transactionDomain: 'other' },
        },
      },
    },
    {
      ...request,
      source: { ...request.source, target: { ...request.source.target, targetRef: 'other' } },
    },
    {
      ...request,
      destination: {
        ...original,
        identity: { ...original.identity, operation: { protocol: 'other', binding: operation } },
      },
    },
  ]
  for (const wrong of changed) {
    expect(await destination.recognize(wrong)).toEqual({ kind: 'unavailable' })
    expect(await destination.seal(wrong)).toEqual({ kind: 'unavailable' })
  }
  expect(await sql.observe(operation)).toMatchObject({ record: { state: 'accepted' } })
  expect(await destination.recognize(request)).toEqual({ kind: 'known', request })
})

it('observes the original terminal when the seal acknowledgement is lost', async () => {
  const { w, sql, operation, request } = await setup()
  const storage: SqlStorage = {
    ...w.storage,
    async commit(input, options) {
      const result = await w.storage.commit(input, options)
      return input.identity.operation === 'governance.meta.seal'
        ? { kind: 'unknown', identity: input.identity, diagnostic: 'lost' }
        : result
    },
    query: identity =>
      identity.operation === 'governance.meta.seal'
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'lost' })
        : w.storage.query(identity),
  }
  const { combinationVersion, manifestDigest } = w.combination('metadata')
  const destination = new GovernanceSourceDestination(
    new SqlOperationCoordinator({
      storage,
      domain: w.domain,
      metadata: { combinationVersion, manifestDigest },
    }),
    request.destination.route,
  )
  expect(await destination.seal(request)).toEqual({ kind: 'terminal', request, outcome: 'aborted' })
  expect(await sql.observe(operation)).toMatchObject({ record: { state: 'aborted' } })
})
