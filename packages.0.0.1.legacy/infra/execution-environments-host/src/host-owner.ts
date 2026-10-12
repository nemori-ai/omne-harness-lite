import { randomUUID } from 'node:crypto'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {
  EnvironmentProvider,
  ManagedResource,
  ResourceLifecycle,
  ResourceRecoveryResult,
} from '@omne-harness-lite/execution-environments'
import {
  createNativeStore,
  hostCreatorIdentity,
  hostCreatorIsGone,
  type NativeRecord,
} from './native-store.ts'
import {
  createHostProcessCoordinate,
  stopHostResource,
  observeWithin,
  type HostRecoveryControl,
} from './native-control.ts'
import { prepareHostProcess } from './native-command.ts'
import type { CommandRequest, FacilityFailure } from '@omne-harness-lite/execution-environments'
import type { Storage } from '@omne-harness-lite/storage'
import type { HostNativePolicy } from './native-policy.ts'
import { finishHostCleanup } from './host-cleanup.ts'
import { hostCoordinateBootChanged, hostGateEntryConfirmed } from './native-evidence.ts'

export type HostAcquireRequest = Parameters<EnvironmentProvider['acquire']>[0]
export function createHostOwner(input: {
  name: string
  generation: string
  storage: Storage
  policy: HostNativePolicy
}) {
  const store = createNativeStore(input.storage, input.name),
    creator = hostCreatorIdentity()
  // Acquisition and managed setup report this exact initialization failure.
  void creator.catch(() => undefined)
  const controls = new Map<string, HostRecoveryControl>()
  const writes = new Map<string, Promise<unknown>>()
  const stopping = new Map<string, Promise<ResourceRecoveryResult>>()
  const fileWorks = new Set<Promise<unknown>>()
  const operations = new Map<Promise<unknown>, string>()
  let active = true
  const uncreated = new Map<string, NativeRecord>()
  let fileTail: Promise<unknown> = Promise.resolve()
  function retainFileWork<T>(work: Promise<T>): Promise<T> {
    fileWorks.add(work)
    void work.then(
      () => fileWorks.delete(work),
      () => fileWorks.delete(work),
    )
    return work
  }
  function serializeFiles<T>(operation: () => Promise<T>): Promise<T> {
    const work = fileTail.then(async () => {
      const pending = (await store.list()).some(
        record =>
          record.generation !== input.generation &&
          !record.stopped &&
          (record.kind === 'batch' || record.kind === 'mutation'),
      )
      if (pending)
        throw new Error(
          'Original file operations require recovery before a new generation can publish',
        )
      return operation()
    })
    retainFileWork(work)
    fileTail = work.catch(() => undefined)
    return work
  }
  function retainOperation<T>(call: string, operation: () => Promise<T>): Promise<T> {
    const work = Promise.resolve().then(operation)
    operations.set(work, call)
    void work.finally(() => operations.delete(work)).catch(() => undefined)
    return work
  }
  function pendingCall(call: string) {
    return [...operations.values()].includes(call)
  }
  async function permit(request: HostAcquireRequest, key: string) {
    if (!active || request.resources.closed.aborted) return false
    const granted = await request.resources.permit(key)
    return granted === 'confirmed' && active && !request.resources.closed.aborted
  }
  async function original(
    request: HostAcquireRequest,
    kind: NativeRecord['kind'],
    reference: Record<string, unknown>,
    extra: Partial<NativeRecord> = {},
  ) {
    const key = randomUUID(),
      identity = await creator
    const captured = copyJsonValue({
      ...reference,
      call: request.call.execution,
      kind,
      generation: input.generation,
      creator: identity,
    })
    if ('failed' in captured) throw new TypeError('Invalid original native resource reference')
    const resource: ManagedResource = { key, provider: input.name, reference: captured.ok }
    const record: NativeRecord = {
      ...extra,
      resource,
      creator: identity,
      kind,
      generation: input.generation,
      scope: writeJsonLossless(request.scope),
    }
    if (!active || request.resources.closed.aborted) return undefined
    if ((await request.resources.plan(resource)) !== 'recorded') return undefined
    uncreated.set(key, record)
    await store.create(record)
    uncreated.delete(key)
    if (!active || request.resources.closed.aborted) {
      await stopped(record, request.resources, true)
      return undefined
    }
    return record
  }
  async function stopped(record: NativeRecord, lifecycle: ResourceLifecycle, confirmed: boolean) {
    if (!confirmed) {
      await lifecycle.stopped(record.resource.key, 'unconfirmed')
      return false
    }
    await store.change(record.resource.key, basis => ({
      ...basis!,
      stopped: true,
      cleanupPending: true,
    }))
    const cleanup = await finishHostCleanup(record, store, input.policy)
    if (cleanup.status !== 'confirmedStopped') return false
    return (await lifecycle.stopped(record.resource.key, 'confirmed')) === 'recorded'
  }
  async function stopWarm(record: NativeRecord): Promise<ResourceRecoveryResult | undefined> {
    if (uncreated.has(record.resource.key)) {
      await store.create(record)
      uncreated.delete(record.resource.key)
      return confirmStop(record)
    }
    const held = controls.get(record.resource.key)
    if (held) {
      if ((await held.stop('forced')) !== 'confirmed') return { status: 'pending' }
      controls.delete(record.resource.key)
      return confirmStop(record)
    }
    const work = writes.get(record.resource.key)
    if (!work) return undefined
    if (
      !(await observeWithin(
        work.catch(() => undefined),
        input.policy.stopDeadlineMs,
      ))
    )
      return { status: 'pending' }
    return confirmStop(record)
  }
  async function alreadyStopped(record: NativeRecord) {
    if (record.stopped || (record.kind === 'leg' && record.completed)) return true
    if (record.kind !== 'leg' || !record.terminal) return false
    return Boolean((await store.load(record.terminal))?.stopped)
  }
  async function stopCold(record: NativeRecord): Promise<ResourceRecoveryResult> {
    if (!(await hostCreatorIsGone(record.creator))) return { status: 'pending' }
    const reference = record.resource.reference as { unit?: string; boot?: string }
    if (reference.unit && reference.boot) {
      const coordinate = { unit: reference.unit, boot: reference.boot }
      // Creator death alone cannot rule out an original late launcher. Entry evidence
      // or a boot change is necessary before interpreting an absent unit as stopped.
      const isolated =
        (await hostCoordinateBootChanged(coordinate)) || (await hostGateEntryConfirmed(coordinate))
      if ((await stopHostResource(coordinate, input.policy, async () => isolated)) !== 'confirmed')
        return { status: 'pending' }
    }
    return confirmStop(record)
  }
  async function stopRecord(record: NativeRecord): Promise<ResourceRecoveryResult> {
    if (await alreadyStopped(record)) return confirmStop(record)
    return (await stopWarm(record)) ?? stopCold(record)
  }
  async function observeStop(record: NativeRecord): Promise<ResourceRecoveryResult> {
    let work = stopping.get(record.resource.key)
    if (!work) {
      work = stopRecord(record).finally(() => {
        stopping.delete(record.resource.key)
      })
      stopping.set(record.resource.key, work)
    }
    try {
      const observed = await observeWithin(work, input.policy.stopDeadlineMs)
      return observed?.value ?? { status: 'pending' }
    } catch {
      return { status: 'pending' }
    }
  }
  async function confirmStop(record: NativeRecord): Promise<ResourceRecoveryResult> {
    await store.change(record.resource.key, basis => ({
      ...basis!,
      stopped: true,
      cleanupPending: true,
    }))
    const result = await finishHostCleanup(record, store, input.policy)
    if (result.status === 'confirmedStopped') writes.delete(record.resource.key)
    return result
  }
  return {
    store,
    original,
    stopped,
    controls,
    writes,
    serializeFiles,
    retainFileWork,
    retainOperation,
    permit,
    isActive: () => active,
    hasPendingWork: () =>
      operations.size > 0 ||
      fileWorks.size > 0 ||
      stopping.size > 0 ||
      writes.size > 0 ||
      uncreated.size > 0,
    async verify() {
      await store.verify()
      await creator
    },
    async start(request: HostAcquireRequest, command: CommandRequest) {
      const coordinate = await createHostProcessCoordinate()
      const record = await original(request, 'command', { ...coordinate })
      if (!record) return { kind: 'rejected' as const, reason: 'closed' as const }
      const prepared = await prepareHostProcess(command, input.policy, coordinate)
      if (prepared.kind === 'rejected') {
        await stopped(record, request.resources, true)
        return prepared
      }
      controls.set(record.resource.key, prepared.control)
      if (
        prepared.kind !== 'ready' ||
        !active ||
        request.resources.closed.aborted ||
        !(await permit(request, record.resource.key))
      ) {
        await stopped(
          record,
          request.resources,
          (await prepared.control.stop('forced')) === 'confirmed',
        )
        return { kind: 'rejected' as const, reason: 'closed' as const }
      }
      if ((await prepared.control.go()) !== 'started')
        return { kind: 'rejected' as const, reason: 'effectUnknown' as const }
      const process = prepared.control.process
      const result = retainFileWork(
        process.result.then(async outcome => {
          const confirmed = (await prepared.control.stop('forced')) === 'confirmed'
          await stopped(record, request.resources, confirmed)
          if (confirmed) controls.delete(record.resource.key)
          return outcome
        }),
      )
      return {
        kind: 'started' as const,
        process: {
          ...process,
          result,
          stop: async (mode: 'graceful' | 'forced') => {
            const status = await prepared.control.stop(mode)
            await stopped(record, request.resources, status === 'confirmed')
            return status
          },
        },
      }
    },
    async recover(resource: ManagedResource): Promise<ResourceRecoveryResult> {
      const stranded = uncreated.get(resource.key)
      if (stranded && writeJsonLossless(stranded.resource) === writeJsonLossless(resource)) {
        // No native preparation started before this failed original index write.
        await store.create(stranded)
        uncreated.delete(resource.key)
        return confirmStop(stranded)
      }
      const record = await store.load(resource.key)
      if (!record) return { status: resource.provider === input.name ? 'pending' : 'unsupported' }
      if (writeJsonLossless(record.resource) !== writeJsonLossless(resource))
        return { status: 'unsupported' }
      return observeStop(record)
    },
    async list(scope: HostAcquireRequest['scope']) {
      const records = await store.list(writeJsonLossless(scope))
      return records
        .filter(
          record =>
            (!record.stopped || record.cleanupPending) &&
            (record.generation !== input.generation || !active),
        )
        .map(record => record.resource)
    },
    async release(request: HostAcquireRequest) {
      const pending: ManagedResource[] = []
      const records = [
        ...(await store.list(writeJsonLossless(request.scope))),
        ...[...uncreated.values()].filter(
          record => record.scope === writeJsonLossless(request.scope),
        ),
      ]
      if (pendingCall(request.call.execution))
        return {
          pending: true,
          resources: records
            .filter(
              record =>
                (record.resource.reference as { call?: string }).call === request.call.execution,
            )
            .map(record => record.resource),
        }
      for (const record of records) {
        if (
          record.generation !== input.generation ||
          (record.stopped && !record.cleanupPending) ||
          record.adopted
        )
          continue
        // Only resources born in this original call are attached to this lease.
        const reference = record.resource.reference as { call?: string }
        if (reference.call !== request.call.execution) continue
        if ((await observeStop(record)).status !== 'confirmedStopped') pending.push(record.resource)
      }
      return { pending: pending.length > 0, resources: pending }
    },
    async retire() {
      active = false
      for (const control of controls.values()) control.closePermission()
      const pending: ManagedResource[] = []
      for (const record of [...(await store.list()), ...uncreated.values()]) {
        if (record.generation !== input.generation || (record.stopped && !record.cleanupPending))
          continue
        if ((await observeStop(record)).status !== 'confirmedStopped') pending.push(record.resource)
      }
      await observeWithin(Promise.allSettled([...fileWorks]), input.policy.stopDeadlineMs)
      return pending
    },
  }
}
export type HostOwner = ReturnType<typeof createHostOwner>
export const closedFacility = (): FacilityFailure => ({ kind: 'rejected', reason: 'closed' })
