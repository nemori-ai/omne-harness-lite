import { isDeepStrictEqual } from 'node:util'
import { fail, succeed } from '@omne-harness/operation-result'
import type { MediaIndex, MediaRow } from '../ports.ts'
import type { Holder } from '../values.ts'

type Row = { -readonly [K in keyof MediaRow]: MediaRow[K] }

const live = (row: Row | undefined): row is Row =>
  row !== undefined && (row.state === 'staged' || row.state === 'held')
const over = (row: Row, now: string): boolean =>
  row.expiresAt !== null && Date.parse(row.expiresAt) <= Date.parse(now)
const copy = (row: Row): MediaRow => structuredClone(row)

function addHolder(row: Row, holder: Holder): void {
  if (!row.holders.some(known => isDeepStrictEqual(known, holder)))
    row.holders = [...row.holders, holder]
  row.state = 'held'
  row.expiresAt = null
}

/** The metadata of media in memory, with the same conditions as the SQL provider. */
export function createMemoryMediaIndex(): MediaIndex {
  const rows = new Map<string, Row>()
  const uploads = new Map<string, string>()
  const pointer = (tenant: string, upload: string): string => `${tenant}\n${upload}`
  return {
    async insertUploading(input) {
      if (rows.has(input.key)) return fail({ kind: 'unavailable', diagnostic: 'duplicate key' })
      if (input.upload !== null) {
        const known = rows.get(uploads.get(pointer(input.tenant, input.upload)) ?? '')
        if (known !== undefined && known.state !== 'deleting')
          return fail({ kind: 'exists', row: copy(known) })
        uploads.set(pointer(input.tenant, input.upload), input.key)
      }
      rows.set(input.key, {
        key: input.key,
        tenant: input.tenant,
        storage: input.storage,
        state: 'uploading',
        mediaType: input.mediaType,
        bytes: input.bytes,
        digest: null,
        facts: null,
        write: null,
        nextSequence: 0,
        received: 0,
        parts: [],
        expiresAt: input.expiresAt,
        holders: [],
      })
      return succeed(null)
    },
    async attachWrite(key, write) {
      const row = rows.get(key)
      if (row?.state !== 'uploading') return fail({ kind: 'not-uploading' })
      row.write = write
      return succeed(null)
    },
    async readUpload(tenant, upload) {
      const row = rows.get(uploads.get(pointer(tenant, upload)) ?? '')
      if (row === undefined || row.state === 'deleting') return fail({ kind: 'not-found' })
      return succeed(copy(row))
    },
    async advance(input) {
      const row = rows.get(input.key)
      if (row?.state !== 'uploading' || row.nextSequence !== input.sequence)
        return fail({ kind: 'stale' })
      row.parts = [...row.parts, input.digest]
      row.received += input.bytes
      row.nextSequence += 1
      return succeed({ nextSequence: row.nextSequence })
    },
    async stageOrMerge(staging) {
      const row = rows.get(staging.key)
      if (row?.state !== 'uploading' || row.tenant !== staging.tenant)
        return fail({ kind: 'not-uploading' })
      const twin = [...rows.values()].find(
        other => live(other) && other.tenant === staging.tenant && other.digest === staging.digest,
      )
      if (twin !== undefined) {
        row.state = 'deleting'
        for (const [name, key] of uploads) if (key === row.key) uploads.set(name, twin.key)
        if (staging.holder !== null) addHolder(twin, staging.holder)
        return succeed({ kind: 'merged', row: copy(twin) })
      }
      row.state = 'staged'
      row.mediaType = staging.mediaType
      row.bytes = staging.bytes
      row.digest = staging.digest
      row.facts = staging.facts
      row.expiresAt = staging.expiresAt
      if (staging.holder !== null) addHolder(row, staging.holder)
      return succeed({ kind: 'staged', row: copy(row) })
    },
    async holdIfLive(input) {
      const row = rows.get(input.key)
      if (!live(row) || row.tenant !== input.tenant) return fail({ kind: 'not-live' })
      addHolder(row, input.holder)
      return succeed(copy(row))
    },
    async readLive(key, tenant) {
      const row = rows.get(key)
      if (!live(row) || row.tenant !== tenant) return fail({ kind: 'not-found' })
      return succeed(copy(row))
    },
    async markDeleting(key) {
      const row = rows.get(key)
      if (row?.state !== 'uploading') return succeed({ marked: false })
      row.state = 'deleting'
      return succeed({ marked: true })
    },
    async markDeletingIfExpired(input) {
      const marked: MediaRow[] = []
      for (const row of rows.values()) {
        if (marked.length >= input.limit) break
        if ((row.state !== 'uploading' && row.state !== 'staged') || !over(row, input.now)) continue
        row.state = 'deleting'
        marked.push(copy(row))
      }
      return succeed(marked)
    },
    async listDeleting(limit) {
      return succeed(
        [...rows.values()]
          .filter(row => row.state === 'deleting')
          .slice(0, limit)
          .map(copy),
      )
    },
    async dropRow(key) {
      if (rows.get(key)?.state !== 'deleting') return succeed(null)
      rows.delete(key)
      for (const [name, target] of uploads) if (target === key) uploads.delete(name)
      return succeed(null)
    },
  }
}
