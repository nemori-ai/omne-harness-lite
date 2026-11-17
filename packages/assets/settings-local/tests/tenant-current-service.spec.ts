import { afterEach, expect, it } from 'vitest'
import { standingPrincipalRef } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { openTenantCurrentWorld } from './tenant-current-world.ts'

const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})
async function open() {
  const w = await openTenantCurrentWorld()
  close.push(() => w.close())
  return w
}
const identityOf = (w: Awaited<ReturnType<typeof open>>, operationId: string) => ({
  domain: w.domain,
  principalRef: standingPrincipalRef(w.principal),
  operation: { target: w.target, operationId },
})

it('prepares and commits a value on an independent target of the actor tenant', async () => {
  const w = await open()
  const plan = await w.current.plan(w.principal, {
    identity: identityOf(w, w.command.operationId),
    intent: { kind: 'change', command: w.command },
  })
  const tenant = tenantCodec.encode(w.principal.tenant)
  if (!tenant.ok) throw new Error('Invalid actor tenant')
  expect(plan).toMatchObject({
    kind: 'planned',
    purpose: { kind: 'target-change' },
    basis: { valueRevision: 0, selection: { kind: 'not-required' } },
    standing: { scopeRef: tenant.value, required: [] },
  })
  const prepared = await w.backend.service.prepareChange(w.principal, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'commit',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  const next = await w.current.plan(w.principal, {
    identity: identityOf(w, 'next'),
    intent: { kind: 'change', command: { ...w.command, operationId: 'next', expectedRevision: 1 } },
  })
  expect(next).toMatchObject({ kind: 'planned', basis: { valueRevision: 1 } })
})

it('refuses to authorize a target of another scope', async () => {
  const w = await open()
  expect(
    await w.current.access.authorize(w.principal, {
      scope: w.domain.scope,
      target: { ...w.target, scopeRef: 'someone-else' },
    } as never),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
})
