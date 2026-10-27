import { canonical, IntegrationError, object, string } from '../integration/parse.ts'
import {
  readCollaborationAuthority,
  recordAuthorityFor,
  type CollaborationAuthorityInput,
} from './collaboration-authority.ts'
import { commentDigest, encodeRecordComment } from './collaboration-comments.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import { readCompleteComments, recordComments } from './collaboration-read.ts'
import type { CommentReference, WaveIdentity } from './collaboration-records.ts'
import {
  orderedRecords,
  recordStream,
  type SequencedComment,
  type SequencedRecord,
} from './collaboration-sequence.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { REST_HEADERS, type GhCommand } from './github-read.ts'
import { InputError } from './protocol.ts'

export type RecordWriteIntent = {
  repo: string
  issue: number
  operationId: string
  body: string
  sha256: string
}
export type RecordWriteResult =
  | { kind: 'confirmed'; reference: CommentReference }
  | { kind: 'unknown'; reason: 'record-not-observed' | 'post-or-readback-failed' }

export type RecordWriteInput = {
  record: SequencedRecord
  call: GhCommand
  authority: (context: WaveIdentity) => Omit<CollaborationAuthorityInput, 'read' | 'reduceIssue'>
} & (
  | { mode: 'recover' }
  | {
      mode: 'publish'
      /** Must durably save this exact attempted intent before returning; failure prevents POST. */
      checkpoint: (intent: RecordWriteIntent) => void
    }
)

function sequenced(record: { kind: string }): record is SequencedRecord {
  return record.kind === 'state' || record.kind === 'delta' || record.kind === 'consumption'
}

function identity(record: SequencedRecord): RecordWriteIntent {
  const body = encodeRecordComment(record)
  return {
    repo: record.context.repo,
    issue: record.kind === 'state' ? record.context.reduceIssue : record.lineParent,
    operationId: record.operationId,
    body,
    sha256: commentDigest(body),
  }
}

function authorityFor(input: RecordWriteInput, context: WaveIdentity) {
  const config = input.authority(context)
  if (config.policy.repository !== context.repo)
    throw new InputError('collaboration-write-repository-mismatch')
  return recordAuthorityFor(
    readCollaborationAuthority({ ...config, reduceIssue: context.reduceIssue, read: input.call }),
    context,
  )
}

function observed(input: RecordWriteInput, intent: RecordWriteIntent): SequencedComment[] {
  const snapshot = readCompleteComments(intent.repo, intent.issue, input.call)
  const records = recordComments(snapshot)
  const stream: SequencedComment[] = []
  const grants = new Map<string, ReturnType<typeof authorityFor>>()
  for (const comment of records) {
    const record = comment.record
    if ('operationId' in record && record.operationId === intent.operationId) {
      if (canonical(record) !== canonical(input.record) || comment.body !== intent.body)
        throw new InputError('collaboration-write-operation-conflict')
    }
    if (!sequenced(record) || recordStream(record) !== recordStream(input.record)) continue
    const key = canonical(record.context)
    let authority = grants.get(key)
    if (authority === undefined) {
      authority = authorityFor(input, record.context)
      grants.set(key, authority)
    }
    validateRecordAuthority(comment, authority, input.call)
    stream.push({ ...comment, record })
  }
  orderedRecords(stream)
  if (
    canonical(snapshot) !== canonical(readCompleteComments(intent.repo, intent.issue, input.call))
  )
    throw new InputError('collaboration-write-snapshot-changed')
  return stream
}

function confirmed(
  records: SequencedComment[],
  intent: RecordWriteIntent,
): RecordWriteResult | undefined {
  const matches = records
    .filter(comment => comment.record.operationId === intent.operationId)
    .sort((a, b) => a.id - b.id)
  const match = matches[0]
  return match === undefined
    ? undefined
    : {
        kind: 'confirmed',
        reference: { issue: intent.issue, commentId: match.id, sha256: intent.sha256 },
      }
}

/** Recovery never writes. A missing comment cannot establish that an earlier POST was rejected. */
export function writeSequencedRecord(input: RecordWriteInput): RecordWriteResult {
  const record = parseCollaborationRecord(input.record)
  if (!sequenced(record)) throw new InputError('collaboration-write-sequence-required')
  input = { ...input, record }
  const intent = identity(input.record)
  const before = observed(input, intent)
  const existing = confirmed(before, intent)
  if (existing !== undefined) return existing
  if (input.mode === 'recover') return { kind: 'unknown', reason: 'record-not-observed' }

  const user = object(
    input.call(['api', '--method', 'GET', ...REST_HEADERS, 'user'], 15_000),
    'user',
  )
  const authority = authorityFor(input, input.record.context)
  const current = {
    ...authority,
    reduce: authority.reduce.filter(grant => grant.until === null),
    lines: authority.lines.filter(grant => grant.until === null),
  }
  const time = new Date().toISOString()
  const prospective: SequencedComment = {
    id: before.reduce((largest, item) => Math.max(largest, item.id), 0) + 1,
    issue: intent.issue,
    author: string(user.login, 'user.login'),
    authorType: string(user.type, 'user.type'),
    body: intent.body,
    url: '',
    createdAt: time,
    updatedAt: time,
    record: input.record,
  }
  validateRecordAuthority(prospective, current, input.call)
  orderedRecords([...before, prospective])
  input.checkpoint({ ...intent })
  try {
    input.call(
      [
        'api',
        '--method',
        'POST',
        ...REST_HEADERS,
        `repos/${intent.repo}/issues/${intent.issue}/comments`,
        '-f',
        `body=${intent.body}`,
      ],
      15_000,
    )
  } catch {}
  try {
    return (
      confirmed(observed(input, intent), intent) ?? {
        kind: 'unknown',
        reason: 'record-not-observed',
      }
    )
  } catch (error) {
    if (error instanceof InputError || error instanceof IntegrationError) throw error
    return { kind: 'unknown', reason: 'post-or-readback-failed' }
  }
}
