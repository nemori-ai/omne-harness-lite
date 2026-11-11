import { digest } from '../src/encoding.ts'
import { connectOrganizationConsumers } from './organization-source-consumers.ts'
import { afterEach, expect, it } from 'vitest'
import { openOrganizationCurrentWorld } from './organization-current-world.ts'
import { standingPrincipalRef } from '@omne-harness/identity'
import { tenantCodec, organizationCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})
async function open() {
  const w = await openOrganizationCurrentWorld()
  close.push(() => w.close())
  return w
}
it('prepares and commits actual organization settings with native current and real administrator qualification', async () => {
  const w = await open()
  const plan = await w.current.plan(w.principal, {
    identity: {
      domain: w.domain,
      principalRef: standingPrincipalRef(w.principal),
      operation: { target: w.target, operationId: w.command.operationId },
    },
    intent: { kind: 'change', command: w.command },
  })
  const tenant = tenantCodec.encode(w.principal.tenant)
  if (!tenant.ok) throw new Error('Invalid actor tenant')
  expect(plan).toMatchObject({
    kind: 'planned',
    purpose: { kind: 'source-update' },
    basis: {
      valueRevision: 0,
      declaration: { ownerRef: 'settings' },
      selection: { kind: 'not-required' },
    },
    standing: { scopeRef: tenant.value, required: ['organization-settings-manage'] },
  })
  const prepared = await w.backend.service.prepareChange(w.principal, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'commit',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'repeat',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  const next = await w.current.plan(w.principal, {
    identity: {
      domain: w.domain,
      principalRef: standingPrincipalRef(w.principal),
      operation: { target: w.target, operationId: 'next' },
    },
    intent: { kind: 'change', command: { ...w.command, operationId: 'next', expectedRevision: 1 } },
  })
  expect(next).toMatchObject({
    kind: 'planned',
    basis: {
      valueRevision: 1,
      policies: [{ inputs: [{ presence: 'present', valueRevision: '1' }] }],
    },
  })
})
it('denies ordinary members and foreign organizations through the actual service', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.identity.principal, w.command)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  const foreign = organizationCodec.encode(randomIdentifiers().organization())
  if (!foreign.ok) throw new Error('Invalid foreign organization')
  expect(
    await w.backend.service.prepareChange(w.principal, {
      ...w.command,
      target: { ...w.target, scopeRef: foreign.value },
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
})
it('rebases historical assignments explicitly after a native definition upgrade', async () => {
  const w = await open()
  const prepared = await w.backend.service.prepareChange(w.principal, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'first',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  const nextDefinition = { ...w.record.definition, version: '2' }
  const nextRef = { ...w.command.definitionRef, version: '2', digest: digest(nextDefinition) }
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'upgrade',
      expectedRevision: 1,
      record: { ...w.record, definition: nextDefinition },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await w.backend.service.prepareChange(w.principal, {
      ...w.command,
      operationId: 'ordinary-stale',
      definitionRef: nextRef,
      expectedRevision: 1,
    }),
  ).toEqual({ kind: 'rejected', reason: 'definition_changed' })
  const rebase = await w.backend.service.prepareRebase(w.principal, {
    protocol: 'settings-rebase/1',
    requestId: 'rebase',
    operationId: 'rebase',
    target: w.target,
    from: w.command.definitionRef,
    to: nextRef,
    expectedRevision: 1,
    assignments: [{ sourceId: 'organization', itemId: 'enabled', disposition: 'retain' }],
  })
  if (rebase.kind !== 'prepared') throw new Error(JSON.stringify(rebase))
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'rebase-commit',
      preparation: rebase.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  const next = await w.backend.service.prepareChange(w.principal, {
    ...w.command,
    operationId: 'after-rebase',
    definitionRef: nextRef,
    expectedRevision: 2,
  })
  expect(next.kind).toBe('prepared')
})
it('honors native grants even when the administrator has manage qualification', async () => {
  const w = await open()
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'remove-write-grant',
      expectedRevision: 1,
      record: { ...w.record, grants: [] },
    }),
  ).toMatchObject({ kind: 'committed' })
  const prepared = await w.backend.service.prepareChange(w.principal, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'denied',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'aborted', reason: 'forbidden' })
})
for (const commitFirst of [true, false])
  it(`coordinates two real organization tenants with a native administrator update, consumer commit first = ${commitFirst}`, async () => {
    const w = await open()
    const linked = await connectOrganizationConsumers(w)
    close.push(() => linked.close())
    const preparations = []
    for (const c of linked.consumers) {
      const prepared = await c.backend.service.prepareChange(c.principal, c.target.command)
      if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
      preparations.push({ consumer: c, preparation: prepared.preparation })
    }
    const admin = await w.backend.service.prepareChange(w.principal, w.command)
    if (admin.kind !== 'prepared') throw new Error(JSON.stringify(admin))
    const first = preparations[0]
    if (!first) throw new Error('Missing first consumer')
    if (commitFirst)
      expect(
        await first.consumer.backend.service.commitChange(first.consumer.principal, {
          requestId: 'first',
          preparation: first.preparation,
        }),
      ).toMatchObject({ kind: 'committed' })
    expect(
      await w.backend.service.commitChange(w.principal, {
        requestId: 'wait',
        preparation: admin.preparation,
      }),
    ).toEqual({ kind: 'rejected', reason: 'unavailable' })
    const drained = await linked.sources.control.recoverSource(
      { domain: w.domain, target: w.target },
      { after: null, limit: 100 },
    )
    if (drained.kind !== 'recovered') throw new Error(JSON.stringify(drained))
    expect(drained.items).toHaveLength(commitFirst ? 1 : 2)
    expect(drained.items.every(i => i.result.kind === 'settled')).toBe(true)
    expect(
      await w.backend.service.commitChange(w.principal, {
        requestId: 'commit-source',
        preparation: admin.preparation,
      }),
    ).toMatchObject({ kind: 'committed', revision: 1 })
    for (const [index, { consumer, preparation }] of preparations.entries()) {
      const result = await consumer.backend.service.commitChange(consumer.principal, {
        requestId: 'after-source',
        preparation,
      })
      expect(result.kind).toBe(commitFirst && index === 0 ? 'committed' : 'rejected')
    }
  })
it('seals the original organization update when real administrator qualification is withdrawn', async () => {
  const w = await open()
  const prepared = await w.backend.service.prepareChange(w.principal, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(await w.identity.demoteAdministrator()).toEqual({ kind: 'succeeded' })
  expect(
    await w.backend.service.commitChange(w.principal, {
      requestId: 'revoked',
      preparation: prepared.preparation,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await w.world.observePreparation({
      kind: 'root',
      identity: {
        domain: w.domain,
        principalRef: standingPrincipalRef(w.principal),
        operation: prepared.preparation.operation,
      },
    }),
  ).toMatchObject({
    kind: 'read',
    output: { kind: 'found', status: { state: 'aborted', reason: 'sealed' } },
  })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'after-seal',
      expectedRevision: 1,
      record: w.record,
    }),
  ).toMatchObject({ kind: 'committed' })
})
