import { object, same, string } from '../integration/parse.ts'
import { readReleaseAcceptance } from './collaboration-acceptance.ts'
import { recordAuthorityFor } from './collaboration-authority.ts'
import { commentDigest, encodeRecordComment } from './collaboration-comments.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import {
  readCompleteComments,
  readReferencedComment,
  recordComments,
} from './collaboration-read.ts'
import type { CommentReference, Evidence, ReleaseRecord } from './collaboration-records.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { REST_HEADERS } from './github-read.ts'
import { readLineRecords } from './line-inbox.ts'
import { operationJournal } from './line-state-journal.ts'
import { InputError } from './protocol.ts'
import {
  assertReduceOperationsSettled,
  assertReduceReleaseOperation,
} from './reduce-integration-recovery.ts'
import { withReduceLock } from './reduce-integration-lock.ts'
import { readReduceQueue } from './reduce-integration-read.ts'
import { readReduceRoster } from './reduce-integration-roster.ts'
import type { ReduceIntegrationPorts } from './reduce-integration.ts'
import { readReleasedWave } from './reduce-watch-release.ts'
import {
  referenceOf,
  verifyActiveAssignment,
  verifyMaterial,
  verifyNextContext,
} from './reduce-watch-materials.ts'

export type ReduceReleasePorts = ReduceIntegrationPorts & {
  /** Reads actual whole-wave checks and owned-work/remaining-defect reports at this exact F and revision. */
  verifyWaveEvidence: (release: ReleaseRecord, evidence: Evidence) => void
}

export function checkReduceRelease(
  ports: ReduceReleasePorts,
  release: ReleaseRecord,
  readinessEvidence: Evidence,
) {
  const queue = readReduceQueue(ports, release.context)
  same(
    release.writer,
    {
      login: queue.authority.binding.responsible,
      epoch: queue.authority.scope.epoch,
      authorization: queue.authority.binding.dispatch,
    },
    'reduce-writer-epoch-mismatch',
  )
  if (queue.activeWrite !== undefined) throw new InputError('reduce-release-active-write')
  const roster = readReduceRoster(ports, release.context)
  same(
    [...release.expectedRequests].sort(),
    queue.requests.map(item => item.input.requestId).sort(),
    'reduce-release-request-set-incomplete',
  )
  same(
    release.lines.map(item => item.lineParent).sort((a, b) => a - b),
    roster.map(item => item.lineParent).sort((a, b) => a - b),
    'reduce-release-lines-incomplete',
  )
  for (const line of roster) {
    const requests = queue.requests.filter(item => item.input.lineParent === line.lineParent)
    if (line.mode === 'idle') {
      if (requests.length !== 0) throw new InputError('reduce-idle-line-has-request')
      continue
    }
    const first = requests.find(item => item.input.previousRequestId === null)
    if (first === undefined) throw new InputError('reduce-release-expected-delivery-pending')
    same(first.input.tasks, line.tasks, 'reduce-release-roster-task-mismatch')
    const last = requests.find(
      item => !requests.some(child => child.input.previousRequestId === item.input.requestId),
    )
    if (
      last === undefined ||
      (last.current?.record.state !== 'merged' &&
        !(
          last.current?.record.state === 'superseded' &&
          last.current.record.disposition?.action === 'rescope'
        ))
    )
      throw new InputError('reduce-release-request-unresolved')
  }
  const results = queue.requests.map(item => {
    if (item.current === undefined) throw new InputError('reduce-release-result-missing')
    return referenceOf(item.current)
  })
  same(
    [...results].sort((a, b) => a.commentId - b.commentId),
    [...release.results].sort((a, b) => a.commentId - b.commentId),
    'reduce-release-results-stale',
  )
  if (release.next !== null) verifyNextContext(ports, release.next)
  for (const line of release.lines) {
    const records = readLineRecords({
      repo: release.context.repo,
      parent: line.lineParent,
      milestone: release.context.milestone,
      read: ports.read,
      authority: context => ports.authorityFor(context.reduceIssue),
    })
    const delta = records.deltas.at(-1)
    if (delta === undefined || delta.record.purpose !== 'release')
      throw new InputError('reduce-release-delta-missing')
    same(referenceOf(delta), line.delta, 'reduce-release-delta-stale')
    same(delta.record.context, release.context, 'reduce-release-delta-context')
    same(delta.record.finalHead, release.finalHead, 'reduce-release-delta-head')
    same(delta.record.continuation, line.continuation, 'reduce-release-delta-continuation')
    if (line.continuation.kind === 'active')
      verifyActiveAssignment(ports, line.continuation.assignment)
    if (line.continuation.kind === 'terminal')
      verifyMaterial(ports, line.continuation.authorization)
  }
  ports.verifyWaveEvidence(release, readinessEvidence)
  return queue.authority
}

function acceptanceReference(release: ReleaseRecord): CommentReference {
  const prefix = `https://github.com/${release.context.repo}/issues/${release.context.reduceIssue}#issuecomment-`
  const id = release.acceptance.url.startsWith(prefix)
    ? release.acceptance.url.slice(prefix.length)
    : ''
  if (!/^[1-9]\d*$/.test(id)) throw new InputError('reduce-release-acceptance-reference')
  return {
    issue: release.context.reduceIssue,
    commentId: Number(id),
    sha256: release.acceptance.sha256,
  }
}

/** Ready checks never accept. Publication and closure each retain their own durable attempt. */
export function releaseReduceWave(
  ports: ReduceReleasePorts,
  input: { record: unknown; journalRoot: string; readinessEvidence: Evidence },
) {
  const parsed = parseCollaborationRecord(input.record)
  if (parsed.kind !== 'release') throw new InputError('reduce-release-required')
  const release = parsed
  return withReduceLock(input.journalRoot, release.context, release.operationId, () => {
    assertReduceReleaseOperation(input.journalRoot, release)
    assertReduceOperationsSettled(
      input.journalRoot,
      release.context,
      release.operationId,
      readReduceQueue(ports, release.context).requests,
    )
    const journal = operationJournal(input.journalRoot, release.operationId)
    const saved = journal.read('release.json')
    const intent = { release, readinessEvidence: input.readinessEvidence }
    if (saved === undefined) journal.save('release.json', intent)
    else same(saved, intent, 'reduce-release-operation-conflict')
    const first = release.lines[0]
    if (first === undefined) throw new InputError('reduce-release-lines-empty')
    const completed = readReleasedWave(ports, release.context, first.lineParent)
    if (completed !== undefined) {
      same(completed.release, release, 'reduce-release-conflict')
      return { kind: 'confirmed' as const, release: completed.releaseReference }
    }
    const authority = checkReduceRelease(ports, release, input.readinessEvidence)
    const { context, finalHead, expectedRequests, results, lines, next } = release
    const accepted = readReleaseAcceptance({
      ...ports.authorityFor(context.reduceIssue),
      reduceIssue: context.reduceIssue,
      read: ports.read,
      sources: ports.sources,
      reference: acceptanceReference(release),
      subject: { context, finalHead, expectedRequests, results, lines, next },
      relatedAuthority: related => ports.authorityFor(related.reduceIssue),
    })
    const acceptedComment = readReferencedComment(context.repo, accepted.reference, ports.read)
    if (Date.parse(release.recordedAt) < Date.parse(acceptedComment.createdAt))
      throw new InputError('reduce-release-before-acceptance')
    const body = encodeRecordComment(release)
    const find = () => {
      const snapshot = readCompleteComments(context.repo, context.reduceIssue, ports.read)
      const releases = recordComments(snapshot).filter(item => item.record.kind === 'release')
      for (const item of releases) {
        validateRecordAuthority(item, recordAuthorityFor(authority, context), ports.read)
        same(item.record, release, 'reduce-release-conflict')
        same(item.body, body, 'reduce-release-bytes-conflict')
      }
      return { snapshot, found: releases[0] }
    }
    let observed = find()
    if (observed.found === undefined) {
      if (observed.snapshot.state !== 'open')
        throw new InputError('reduce-release-closed-without-record')
      if (journal.read('publish.json') !== undefined)
        return { kind: 'unknown' as const, phase: 'publish', reason: 'release-not-observed' }
      const user = object(
        ports.read(['api', '--method', 'GET', ...REST_HEADERS, 'user'], 15_000),
        'user',
      )
      if (string(user.login, 'user.login') !== release.writer.login || user.type !== 'User')
        throw new InputError('reduce-release-writer-mismatch')
      journal.save('publish.json', { body, sha256: commentDigest(body) })
      try {
        ports.call(
          [
            'api',
            '--method',
            'POST',
            ...REST_HEADERS,
            `repos/${context.repo}/issues/${context.reduceIssue}/comments`,
            '-f',
            `body=${body}`,
          ],
          15_000,
        )
      } catch {}
      observed = find()
      if (observed.found === undefined)
        return { kind: 'unknown' as const, phase: 'publish', reason: 'release-not-observed' }
    }
    if (observed.snapshot.state === 'open') {
      if (journal.read('close.json') !== undefined)
        return { kind: 'unknown' as const, phase: 'close', reason: 'closure-not-observed' }
      journal.save('close.json', {
        issue: context.reduceIssue,
        release: referenceOf(observed.found),
      })
      try {
        ports.call(
          [
            'api',
            '--method',
            'PATCH',
            ...REST_HEADERS,
            `repos/${context.repo}/issues/${context.reduceIssue}`,
            '-f',
            'state=closed',
          ],
          15_000,
        )
      } catch {}
    }
    const readback = readReleasedWave(ports, context, first.lineParent)
    return readback === undefined
      ? { kind: 'unknown' as const, phase: 'close', reason: 'closure-not-observed' }
      : { kind: 'confirmed' as const, release: readback.releaseReference }
  })
}
