// The commit notices of the session log on the release tree (#1230, RFC-0015 §8「会话观察」): a
// listener of `session-cordis-contract/committed` on the root of the formal assembly, the batches of
// the session log as the Session storage holds them (one per revision, read only), and the table
// that puts the two side by side. No vitest import: the demonstration script uses this file too.
//
// The log is read from the Session SQL storage (`sl_entry`), the one place that writes it: every
// revision and every entry kind, whatever a history face would show to a reader.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { DurableEvidence, SessionRevision } from '@omne-harness/session-contract'
import type {} from '@omne-harness/session-cordis-contract/cordis'

const COMMITTED = 'session-cordis-contract/committed'

export type Notice = Readonly<{
  session: string
  revision: string
  source: DurableEvidence
  kinds: readonly string[]
}>

/** One revision of the session log: its entry kinds, without repeats, in their first order. */
export type Batch = Readonly<{ revision: string; kinds: readonly string[] }>

export type NoticeRecorder = Readonly<{
  /** The notices received so far, in the order they arrived. */
  notices: () => readonly Notice[]
  stop: () => void
}>

/** Listens on the root of the assembly; `onNotice` is called for each notice as it arrives. */
export function recordNotices(scope: Context, onNotice?: (notice: Notice) => void): NoticeRecorder {
  const received: Notice[] = []
  const stop = scope.root.on(
    COMMITTED,
    (_tenant, session, revision: SessionRevision, source, kinds) => {
      const notice = { session, revision, source, kinds: [...kinds] }
      received.push(notice)
      onNotice?.(notice)
    },
  )
  return { notices: () => [...received], stop }
}

function sqliteFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...sqliteFiles(path))
    else if (/\.(sqlite|db)$/.test(entry.name)) files.push(path)
  }
  return files
}

/** The batches of `session` as the Session storage under `storageRoot` holds them, by revision. */
export function logBatches(storageRoot: string, session: string): readonly Batch[] {
  const rows: { revision: string; kind: string }[] = []
  for (const file of sqliteFiles(storageRoot)) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sl_entry'`)
        .get()
      if (table === undefined) continue
      for (const row of db
        .prepare(`SELECT revision, kind FROM sl_entry WHERE session = ? ORDER BY position`)
        .all(session))
        rows.push({ revision: String(row['revision']), kind: String(row['kind']) })
    } finally {
      db.close()
    }
  }
  const batches = new Map<string, string[]>()
  for (const row of rows) {
    const kinds = batches.get(row.revision) ?? []
    if (!kinds.includes(row.kind)) kinds.push(row.kind)
    batches.set(row.revision, kinds)
  }
  return [...batches].map(([revision, kinds]) => ({ revision, kinds }))
}

/** Waits until the log of `session` has a `run.terminal` and has not moved for `quietMs`. */
export async function settledLog(
  storageRoot: string,
  session: string,
  quietMs = 2000,
): Promise<readonly Batch[]> {
  const end = Date.now() + 120_000
  let last = ''
  let since = Date.now()
  for (;;) {
    const batches = logBatches(storageRoot, session)
    const text = JSON.stringify(batches)
    if (text !== last) {
      last = text
      since = Date.now()
    }
    const ended = batches.some(batch => batch.kinds.includes('run.terminal'))
    if (ended && Date.now() - since >= quietMs) return batches
    if (Date.now() > end) throw new Error(`the log of ${session} did not settle: ${text}`)
    await sleep(100)
  }
}

export type Row = Readonly<{ revision: string; kinds: readonly string[]; notices: number }>

/** One row per revision of the log: its kinds and how many notices named that revision. */
export function noticeTable(
  batches: readonly Batch[],
  notices: readonly Notice[],
  session: string,
): readonly Row[] {
  const own = notices.filter(notice => notice.session === session)
  return batches.map(batch => ({
    revision: batch.revision,
    kinds: batch.kinds,
    notices: own.filter(notice => notice.revision === batch.revision).length,
  }))
}

/** The table as Markdown lines: revision, the kinds of the batch, and whether it had a notice. */
export function tableLines(rows: readonly Row[]): string[] {
  return [
    '| 修订 | 这一批的条目种类 | 通知 |',
    '| --- | --- | --- |',
    ...rows.map(
      row =>
        `| ${row.revision} | ${row.kinds.join(', ')} | ${row.notices === 0 ? '无' : `${String(row.notices)} 条`} |`,
    ),
  ]
}
