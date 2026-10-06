import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkAppendInput, object } from '@omne-harness-lite/session-log'
import { addInteger, compareInteger, positiveInteger } from '@omne-harness-lite/session-log'
import type {
  LogCommit,
  LogDecodeResult,
  LocatedCommit,
  JsonNumber,
  SessionRef,
  TenantId,
} from './types.ts'

export const commitFormatVersion = 1
export const indexFoldVersion = 1

/** One complete UTF-8 line is one batch. No condition or position is added to the payload. */
export function encodeCommitLine(commit: LogCommit): Uint8Array {
  if (commit.v !== commitFormatVersion || !positiveInteger(commit.first))
    throw new TypeError('invalid commit shell')
  const checked = checkAppendInput(
    commit.session,
    commit.entries,
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new TypeError('invalid commit entries')
  return new TextEncoder().encode(
    `${writeJsonLossless({ v: commit.v, session: checked.ok.session, first: commit.first, entries: checked.ok.entries })}\n`,
  )
}

function decodeLine(bytes: Uint8Array): LogCommit | undefined {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
  const read = readJsonStrict(text)
  if ('failed' in read || !object(read.ok)) return undefined
  const row = read.ok
  if (
    Object.keys(row).some(key => !['v', 'session', 'first', 'entries'].includes(key)) ||
    row.v !== commitFormatVersion ||
    !positiveInteger(row.first)
  )
    return undefined
  const checked = checkAppendInput(
    row.session,
    row.entries,
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) return undefined
  return Object.freeze({
    v: commitFormatVersion,
    session: checked.ok.session,
    first: row.first,
    entries: checked.ok.entries,
  })
}

/** Strict line scanning; only a malformed final suffix may be truncated by the IO owner. */
export function decodeLogBytes(
  bytes: Uint8Array,
  session: SessionRef,
  first: JsonNumber = 1,
  priorTenant?: TenantId,
): LogDecodeResult {
  const rows: { start: number; end: number; commit: LogCommit | undefined }[] = []
  let start = 0
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] !== 10) continue
    rows.push({ start, end: index + 1, commit: decodeLine(bytes.subarray(start, index)) })
    start = index + 1
  }
  let next = first
  let tenant = priorTenant
  let validBytes = 0
  const commits: LocatedCommit[] = []
  for (const [index, row] of rows.entries()) {
    const commit = row.commit
    if (commit === undefined) {
      if (rows.slice(index + 1).some(later => later.commit !== undefined))
        return Object.freeze({ failure: 'corrupt', line: index + 1, reason: 'representation' })
      return Object.freeze({ commits: Object.freeze(commits), validBytes, needsTruncation: true })
    }
    if (commit.session !== session)
      return Object.freeze({ failure: 'corrupt', line: index + 1, reason: 'session' })
    if (compareInteger(commit.first, next) !== 0)
      return Object.freeze({ failure: 'corrupt', line: index + 1, reason: 'position' })
    const firstEntry = commit.entries[0]
    if (firstEntry === undefined) throw new Error('validated commit lost entries')
    if (tenant !== undefined && !tenantIdEquals(tenant, firstEntry.tenant))
      return Object.freeze({ failure: 'corrupt', line: index + 1, reason: 'tenant' })
    tenant ??= firstEntry.tenant
    next = addInteger(next, commit.entries.length)
    validBytes = row.end
    commits.push(Object.freeze({ commit, start: row.start, end: row.end }))
  }
  return Object.freeze({
    commits: Object.freeze(commits),
    validBytes,
    needsTruncation: start !== bytes.length,
  })
}
