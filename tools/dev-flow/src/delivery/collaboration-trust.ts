import { canonical, object, string } from '../integration/parse.ts'
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'
import type { ReduceWriter, RequestInput, WaveIdentity } from './collaboration-records.ts'
import { recordContext, type RecordComment } from './collaboration-read.ts'
import { utcTime } from './collaboration-values.ts'

export type AuthorityInterval = { from: string; until: string | null }
export type RecordAuthority = {
  context: WaveIdentity
  participants: number[]
  reduce: (AuthorityInterval & { writer: ReduceWriter })[]
  lines: (AuthorityInterval & { lineParent: number; login: string })[]
  workflow: { path: string; ref: string; head: string }
}

declare const verifiedAuthority: unique symbol
export type VerifiedRecordComment = RecordComment & { readonly [verifiedAuthority]: true }

export function requestRunName(input: RequestInput, inputDigest: string): string {
  return `integration-request:${input.requestId}:${input.pull?.head ?? 'none'}:${inputDigest}`
}

function covers(grant: AuthorityInterval, start: string, end: string): boolean {
  const from = Date.parse(utcTime(grant.from, 'authority.from'))
  const until =
    grant.until === null ? Infinity : Date.parse(utcTime(grant.until, 'authority.until'))
  if (until <= from) throw new InputError('collaboration-authority-interval-invalid')
  return (
    from <= Date.parse(start) && Date.parse(start) <= Date.parse(end) && Date.parse(end) < until
  )
}

/** The caller supplies authority already resolved from dispatch decisions, including epoch history. */
export function validateRecordAuthority(
  comment: RecordComment,
  authority: RecordAuthority,
  read: GhRead,
): asserts comment is VerifiedRecordComment {
  const { record } = comment
  const context = recordContext(record)
  if (canonical(context) !== canonical(authority.context))
    throw new InputError('collaboration-record-context-mismatch')
  if (new Set(authority.participants).size !== authority.participants.length)
    throw new InputError('collaboration-authority-participants-conflict')
  const activeReduce = authority.reduce.filter(grant =>
    covers(grant, comment.createdAt, comment.updatedAt),
  )
  if (activeReduce.length > 1) throw new InputError('collaboration-reduce-owner-conflict')
  if (activeReduce.length === 0) throw new InputError('collaboration-reduce-writer-untrusted')
  for (const parent of authority.participants) {
    if (
      authority.lines.filter(
        grant => grant.lineParent === parent && covers(grant, comment.createdAt, comment.updatedAt),
      ).length > 1
    )
      throw new InputError('collaboration-line-owner-conflict')
  }
  const lineParent =
    record.kind === 'request'
      ? record.input.lineParent
      : record.kind === 'assignment'
        ? record.assignment.lineParent
        : record.kind === 'release'
          ? null
          : record.lineParent
  const expectedIssue =
    record.kind === 'delta' || record.kind === 'consumption' || record.kind === 'assignment'
      ? lineParent
      : context.reduceIssue
  if (comment.issue !== expectedIssue) throw new InputError('collaboration-record-card-mismatch')
  if (lineParent !== null && !authority.participants.includes(lineParent))
    throw new InputError('collaboration-record-line-unknown')
  if (record.kind === 'request') {
    validateRequest(comment, authority, read)
    return
  }
  if (record.kind === 'consumption') {
    if (
      comment.authorType !== 'User' ||
      comment.author !== record.writer ||
      !authority.lines.some(
        grant =>
          grant.lineParent === lineParent &&
          grant.login === comment.author &&
          covers(grant, comment.createdAt, comment.updatedAt),
      )
    )
      throw new InputError('collaboration-line-writer-untrusted')
    return
  }
  const grants = authority.reduce.filter(
    grant =>
      canonical(grant.writer) === canonical(record.writer) &&
      covers(grant, comment.createdAt, comment.updatedAt),
  )
  if (
    comment.authorType !== 'User' ||
    comment.author !== record.writer.login ||
    grants.length !== 1
  )
    throw new InputError('collaboration-reduce-writer-untrusted')
  if (record.kind === 'release') {
    const expected = [...authority.participants].sort((a, b) => a - b)
    const actual = record.lines.map(line => line.lineParent).sort((a, b) => a - b)
    if (canonical(expected) !== canonical(actual))
      throw new InputError('collaboration-release-lines-incomplete')
  }
}

function validateRequest(comment: RecordComment, authority: RecordAuthority, read: GhRead): void {
  if (comment.record.kind !== 'request') throw new InputError('collaboration-request-required')
  const { input, workflow } = comment.record
  if (comment.author !== 'github-actions[bot]' || comment.authorType !== 'Bot')
    throw new InputError('collaboration-request-author-untrusted')
  if (
    canonical({ path: workflow.path, ref: workflow.ref, head: workflow.head }) !==
    canonical(authority.workflow)
  )
    throw new InputError('collaboration-request-workflow-untrusted')
  const run = object(
    read(
      [
        'api',
        '--method',
        'GET',
        ...REST_HEADERS,
        `repos/${input.context.repo}/actions/runs/${workflow.runId}/attempts/${workflow.runAttempt}`,
      ],
      15_000,
    ),
    'workflow run',
  )
  const repository = object(run.repository, 'workflow.repository')
  if (
    repository.full_name !== input.context.repo ||
    run.id !== workflow.runId ||
    run.run_attempt !== workflow.runAttempt ||
    (run.path !== workflow.path &&
      run.path !== `${workflow.path}@${workflow.ref}` &&
      run.path !== `${workflow.path}@refs/heads/${workflow.ref}`) ||
    run.head_branch !== workflow.ref ||
    run.head_sha !== workflow.head ||
    run.event !== 'workflow_dispatch' ||
    run.display_title !== requestRunName(input, workflow.inputDigest)
  )
    throw new InputError('collaboration-request-run-mismatch')
  const actor = object(run.actor, 'workflow.actor'),
    triggered = object(run.triggering_actor, 'workflow.triggering_actor')
  const started = utcTime(run.created_at, 'workflow.created_at')
  if (
    !authority.lines.some(
      grant =>
        grant.lineParent === input.lineParent &&
        grant.login === actor.login &&
        covers(grant, started, started),
    )
  )
    throw new InputError('collaboration-request-owner-untrusted')
  const triggeringLogin = string(triggered.login, 'workflow.triggering_actor.login')
  const activeTrigger =
    triggeringLogin === actor.login
      ? authority.lines.some(
          grant =>
            grant.lineParent === input.lineParent &&
            grant.login === triggeringLogin &&
            covers(grant, comment.createdAt, comment.updatedAt),
        )
      : authority.reduce.some(
          grant =>
            grant.writer.login === triggeringLogin &&
            covers(grant, comment.createdAt, comment.updatedAt),
        )
  if (!activeTrigger) throw new InputError('collaboration-request-rerun-untrusted')
  if (run.status !== 'completed') throw new InputError('collaboration-request-workflow-pending')
  if (run.conclusion !== 'success') throw new InputError('collaboration-request-workflow-failed')
}
