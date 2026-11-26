import { isDeepStrictEqual } from 'node:util'
import { fail, succeed } from '@omne-harness/operation-result'
import type { MediaIndex, MediaRow } from '../ports.ts'
import { REPRESENTATION_OWNER, type Representation } from '../representation.ts'
import type { Holder, Provenance } from '../values.ts'

type Row = { -readonly [K in keyof MediaRow]: MediaRow[K] }

const live = (row: Row | undefined): row is Row =>
  row !== undefined && (row.state === 'staged' || row.state === 'held')
const over = (row: Row, now: string): boolean =>
  row.expiresAt !== null && Date.parse(row.expiresAt) <= Date.parse(now)
const copy = (row: Row): MediaRow => structuredClone(row)
const same = (one: Provenance, other: Provenance): boolean =>
  one.name === other.name && one.revision === other.revision

/** What rows came to, and the end of what was kept for a row that goes. */
function keptFor(all: Map<string, Row>, holders: Map<string, Holder[]>) {
  const kept = new Map<string, Representation[]>()
  const find = (key: string, definition: Provenance) =>
    (kept.get(key) ?? []).find(each => same(each.definition, definition))
  return {
    record(key: string, representation: Representation): Representation {
      const first = find(key, representation.definition)
      if (first !== undefined) return structuredClone(first)
      kept.set(key, [...(kept.get(key) ?? []), structuredClone(representation)])
      return representation
    },
    read: (key: string, definition: Provenance): Representation | null =>
      structuredClone(find(key, definition) ?? null),
    forget: (key: string): void => void kept.delete(key),
    /** Answers the rows the going of `original` leaves with no holder, marked deleting. */
    released(original: string): Row[] {
      kept.delete(original)
      const orphans: Row[] = []
      for (const [key, known] of holders) {
        const rest = known.filter(
          each => each.owner !== REPRESENTATION_OWNER || each.work !== original,
        )
        const row = all.get(key)
        if (rest.length === known.length || row === undefined) continue
        holders.set(key, rest)
        row.holderCount = rest.length
        if (rest.length > 0 || row.state !== 'held') continue
        row.state = 'deleting'
        orphans.push(row)
      }
      return orphans
    },
  }
}

/** The metadata of media in memory: a row is seen only through its own tenant, as in the SQL provider. */
export function createMemoryMediaIndex(): MediaIndex {
  const all = new Map<string, Row>()
  const rows = {
    get: (tenant: string, key: string): Row | undefined => {
      const row = all.get(key)
      return row?.tenant === tenant ? row : undefined
    },
    of: (tenant: string): Row[] => [...all.values()].filter(row => row.tenant === tenant),
  }
  const uploads = new Map<string, string>()
  const holders = new Map<string, Holder[]>()
  function addHolder(row: Row, holder: Holder): void {
    const known = holders.get(row.key) ?? []
    if (!known.some(other => isDeepStrictEqual(other, holder))) known.push(holder)
    holders.set(row.key, known)
    row.holderCount = known.length
    row.state = 'held'
    row.expiresAt = null
  }
  const pointer = (tenant: string, upload: string): string => `${tenant}\n${upload}`
  const representations = keptFor(all, holders)
  return {
    async insertUploading(input) {
      if (all.has(input.key)) return fail({ kind: 'unavailable', diagnostic: 'duplicate key' })
      if (input.upload !== null) {
        const known = rows.get(input.tenant, uploads.get(pointer(input.tenant, input.upload)) ?? '')
        if (known !== undefined && known.state !== 'deleting')
          return fail({ kind: 'exists', row: copy(known) })
        uploads.set(pointer(input.tenant, input.upload), input.key)
      }
      all.set(input.key, {
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
        holderCount: 0,
        ...(input.name === undefined ? {} : { name: input.name }),
      })
      return succeed(null)
    },
    async attachWrite(tenant, key, write) {
      const row = rows.get(tenant, key)
      if (row?.state !== 'uploading') return fail({ kind: 'not-uploading' })
      row.write = write
      return succeed(null)
    },
    async readUpload(tenant, upload) {
      const row = rows.get(tenant, uploads.get(pointer(tenant, upload)) ?? '')
      if (row === undefined || row.state === 'deleting') return fail({ kind: 'not-found' })
      return succeed(copy(row))
    },
    async advance(input) {
      const row = rows.get(input.tenant, input.key)
      if (row?.state !== 'uploading' || row.nextSequence !== input.sequence)
        return fail({ kind: 'stale' })
      row.parts = [...row.parts, input.digest]
      row.received += input.bytes
      row.nextSequence += 1
      return succeed({ nextSequence: row.nextSequence })
    },
    async stageOrMerge(staging) {
      const row = rows.get(staging.tenant, staging.key)
      if (row?.state !== 'uploading') return fail({ kind: 'not-uploading' })
      const twin = rows
        .of(staging.tenant)
        .find(other => live(other) && other.digest === staging.digest)
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
      const row = rows.get(input.tenant, input.key)
      if (!live(row)) return fail({ kind: 'not-live' })
      addHolder(row, input.holder)
      return succeed(copy(row))
    },
    async readLive(key, tenant) {
      const row = rows.get(tenant, key)
      if (!live(row)) return fail({ kind: 'not-found' })
      return succeed(copy(row))
    },
    async markDeleting(tenant, key) {
      const row = rows.get(tenant, key)
      if (row?.state !== 'uploading') return succeed({ marked: false })
      row.state = 'deleting'
      return succeed({ marked: true })
    },
    async markDeletingIfExpired(input) {
      const marked: MediaRow[] = []
      for (const row of rows.of(input.tenant)) {
        if (marked.length >= input.limit) break
        if ((row.state !== 'uploading' && row.state !== 'staged') || !over(row, input.now)) continue
        row.state = 'deleting'
        marked.push(copy(row), ...representations.released(row.key).map(copy))
      }
      return succeed(marked)
    },
    async listDeleting(tenant, limit) {
      return succeed(
        rows
          .of(tenant)
          .filter(row => row.state === 'deleting')
          .slice(0, limit)
          .map(copy),
      )
    },
    async dropRow(tenant, key) {
      if (rows.get(tenant, key)?.state !== 'deleting') return succeed(null)
      all.delete(key)
      holders.delete(key)
      representations.forget(key)
      for (const [name, target] of uploads) if (target === key) uploads.delete(name)
      return succeed(null)
    },
    async recordRepresentation({ tenant, key, representation }) {
      if (!live(rows.get(tenant, key))) return fail({ kind: 'not-live' })
      return succeed(representations.record(key, representation))
    },
    async readRepresentation({ tenant, key, definition }) {
      return succeed(live(rows.get(tenant, key)) ? representations.read(key, definition) : null)
    },
  }
}
