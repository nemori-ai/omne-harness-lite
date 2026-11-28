import { judgeMessage } from '@omne-harness/message'
import type { EntryId, HistoryEntry, ModelViewRow } from '@omne-harness/session-contract'
import { z } from 'zod'
import { readEntryText } from '../entry-codec.ts'
import { FIRST_EPOCH, viewOf } from './fork.ts'
import { MAX_COMPACTION_ROWS } from './compaction-window.ts'
import { big, packed, rowsOf, text, PAGE_ROWS, type Executor, type Scope } from './support.ts'

const provenance = z.array(
  z.strictObject({
    owner: z.string(),
    key: z.string(),
    blocks: z.array(z.string()),
  }),
)

const isEntryId = (value: unknown): value is EntryId =>
  typeof value === 'string' && /^[1-9][0-9]*$/u.test(value)

const MAX_RECOVERY_BYTES = 64 * 1024 * 1024

/** Recover the fork prefix and local originals; exceed the model row ceiling or 64 MiB: unreadable. */
export function readModelOriginals(
  port: Executor,
  scope: Scope,
  before: bigint,
): Readonly<{ inherited: readonly ModelViewRow[]; entries: readonly HistoryEntry[] }> | null {
  try {
    const view = viewOf(port, scope, FIRST_EPOCH)
    if (view.inherited < 0n || view.inherited > BigInt(MAX_COMPACTION_ROWS)) return null
    let bytesRead = 0
    const charge = (bytes: number): boolean => {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_RECOVERY_BYTES - bytesRead)
        return false
      bytesRead += bytes
      return true
    }
    const inherited: ModelViewRow[] = []
    let after = 0n
    while (after < view.inherited) {
      const page = view.rows(after, view.inherited, PAGE_ROWS)
      if (page.length === 0) return null
      for (const row of page) {
        const seq = big(row['seq'])
        if (seq !== after + 1n) return null
        const entry = text(row['entry'])
        if (!isEntryId(entry)) return null
        const bytes = Number(row['bytes'])
        if (!charge(bytes)) return null
        const encoded = text(row['message'])
        // A shared summary needs originals outside this session; neither its body nor its parent
        // log grants those originals to this recovery read.
        if (!encoded.startsWith('{')) return null
        if (Buffer.byteLength(encoded) !== bytes) return null
        const message = judgeMessage(JSON.parse(encoded))
        if (!('ok' in message) || message.ok.role === 'compaction') return null
        const encodedProvenance = row['provenance'] == null ? null : text(row['provenance'])
        if (encodedProvenance !== null && !charge(Buffer.byteLength(encodedProvenance))) return null
        inherited.push({
          seq: String(seq),
          entry,
          bytes,
          prefixDigest: text(row['prefix_digest']),
          message: message.ok,
          ...(encodedProvenance === null
            ? {}
            : {
                provenance: provenance.parse(JSON.parse(encodedProvenance)),
              }),
        })
        after = seq
      }
    }

    const entries: HistoryEntry[] = []
    after = 0n
    for (;;) {
      const page = rowsOf(
        port,
        `SELECT position, kind, bytes, entry FROM sl_entry
          WHERE tenant = ? AND session = ? AND position > ? AND position < ?
            AND ((kind GLOB 'message.*' AND kind <> 'message.compaction')
              OR kind IN ('intake.routed', 'session.model-projected'))
          ORDER BY position LIMIT ?`,
        [scope.tenant, scope.session, after, before, BigInt(PAGE_ROWS)],
      )
      if (inherited.length + entries.length + page.length > MAX_COMPACTION_ROWS) return null
      for (const row of page) {
        const position = big(row['position'])
        if (position <= after || position >= before) return null
        const bytes = Number(row['bytes'])
        if (!charge(bytes)) return null
        const encoded = packed(row['entry'])
        if (Buffer.byteLength(encoded) !== bytes) return null
        const entry = readEntryText(encoded)
        if (entry.id !== String(position) || entry.kind !== text(row['kind'])) return null
        entries.push(entry)
        after = position
      }
      if (page.length < PAGE_ROWS) return { inherited, entries }
    }
  } catch {
    return null
  }
}
