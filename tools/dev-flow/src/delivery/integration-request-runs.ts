import { array, canonical, integer, object, string } from '../integration/parse.ts'
import type { RequestInput, WorkflowEvidence } from './collaboration-records.ts'
import { requestRunName, type RecordAuthority } from './collaboration-trust.ts'
import { utcTime } from './collaboration-values.ts'
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export type RequestRun = {
  runId: number
  runAttempt: number
  actor: string
  triggeringActor: string
  createdAt: string
  status: string
  conclusion: string | null
}

export function readRequestRun(
  input: RequestInput,
  workflow: WorkflowEvidence,
  read: GhRead,
): RequestRun {
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
    'request run',
  )
  if (
    object(run.repository, 'run.repository').full_name !== input.context.repo ||
    run.id !== workflow.runId ||
    run.run_attempt !== workflow.runAttempt ||
    ![
      workflow.path,
      `${workflow.path}@${workflow.ref}`,
      `${workflow.path}@refs/heads/${workflow.ref}`,
    ].includes(string(run.path, 'run.path')) ||
    run.head_branch !== workflow.ref ||
    run.head_sha !== workflow.head ||
    run.event !== 'workflow_dispatch' ||
    run.display_title !== requestRunName(input, workflow.inputDigest)
  )
    throw new InputError('integration-request-run-mismatch')
  return {
    runId: workflow.runId,
    runAttempt: workflow.runAttempt,
    actor: string(object(run.actor, 'run.actor').login, 'actor.login'),
    triggeringActor: string(
      object(run.triggering_actor, 'run.triggering_actor').login,
      'triggeringActor.login',
    ),
    createdAt: utcTime(run.created_at, 'run.created_at'),
    status: string(run.status, 'run.status'),
    conclusion: run.conclusion === null ? null : string(run.conclusion, 'run.conclusion'),
  }
}

export function requireRunActors(
  run: RequestRun,
  input: RequestInput,
  authority: RecordAuthority,
): void {
  const covers = (from: string, until: string | null, at: string) =>
    Date.parse(from) <= Date.parse(at) && (until === null || Date.parse(at) < Date.parse(until))
  if (
    !authority.lines.some(
      line =>
        line.lineParent === input.lineParent &&
        line.login === run.actor &&
        covers(line.from, line.until, run.createdAt),
    )
  )
    throw new InputError('integration-request-run-actor-untrusted')
  const activeLine = authority.lines.some(
    line =>
      line.lineParent === input.lineParent &&
      line.login === run.triggeringActor &&
      line.until === null,
  )
  const activeReduce = authority.reduce.some(
    grant => grant.writer.login === run.triggeringActor && grant.until === null,
  )
  if (!(run.triggeringActor === run.actor ? activeLine : activeReduce))
    throw new InputError('integration-request-run-trigger-untrusted')
}

/** Complete workflow history is required before recovering a lost dispatch response. */
export function findRequestRuns(
  input: RequestInput,
  workflow: Omit<WorkflowEvidence, 'runId' | 'runAttempt'>,
  read: GhRead,
): RequestRun[] {
  const endpoint = `repos/${input.context.repo}/actions/workflows/${workflow.path.split('/').at(-1)}/runs`
  const prefix = `integration-request:${input.requestId}:`
  const found: RequestRun[] = [],
    ids = new Set<number>()
  let expected: number | undefined
  for (let page = 1; ; page++) {
    const value = object(
      read(
        ['api', '--method', 'GET', ...REST_HEADERS, `${endpoint}?per_page=100&page=${page}`],
        15_000,
      ),
      'workflow runs',
    )
    const count = value.total_count
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new InputError('integration-request-run-count-invalid')
    if (expected !== undefined && expected !== count)
      throw new InputError('integration-request-runs-changed')
    expected = count
    const runs = array(value.workflow_runs, 'workflow_runs')
    for (const raw of runs) {
      const run = object(raw, 'workflow run'),
        id = integer(run.id, 'run.id')
      if (ids.has(id)) throw new InputError('integration-request-run-page-duplicate')
      ids.add(id)
      if (typeof run.display_title !== 'string' || !run.display_title.startsWith(prefix)) continue
      if (run.display_title !== requestRunName(input, workflow.inputDigest))
        throw new InputError('integration-request-run-input-conflict')
      found.push(
        readRequestRun(
          input,
          { ...workflow, runId: id, runAttempt: integer(run.run_attempt, 'run_attempt') },
          read,
        ),
      )
    }
    if (runs.length < 100) break
    if (runs.length > 100 || ids.size > expected)
      throw new InputError('integration-request-runs-incomplete')
  }
  if (ids.size !== expected) throw new InputError('integration-request-runs-incomplete')
  const distinct = new Set(found.map(run => canonical([run.runId, run.runAttempt])))
  if (distinct.size !== found.length) throw new InputError('integration-request-runs-duplicate')
  return found
}
