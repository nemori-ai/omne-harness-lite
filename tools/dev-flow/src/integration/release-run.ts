import { canonical, integer, object } from './parse.ts'
import { confirmationNote } from './gate.ts'
import { REST_HEADERS, type GhCommand } from '../delivery/github-read.ts'
import { operationJournal } from '../delivery/line-state-journal.ts'
import { InputError } from '../delivery/protocol.ts'
import {
  dispatchReceipt,
  parseReleaseRunInput,
  pendingReleaseEnvironment,
  RELEASE_REF,
  RELEASE_WORKFLOW,
  releaseApprovals,
  releaseInputs,
  verifyReleaseRun,
  type ReleaseRunInput,
} from './release-run-protocol.ts'

export type ReleaseRunResult = {
  status: 'completed' | 'unknown' | 'timed-out' | 'cancelled' | 'approval-required'
  runId: number | null
  runAttempt: 1 | null
  conclusion: string | null
  diagnostic: string
  journal: string
  approvals: ReturnType<typeof releaseApprovals>
}
export type ReleaseRunOptions = {
  input: unknown
  journalRoot: string
  call: GhCommand
  approval: { kind: 'observe' } | { kind: 'approve'; note: string }
  timeoutMs: number
  intervalMs?: number
  signal?: AbortSignal
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

function dispatch(
  input: ReleaseRunInput,
  options: ReleaseRunOptions,
  journal: ReturnType<typeof operationJournal>,
) {
  const base = `repos/${input.repo}`
  const get = (path: string) =>
    options.call(['api', '--method', 'GET', ...REST_HEADERS, path], 15_000)
  const saved = journal.read('intent.json')
  if (saved !== undefined) {
    const intent = object(saved, 'release intent')
    if (canonical(intent.input) !== canonical(input))
      throw new InputError('release-run-operation-conflict')
    const receipt = journal.read('receipt.json')
    return receipt === undefined
      ? null
      : {
          receipt: dispatchReceipt(receipt, input.repo),
          workflowId: integer(intent.workflowId, 'workflowId'),
        }
  }
  const workflow = object(get(`${base}/actions/workflows/gate-release.yml`), 'workflow')
  const workflowId = integer(workflow.id, 'workflow.id')
  if (workflow.path !== RELEASE_WORKFLOW || workflow.state !== 'active')
    throw new InputError('release-run-workflow-mismatch')
  const ref = object(get(`${base}/git/ref/heads/${RELEASE_REF}`), 'ref')
  if (
    ref.ref !== `refs/heads/${RELEASE_REF}` ||
    object(ref.object, 'ref.object').sha !== input.workflowHead
  )
    throw new InputError('release-run-ref-mismatch')
  journal.save('intent.json', { input, workflowId, ref: RELEASE_REF, inputs: releaseInputs(input) })
  let receipt: ReturnType<typeof dispatchReceipt>
  try {
    receipt = dispatchReceipt(
      options.call(
        [
          'api',
          '--method',
          'POST',
          ...REST_HEADERS,
          `${base}/actions/workflows/${workflowId}/dispatches`,
          '-f',
          `ref=${RELEASE_REF}`,
          ...Object.entries(releaseInputs(input)).flatMap(([key, value]) => [
            '-f',
            `inputs[${key}]=${value}`,
          ]),
        ],
        15_000,
      ),
      input.repo,
    )
  } catch {
    return null
  }
  journal.save('receipt.json', receipt)
  return { receipt, workflowId }
}

/** Dispatches once and observes that exact run/attempt. Approval is separately, explicitly requested. */
export async function releaseRun(options: ReleaseRunOptions): Promise<ReleaseRunResult> {
  const input = parseReleaseRunInput(options.input)
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)
    throw new InputError('release-run-timeout-invalid')
  const interval = options.intervalMs ?? 6_000
  if (!Number.isSafeInteger(interval) || interval < 1)
    throw new InputError('release-run-interval-invalid')
  const note = options.approval.kind === 'approve' ? confirmationNote(options.approval.note) : null
  const journal = operationJournal(options.journalRoot, input.operationId)
  let approvals: ReturnType<typeof releaseApprovals> = []
  const result = (
    status: ReleaseRunResult['status'],
    diagnostic: string,
    runId: number | null,
    conclusion: string | null = null,
  ): ReleaseRunResult => ({
    status,
    diagnostic,
    runId,
    runAttempt: runId === null ? null : 1,
    conclusion,
    journal: journal.directory,
    approvals,
  })
  if (options.signal?.aborted) return result('cancelled', 'observation-cancelled-no-dispatch', null)
  const dispatched = dispatch(input, options, journal)
  if (dispatched === null) return result('unknown', 'dispatch-response-unknown-no-repost', null)
  const runId = dispatched.receipt.workflow_run_id
  const path = `repos/${input.repo}/actions/runs/${runId}`
  const get = (endpoint: string) =>
    options.call(['api', '--method', 'GET', ...REST_HEADERS, endpoint], 15_000)
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const deadline = now() + options.timeoutMs
  for (;;) {
    if (options.signal?.aborted)
      return result('cancelled', 'observation-cancelled-run-may-continue', runId)
    const current = verifyReleaseRun(get(path), input, runId, dispatched.workflowId)
    const attempt = verifyReleaseRun(get(`${path}/attempts/1`), input, runId, dispatched.workflowId)
    if (current.status === 'completed' && attempt.status === 'completed') {
      approvals = releaseApprovals(get(`${path}/approvals`))
      return result('completed', 'exact-run-completed', runId, attempt.conclusion)
    }
    const pending = pendingReleaseEnvironment(get(`${path}/pending_deployments`))
    if (pending !== undefined && note !== null) {
      if (!pending.canApprove)
        return result('approval-required', 'npm-release-approval-not-permitted', runId)
      const file = `approval-${pending.id}.json`
      const approval = {
        runId,
        runAttempt: 1,
        environmentId: pending.id,
        environment: 'npm-release',
        note,
      }
      const saved = journal.read(file)
      if (saved !== undefined && canonical(saved) !== canonical(approval))
        throw new InputError('release-run-approval-conflict')
      if (saved !== undefined) approvals = releaseApprovals(get(`${path}/approvals`))
      if (saved === undefined) {
        // Re-read after the pending-environment read so a rerun cannot redirect this approval.
        verifyReleaseRun(get(path), input, runId, dispatched.workflowId)
        journal.save(file, approval)
        try {
          options.call(
            [
              'api',
              '--method',
              'POST',
              ...REST_HEADERS,
              `${path}/pending_deployments`,
              '-F',
              `environment_ids[]=${pending.id}`,
              '-f',
              'state=approved',
              '-f',
              `comment=${note}`,
            ],
            15_000,
          )
        } catch {
          return result('unknown', 'approval-response-unknown-no-repeat', runId)
        }
      }
    }
    if (now() >= deadline)
      return result('timed-out', 'observation-timed-out-run-may-continue', runId)
    await sleep(Math.min(interval, Math.max(1, deadline - now())))
  }
}
