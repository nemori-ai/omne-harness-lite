import { record } from './protocol.ts'
import type { EventSubject } from './events.ts'

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? record(value, 'event object')
    : {}
}
function id(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}
function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function sha(value: unknown): string | null {
  return typeof value === 'string' && /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value)
    ? value.toLowerCase()
    : null
}

/** Untrusted locating hints, never evidence of the current authoritative state. */
export function channelSubject(body: Record<string, unknown>): EventSubject {
  const run = object(body.workflow_run),
    job = object(body.workflow_job),
    check = object(body.check_run)
  const suite = object(body.check_suite),
    deployment = object(body.deployment),
    status = object(body.deployment_status)
  const pull = object(body.pull_request),
    review = object(body.review)
  return {
    runId: id(run.id) ?? id(job.run_id),
    runAttempt: id(run.run_attempt) ?? id(job.run_attempt),
    workflowJobId: id(job.id),
    checkRunId: id(check.id),
    checkSuiteId: id(suite.id) ?? id(object(check.check_suite).id),
    headSha:
      sha(run.head_sha) ??
      sha(job.head_sha) ??
      sha(check.head_sha) ??
      sha(suite.head_sha) ??
      sha(object(pull.head).sha) ??
      sha(body.after),
    ref: string(body.ref) ?? string(deployment.ref),
    deploymentId: id(deployment.id),
    deploymentStatusId: id(status.id),
    reviewId: id(review.id),
    pullNumber: id(pull.number),
  }
}
