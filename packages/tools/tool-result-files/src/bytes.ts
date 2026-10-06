import type { AttachmentRef } from '@omne-harness-lite/content-blocks'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ExecutionRef, ResultStoreFailure } from '@omne-harness-lite/tool-execution-runtime'
import { validate } from '@omne-harness-lite/content-blocks'
import { createRecords, digest, fileKey, object, same } from './records.ts'
import { captureRef, captureReference } from './values.ts'
import type { createImmutableFiles } from './immutable-files.ts'

const reject = (reason: ResultStoreFailure['reason']): ResultStoreFailure => ({
  kind: 'rejected',
  reason,
})
export function createByteStore(
  files: Awaited<ReturnType<typeof createImmutableFiles>>,
  storage: string,
) {
  const records = createRecords(files)
  async function read(
    scope: SessionScope,
    reference: AttachmentRef,
    expected?: ExecutionRef,
  ): Promise<{ kind: 'read'; bytes: Uint8Array } | ResultStoreFailure> {
    if (reference.storage !== storage) return reject('undeclaredStorage')
    if (!/^[a-f0-9]{64}$/u.test(reference.key)) return reject('notFound')
    const value = await records.read(reference.key)
    if (typeof value === 'string')
      return reject(value === 'missing' ? 'notFound' : 'storageUnavailable')
    const ref = captureRef(value.ref),
      saved = captureReference(value.reference),
      slot = value.slot
    if (
      value.format !== 'tool-result-files/1' ||
      value.kind !== 'bytes' ||
      Object.keys(value).length !== 6 ||
      !ref ||
      !saved ||
      !Array.isArray(slot) ||
      !slot.every(part => typeof part === 'string') ||
      !(
        (slot.length === 1 && slot[0] === 'raw') ||
        (slot.length === 2 && slot[0] === 'attachment')
      ) ||
      typeof value.digest !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.digest)
    )
      return reject('storageUnavailable')
    if (
      !same({ tenant: ref.tenant, session: ref.session }, scope) ||
      (expected && !same(ref, expected))
    )
      return reject('notAuthorized')
    if (fileKey(ref, slot as string[]) !== reference.key || !same(saved, reference))
      return reject('notFound')
    const bytes = await files.read(`${reference.key}.bytes`)
    if (typeof bytes === 'string') return reject('storageUnavailable')
    if (!same(reference.bytes, bytes.byteLength) || digest(bytes) !== value.digest)
      return reject('storageUnavailable')
    return { kind: 'read', bytes }
  }
  return Object.freeze({
    read,
    async publish(
      ref: ExecutionRef,
      slot: readonly string[],
      bytes: Uint8Array,
      mediaType: string,
      name?: string,
    ): Promise<{ kind: 'stored'; reference: AttachmentRef } | ResultStoreFailure> {
      const key = fileKey(ref, slot),
        supplied = {
          storage,
          key,
          mediaType,
          bytes: bytes.byteLength,
          ...(name === undefined ? {} : { name }),
        }
      if (!validate('AttachmentRef', supplied).valid) return reject('invalidInput')
      const reference = captureReference(supplied)!
      const previous = await records.read(key)
      if (previous === 'unavailable') return reject('storageUnavailable')
      const metadata = {
        format: 'tool-result-files/1',
        kind: 'bytes',
        ref,
        slot,
        digest: digest(bytes),
        reference,
      }
      if (object(previous) && !same(previous, metadata)) return reject('conflict')
      const written = await files.publish(`${key}.bytes`, bytes)
      if (written === 'conflict') return reject('conflict')
      if (written === 'unavailable') return reject('receiptUnknown')
      const recorded = await records.publish(key, metadata)
      if (recorded === 'conflict') return reject('conflict')
      if (recorded === 'unavailable') return reject('receiptUnknown')
      return { kind: 'stored', reference }
    },
  })
}
