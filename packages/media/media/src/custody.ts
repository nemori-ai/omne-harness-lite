import { fail, succeed } from '@omne-harness/operation-result'
import {
  KNOWN_MEDIA_TYPES,
  modalityOf,
  type Custody,
  type MediaRow,
} from '@omne-harness/media-contract'
import { digestOf, partsOf } from './bytes.ts'
import { later, tenantText, unavailable, writeFailure, type MediaDependencies } from './deps.ts'
import type { Objects } from './objects.ts'

const invalidReference = fail({ kind: 'invalid-reference' } as const)

export function createCustody(deps: MediaDependencies, objects: Objects): Custody {
  const { index, config } = deps

  /** The bytes of a product, read up to one byte past the limit of its modality. */
  async function within(chunks: AsyncIterable<Uint8Array>, limit: number) {
    const taken: Uint8Array[] = []
    let size = 0
    for await (const chunk of chunks) {
      size += chunk.byteLength
      if (size > limit) return null
      taken.push(chunk)
    }
    return new Uint8Array(Buffer.concat(taken))
  }

  /** Writes the bytes of an uploading row to the store and seals them. */
  async function store(row: MediaRow, bytes: Uint8Array): Promise<boolean> {
    const target = objects.storeOf(row.storage)
    const begun = await target?.begin(row.key)
    if (target === undefined || begun === undefined || 'failure' in begun) return false
    let sequence = 0
    for (const part of partsOf(bytes, config.partBytes)) {
      if ('failure' in (await target.append(begun.ok.write, sequence, part))) return false
      sequence += 1
    }
    return 'ok' in (await target.seal(begun.ok.write, sequence))
  }

  return {
    async put(input) {
      const tenant = tenantText(input.tenant)
      if (tenant === null || !KNOWN_MEDIA_TYPES.includes(input.mediaType))
        return fail({ kind: 'unsupported-type' })
      const limit = config.maxBytes[modalityOf(input.mediaType)]
      const bytes = await within(input.bytes, limit)
      if (bytes === null) return fail({ kind: 'too-large', limit })
      const measured = await objects.measure(input.mediaType, bytes)
      if ('failure' in measured) return measured
      const key = deps.newKey()
      const inserted = await index.insertUploading({
        key,
        tenant,
        storage: deps.writeTo,
        mediaType: input.mediaType,
        bytes: bytes.byteLength,
        upload: null,
        expiresAt: later(deps.clock, config.uploadTtlMs),
      })
      if ('failure' in inserted)
        return inserted.failure.kind === 'exists'
          ? unavailable('index')
          : writeFailure('index', inserted.failure)
      const row: MediaRow = {
        key,
        tenant,
        storage: deps.writeTo,
        state: 'uploading',
        mediaType: input.mediaType,
        bytes: bytes.byteLength,
        digest: null,
        facts: null,
        write: null,
        nextSequence: 0,
        received: 0,
        parts: [],
        expiresAt: null,
        holderCount: 0,
      }
      if (!(await store(row, bytes))) {
        await objects.discard(row)
        return unavailable('store')
      }
      const settled = await objects.settle({
        row,
        digest: digestOf(bytes),
        bytes: bytes.byteLength,
        facts: measured.ok,
        holder: input.holder,
      })
      if ('ok' in settled) return settled
      return settled.failure.kind === 'not-uploading' ? unavailable('index') : fail(settled.failure)
    },

    async hold(input) {
      const tenant = tenantText(input.tenant)
      const row = await objects.resolve(tenant, input.ref)
      if ('failure' in row) return row
      const held = await index.holdIfLive({
        key: row.ok.key,
        tenant: row.ok.tenant,
        holder: input.holder,
      })
      if ('ok' in held) return succeed({ facts: objects.committed(held.ok).facts })
      return held.failure.kind === 'not-live'
        ? invalidReference
        : writeFailure('index', held.failure)
    },

    async describe(input) {
      const row = await objects.resolve(tenantText(input.tenant), input.ref)
      if ('failure' in row) return row
      return succeed({
        state: row.ok.state === 'held' ? 'held' : 'staged',
        facts: objects.committed(row.ok).facts,
      })
    },

    async sweep(input) {
      const tenant = tenantText(input.tenant)
      if (tenant === null) return succeed({ removed: 0, more: false })
      const { limit } = input
      const expired = await index.markDeletingIfExpired({ tenant, now: deps.clock.now(), limit })
      if ('failure' in expired) return writeFailure('index', expired.failure)
      const deleting = await index.listDeleting(tenant, limit)
      if ('failure' in deleting) return unavailable('index')
      let removed = 0
      for (const row of deleting.ok) if (await objects.erase(row)) removed += 1
      return succeed({ removed, more: deleting.ok.length >= limit })
    },
  }
}
