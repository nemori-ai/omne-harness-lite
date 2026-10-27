import { array, integer, object, same, string } from '../integration/parse.ts'
import { readReleaseAcceptance } from './collaboration-acceptance.ts'
import { commentDigest } from './collaboration-comments.ts'
import {
  readCompleteComments,
  readReferencedComment,
  recordComments,
} from './collaboration-read.ts'
import type { CommentReference, ReleaseRecord, WaveIdentity } from './collaboration-records.ts'
import { recordAuthorityFor } from './collaboration-authority.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { utcTime } from './collaboration-values.ts'
import { REST_HEADERS } from './github-read.ts'
import { InputError } from './protocol.ts'
import {
  referenceOf,
  verifyActiveAssignment,
  verifyMaterial,
  verifyNextContext,
  watchAuthority,
  type ReduceWatchPorts,
} from './reduce-watch-materials.ts'

function acceptanceReference(release: ReleaseRecord): CommentReference {
  const prefix = `https://github.com/${release.context.repo}/issues/${release.context.reduceIssue}#issuecomment-`
  if (!release.acceptance.url.startsWith(prefix)) throw new InputError('watch-acceptance-reference')
  const id = release.acceptance.url.slice(prefix.length)
  if (!/^[1-9]\d*$/.test(id)) throw new InputError('watch-acceptance-reference')
  return {
    issue: release.context.reduceIssue,
    commentId: integer(Number(id), 'acceptance comment'),
    sha256: release.acceptance.sha256,
  }
}

function closure(ports: ReduceWatchPorts, context: WaveIdentity, publishedAt: string) {
  const events: { id: number; event: string; time: string }[] = []
  const ids = new Set<number>()
  for (let page = 1; ; page++) {
    const items = array(
      ports.read(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          `repos/${context.repo}/issues/${context.reduceIssue}/events?per_page=100&page=${page}`,
        ],
        15_000,
      ),
      'issue events',
    )
    if (items.length > 100) throw new InputError('watch-events-page-invalid')
    for (const raw of items) {
      const event = object(raw, 'issue event')
      const id = integer(event.id, 'event.id')
      if (ids.has(id)) throw new InputError('watch-events-page-duplicate')
      ids.add(id)
      const kind = string(event.event, 'event.event')
      if (kind === 'closed' || kind === 'reopened')
        events.push({ id, event: kind, time: utcTime(event.created_at, 'event.created_at') })
    }
    if (items.length < 100) break
  }
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.id - b.id)
  const last = events.at(-1)
  if (last?.event !== 'closed' || Date.parse(last.time) < Date.parse(publishedAt))
    throw new InputError('watch-closure-not-after-release')
  if (
    events.some(
      item => item.event === 'reopened' && Date.parse(item.time) >= Date.parse(publishedAt),
    )
  )
    throw new InputError('watch-release-reopened')
  return last
}

export function readReleasedWave(
  ports: ReduceWatchPorts,
  context: WaveIdentity,
  lineParent: number,
  historicalProof = false,
) {
  const authority = watchAuthority(ports, context.repo, context.reduceIssue)
  same(authority.scope.context, context, 'watch-current-context-stale')
  const records = recordComments(authority.snapshot).flatMap(comment => {
    if (comment.record.kind !== 'release') return []
    validateRecordAuthority(
      comment,
      recordAuthorityFor(authority, comment.record.context),
      ports.read,
    )
    same(comment.record.context, context, 'watch-release-context-stale')
    if (comment.createdAt !== comment.updatedAt) throw new InputError('watch-release-edited')
    return [{ ...comment, record: comment.record }]
  })
  const item = records[0]
  if (item === undefined) {
    if (authority.snapshot.state === 'closed') throw new InputError('watch-closed-without-release')
    return undefined
  }
  for (const other of records) same(other.record, item.record, 'watch-release-conflict')
  if (authority.snapshot.state !== 'closed') return undefined
  const release = item.record
  const { context: identity, finalHead, expectedRequests, results, lines, next } = release
  const config = ports.authorityFor(context.reduceIssue)
  const accepted = readReleaseAcceptance({
    ...config,
    reduceIssue: context.reduceIssue,
    read: ports.read,
    sources: ports.sources,
    reference: acceptanceReference(release),
    subject: { context: identity, finalHead, expectedRequests, results, lines, next },
    relatedAuthority: related => ports.authorityFor(related.reduceIssue),
  })
  const acceptedComment = readReferencedComment(context.repo, accepted.reference, ports.read)
  if (
    Date.parse(item.createdAt) < Date.parse(acceptedComment.createdAt) ||
    Date.parse(release.recordedAt) < Date.parse(acceptedComment.createdAt)
  )
    throw new InputError('watch-release-before-acceptance')
  let historical = false
  if (!historicalProof) {
    if (next !== null) verifyNextContext(ports, next, acceptedComment.createdAt)
    for (const line of lines) {
      if (line.continuation.kind === 'active') {
        try {
          verifyActiveAssignment(ports, line.continuation.assignment, acceptedComment.createdAt)
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !/watch-task-(no-longer-active|binding-stale|dispatch-stale|already-handed-off)/.test(
              error.message,
            )
          )
            throw error
          if (next === null || readReleasedWave(ports, next, line.lineParent, true) === undefined)
            throw error
          if (line.lineParent === lineParent) historical = true
        }
      }
      if (line.continuation.kind === 'terminal')
        verifyMaterial(ports, line.continuation.authorization)
    }
  }
  const line = lines.find(candidate => candidate.lineParent === lineParent)
  if (line === undefined) throw new InputError('watch-line-not-in-release')
  const delta = readReferencedComment(context.repo, line.delta, ports.read)
  const closed = closure(ports, context, item.createdAt)
  same(
    authority.snapshot,
    readCompleteComments(context.repo, context.reduceIssue, ports.read),
    'watch-release-changed-during-read',
  )
  same(
    item.body,
    readReferencedComment(context.repo, referenceOf(item), ports.read).body,
    'watch-release-bytes-changed',
  )
  return {
    historical,
    release,
    releaseReference: referenceOf(item),
    delta: line.delta,
    continuation: line.continuation,
    evidence: {
      acceptance: accepted.reference,
      closed,
      deltaDigest: commentDigest(delta.body),
      source: 'github-rest' as const,
    },
  }
}
