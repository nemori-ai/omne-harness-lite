import { afterEach, expect, it } from 'vitest'
import { openSourceServiceWorld, source } from './source-service-world.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import {
  createSettingsSourceReservations,
  type SettingsSourceDestination,
  type SettingsSourceRequest,
} from '../src/preparation.ts'
import { sourceRequest } from './source-retention-world.ts'
import { intentIdentitySchema } from '../src/intent-schema.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})
it('captures the real absent source and retains it until an exact destination terminal', async () => {
  const w = await openSourceServiceWorld({
    async seal(request) {
      return { kind: 'terminal', request, outcome: 'aborted' }
    },
  })
  close.push(() => w.close())
  const request = { ...sourceRequest(), source }
  const held = await w.sources.service.reserve(request.destination.identity.principalRef, request)
  expect(held).toMatchObject({
    kind: 'held',
    request,
    snapshot: { presence: 'absent', state: { revision: 0 } },
  })
  expect(await w.set()).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(await w.sources.service.settle(request)).toMatchObject({
    kind: 'settled',
    request,
    outcome: 'aborted',
  })
  expect(await w.set()).toMatchObject({ kind: 'committed', revision: 1 })
  expect(
    await w.sources.service.reserve(request.destination.identity.principalRef, request),
  ).toMatchObject({ kind: 'settled', outcome: 'aborted' })
})
it('keeps the original snapshot after reopen and rejects changed route or principal', async () => {
  const resolver = {
    async seal(request: ReturnType<typeof sourceRequest>) {
      return { kind: 'terminal' as const, request, outcome: 'committed' as const }
    },
  }
  const w = await openSourceServiceWorld(resolver)
  close.push(() => w.close())
  expect(await w.set()).toMatchObject({ kind: 'committed', revision: 1 })
  const request = { ...sourceRequest(), source }
  const held = await w.sources.service.reserve(request.destination.identity.principalRef, request)
  expect(held).toMatchObject({
    kind: 'held',
    snapshot: {
      presence: 'present',
      state: { revision: 1, sources: [{ values: [{ itemId: 'enabled' }] }] },
    },
  })
  expect(await w.sources.service.reserve('other-principal', request)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  const changed = { ...request, destination: { ...request.destination, route: 'other-route' } }
  expect(
    await w.sources.service.reserve(request.destination.identity.principalRef, changed),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  await w.close()
  const reopened = await openSourceServiceWorld(resolver, w.root)
  close.push(() => reopened.close())
  expect(
    await reopened.sources.service.reserve(request.destination.identity.principalRef, request),
  ).toEqual(held)
  expect(await reopened.sources.service.settle(request)).toMatchObject({
    kind: 'settled',
    outcome: 'committed',
  })
})
it('keeps a hold on unavailable or mismatched terminals and recovers other page members', async () => {
  const w = await openSourceServiceWorld({
    async seal(request) {
      if (request.destination.attemptId === 'unavailable') throw new Error('offline')
      if (request.destination.attemptId === 'mismatched')
        return {
          kind: 'terminal',
          request: { ...request, destination: { ...request.destination, route: 'wrong' } },
          outcome: 'aborted',
        }
      return { kind: 'terminal', request, outcome: 'aborted' }
    },
  })
  close.push(() => w.close())
  for (const id of ['unavailable', 'mismatched', 'available']) {
    const request = { ...sourceRequest(id), source }
    expect(
      (await w.sources.service.reserve(request.destination.identity.principalRef, request)).kind,
    ).toBe('held')
  }
  const recovered = await w.sources.control.recover({ after: null, limit: 100 })
  if (recovered.kind !== 'recovered') throw new Error(JSON.stringify(recovered))
  expect(recovered.items).toHaveLength(3)
  expect(recovered.items.filter(i => i.result.kind === 'settled')).toHaveLength(1)
  expect(recovered.items.filter(i => i.result.kind === 'rejected')).toHaveLength(2)
  expect(await w.sources.control.recover({ after: recovered.after, limit: 100 })).toMatchObject({
    kind: 'recovered',
    items: [],
    after: null,
  })
  const retry = await w.sources.control.recover({ after: null, limit: 1 })
  expect(retry).toMatchObject({ kind: 'recovered', items: [{ result: { kind: 'rejected' } }] })
  expect(await w.set()).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(await w.sources.control.pendingUpdates({ after: null, limit: 100 })).toMatchObject({
    kind: 'page',
    items: [{ source, pending: { identity: { operation: { operationId: 'set-source' } } } }],
  })
})

async function linked() {
  let destination: SettingsSourceDestination | undefined
  const sourceWorld = await openSourceServiceWorld({
    recognize: request =>
      destination ? destination.recognize(request) : Promise.resolve({ kind: 'unavailable' }),
    seal: request =>
      destination ? destination.seal(request) : Promise.resolve({ kind: 'unavailable' }),
  })
  close.push(() => sourceWorld.close())
  const requests: SettingsSourceRequest[] = []
  const target = await openPreparedServiceWorld(options => ({
    ...options,
    sources: {
      reserve(context, request) {
        requests.push(request)
        return sourceWorld.sources.service.reserve(context.principalRef, request)
      },
      settle: sourceWorld.sources.service.settle,
    },
  }))
  close.push(() => target.close())
  target.updateCurrent(current => ({
    ...current,
    sources: { ...current.sources, sources: [source] },
  }))
  destination = target.control.sourceDestination
  return { sourceWorld, target, requests }
}
for (const commitFirst of [true, false])
  it(`settles against the actual prepared destination, commit first = ${commitFirst}`, async () => {
    const { sourceWorld, target, requests } = await linked()
    const prepared = await target.service.prepareChange(target.context, target.command)
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    const request = requests[0]!
    expect(await sourceWorld.set()).toEqual({ kind: 'rejected', reason: 'unavailable' })
    if (!commitFirst)
      expect(await sourceWorld.sources.service.settle(request)).toMatchObject({
        kind: 'settled',
        outcome: 'aborted',
      })
    const committed = await target.service.commitChange(target.context, {
      requestId: 'commit',
      preparation: prepared.preparation,
    })
    expect(committed.kind).toBe(commitFirst ? 'committed' : 'rejected')
    expect(await sourceWorld.sources.service.settle(request)).toMatchObject({
      kind: 'settled',
      outcome: commitFirst ? 'committed' : 'aborted',
    })
    expect(await sourceWorld.set()).toMatchObject({ kind: 'committed' })
    expect(
      await target.control.sourceDestination.seal({
        ...request,
        destination: { ...request.destination, route: 'forged' },
      }),
    ).toEqual({ kind: 'unavailable' })
  })
it('does not seal a successor when recovering an original source request', async () => {
  const { sourceWorld, target, requests } = await linked()
  const first = await target.service.prepareChange(target.context, target.command)
  if (first.kind !== 'prepared') throw new Error(JSON.stringify(first))
  expect(await sourceWorld.sources.service.settle(requests[0]!)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  const next = await target.service.prepareChange(target.context, target.command)
  if (next.kind !== 'prepared') throw new Error(JSON.stringify(next))
  expect(next.preparation.attemptId).not.toBe(first.preparation.attemptId)
  expect(await target.control.sourceDestination.seal(requests[0]!)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(
    await target.service.commitChange(target.context, {
      requestId: 'commit-next',
      preparation: next.preparation,
    }),
  ).toMatchObject({ kind: 'committed' })
})
it('recovers an actual requested destination after losing the source reserve reply', async () => {
  const { sourceWorld, target, requests } = await linked()
  let lose = true
  const original = sourceWorld.sources.service.reserve
  sourceWorld.sources.service.reserve = async (...args) => {
    const result = await original(...args)
    if (lose) {
      lose = false
      throw new Error('lost reserve response')
    }
    return result
  }
  expect((await target.service.prepareChange(target.context, target.command)).kind).toBe('unknown')
  expect(await sourceWorld.sources.control.recover({ after: null, limit: 100 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(await target.control.sourceDestination.seal(requests[0]!)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(await sourceWorld.set()).toMatchObject({ kind: 'committed' })
})
it('closes an original request that never reached the source and fences its late reserve', async () => {
  const { sourceWorld, target, requests } = await linked()
  const reserve = sourceWorld.sources.service.reserve
  sourceWorld.sources.service.reserve = async () => {
    throw new Error('transport lost before reserve')
  }
  expect((await target.service.prepareChange(target.context, target.command)).kind).toBe('unknown')
  const request = requests[0]!
  const settled = await sourceWorld.sources.service.settle(request)
  expect(settled).toMatchObject({ kind: 'settled', request, outcome: 'aborted' })
  expect(await reserve(target.context.principalRef, request)).toEqual(settled)
  expect(await target.control.sourceDestination.seal(request)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(await sourceWorld.sources.control.recover({ after: null, limit: 100 })).toMatchObject({
    kind: 'recovered',
    items: [],
  })
  expect(await sourceWorld.set()).toMatchObject({ kind: 'committed' })
})
it('drains an accepted reserve while rejecting new calls and leaves shared storage open', async () => {
  const w = await openSourceServiceWorld({
    async seal(request) {
      return { kind: 'terminal', request, outcome: 'aborted' }
    },
  })
  close.push(() => w.close())
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const service = createSettingsSourceReservations({
    ...w.options,
    access: {
      async authorize(context: string, request) {
        entered.resolve()
        await release.promise
        return w.options.access.authorize(context, request)
      },
    },
  })
  const request = { ...sourceRequest(), source }
  const pending = service.service.reserve(request.destination.identity.principalRef, request)
  await entered.promise
  let closed = false
  const closing = service.control.close().then(() => {
    closed = true
  })
  try {
    expect(
      await service.service.reserve(request.destination.identity.principalRef, request),
    ).toEqual({ kind: 'rejected', reason: 'closing' })
    expect(closed).toBe(false)
  } finally {
    release.resolve()
  }
  expect((await pending).kind).toBe('held')
  await closing
  expect(await w.sources.service.settle(request)).toMatchObject({ kind: 'settled' })
  expect(await w.set()).toMatchObject({ kind: 'committed' })
})
it('does not create a source hold for a destination request that was never durably requested', async () => {
  const { sourceWorld, target, requests } = await linked()
  expect((await target.service.prepareChange(target.context, target.command)).kind).toBe('prepared')
  const original = requests[0]!
  expect((await sourceWorld.sources.service.settle(original)).kind).toBe('settled')
  const fabricated = {
    ...original,
    destination: {
      ...original.destination,
      attemptId: 'never-requested',
      route: 'unsupported-route',
    },
  }
  expect(
    await sourceWorld.sources.service.reserve(target.context.principalRef, fabricated),
  ).toMatchObject({ kind: 'rejected' })
  const foreignOperation = {
    ...original,
    destination: {
      ...original.destination,
      identity: {
        ...original.destination.identity,
        operation: { kind: 'permission-capture', captureId: 'foreign' },
      },
    },
  }
  expect(await target.control.sourceDestination.recognize(foreignOperation)).toEqual({
    kind: 'unavailable',
  })
  expect(await target.control.sourceDestination.seal(foreignOperation)).toEqual({
    kind: 'unavailable',
  })
  expect(await sourceWorld.set()).toMatchObject({ kind: 'committed' })
})

it.each(['unavailable', 'mismatched', 'committed'] as const)(
  'cannot close an absent reservation from a %s destination result',
  async kind => {
    const world = await openSourceServiceWorld({
      async seal(request) {
        if (kind === 'unavailable') return { kind: 'unavailable' }
        return {
          kind: 'terminal',
          request:
            kind === 'mismatched'
              ? { ...request, destination: { ...request.destination, route: 'other' } }
              : request,
          outcome: kind === 'committed' ? 'committed' : 'aborted',
        }
      },
    })
    close.push(() => world.close())
    const request = { ...sourceRequest(), source }
    expect(await world.sources.service.settle(request)).toMatchObject({ kind: 'rejected' })
    expect(
      await world.sources.service.reserve(request.destination.identity.principalRef, request),
    ).toMatchObject({ kind: 'held' })
  },
)
it('recognizes a durable settlement after its SQL response is lost', async () => {
  let seals = 0
  const w = await openSourceServiceWorld({
    async seal(request) {
      seals++
      return { kind: 'terminal', request, outcome: 'aborted' }
    },
  })
  close.push(() => w.close())
  let lose = true
  const service = createSettingsSourceReservations({
    ...w.options,
    storage: {
      ...w.storage,
      async commit(input) {
        const result = await w.storage.commit(input)
        if (lose && input.commands.some(command => command.facts['kind'] === 'settlement')) {
          lose = false
          throw new Error('lost settled SQL response')
        }
        return result
      },
    },
  })
  close.push(() => service.control.close())
  const request = { ...sourceRequest(), source }
  expect(
    (await service.service.reserve(request.destination.identity.principalRef, request)).kind,
  ).toBe('held')
  expect(await service.service.settle(request)).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(await service.service.settle(request)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(seals).toBe(1)
  expect(await w.set()).toMatchObject({ kind: 'committed' })
})
it('cannot revive the destination when it seals between request recognition and source reserve', async () => {
  const { sourceWorld, target, requests } = await linked()
  const sourceService = createSettingsSourceReservations({
    ...sourceWorld.options,
    destination: {
      async recognize(request) {
        const known = await target.control.sourceDestination.recognize(request)
        expect(await target.control.sourceDestination.seal(request)).toMatchObject({
          kind: 'terminal',
          outcome: 'aborted',
        })
        return known
      },
      seal: target.control.sourceDestination.seal,
    },
  })
  close.push(() => sourceService.control.close())
  sourceWorld.sources.service.reserve = sourceService.service.reserve
  expect((await target.service.prepareChange(target.context, target.command)).kind).not.toBe(
    'prepared',
  )
  const request = requests[0]!
  expect(
    await target.service.commitChange(target.context, {
      requestId: 'late',
      preparation: {
        protocol: 'settings-preparation/1',
        operation: intentIdentitySchema.parse(request.destination.identity).operation,
        attemptId: request.destination.attemptId,
        commandDigest: request.destination.commandDigest,
      },
    }),
  ).toMatchObject({ kind: 'rejected' })
  expect(await sourceService.control.recover({ after: null, limit: 100 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(await sourceWorld.set()).toMatchObject({ kind: 'committed' })
})
