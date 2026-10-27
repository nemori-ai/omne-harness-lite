import { readAuthority } from '../integration/authority.ts'
import type { AuthorityFacts } from '../integration/delivery-facts.ts'
import { canonical, digest, object, same } from '../integration/parse.ts'
import { readTaskBinding } from './binding.ts'
import {
  readCollaborationAuthority,
  recordAuthorityFor,
  type CollaborationAuthorityInput,
} from './collaboration-authority.ts'
import type { AdoptedAcceptanceSources } from './collaboration-acceptance-source.ts'
import {
  readCompleteComments,
  recordComments,
  type CollaborationComment,
} from './collaboration-read.ts'
import type {
  ActiveAssignment,
  Assignment,
  Evidence,
  WaveIdentity,
} from './collaboration-records.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { fetchIssueCard, REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export type ReduceWatchPorts = {
  read: GhRead
  sources: AdoptedAcceptanceSources
  authorityFor: (reduceIssue: number) => Omit<CollaborationAuthorityInput, 'read' | 'reduceIssue'>
  taskFactsFor?: (dispatch: string) => AuthorityFacts
  readEvidence: (evidence: Evidence) => string
}

export function watchAuthority(ports: ReduceWatchPorts, repo: string, issue: number) {
  const input = ports.authorityFor(issue)
  if (input.policy.repository !== repo) throw new InputError('watch-authority-repository')
  return readCollaborationAuthority({ ...input, reduceIssue: issue, read: ports.read })
}

export function verifyMaterial(ports: ReduceWatchPorts, evidence: Evidence): void {
  if (digest(ports.readEvidence(evidence)) !== evidence.sha256)
    throw new InputError('watch-material-digest-mismatch')
}

export function verifyActiveAssignment(
  ports: ReduceWatchPorts,
  assignment: ActiveAssignment,
  before?: string,
): void {
  const { context } = assignment
  const authority = watchAuthority(ports, context.repo, context.reduceIssue)
  same(authority.scope.context, context, 'watch-assignment-context-stale')
  const line = authority.scope.lines.find(line => line.lineParent === assignment.lineParent)
  if (line === undefined) throw new InputError('watch-assignment-line-missing')
  for (const comment of recordComments(authority.snapshot)) {
    const record = comment.record
    if (
      record.kind !== 'request' ||
      record.input.lineParent !== assignment.lineParent ||
      !record.input.tasks.some(task =>
        assignment.tasks.some(assigned => canonical(assigned) === canonical(task)),
      )
    )
      continue
    validateRecordAuthority(
      comment,
      recordAuthorityFor(authority, record.input.context),
      ports.read,
    )
    throw new InputError('watch-task-already-handed-off')
  }
  for (const evidence of [...assignment.inputs, ...assignment.acceptance])
    verifyMaterial(ports, evidence)
  for (const task of assignment.tasks) {
    const card = fetchIssueCard(context.repo, task.issue, ports.read)
    const binding = readTaskBinding(card.body, card.identity)
    if (binding === undefined) throw new InputError('watch-task-binding-missing')
    if (binding.responsible !== line.login) throw new InputError('watch-task-line-owner-mismatch')
    const parent = object(
      ports.read(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          `repos/${context.repo}/issues/${task.issue}/parent`,
        ],
        15_000,
      ),
      'task.parent',
    )
    if (
      parent.number !== assignment.lineParent ||
      parent.html_url !== `https://github.com/${context.repo}/issues/${assignment.lineParent}`
    )
      throw new InputError('watch-task-line-parent-mismatch')
    same(
      {
        issue: binding.issue.number,
        revision: binding.revision,
        attempt: binding.attempt,
        dispatch: binding.dispatch,
      },
      task,
      'watch-task-binding-stale',
    )
    if (card.issue.state !== 'open') throw new InputError('watch-task-no-longer-active')
    same(binding.taskBase, assignment.finalHead, 'watch-task-baseline-mismatch')
    const snapshot = readCompleteComments(context.repo, task.issue, ports.read)
    if (snapshot.milestone !== context.milestone)
      throw new InputError('watch-task-milestone-mismatch')
    const config = ports.authorityFor(context.reduceIssue)
    const facts = ports.taskFactsFor?.(task.dispatch)
    if (config.adoptedFacts !== undefined && facts === undefined)
      throw new InputError('watch-task-adopted-facts-missing')
    const decision = readAuthority(
      config.policy,
      task.dispatch,
      {
        issues: [{ number: task.issue, comments: snapshot.comments, commentsComplete: true }],
      },
      facts,
      ports.read,
    )
    same(decision.task, binding, 'watch-task-dispatch-stale')
    const dispatch = snapshot.comments.find(comment => comment.url === task.dispatch)
    if (
      dispatch === undefined ||
      (before !== undefined && Date.parse(dispatch.updatedAt) > Date.parse(before))
    )
      throw new InputError('watch-task-created-after-acceptance')
    same(snapshot, readCompleteComments(context.repo, task.issue, ports.read), 'watch-task-changed')
  }
}

export function referenceOf(comment: CollaborationComment) {
  return { issue: comment.issue, commentId: comment.id, sha256: digest(comment.body) }
}

/** Initial entry uses the earliest adopted assignment; later entries use the durable release cursor. */
export function initialAssignment(
  ports: ReduceWatchPorts,
  repo: string,
  parent: number,
): Assignment {
  const snapshot = readCompleteComments(repo, parent, ports.read)
  const candidates = recordComments(snapshot)
    .flatMap(comment => {
      if (comment.record.kind !== 'assignment') return []
      const assignment = comment.record.assignment
      if (assignment.context.repo !== repo || assignment.lineParent !== parent)
        throw new InputError('watch-parent-assignment-mismatch')
      if (assignment.context.milestone !== snapshot.milestone)
        throw new InputError('watch-parent-milestone-mismatch')
      const authority = watchAuthority(ports, repo, assignment.context.reduceIssue)
      validateRecordAuthority(
        comment,
        recordAuthorityFor(authority, assignment.context),
        ports.read,
      )
      return [{ comment, assignment }]
    })
    .sort(
      (a, b) =>
        a.assignment.context.wave - b.assignment.context.wave || a.comment.id - b.comment.id,
    )
  const first = candidates[0]
  if (first === undefined) throw new InputError('watch-parent-assignment-missing')
  for (const candidate of candidates.filter(
    item => item.assignment.context.wave === first.assignment.context.wave,
  ))
    same(candidate.assignment, first.assignment, 'watch-parent-assignment-conflict')
  return first.assignment
}

export function verifyNextContext(
  ports: ReduceWatchPorts,
  context: WaveIdentity,
  before?: string,
): void {
  const authority = watchAuthority(ports, context.repo, context.reduceIssue)
  same(authority.scope.context, context, 'watch-next-context-stale')
  const dispatch = authority.snapshot.comments.find(
    comment => comment.url === authority.binding.dispatch,
  )
  if (
    dispatch === undefined ||
    (before !== undefined && Date.parse(dispatch.updatedAt) > Date.parse(before))
  )
    throw new InputError('watch-next-created-after-acceptance')
}
