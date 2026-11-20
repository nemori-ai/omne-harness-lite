import type { Holder, NewRow, Staging } from '@omne-harness/media-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  hold,
  insert,
  isLive,
  keysWhere,
  load,
  pointed,
  save,
  type Row,
  type SqlPort,
} from './rows.ts'
import { PARTICIPANT, PROTOCOL, SCRIPTS, type ScriptName } from './schema.ts'

const ok = (value: unknown) => ({ ok: value })
const failure = (kind: string, extra: object = {}) => ({ failure: { kind, ...extra } })
const fresh = (input: NewRow): Row => ({
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

/** The commands come from this member's own index adapter, so their shape is not parsed again here. */
const RUN: Record<ScriptName, (port: SqlPort, command: never) => unknown> = {
  insertUploading(port, input: NewRow) {
    if (load(port, input.key) !== null)
      return failure('unavailable', { diagnostic: 'duplicate key' })
    if (input.upload !== null) {
      const known = pointed(port, input.upload)
      if (known !== null && known.state !== 'deleting') return failure('exists', { row: known })
      port.execute('INSERT OR REPLACE INTO md_uploads (upload, key) VALUES (?, ?)', [
        input.upload,
        input.key,
      ])
    }
    insert(port, fresh(input))
    return ok(null)
  },
  attachWrite(port, input: { key: string; write: string }) {
    const row = load(port, input.key)
    if (row?.state !== 'uploading') return failure('not-uploading')
    save(port, { ...row, write: input.write })
    return ok(null)
  },
  advance(port, input: { key: string; sequence: number; digest: string; bytes: number }) {
    const row = load(port, input.key)
    if (row?.state !== 'uploading' || row.nextSequence !== input.sequence) return failure('stale')
    const nextSequence = row.nextSequence + 1
    save(port, {
      ...row,
      parts: [...row.parts, input.digest],
      received: row.received + input.bytes,
      nextSequence,
    })
    return ok({ nextSequence })
  },
  stageOrMerge(port, staging: Staging) {
    const row = load(port, staging.key)
    if (row?.state !== 'uploading') return failure('not-uploading')
    const [twinKey] = keysWhere(port, "digest = ? AND state IN ('staged', 'held')", [
      staging.digest,
    ])
    const twin = twinKey === undefined ? null : load(port, twinKey)
    if (twin !== null) {
      save(port, { ...row, state: 'deleting' })
      port.execute('UPDATE md_uploads SET key = ? WHERE key = ?', [twin.key, row.key])
      return ok({
        kind: 'merged',
        row: staging.holder === null ? twin : hold(port, twin, staging.holder),
      })
    }
    const staged: Row = {
      ...row,
      state: 'staged',
      mediaType: staging.mediaType,
      bytes: staging.bytes,
      digest: staging.digest,
      facts: staging.facts,
      expiresAt: staging.expiresAt,
    }
    save(port, staged)
    return ok({
      kind: 'staged',
      row: staging.holder === null ? staged : hold(port, staged, staging.holder),
    })
  },
  holdIfLive(port, input: { key: string; holder: Holder }) {
    const row = load(port, input.key)
    return isLive(row) ? ok(hold(port, row, input.holder)) : failure('not-live')
  },
  markDeleting(port, input: { key: string }) {
    const row = load(port, input.key)
    if (row?.state !== 'uploading') return ok({ marked: false })
    save(port, { ...row, state: 'deleting' })
    return ok({ marked: true })
  },
  markDeletingIfExpired(port, input: { now: string; limit: number }) {
    const due = keysWhere(
      port,
      "state IN ('uploading', 'staged') AND expires_at <= ? ORDER BY expires_at LIMIT ?",
      [Date.parse(input.now), input.limit],
    )
    return ok(
      due.map(key => {
        const marked: Row = { ...(load(port, key) as Row), state: 'deleting' }
        save(port, marked)
        return marked
      }),
    )
  },
  dropRow(port, input: { key: string }) {
    if (load(port, input.key)?.state !== 'deleting') return ok(null)
    for (const table of ['md_objects', 'md_holds', 'md_uploads'])
      port.execute(`DELETE FROM ${table} WHERE key = ?`, [input.key])
    return ok(null)
  },
}

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const script = facts['script'] as ScriptName
    if (!SCRIPTS.includes(script)) return { kind: 'failed', diagnostic: 'unknown_media_script' }
    return {
      kind: 'participated',
      response: RUN[script](port, facts['command'] as never) as JsonValue,
    }
  },
} satisfies ParticipantModule
