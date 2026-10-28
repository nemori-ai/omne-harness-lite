import {
  canonical,
  digest,
  integer,
  object,
  same,
  string,
  IntegrationError,
} from '../integration/parse.ts'
import {
  readCollaborationAuthority,
  recordAuthorityFor,
  type CollaborationAuthorityInput,
} from './collaboration-authority.ts'
import { commentDigest } from './collaboration-comments.ts'
import { parseRequestInput } from './collaboration-parse.ts'
import type { CommentReference, RequestInput } from './collaboration-records.ts'
import { uuid } from './collaboration-values.ts'
import { REST_HEADERS, type GhCommand } from './github-read.ts'
import {
  validateRequestBindings,
  type RequestTaskAuthority,
} from './integration-request-bindings.ts'
import {
  githubRequestEvidence,
  verifyRequestEvidence,
  type RequestEvidenceReader,
} from './integration-request-evidence.ts'
import { RequestJournal, type RequestIntent } from './integration-request-journal.ts'
import {
  existingRequest,
  readRequestHistory,
  requireRequestSlot,
  verifyRedispatchReferences,
} from './integration-request-read.ts'
import {
  findRequestRuns,
  readRequestRun,
  requireRunActors,
  type RequestRun,
} from './integration-request-runs.ts'
import { InputError } from './protocol.ts'

export type RequestBootstrap = Omit<CollaborationAuthorityInput, 'read' | 'reduceIssue'> & {
  taskAuthority?: RequestTaskAuthority
}
export type IntegrationRequestResult = {
  schemaVersion: 1
  operation: 'submit'
  operationId: string
  repo: string
  requestId: string
  outcome: RequestInput['outcome']
  evidence: { journal: string; receipt: CommentReference | null; runs: RequestRun[] }
  diagnostics: string[]
} & (
  | { status: 'registered'; sideEffects: 'registration-confirmed'; recovery: null }
  | {
      status: 'unknown' | 'failed'
      errorCode: string
      retryable: false
      sideEffects: 'dispatch-may-have-started'
      recovery: 'recover-same-request'
    }
)
export type SubmitRequestOptions = {
  mode: 'submit' | 'recover'
  input: RequestInput
  operationId: string
  journalRoot: string
  bootstrap: RequestBootstrap
  call: GhCommand
  evidenceReader?: RequestEvidenceReader
}

function dispatch(intent: RequestIntent, call: GhCommand): number {
  const repo = intent.input.context.repo,
    workflow = intent.workflow
  const response = object(
    call(
      [
        'api',
        '--method',
        'POST',
        ...REST_HEADERS,
        `repos/${repo}/actions/workflows/${workflow.path.split('/').at(-1)}/dispatches`,
        '-f',
        `ref=${workflow.ref}`,
        '-f',
        `inputs[request]=${canonical(intent.input)}`,
        '-f',
        `inputs[input-digest]=${workflow.inputDigest}`,
      ],
      15_000,
    ),
    'workflow dispatch',
  )
  const id = integer(response.workflow_run_id, 'workflow_run_id')
  if (
    response.run_url !== `https://api.github.com/repos/${repo}/actions/runs/${id}` ||
    response.html_url !== `https://github.com/${repo}/actions/runs/${id}`
  )
    throw new InputError('integration-request-dispatch-response-mismatch')
  return id
}

export function submitIntegrationRequest(options: SubmitRequestOptions): IntegrationRequestResult {
  const input = parseRequestInput(options.input),
    operationId = uuid(options.operationId, 'operationId')
  if (options.bootstrap.policy.repository !== input.context.repo)
    throw new InputError('integration-request-repository-mismatch')
  const journal = new RequestJournal(options.journalRoot, input)
  const run = (): IntegrationRequestResult => {
    try {
      return submitLocked({ ...options, input, operationId }, journal)
    } catch (error) {
      if (error instanceof InputError || error instanceof IntegrationError || !journal.attempted)
        throw error
      return {
        schemaVersion: 1,
        operation: 'submit',
        operationId,
        repo: input.context.repo,
        requestId: input.requestId,
        outcome: input.outcome,
        status: 'unknown',
        errorCode: 'integration-request-readback-unavailable',
        retryable: false,
        sideEffects: 'dispatch-may-have-started',
        recovery: 'recover-same-request',
        evidence: { journal: journal.directory, receipt: null, runs: [] },
        diagnostics: [
          'The dispatch intent is durable. Keep the candidate frozen and recover the same request.',
        ],
      }
    }
  }
  return options.mode === 'recover' ? run() : journal.lock(run)
}

function submitLocked(
  options: SubmitRequestOptions,
  journal: RequestJournal,
): IntegrationRequestResult {
  const { input, bootstrap, call, operationId } = options
  const authority = readCollaborationAuthority({
    ...bootstrap,
    reduceIssue: input.context.reduceIssue,
    read: call,
  })
  const grant = recordAuthorityFor(authority, input.context)
  const old = journal.read()
  if (options.mode === 'recover' && old === null)
    throw new InputError('integration-request-journal-missing')
  const intent = journal.prepare({
    schemaVersion: 1,
    operationId,
    input,
    workflow: { ...grant.workflow, inputDigest: digest(canonical(input)) },
    preparedAt: new Date().toISOString(),
  })
  same(
    intent.workflow,
    { ...grant.workflow, inputDigest: digest(canonical(input)) },
    'integration-request-workflow-adoption-changed',
  )
  const common = {
    schemaVersion: 1 as const,
    operation: 'submit' as const,
    operationId,
    repo: input.context.repo,
    requestId: input.requestId,
    outcome: input.outcome,
  }
  const history = readRequestHistory(authority, call),
    existing = existingRequest(input, history)
  if (existing !== undefined) {
    verifyRequestEvidence(input, options.evidenceReader ?? githubRequestEvidence(call))
    return {
      ...common,
      status: 'registered',
      sideEffects: 'registration-confirmed',
      recovery: null,
      evidence: {
        journal: journal.directory,
        receipt: {
          issue: input.context.reduceIssue,
          commentId: existing.receipt.id,
          sha256: commentDigest(existing.receipt.body),
        },
        runs: [readRequestRun(input, existing.receipt.record.workflow, call)],
      },
      diagnostics: [],
    }
  }
  if (options.mode === 'submit' && !journal.attempted) {
    requireRequestSlot(input, history)
    verifyRedispatchReferences(
      input,
      history,
      authority,
      call,
      options.evidenceReader ?? githubRequestEvidence(call),
    )
    const prior = findRequestRuns(input, intent.workflow, call)
    if (prior.length === 0) {
      const actor = object(
        call(['api', '--method', 'GET', ...REST_HEADERS, 'user'], 15_000),
        'user',
      )
      validateRequestBindings({
        request: input,
        authority,
        actor: string(actor.login, 'user.login'),
        policy: bootstrap.policy,
        read: call,
        taskAuthority: bootstrap.taskAuthority,
      })
      verifyRequestEvidence(input, options.evidenceReader ?? githubRequestEvidence(call))
      const ref = object(
        call(
          [
            'api',
            '--method',
            'GET',
            ...REST_HEADERS,
            `repos/${input.context.repo}/git/ref/heads/${intent.workflow.ref}`,
          ],
          15_000,
        ),
        'workflow ref',
      )
      if (
        ref.ref !== `refs/heads/${intent.workflow.ref}` ||
        object(ref.object, 'ref.object').sha !== intent.workflow.head
      )
        throw new InputError('integration-request-workflow-head-changed')
      journal.attemptedDispatch(intent)
      try {
        journal.saveRun(dispatch(intent, call))
      } catch {}
    }
  }
  const id = journal.runId()
  const runs =
    id === null
      ? findRequestRuns(input, intent.workflow, call)
      : [readRequestRun(input, { ...intent.workflow, runId: id, runAttempt: 1 }, call)]
  for (const run of runs) requireRunActors(run, input, grant)
  const refreshed = existingRequest(input, readRequestHistory(authority, call))
  if (refreshed !== undefined) {
    verifyRequestEvidence(input, options.evidenceReader ?? githubRequestEvidence(call))
    return {
      ...common,
      status: 'registered',
      sideEffects: 'registration-confirmed',
      recovery: null,
      evidence: {
        journal: journal.directory,
        receipt: {
          issue: input.context.reduceIssue,
          commentId: refreshed.receipt.id,
          sha256: commentDigest(refreshed.receipt.body),
        },
        runs,
      },
      diagnostics: [],
    }
  }
  const failed =
    runs.length > 0 && runs.every(run => run.status === 'completed' && run.conclusion !== 'success')
  return {
    ...common,
    status: failed ? 'failed' : 'unknown',
    errorCode: failed
      ? 'integration-request-action-failed'
      : 'integration-request-receipt-not-confirmed',
    retryable: false,
    sideEffects: 'dispatch-may-have-started',
    recovery: 'recover-same-request',
    evidence: { journal: journal.directory, receipt: null, runs },
    diagnostics: ['Keep candidate frozen. Read back this request; do not dispatch a replacement.'],
  }
}
