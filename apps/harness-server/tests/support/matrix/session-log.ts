import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { inflateRawSync } from 'node:zlib'

export type LogEntry = Readonly<{ position: string; kind: string; body: Record<string, unknown> }>

export type SessionLog = Readonly<{
  session: string
  entries: readonly LogEntry[]
  kinds: readonly string[]
  started: number
  attemptsStarted: number
  terminals: readonly string[]
  terminalRuns: readonly string[]
  users: readonly string[]
  assistants: readonly string[]
  tools: readonly string[]
  inputs: readonly string[]
  batches: readonly (readonly string[])[]
}>

const TENANT_DOMAIN_PREFIX = '74656e616e742f'

function decode(entry: Uint8Array): Record<string, unknown> {
  const bytes = Buffer.from(entry)
  try {
    return JSON.parse(inflateRawSync(bytes.subarray(1)).toString('utf8')) as Record<string, unknown>
  } catch {
    return JSON.parse(bytes.subarray(1).toString('utf8')) as Record<string, unknown>
  }
}

export function blocksText(body: Record<string, unknown>): string {
  const message = body['message'] as { blocks?: { kind?: string; text?: string }[] } | undefined
  return (message?.blocks ?? [])
    .filter(block => block.kind === 'text')
    .map(block => block.text ?? '')
    .join('')
}

function summarize(session: string, entries: LogEntry[]): SessionLog {
  const of = (kind: string) => entries.filter(entry => entry.kind === kind)
  return {
    session,
    entries,
    kinds: entries.map(entry => entry.kind),
    started: of('run.started').length,
    attemptsStarted: of('run.attempt-started').length,
    terminals: of('run.terminal').map(entry => {
      const terminal = entry.body['terminal'] as { outcome?: string } | undefined
      return terminal?.outcome ?? 'unknown'
    }),
    terminalRuns: of('run.terminal').map(entry => {
      const terminal = entry.body['terminal'] as { run?: string } | undefined
      return terminal?.run ?? 'unknown'
    }),
    users: of('message.user').map(entry => blocksText(entry.body)),
    assistants: of('message.assistant').map(entry => blocksText(entry.body)),
    tools: of('message.tool').map(entry => JSON.stringify(entry.body)),
    inputs: of('intake.routed').map(entry => String(entry.body['input'])),
    batches: of('run.batch-taken').map(entry => {
      const batch = entry.body['batch'] as { ordered?: string[] } | undefined
      return batch?.ordered ?? []
    }),
  }
}

export function readSessionLog(domainsDir: string, session: string): SessionLog | null {
  if (!existsSync(domainsDir)) return null
  for (const name of readdirSync(domainsDir).filter(
    n => n.endsWith('.sqlite') && n.startsWith(TENANT_DOMAIN_PREFIX),
  )) {
    let db: DatabaseSync
    try {
      db = new DatabaseSync(join(domainsDir, name), { readOnly: true })
    } catch {
      continue
    }
    try {
      const rows = db
        .prepare('select position, kind, entry from sl_entry where session like ? order by rowid')
        .all(`${session}%`) as { position: unknown; kind: string; entry: Uint8Array }[]
      if (rows.length === 0) continue
      return summarize(
        session,
        rows.map(row => ({
          position: String(row.position),
          kind: row.kind,
          body: (decode(row.entry)['body'] ?? {}) as Record<string, unknown>,
        })),
      )
    } catch {
      continue
    } finally {
      db.close()
    }
  }
  return null
}

export function runsSettled(log: SessionLog | null): boolean {
  return log !== null && log.started > 0 && log.started === log.terminals.length
}

export function inputTakenCounts(log: SessionLog): number[] {
  return log.inputs.map(input => log.batches.filter(batch => batch.includes(input)).length)
}
