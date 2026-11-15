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

export type Batch = Readonly<{ revision: string; kinds: readonly string[] }>

export type NoticeRecorder = Readonly<{
  notices: () => readonly Notice[]
  stop: () => void
}>

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
