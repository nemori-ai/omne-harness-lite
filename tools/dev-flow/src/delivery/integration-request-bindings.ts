import { readAuthority } from '../integration/authority.ts'
import type { AuthorityFacts } from '../integration/delivery-facts.ts'
import { canonical, object, same, string } from '../integration/parse.ts'
import { activeTrack, type Policy } from '../integration/policy.ts'
import { readTaskBinding, type TaskBinding } from './binding.ts'
import type { VerifiedCollaborationAuthority } from './collaboration-authority.ts'
import { readCompleteComments } from './collaboration-read.ts'
import type { RequestInput } from './collaboration-records.ts'
import { fetchIssueCard, REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export type RequestTaskAuthority = (dispatch: string) => AuthorityFacts | undefined

export function validateRequestBindings(input: {
  request: RequestInput
  authority: VerifiedCollaborationAuthority
  actor: string
  policy: Policy
  read: GhRead
  taskAuthority?: RequestTaskAuthority | undefined
}): void {
  const { request, authority, actor, policy, read } = input
  same(request.context, authority.scope.context, 'integration-request-current-context-mismatch')
  if (authority.snapshot.state !== 'open') throw new InputError('integration-request-reduce-closed')
  if (
    !authority.scope.lines.some(
      line => line.lineParent === request.lineParent && line.login === actor,
    )
  )
    throw new InputError('integration-request-line-owner-mismatch')
  const parent = fetchIssueCard(request.context.repo, request.lineParent, read)
  if (object(parent.issue.milestone, 'line.milestone').number !== request.context.milestone)
    throw new InputError('integration-request-line-milestone-mismatch')
  const bindings: TaskBinding[] = []
  for (const task of request.tasks) {
    const card = fetchIssueCard(request.context.repo, task.issue, read)
    const snapshot = readCompleteComments(request.context.repo, task.issue, read)
    same(snapshot.body, card.body, 'integration-request-task-changed')
    if (snapshot.state !== 'open' || snapshot.milestone !== request.context.milestone)
      throw new InputError('integration-request-task-inactive')
    const binding = readTaskBinding(card.body, card.identity)
    if (binding === undefined) throw new InputError('integration-request-task-binding-missing')
    same(
      {
        issue: binding.issue.number,
        revision: binding.revision,
        attempt: binding.attempt,
        dispatch: binding.dispatch,
      },
      task,
      'integration-request-task-attempt-mismatch',
    )
    if (
      binding.responsible !== actor ||
      activeTrack(policy, binding.route.track).branch !== request.targetRef
    )
      throw new InputError('integration-request-task-owner-or-target-mismatch')
    const decision = readAuthority(
      policy,
      binding.dispatch,
      {
        issues: [{ number: task.issue, comments: snapshot.comments, commentsComplete: true }],
      },
      input.taskAuthority?.(binding.dispatch),
      read,
    )
    same(decision.task, binding, 'integration-request-task-dispatch-mismatch')
    const relation = object(
      read(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          `repos/${request.context.repo}/issues/${task.issue}/parent`,
        ],
        15_000,
      ),
      'task.parent',
    )
    if (relation.html_url !== parent.url || relation.number !== request.lineParent)
      throw new InputError('integration-request-task-parent-mismatch')
    if (
      canonical(snapshot) !==
      canonical(readCompleteComments(request.context.repo, task.issue, read))
    )
      throw new InputError('integration-request-task-changed')
    bindings.push(binding)
  }
  if (request.pull === null) return
  const pull = object(
    read(
      [
        'api',
        '--method',
        'GET',
        ...REST_HEADERS,
        `repos/${request.context.repo}/pulls/${request.pull.number}`,
      ],
      15_000,
    ),
    'pull',
  )
  const head = object(pull.head, 'pull.head'),
    base = object(pull.base, 'pull.base')
  if (
    pull.number !== request.pull.number ||
    pull.html_url !== `https://github.com/${request.context.repo}/pull/${request.pull.number}` ||
    pull.state !== 'open' ||
    pull.merged === true ||
    object(head.repo, 'pull.head.repo').full_name !== request.context.repo ||
    object(base.repo, 'pull.base.repo').full_name !== request.context.repo ||
    base.ref !== request.targetRef ||
    head.sha !== request.pull.head ||
    !bindings.every(binding => binding.branch === string(head.ref, 'pull.head.ref')) ||
    (request.outcome === 'ready' && pull.draft !== false)
  )
    throw new InputError('integration-request-pull-mismatch')
}
