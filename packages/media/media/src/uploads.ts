import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  KNOWN_MEDIA_TYPES,
  modalityOf,
  type MediaRow,
  type MediaUnavailable,
  type MediaUnknown,
  type UploadStatus,
  type Uploads,
} from '@omne-harness/media-contract'
import { collect, digestOf } from './bytes.ts'
import {
  isPortFailure,
  later,
  tenantText,
  unavailable,
  writeFailure,
  type MediaDependencies,
} from './deps.ts'
import type { Objects } from './objects.ts'

const UPLOAD = /^[\w.:-]{1,128}$/
const notFound = fail({ kind: 'not-found' } as const)

function createContext(deps: MediaDependencies, objects: Objects) {
  const { index, config } = deps

  const statusOf = (upload: string, row: MediaRow): UploadStatus =>
    row.state === 'uploading'
      ? {
          kind: 'uploading',
          ticket: { upload, nextSequence: row.nextSequence, partBytes: config.partBytes },
        }
      : { kind: 'committed', committed: objects.committed(row) }

  async function rowOf(tenant: string | null, upload: string) {
    if (tenant === null || !UPLOAD.test(upload)) return notFound
    const row = await index.readUpload(tenant, upload)
    if ('ok' in row) return row
    return row.failure.kind === 'not-found' ? notFound : unavailable('index')
  }

  /** The open write of an uploading row; a crash before it was recorded opens it again. */
  async function writeOf(row: MediaRow): Promise<Outcome<string, MediaUnavailable | MediaUnknown>> {
    if (row.write !== null) return succeed(row.write)
    const store = objects.storeOf(row.storage)
    const begun = await store?.begin(row.key)
    if (begun === undefined || 'failure' in begun) return unavailable('store')
    const attached = await index.attachWrite(row.tenant, row.key, begun.ok.write)
    if ('failure' in attached)
      return isPortFailure(attached.failure)
        ? writeFailure('index', attached.failure)
        : unavailable('index')
    return succeed(begun.ok.write)
  }

  return { deps, objects, index, config, statusOf, rowOf, writeOf }
}
type Context = ReturnType<typeof createContext>

async function begin(
  context: Context,
  input: Parameters<Uploads['begin']>[0],
): ReturnType<Uploads['begin']> {
  const { deps, index, config, statusOf, writeOf } = context
  const tenant = tenantText(input.tenant)
  if (tenant === null || !UPLOAD.test(input.upload))
    return fail({ kind: 'invalid', field: 'upload' })
  if (!Number.isSafeInteger(input.bytes) || input.bytes < 1)
    return fail({ kind: 'invalid', field: 'bytes' })
  if (!KNOWN_MEDIA_TYPES.includes(input.mediaType)) return fail({ kind: 'unsupported-type' })
  const limit = config.maxBytes[modalityOf(input.mediaType)]
  if (input.bytes > limit) return fail({ kind: 'too-large', limit })
  const key = deps.newKey()
  const inserted = await index.insertUploading({
    key,
    tenant,
    storage: deps.writeTo,
    mediaType: input.mediaType,
    bytes: input.bytes,
    upload: input.upload,
    expiresAt: later(deps.clock, config.uploadTtlMs),
  })
  if ('failure' in inserted) {
    if (inserted.failure.kind === 'exists')
      return succeed(statusOf(input.upload, inserted.failure.row))
    return writeFailure('index', inserted.failure)
  }
  const row = await index.readUpload(tenant, input.upload)
  if ('failure' in row) return unavailable('index')
  const write = await writeOf(row.ok)
  if ('failure' in write) return write
  return succeed(statusOf(input.upload, row.ok))
}

async function append(
  context: Context,
  input: Parameters<Uploads['append']>[0],
): ReturnType<Uploads['append']> {
  const { objects, index, config, rowOf, writeOf } = context
  if (input.part.byteLength > config.partBytes)
    return fail({ kind: 'part-too-large', limit: config.partBytes })
  const found = await rowOf(tenantText(input.tenant), input.upload)
  if ('failure' in found) return found
  const row = found.ok
  if (row.state !== 'uploading') return fail({ kind: 'committed' })
  const digest = digestOf(input.part)
  if (input.sequence < row.nextSequence)
    return row.parts[input.sequence] === digest
      ? succeed({ nextSequence: row.nextSequence })
      : fail({ kind: 'conflict' })
  if (input.sequence > row.nextSequence)
    return fail({ kind: 'gap', nextSequence: row.nextSequence })
  if (row.received + input.part.byteLength > row.bytes) return fail({ kind: 'beyond-declared' })
  const write = await writeOf(row)
  if ('failure' in write) return write
  const stored = await objects.storeOf(row.storage)?.append(write.ok, input.sequence, input.part)
  if (stored === undefined || 'failure' in stored) return unavailable('store')
  const advanced = await index.advance({
    tenant: row.tenant,
    key: row.key,
    sequence: input.sequence,
    digest,
    bytes: input.part.byteLength,
  })
  if ('ok' in advanced) return advanced
  if (advanced.failure.kind !== 'stale') return writeFailure('index', advanced.failure)
  const again = await rowOf(row.tenant, input.upload)
  if ('failure' in again) return again
  return again.ok.parts[input.sequence] === digest
    ? succeed({ nextSequence: again.ok.nextSequence })
    : fail({ kind: 'conflict' })
}

async function commit(
  context: Context,
  input: Parameters<Uploads['commit']>[0],
): ReturnType<Uploads['commit']> {
  const { objects, rowOf, writeOf } = context
  const found = await rowOf(tenantText(input.tenant), input.upload)
  if ('failure' in found) return found
  const row = found.ok
  if (row.state !== 'uploading')
    return row.digest === input.digest
      ? succeed(objects.committed(row))
      : fail({ kind: 'digest-mismatch' })
  if (row.received !== row.bytes)
    return fail({ kind: 'incomplete', nextSequence: row.nextSequence })
  const write = await writeOf(row)
  if ('failure' in write) return write
  const store = objects.storeOf(row.storage)
  const sealed = await store?.seal(write.ok, row.parts.length)
  if (sealed === undefined || 'failure' in sealed) return unavailable('store')
  const opened = await store?.open(row.key)
  if (opened === undefined || 'failure' in opened) return unavailable('store')
  const bytes = await collect(opened.ok)
  const digest = digestOf(bytes)
  if (bytes.byteLength !== row.bytes || digest !== input.digest) {
    await objects.discard(row)
    return fail({ kind: 'digest-mismatch' })
  }
  const measured = await objects.measure(row.mediaType, bytes)
  if ('failure' in measured) {
    await objects.discard(row)
    return measured
  }
  const settled = await objects.settle({
    row,
    digest,
    bytes: bytes.byteLength,
    facts: measured.ok,
    holder: null,
  })
  if ('ok' in settled) return settled
  if (settled.failure.kind !== 'not-uploading') return fail(settled.failure)
  const again = await rowOf(row.tenant, input.upload)
  if ('failure' in again) return again
  return again.ok.state === 'uploading' ? notFound : succeed(objects.committed(again.ok))
}

export function createUploads(deps: MediaDependencies, objects: Objects): Uploads {
  const context = createContext(deps, objects)
  const { rowOf, statusOf } = context
  return {
    begin: input => begin(context, input),
    append: input => append(context, input),
    commit: input => commit(context, input),
    async status(input) {
      const found = await rowOf(tenantText(input.tenant), input.upload)
      return 'ok' in found ? succeed(statusOf(input.upload, found.ok)) : found
    },
    async abandon(input) {
      const found = await rowOf(tenantText(input.tenant), input.upload)
      if ('failure' in found)
        return found.failure.kind === 'not-found' ? succeed(null) : unavailable('index')
      if (found.ok.state !== 'uploading') return fail({ kind: 'committed' })
      await objects.discard(found.ok)
      return succeed(null)
    },
  }
}
