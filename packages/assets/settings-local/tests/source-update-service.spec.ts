import { afterEach, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { createStandaloneSettingsOwner } from '../src/index.ts'
import { createSettingsSourceReservations, type SettingsSourceRequest } from '../src/preparation.ts'
import { sourceKey } from '../src/source-retention-records.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import { definition } from './world.ts'
import { equal } from '../src/encoding.ts'
import { STANDALONE_PARTICIPANT } from '../src/standalone-schema.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})
async function open() {
  const admin = await openPreparedServiceWorld(undefined, { sourceCapture: true })
  close.push(() => admin.close())
  const source = { domain: admin.options.domain, target: admin.command.target }
  admin.updateCurrent(current => ({
    ...current,
    purpose: { kind: 'source-update', sourceKey: sourceKey(source) },
  }))
  const participants = [
    'settings.source-snapshot',
    'settings.source-retention',
    STANDALONE_PARTICIPANT,
    ...admin.world.participants.filter(
      p =>
        p !== 'settings.source-finalization' &&
        p !== 'settings.source-retention' &&
        p !== 'fixture.recovery-rollback',
    ),
  ]
  const manifest = combinationManifest({ catalog: admin.world.materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const registration = {
    combinationVersion: 'source-update-service/1',
    manifestDigest: manifestDigest(manifest.manifest),
  }
  expect(
    await admin.world.storage.registerCombination({
      ...source.domain,
      ...registration,
      participants,
    }),
  ).toMatchObject({ kind: 'registered' })
  const owner = createStandaloneSettingsOwner({
    storage: admin.world.storage,
    domain: source.domain,
    ...registration,
  })
  close.push(() => owner.close())
  async function provision(selected = source) {
    expect(
      await owner.mutate({
        kind: 'provision',
        operationId: `provision-${selected.target.targetRef}`,
        expectedRevision: null,
        record: {
          target: selected.target,
          publicationRef: null,
          definition,
          sources: [
            {
              sourceId: 'tenant',
              ownerRef: 'owner',
              scope: { kind: 'tenant', subjectRef: source.target.scopeRef },
            },
          ],
          grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
        },
      }),
    ).toMatchObject({ kind: 'committed' })
  }
  await provision()
  let unavailable = false
  let seals = 0
  const destinations: Awaited<ReturnType<typeof openPreparedServiceWorld>>[] = []
  function destination(request: SettingsSourceRequest) {
    return destinations.find(target =>
      equal(target.options.domain, request.destination.identity.domain),
    )?.control.sourceDestination
  }
  const sources = createSettingsSourceReservations({
    storage: admin.world.storage,
    domain: source.domain,
    registration,
    access: {
      async authorize(principalRef: string, request) {
        return {
          kind: 'authorized',
          principalRef,
          scope: source.domain.scope,
          target: request.source.target,
        }
      },
    },
    destination: {
      recognize: request =>
        destination(request)?.recognize(request) ?? Promise.resolve({ kind: 'unavailable' }),
      async seal(request) {
        seals++
        return unavailable
          ? { kind: 'unavailable' }
          : (destination(request)?.seal(request) ?? { kind: 'unavailable' })
      },
    },
  })
  close.push(() => sources.control.close())
  async function connect(selected = source) {
    const target = await openPreparedServiceWorld(options => ({
      ...options,
      sources: {
        reserve: (context, request) => sources.service.reserve(context.principalRef, request),
        settle: request => sources.service.settle(request),
      },
    }))
    close.push(() => target.close())
    target.updateCurrent(current => ({
      ...current,
      sources: { ...current.sources, sources: [selected] },
    }))
    destinations.push(target)
    return target
  }
  const target = await connect()
  return {
    admin,
    source,
    target,
    sources,
    owner,
    provision,
    connect,
    setUnavailable(value: boolean) {
      unavailable = value
    },
    seals: () => seals,
  }
}
it('keeps the original source update pending instead of sealing it while a destination is held', async () => {
  const { admin, target, sources, source } = await open()
  expect((await target.service.prepareChange(target.context, target.command)).kind).toBe('prepared')
  const prepared = await admin.service.prepareChange(admin.context, admin.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await admin.service.commitChange(admin.context, {
      requestId: 'wait',
      preparation: prepared.preparation,
    }),
  ).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(
    await admin.service.getOperation(admin.context, prepared.preparation.operation),
  ).toMatchObject({
    kind: 'pending',
    attempt: { state: 'prepared', preparation: prepared.preparation },
  })
  expect(await sources.control.recoverSource(source, { after: null, limit: 100 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(
    await admin.service.commitChange(admin.context, {
      requestId: 'retry',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
})

it('recovers only the selected source and leaves another source able to commit', async () => {
  const w = await open()
  const other = { ...w.source, target: { ...w.source.target, targetRef: 'unrelated-source' } }
  await w.provision(other)
  const target2 = await w.connect(other)
  const first = await w.target.service.prepareChange(w.target.context, w.target.command)
  const second = await target2.service.prepareChange(target2.context, target2.command)
  if (first.kind !== 'prepared' || second.kind !== 'prepared')
    throw new Error('Expected preparations')
  expect(
    await w.sources.control.recoverSource(w.source, { after: null, limit: 100 }),
  ).toMatchObject({
    kind: 'recovered',
    items: [{ request: { source: w.source }, result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(w.seals()).toBe(1)
  expect(
    await target2.service.commitChange(target2.context, {
      requestId: 'other-commit',
      preparation: second.preparation,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await w.target.service.commitChange(w.target.context, {
      requestId: 'sealed',
      preparation: first.preparation,
    }),
  ).toMatchObject({ kind: 'rejected' })
})
it('keeps unknown obligations across a bounded scan and permits cancellation of the pending update', async () => {
  const w = await open()
  expect((await w.target.service.prepareChange(w.target.context, w.target.command)).kind).toBe(
    'prepared',
  )
  const prepared = await w.admin.service.prepareChange(w.admin.context, w.admin.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  w.setUnavailable(true)
  const page = await w.sources.control.recoverSource(w.source, { after: null, limit: 1 })
  if (page.kind !== 'recovered') throw new Error(JSON.stringify(page))
  expect(page.items).toMatchObject([{ result: { kind: 'rejected', reason: 'unavailable' } }])
  expect(page.after).not.toBeNull()
  expect(await w.sources.control.recoverSource(w.source, { after: page.after, limit: 1 })).toEqual({
    kind: 'recovered',
    items: [],
    after: null,
  })
  expect(
    await w.admin.service.commitChange(w.admin.context, {
      requestId: 'wait',
      preparation: prepared.preparation,
    }),
  ).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(
    await w.admin.service.cancelChange(w.admin.context, {
      requestId: 'cancel',
      operation: prepared.preparation.operation,
    }),
  ).toMatchObject({ kind: 'aborted', reason: 'cancelled' })
  w.setUnavailable(false)
  expect(await w.sources.control.recoverSource(w.source, { after: null, limit: 1 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled' } }],
  })
})
it('rejects recovery for another domain without calling its destination', async () => {
  const w = await open()
  const foreign = {
    ...w.source,
    domain: { ...w.source.domain, transactionDomain: 'foreign.settings' },
  }
  expect(await w.sources.control.recoverSource(foreign, { after: null, limit: 100 })).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await w.sources.control.recoverSource(w.source, { after: null, limit: 101 })).toEqual({
    kind: 'rejected',
    reason: 'invalid_input',
  })
  expect(w.seals()).toBe(0)
})
it('paginates only held requests of the chosen source without losing continuation keys', async () => {
  const w = await open()
  for (const operationId of ['page-a', 'page-b', 'page-c'])
    expect(
      (await w.target.service.prepareChange(w.target.context, { ...w.target.command, operationId }))
        .kind,
    ).toBe('prepared')
  const seen = new Set<string>()
  let after: string | null = null
  do {
    const page = await w.sources.control.recoverSource(w.source, { after, limit: 1 })
    if (page.kind !== 'recovered') throw new Error(JSON.stringify(page))
    expect(page.items.length).toBeLessThanOrEqual(1)
    for (const item of page.items) {
      expect(item.result.kind).toBe('settled')
      const id = item.request.destination.identity.operation.operationId
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
    after = page.after
  } while (after !== null)
  expect([...seen].sort()).toEqual(['page-a', 'page-b', 'page-c'])
})
it('keeps a source update pending if readiness cannot be read and retries its exact preparation', async () => {
  let unavailable = true
  const admin = await openPreparedServiceWorld(options => ({
    ...options,
    storage: {
      ...options.storage,
      async read(request) {
        if (unavailable && request.handler === 'settings.source-read')
          throw new Error('readiness offline')
        return options.storage.read(request)
      },
    },
  }))
  close.push(() => admin.close())
  const source = { domain: admin.options.domain, target: admin.command.target }
  admin.updateCurrent(current => ({
    ...current,
    purpose: { kind: 'source-update', sourceKey: sourceKey(source) },
  }))
  const prepared = await admin.service.prepareChange(admin.context, admin.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await admin.service.commitChange(admin.context, {
      requestId: 'unknown',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'unknown' })
  expect(
    await admin.service.getOperation(admin.context, prepared.preparation.operation),
  ).toMatchObject({ kind: 'pending', attempt: { state: 'prepared' } })
  unavailable = false
  expect(
    await admin.service.commitChange(admin.context, {
      requestId: 'retry',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed' })
})
