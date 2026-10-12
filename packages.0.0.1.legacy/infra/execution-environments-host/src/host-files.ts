import type {
  FileFacility,
  FileBatchEntry,
  FileBatchReference,
  FileBatchResult,
  FacilityFailure,
} from '@omne-harness-lite/execution-environments'
import { fileFailure, hostFileVersion, inspectHostPath } from './file-path.ts'
import { readHostFile, statHostFile, listHostFiles, searchHostFiles } from './file-query.ts'
import { moveHostFile, captureHostCopy, removeHostPath, mkdirHostPath } from './file-mutation.ts'
import {
  planHostFileBatch,
  prepareHostFileBatch,
  publishHostFileBatch,
  recognizeHostFileBatch,
} from './file-batch.ts'
import type { HostNativePolicy } from './native-policy.ts'
import type { HostAcquireRequest, HostOwner } from './host-owner.ts'
import { observeWithin } from './native-control.ts'
import type { NativeRecord } from './native-store.ts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const mayPublish = (open: boolean, within: boolean, parent: boolean) => open && within && parent
export function createHostFiles(
  owner: HostOwner,
  request: HostAcquireRequest,
  policy: HostNativePolicy,
): FileFacility {
  const open = () => owner.isActive() && !request.resources.closed.aborted
  async function observeWork<T>(
    record: NativeRecord,
    operation: (within: () => boolean) => Promise<T>,
    unknown: T,
    serialize = true,
  ): Promise<T> {
    let expired = false
    const run = () => operation(() => !expired)
    const work = serialize ? owner.serializeFiles(run) : run()
    owner.writes.set(record.resource.key, work)
    const settled = owner.retainFileWork(
      work
        .catch(() => unknown)
        .then(async value => {
          try {
            if (await owner.stopped(record, request.resources, true))
              owner.writes.delete(record.resource.key)
          } catch {
            // Keep the original completed IO until the same cleanup owner can retry.
          }
          return value
        }),
    )
    // Cleanup failure cannot erase an independently confirmed publication receipt.
    const observed = await observeWithin(settled, policy.commandDeadlineMs)
    if (!observed) expired = true
    return observed ? observed.value : unknown
  }

  async function batch(
    entries: readonly FileBatchEntry[],
    serialize = true,
    parentOpen = () => true,
  ): Promise<FileBatchResult | FacilityFailure> {
    if (!open() || !parentOpen()) return { kind: 'rejected', reason: 'closed' }
    const manifest = planHostFileBatch(entries)
    const record = await owner.original(
      request,
      'batch',
      { manifest },
      { manifest, receipts: { published: [], complete: false } },
    )
    if (!record) return { kind: 'rejected', reason: 'closed' }
    const reference: FileBatchReference = { id: manifest.id, generation: record.generation }
    async function publish(within: () => boolean): Promise<FileBatchResult | FacilityFailure> {
      if (!mayPublish(open(), within(), parentOpen()))
        return { kind: 'unknown', batch: reference, published: [], reason: 'closed' }
      const prepared = await prepareHostFileBatch(manifest, entries, policy, async ownership => {
        try {
          await owner.store.change(record!.resource.key, basis => ({
            ...basis!,
            stageOwners: [...(basis!.stageOwners ?? []), ownership],
          }))
          return 'recorded'
        } catch {
          return 'unavailable'
        }
      })
      if (prepared.kind === 'rejected') return prepared
      if (prepared.kind === 'unknown')
        return { kind: 'unknown', batch: reference, published: [], reason: 'effectUnknown' }
      if (
        !mayPublish(open(), within(), parentOpen()) ||
        (await request.resources.permit(record!.resource.key)) !== 'confirmed'
      )
        return { kind: 'unknown', batch: reference, published: [], reason: 'closed' }
      const result = await publishHostFileBatch(manifest, policy, {
        open: () => open() && within() && parentOpen(),
        async record(event) {
          try {
            await owner.store.change(record!.resource.key, basis => {
              const receipts = basis!.receipts ?? { published: [], complete: false }
              return {
                ...basis!,
                receipts:
                  event.kind === 'completed'
                    ? { ...receipts, complete: true }
                    : { ...receipts, published: [...receipts.published, event.path] },
              }
            })
            return 'recorded'
          } catch {
            return 'unavailable'
          }
        },
      })
      return { ...result, batch: reference }
    }
    return observeWork(
      record,
      publish,
      { kind: 'unknown', batch: reference, published: [], reason: 'effectUnknown' },
      serialize,
    )
  }
  async function mutation<T>(
    paths: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T | FacilityFailure> {
    if (!open()) return { kind: 'rejected', reason: 'closed' }
    const record = await owner.original(request, 'mutation', { paths })
    if (!record) return { kind: 'rejected', reason: 'closed' }
    return observeWork<T | FacilityFailure>(
      record,
      async within => {
        if (
          !open() ||
          !within() ||
          (await request.resources.permit(record.resource.key)) !== 'confirmed'
        )
          return { kind: 'rejected', reason: 'closed' }
        return open() && within() ? operation() : { kind: 'rejected', reason: 'closed' }
      },
      { kind: 'rejected', reason: 'effectUnknown' },
    )
  }
  async function query<T>(operation: () => Promise<T>): Promise<T | FacilityFailure> {
    const work = owner.retainFileWork(operation())
    try {
      const observed = await observeWithin(work, policy.commandDeadlineMs)
      return observed ? observed.value : { kind: 'rejected', reason: 'unavailable' }
    } catch (error) {
      return fileFailure(error)
    }
  }
  return {
    read: value => query(() => readHostFile(value, policy)),
    stat: path => query(() => statHostFile(path)),
    list: value => query(() => listHostFiles(value, policy)),
    search: value => query(() => searchHostFiles(value, policy)),
    async write(value) {
      try {
        const captured = await query(() => inspectHostPath(value.path, true))
        if (captured && 'kind' in captured) return captured
        const stat = captured
        const expectedVersion =
          value.mode === 'create'
            ? null
            : (value.expectedVersion ?? (stat ? hostFileVersion(stat) : null))
        const result = await batch([{ path: value.path, data: value.data, expectedVersion }])
        if (result.kind !== 'committed') return result
        const after = await query(() => statHostFile(value.path))
        return after.kind === 'stat'
          ? { kind: 'written', path: after.value.path, version: after.value.version }
          : {
              kind: 'unknown',
              batch: result.batch,
              published: result.published,
              reason: 'effectUnknown',
            }
      } catch (error) {
        return fileFailure(error)
      }
    },
    commitBatch: value => batch(value.entries),
    recoverBatch: reference =>
      query(async () => {
        const records = await owner.store.list(writeJsonLossless(request.scope))
        const record = records.find(
          value => value.manifest?.id === reference.id && value.generation === reference.generation,
        )
        if (!record?.manifest) return { kind: 'rejected' as const, reason: 'notFound' as const }
        const receipts = record.receipts ?? { published: [], complete: false }
        const recognized = await recognizeHostFileBatch(record.manifest, receipts, policy)
        return {
          kind: 'recognized' as const,
          batch: reference,
          published: receipts.published,
          ...recognized,
        }
      }),
    move: value => mutation([value.source, value.target], () => moveHostFile(value, policy)),
    async copy(value) {
      let expired = false
      const work = owner.serializeFiles(async () => {
        try {
          if (!open() || expired) return { kind: 'rejected' as const, reason: 'closed' as const }
          const copy = await captureHostCopy(value, policy),
            result = await batch(copy.entries, false, () => !expired)
          if (result.kind === 'unknown')
            return { kind: 'rejected' as const, reason: 'effectUnknown' as const }
          return result.kind === 'committed'
            ? { kind: 'copied' as const, source: copy.source, target: copy.target }
            : result
        } catch (error) {
          return fileFailure(error)
        }
      })
      const observed = await observeWithin(work, policy.commandDeadlineMs)
      if (!observed) expired = true
      return observed?.value ?? { kind: 'rejected', reason: 'effectUnknown' }
    },
    remove: value => mutation([value.path], () => removeHostPath(value, policy)),
    mkdir: value => mutation([value.path], () => mkdirHostPath(value, policy)),
  }
}
