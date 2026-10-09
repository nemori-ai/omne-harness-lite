import { setTimeout as yieldToTimers } from 'node:timers/promises'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type { CheckedPrefix } from '@omne-harness-lite/session-log'
import type {
  SessionAccess,
  SessionScope,
  AccessOperation,
} from '@omne-harness-lite/session-tenancy'
import {
  projectToolJournal,
  type ExecutionRef,
  type ResultStoreConfig,
  type ResultStoreFailure,
  type ToolJournalHistory,
  type ToolResultStorageDependencies,
  type ToolResultStorageInstance,
  type ToolResultStorageOperations,
  type ToolResultWriter,
} from '@omne-harness-lite/tool-execution-runtime'
import { createImmutableFiles } from './immutable-files.ts'
import { readStoredResult } from './result-record.ts'
import { createByteStore } from './bytes.ts'
import { createRecords, fileKey, object, same } from './records.ts'
import {
  captureRef,
  captureReference,
  captureResult,
  captureScope,
  captureStoreConfig,
  references,
} from './values.ts'

const reject = (reason: ResultStoreFailure['reason']): ResultStoreFailure => ({
  kind: 'rejected',
  reason,
})

/** An independent closure. Live dependencies belong to construction, never to plugin Config. */
export async function openToolResultStorage(
  config: Pick<ResultStoreConfig, 'directory' | 'storage'>,
  dependencies: ToolResultStorageDependencies,
): Promise<ToolResultStorageInstance> {
  const copied = captureStoreConfig(config)
  const storage = copied.storage,
    files = await createImmutableFiles(copied.directory)
  const records = createRecords(files),
    bytes = createByteStore(files, storage),
    generation = dependencies.backing.ownerGeneration
  let held: ReturnType<ToolResultStorageDependencies['backing']['borrow']>
  try {
    held = dependencies.backing.borrow()
  } catch (error) {
    await files.close()
    throw error
  }
  const tasks = new Set<Promise<unknown>>()
  let accepting = true,
    released = false,
    closing: Promise<void> | undefined
  const active = () => !released && generation === dependencies.backing.ownerGeneration
  function track<T>(operation: () => Promise<T>): Promise<T | ResultStoreFailure> {
    if (!accepting || !active()) return Promise.resolve(reject('ownerStopped'))
    const task = Promise.resolve()
      .then(operation)
      .catch(() => reject('storageUnavailable'))
    tasks.add(task)
    void task.then(() => tasks.delete(task))
    return task
  }
  async function authorize(
    access: SessionAccess,
    scope: SessionScope,
    operation: AccessOperation,
  ): Promise<ResultStoreFailure | undefined> {
    // History can keep a chain of microtasks busy. Run due maintenance before current authorization.
    await yieldToTimers(0)
    if (!active()) return reject('ownerStopped')
    const checked = await dependencies.authorization.authorize(access, scope, operation)
    if (!active()) return reject('ownerStopped')
    if (checked.kind !== 'authorized' || !same(checked.identity.scope, scope))
      return reject(
        checked.kind === 'rejected' && checked.reason === 'unavailable'
          ? 'storageUnavailable'
          : 'notAuthorized',
      )
  }
  async function maintenance(
    access: RecoveryAccess,
    ref: ExecutionRef,
  ): Promise<ResultStoreFailure | undefined> {
    if (!active()) return reject('ownerStopped')
    const checked = await dependencies.recoveryAuthority.authorizeRecovery(
      access,
      { tenant: ref.tenant, session: ref.session },
      [],
    )
    if (!active()) return reject('ownerStopped')
    if (checked !== 'authorized')
      return reject(checked === 'unavailable' ? 'storageUnavailable' : 'notAuthorized')
  }
  async function history(
    ref: ExecutionRef,
  ): Promise<{ kind: 'history'; execution?: ToolJournalHistory } | ResultStoreFailure> {
    if (!active()) return reject('ownerStopped')
    const prefix = await held.log.readSince(ref.session, 0)
    if (!active()) return reject('ownerStopped')
    if ('failure' in prefix) return reject('storageUnavailable')
    const scope = { tenant: ref.tenant, session: ref.session },
      copy = copyJsonValue({ scope, ownerGeneration: generation, ...prefix })
    if ('failed' in copy) return reject('storageUnavailable')
    const checked = copy.ok as unknown as CheckedPrefix,
      facts = dependencies.history.inspect(checked, ref.callId),
      projected = projectToolJournal(scope, checked.entries)
    if (facts.kind === 'unavailable' || 'invalid' in projected) return reject('storageUnavailable')
    const execution = projected.executions.get(ref.callId)
    if (
      execution &&
      (facts.kind !== 'known' ||
        facts.facts.route.kind !== 'execution' ||
        facts.facts.route.intentKey !== execution.intent.entry.dedupeKey)
    )
      return reject('storageUnavailable')
    return { kind: 'history', ...(execution ? { execution } : {}) }
  }
  async function writerState(ref: ExecutionRef): Promise<ResultStoreFailure | undefined> {
    const value = await history(ref)
    if (value.kind === 'rejected') return value
    if (!value.execution) return reject('notFound')
    if (value.execution.confirmed) return reject('ownerStopped')
  }
  function writer(ref: ExecutionRef): ToolResultWriter {
    return Object.freeze<ToolResultWriter>({
      storeRaw(supplied, mediaType) {
        if (!(supplied instanceof Uint8Array) || typeof mediaType !== 'string')
          return Promise.resolve(reject('invalidInput'))
        const captured = new Uint8Array(supplied)
        return track(async () => {
          const failed = await writerState(ref)
          return failed ?? (await bytes.publish(ref, ['raw'], captured, mediaType))
        })
      },
      putAttachment(itemKey, supplied, mediaType, name) {
        if (
          !('ok' in parseOpaqueIdentifier(itemKey, 'AttachmentItem')) ||
          !(supplied instanceof Uint8Array) ||
          typeof mediaType !== 'string' ||
          (name !== undefined && typeof name !== 'string')
        )
          return Promise.resolve(reject('invalidInput'))
        const captured = new Uint8Array(supplied)
        return track(async () => {
          const failed = await writerState(ref)
          return (
            failed ?? (await bytes.publish(ref, ['attachment', itemKey], captured, mediaType, name))
          )
        })
      },
      recordResult(supplied) {
        const value = captureResult(supplied)
        if (!value || !same(value.ref, ref)) return Promise.resolve(reject('invalidInput'))
        return track(async () => {
          const failed = await writerState(ref)
          if (failed) return failed
          for (const reference of [
            ...references(value.result),
            ...(value.raw ? [value.raw] : []),
          ]) {
            const checked = await bytes.read(
              { tenant: ref.tenant, session: ref.session },
              reference,
              ref,
            )
            if (checked.kind === 'rejected') return checked
          }
          if (!active()) return reject('ownerStopped')
          const result = await records.publish(fileKey(ref, ['result']), {
            format: 'tool-result-files/1',
            kind: 'result',
            value,
          })
          return result === 'unavailable'
            ? reject('receiptUnknown')
            : result === 'conflict'
              ? reject('conflict')
              : result
        })
      },
    })
  }
  async function readResult(ref: ExecutionRef) {
    const current = await history(ref)
    if (current.kind === 'rejected') return current
    const terminal = current.execution?.terminal?.value.terminal
    const returned =
      terminal?.outcome === 'completed'
        ? terminal.result
        : terminal?.outcome === 'failed'
          ? terminal.result
          : undefined
    if (returned === undefined) return reject('notFound')
    return readStoredResult(records, ref, returned)
  }
  const operations = Object.freeze<ToolResultStorageOperations>({
    bindWriter(access, supplied, declaredStorage) {
      const ref = captureRef(supplied)
      if (!ref || typeof declaredStorage !== 'string')
        return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const scope = { tenant: ref.tenant, session: ref.session },
          denied = await authorize(access, scope, 'tool.submit')
        if (denied) return denied
        if (declaredStorage !== storage) return reject('undeclaredStorage')
        const failed = await writerState(ref)
        if (failed) return failed
        const recheck = await authorize(access, scope, 'tool.submit')
        return recheck ?? { kind: 'bound' as const, writer: writer(ref) }
      })
    },
    available(access, supplied, declaredStorage) {
      const scope = captureScope(supplied)
      if (!scope || typeof declaredStorage !== 'string')
        return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const denied = await authorize(access, scope, 'result.read')
        if (denied) return denied
        if (declaredStorage !== storage) return reject('undeclaredStorage')
        const reader = dependencies.reader
        if (!reader) return reject('storageUnavailable')
        const lease = reader.implementations.acquire(reader.selected)
        if ('kind' in lease) return reject('storageUnavailable')
        try {
          const recheck = await authorize(access, scope, 'result.read')
          if (recheck) return recheck
          const current = reader.implementations.acquire(reader.selected)
          if ('kind' in current) return reject('storageUnavailable')
          try {
            return current.implementation === lease.implementation &&
              current.implementation.invalidated?.aborted !== true
              ? { kind: 'available' as const, storage, readerTool: reader.selected.definition.name }
              : reject('storageUnavailable')
          } finally {
            current.release()
          }
        } finally {
          lease.release()
        }
      })
    },
    readResult(access, supplied) {
      const ref = captureRef(supplied)
      if (!ref) return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const scope = { tenant: ref.tenant, session: ref.session },
          denied = await authorize(access, scope, 'result.read')
        if (denied) return denied
        const result = await readResult(ref)
        return (await authorize(access, scope, 'result.read')) ?? result
      })
    },
    readBytes(access, supplied, suppliedReference) {
      const scope = captureScope(supplied),
        reference = captureReference(suppliedReference)
      if (!scope || !reference) return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const denied = await authorize(access, scope, 'result.read')
        if (denied) return denied
        const result = await bytes.read(scope, reference)
        return (await authorize(access, scope, 'result.read')) ?? result
      })
    },
    readForDelivery(access, supplied) {
      const ref = captureRef(supplied)
      if (!ref) return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const denied = await maintenance(access, ref)
        if (denied) return denied
        const result = await readResult(ref)
        return (await maintenance(access, ref)) ?? result
      })
    },
    readDeliveryBytes(access, supplied, suppliedReference) {
      const ref = captureRef(supplied),
        reference = captureReference(suppliedReference)
      if (!ref || !reference) return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const denied = await maintenance(access, ref)
        if (denied) return denied
        const current = await history(ref)
        if (current.kind === 'rejected') return current
        const ended = current.execution?.terminal?.value
        if (!ended) return reject('notFound')
        const result = await readResult(ref),
          members =
            result.kind === 'found'
              ? [
                  ...references(result.value.result),
                  ...(result.value.raw ? [result.value.raw] : []),
                ]
              : []
        if (ended.delivery.raw) members.push(ended.delivery.raw)
        if (ended.delivery.result.offloaded) members.push(ended.delivery.result.offloaded)
        const response = members.some(member => same(member, reference))
          ? await bytes.read({ tenant: ref.tenant, session: ref.session }, reference, ref)
          : reject('notFound')
        return (await maintenance(access, ref)) ?? response
      })
    },
  })
  return Object.freeze({
    operations,
    close(): Promise<void> {
      accepting = false
      if (released) return Promise.resolve()
      if (closing) return closing
      const task = Promise.resolve().then(async () => {
        await Promise.allSettled([...tasks])
        await files.close()
        await held.release()
        released = true
      })
      closing = task
      void task.then(
        () => {
          closing = undefined
        },
        () => {
          closing = undefined
        },
      )
      return task
    },
  })
}
