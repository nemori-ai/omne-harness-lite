import { parseDispatchDecision, readAuthority } from '../integration/authority.ts'
import type { AuthorityFacts } from '../integration/delivery-facts.ts'
import type { Policy } from '../integration/policy.ts'
import {
  canonical,
  digest,
  fields,
  literal,
  section,
  same,
  string,
  IntegrationError,
} from '../integration/parse.ts'
import { readTaskBinding, type TaskBinding } from './binding.ts'
import { bodyFields } from './body.ts'
import { collaborationBlock } from './collaboration-block.ts'
import { commentDigest } from './collaboration-comments.ts'
import {
  readCompleteComments,
  readReferencedComment,
  type CollaborationComment,
  type CommentSnapshot,
} from './collaboration-read.ts'
import type { CommentReference, WaveIdentity } from './collaboration-records.ts'
import {
  parseCollaborationScope,
  RESPONSIBILITY_FIELD,
  SCOPE_MARKER,
  STOP_MARKER,
  type CollaborationScope,
} from './collaboration-scope.ts'
import type { RecordAuthority } from './collaboration-trust.ts'
import { evidenceList, nonempty, parseWave } from './collaboration-values.ts'
import { fetchIssueCard, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

const verified = Symbol('verified collaboration authority')
type EpochSource = {
  comment: CollaborationComment
  scope: CollaborationScope
  binding: TaskBinding
  until: string | null
}
export type VerifiedCollaborationAuthority = {
  readonly [verified]: true
  binding: TaskBinding
  scope: CollaborationScope
  records: RecordAuthority[]
  sources: CommentReference[]
  snapshot: CommentSnapshot
}

function source(comment: CollaborationComment): EpochSource {
  const decision = parseDispatchDecision(section(comment.body, 'omne-integration-authority:v1'))
  if (
    comment.authorType !== 'User' ||
    comment.author !== decision.responsible ||
    decision.task.dispatch !== comment.url
  )
    throw new InputError('collaboration-dispatch-author-mismatch')
  const scope = parseCollaborationScope(comment.body)
  if (
    scope.context.reduceIssue !== decision.task.issue.number ||
    scope.context.repo !== decision.task.issue.repository
  )
    throw new InputError('collaboration-dispatch-context-mismatch')
  return { comment, scope, binding: decision.task, until: null }
}

function observed(
  snapshot: CommentSnapshot,
  reference: CommentReference,
  read: GhRead,
): CollaborationComment {
  if (reference.issue !== snapshot.issue)
    throw new InputError('collaboration-history-card-mismatch')
  const current = readReferencedComment(snapshot.repo, reference, read)
  const captured = snapshot.comments.find(comment => comment.id === reference.commentId)
  if (captured === undefined || canonical(captured) !== canonical(current))
    throw new InputError('collaboration-authority-comment-changed')
  return current
}

function previousSource(
  child: EpochSource,
  snapshot: CommentSnapshot,
  read: GhRead,
): EpochSource | null {
  const previous = child.scope.previous
  if (previous === null) return null
  const parent = source(observed(snapshot, previous.dispatch, read))
  const stopped = observed(snapshot, previous.stopped, read)
  const stop = fields(
    collaborationBlock(stopped.body, STOP_MARKER),
    ['schemaVersion', 'context', 'epoch', 'writer', 'stopped', 'evidence'],
    'stop',
  )
  literal(stop.schemaVersion, 1, 'stop.schemaVersion')
  literal(stop.stopped, true, 'stop.stopped')
  same(parseWave(stop.context), parent.scope.context, 'Stop context differs from previous dispatch')
  same(stop.epoch, parent.scope.epoch, 'Stop epoch differs from previous dispatch')
  same(stop.writer, parent.binding.responsible, 'Stop writer differs from previous dispatch')
  nonempty(evidenceList(stop.evidence), 'stop.evidence')
  if (
    stopped.authorType !== 'User' ||
    ![parent.binding.responsible, child.binding.responsible].includes(stopped.author)
  )
    throw new InputError('collaboration-stop-author-untrusted')
  const before = parent.scope.context,
    after = child.scope.context
  if (
    before.repo !== after.repo ||
    before.milestone !== after.milestone ||
    before.wave !== after.wave ||
    before.reduceIssue !== after.reduceIssue ||
    before.planRevision > after.planRevision
  )
    throw new InputError('collaboration-history-context-conflict')
  if (parent.binding.issue.id !== child.binding.issue.id)
    throw new InputError('collaboration-history-issue-conflict')
  if (stopped.createdAt !== stopped.updatedAt) throw new InputError('collaboration-stop-edited')
  const end = Date.parse(stopped.createdAt)
  if (end <= Date.parse(parent.comment.updatedAt) || end > Date.parse(child.comment.updatedAt))
    throw new InputError('collaboration-history-time-conflict')
  parent.until = stopped.createdAt
  return parent
}

function recordAuthorities(epochs: EpochSource[]): RecordAuthority[] {
  const contexts = new Map<string, CollaborationScope>()
  for (const { scope } of epochs) {
    const key = canonical(scope.context),
      prior = contexts.get(key)
    if (
      prior !== undefined &&
      (canonical(prior.workflow) !== canonical(scope.workflow) ||
        canonical(prior.lines.map(line => line.lineParent).sort((a, b) => a - b)) !==
          canonical(scope.lines.map(line => line.lineParent).sort((a, b) => a - b)))
    )
      throw new InputError('collaboration-scope-plan-conflict')
    contexts.set(key, scope)
  }
  return [...contexts.values()].map(scope => ({
    context: scope.context,
    participants: scope.lines.map(line => line.lineParent),
    workflow: scope.workflow,
    reduce: epochs
      .filter(epoch => epoch.scope.context.planRevision >= scope.context.planRevision)
      .map(epoch => ({
        from: epoch.comment.updatedAt,
        until: epoch.until,
        writer: {
          login: epoch.binding.responsible,
          epoch: epoch.scope.epoch,
          authorization: epoch.comment.url,
        },
      })),
    lines: epochs
      .filter(epoch => epoch.scope.context.planRevision >= scope.context.planRevision)
      .flatMap(epoch =>
        epoch.scope.lines
          .filter(line => scope.lines.some(member => member.lineParent === line.lineParent))
          .map(line => ({ ...line, from: epoch.comment.updatedAt, until: epoch.until })),
      ),
  }))
}

export type CollaborationAuthorityInput = {
  policy: Policy
  reduceIssue: number
  adoptedFacts?: AuthorityFacts
  historicalFacts?: readonly AuthorityFacts[]
  read: GhRead
}

/** Reads current dispatch authority and its carried history. Acceptance responsibility remains a declaration. */
export function readCollaborationAuthority(
  input: CollaborationAuthorityInput,
): VerifiedCollaborationAuthority {
  const { policy, reduceIssue, adoptedFacts, read } = input
  const card = fetchIssueCard(policy.repository, reduceIssue, read)
  const snapshot = readCompleteComments(policy.repository, reduceIssue, read)
  same(card.body, snapshot.body, 'Collaboration card changed during capture')
  same(card.issue.updated_at, snapshot.updatedAt, 'Collaboration card changed during capture')
  const binding = readTaskBinding(snapshot.body, card.identity)
  if (binding === undefined) throw new InputError('collaboration-binding-missing')
  const decision = readAuthority(
    policy,
    binding.dispatch,
    { issues: [{ number: reduceIssue, comments: snapshot.comments, commentsComplete: true }] },
    adoptedFacts,
    read,
  )
  same(decision.task, binding, 'Collaboration dispatch differs from current binding')
  const comment = snapshot.comments.find(item => item.url === binding.dispatch)
  if (comment === undefined) throw new InputError('collaboration-dispatch-missing')
  const current = source(comment)
  if (snapshot.milestone !== current.scope.context.milestone)
    throw new InputError('collaboration-milestone-mismatch')
  const acceptance = current.scope.acceptanceResponsibility
  if (acceptance !== null) {
    const responsibility = bodyFields(snapshot.body).get(RESPONSIBILITY_FIELD)
    if (
      responsibility?.length !== 1 ||
      digest(string(responsibility[0], RESPONSIBILITY_FIELD)) !== acceptance.fieldSha256
    )
      throw new InputError('collaboration-responsibility-source-changed')
  }
  const epochs = readEpochHistory(input, snapshot, current)
  const after = readCompleteComments(policy.repository, reduceIssue, read)
  same(snapshot, after, 'Collaboration authority changed during read')
  return {
    [verified]: true,
    binding,
    scope: current.scope,
    records: recordAuthorities(epochs),
    sources: epochs.map(epoch => ({
      issue: reduceIssue,
      commentId: epoch.comment.id,
      sha256: commentDigest(epoch.comment.body),
    })),
    snapshot,
  }
}

function readEpochHistory(
  input: CollaborationAuthorityInput,
  snapshot: CommentSnapshot,
  current: EpochSource,
): EpochSource[] {
  const { policy, reduceIssue, adoptedFacts, read } = input
  const epochs = [current],
    ids = new Set([current.comment.id]),
    epochIds = new Set([current.scope.epoch])
  let next = previousSource(current, snapshot, read)
  const factsFor = (url: string): AuthorityFacts | undefined => {
    const facts = input.historicalFacts?.find(item => item.url === url)
    if (adoptedFacts !== undefined && facts === undefined)
      throw new InputError('collaboration-history-adopted-facts-missing')
    return facts
  }
  while (next !== null) {
    if (ids.has(next.comment.id) || epochIds.has(next.scope.epoch))
      throw new InputError('collaboration-authority-history-cycle')
    ids.add(next.comment.id)
    epochIds.add(next.scope.epoch)
    const historical = readAuthority(
      policy,
      next.comment.url,
      { issues: [{ number: reduceIssue, comments: snapshot.comments, commentsComplete: true }] },
      factsFor(next.comment.url),
      read,
    )
    same(historical.task, next.binding, 'Historical collaboration dispatch changed')
    epochs.unshift(next)
    next = previousSource(next, snapshot, read)
  }
  for (const item of snapshot.comments) {
    if (!ids.has(item.id) && item.body.includes(`\`\`\`json ${SCOPE_MARKER.split(':')[0]}:`)) {
      const candidate = parseCollaborationScope(item.body)
      if (
        candidate.context.repo === current.scope.context.repo &&
        candidate.context.milestone === current.scope.context.milestone &&
        candidate.context.wave === current.scope.context.wave &&
        candidate.context.reduceIssue === reduceIssue
      ) {
        try {
          readAuthority(
            policy,
            item.url,
            {
              issues: [
                { number: reduceIssue, comments: snapshot.comments, commentsComplete: true },
              ],
            },
            factsFor(item.url),
            read,
          )
        } catch (error) {
          if (error instanceof IntegrationError && error.code === 'refused') continue
          throw error
        }
        throw new InputError('collaboration-unlinked-dispatch-conflict')
      }
    }
  }
  return epochs
}

export function recordAuthorityFor(
  authority: VerifiedCollaborationAuthority,
  context: WaveIdentity,
): RecordAuthority {
  const result = authority.records.find(item => canonical(item.context) === canonical(context))
  if (result === undefined) throw new InputError('collaboration-context-not-authorized')
  return result
}
