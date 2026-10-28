import { canonical, digest, same } from '../integration/parse.ts'
import { readCollaborationAuthority, recordAuthorityFor } from './collaboration-authority.ts'
import { commentDigest, encodeRecordComment } from './collaboration-comments.ts'
import { parseRequestInput } from './collaboration-parse.ts'
import { readCompleteComments, recordComments } from './collaboration-read.ts'
import type {
  CommentReference,
  RequestInput,
  RequestRecord,
  WorkflowEvidence,
} from './collaboration-records.ts'
import { parseWorkflow } from './collaboration-values.ts'
import { REST_HEADERS, type GhCommand } from './github-read.ts'
import { validateRequestBindings } from './integration-request-bindings.ts'
import {
  githubRequestEvidence,
  verifyRequestEvidence,
  type RequestEvidenceReader,
} from './integration-request-evidence.ts'
import { RequestJournal } from './integration-request-journal.ts'
import {
  existingRequest,
  readRequestHistory,
  requireRequestSlot,
  verifyRedispatchReferences,
} from './integration-request-read.ts'
import { findRequestRuns, readRequestRun, requireRunActors } from './integration-request-runs.ts'
import type { RequestBootstrap } from './integration-request.ts'
import { InputError } from './protocol.ts'

export type RegistrationResult =
  | { status: 'recorded' | 'reused'; receipt: CommentReference }
  | { status: 'unknown'; errorCode: string }

export function registerIntegrationRequest(options: {
  input: RequestInput
  workflow: WorkflowEvidence
  bootstrap: RequestBootstrap
  journalRoot: string
  call: GhCommand
  evidenceReader?: RequestEvidenceReader
}): RegistrationResult {
  const input = parseRequestInput(options.input),
    workflow = parseWorkflow(options.workflow)
  if (
    options.bootstrap.policy.repository !== input.context.repo ||
    workflow.inputDigest !== digest(canonical(input))
  )
    throw new InputError('integration-request-action-input-mismatch')
  const authority = readCollaborationAuthority({
    ...options.bootstrap,
    reduceIssue: input.context.reduceIssue,
    read: options.call,
  })
  const grant = recordAuthorityFor(authority, input.context)
  same(
    grant.workflow,
    { path: workflow.path, ref: workflow.ref, head: workflow.head },
    'integration-request-action-workflow-untrusted',
  )
  const run = readRequestRun(input, workflow, options.call)
  requireRunActors(run, input, grant)
  if (run.status !== 'in_progress')
    throw new InputError('integration-request-action-run-not-running')
  const history = readRequestHistory(authority, options.call),
    existing = existingRequest(input, history)
  if (existing !== undefined) {
    verifyRequestEvidence(input, options.evidenceReader ?? githubRequestEvidence(options.call))
    return {
      status: 'reused',
      receipt: {
        issue: input.context.reduceIssue,
        commentId: existing.receipt.id,
        sha256: commentDigest(existing.receipt.body),
      },
    }
  }
  const prior = findRequestRuns(input, workflow, options.call)
  if (
    workflow.runAttempt !== 1 ||
    prior.some(item => item.runId !== workflow.runId) ||
    history.incomplete.some(
      comment =>
        comment.record.kind === 'request' && comment.record.input.lineParent === input.lineParent,
    )
  )
    return { status: 'unknown', errorCode: 'integration-request-registration-needs-recovery' }
  requireRequestSlot(input, history)
  verifyRedispatchReferences(
    input,
    history,
    authority,
    options.call,
    options.evidenceReader ?? githubRequestEvidence(options.call),
  )
  validateRequestBindings({
    request: input,
    authority,
    actor: run.actor,
    policy: options.bootstrap.policy,
    read: options.call,
    taskAuthority: options.bootstrap.taskAuthority,
  })
  verifyRequestEvidence(input, options.evidenceReader ?? githubRequestEvidence(options.call))
  const journal = new RequestJournal(options.journalRoot, input)
  return journal.lock(() => {
    const intent = journal.prepare({
      schemaVersion: 1,
      operationId: input.requestId,
      input,
      workflow: { ...grant.workflow, inputDigest: workflow.inputDigest },
      preparedAt: new Date().toISOString(),
    })
    const record: RequestRecord = {
      schemaVersion: 1,
      kind: 'request',
      input,
      workflow,
      registeredAt: intent.preparedAt,
    }
    const body = encodeRecordComment(record)
    const observe = (): CommentReference | undefined => {
      const matches = recordComments(
        readCompleteComments(input.context.repo, input.context.reduceIssue, options.call),
      ).filter(
        comment =>
          comment.record.kind === 'request' && comment.record.input.requestId === input.requestId,
      )
      for (const comment of matches) {
        if (
          comment.body !== body ||
          comment.author !== 'github-actions[bot]' ||
          comment.authorType !== 'Bot'
        )
          throw new InputError('integration-request-action-receipt-conflict')
      }
      const match = matches.sort((a, b) => a.id - b.id)[0]
      return match === undefined
        ? undefined
        : { issue: input.context.reduceIssue, commentId: match.id, sha256: commentDigest(body) }
    }
    const previous = observe()
    if (previous !== undefined) return { status: 'recorded', receipt: previous }
    if (journal.attempted)
      return { status: 'unknown', errorCode: 'integration-request-post-outcome-unknown' }
    journal.attemptedDispatch(intent)
    try {
      options.call(
        [
          'api',
          '--method',
          'POST',
          ...REST_HEADERS,
          `repos/${input.context.repo}/issues/${input.context.reduceIssue}/comments`,
          '-f',
          `body=${body}`,
        ],
        15_000,
      )
    } catch {}
    const receipt = observe()
    return receipt === undefined
      ? { status: 'unknown', errorCode: 'integration-request-post-outcome-unknown' }
      : { status: 'recorded', receipt }
  })
}
