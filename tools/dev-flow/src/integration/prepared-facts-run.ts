import { REST_HEADERS, type GhRead } from '../delivery/github-read.ts'
import { InputError } from '../delivery/protocol.ts'
import { utcTime } from '../delivery/collaboration-values.ts'
import type { FactsDeployment } from './published-delivery-facts.ts'
import { array, choice, integer, object, same, string } from './parse.ts'

const conclusions = [
  'success',
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'neutral',
  'skipped',
  'stale',
  'startup_failure',
] as const

export function parseFactsRunConclusion(value: unknown) {
  return value === null ? null : choice(value, conclusions, 'facts-preparation-run-conclusion')
}

export type FactsRunInput = { issue: string; authority: string; nonce: string }
export type PreparedFactsRun = {
  id: number
  attempt: 1
  status: string
  conclusion: ReturnType<typeof parseFactsRunConclusion>
  createdAt: string
}

export function factsRunName(input: FactsRunInput): string {
  const title = `delivery-facts:${input.nonce}:${input.issue}:${input.authority}`
  if (title.length > 255) throw new InputError('facts-preparation-title-too-long')
  return title
}

export function readPreparedFactsRun(
  deployment: FactsDeployment,
  input: FactsRunInput,
  runId: number,
  read: GhRead,
): PreparedFactsRun {
  const endpoint = `repos/${deployment.repository}/actions/runs/${runId}`
  const get = (path: string) => read(['api', '--method', 'GET', ...REST_HEADERS, path], 15_000)
  function parse(value: unknown): PreparedFactsRun {
    const v = object(value, 'facts preparation run')
    if (
      v.id !== runId ||
      v.workflow_id !== deployment.workflow.id ||
      v.path !== deployment.workflow.path ||
      v.head_branch !== deployment.workflow.ref ||
      v.head_sha !== deployment.workflow.head ||
      v.event !== 'workflow_dispatch' ||
      v.run_attempt !== 1 ||
      v.display_title !== factsRunName(input) ||
      object(v.repository, 'run.repository').full_name !== deployment.repository ||
      object(v.head_repository, 'run.head_repository').full_name !== deployment.repository
    )
      throw new InputError('facts-preparation-run-mismatch')
    const status = string(v.status, 'run.status')
    if (!['queued', 'in_progress', 'requested', 'waiting', 'pending', 'completed'].includes(status))
      throw new InputError('facts-preparation-run-status')
    const conclusion = parseFactsRunConclusion(v.conclusion)
    if (status === 'completed' ? conclusion === null : conclusion !== null)
      throw new InputError('facts-preparation-run-conclusion')
    return {
      id: runId,
      attempt: 1,
      status,
      conclusion,
      createdAt: utcTime(v.created_at, 'run.created_at'),
    }
  }
  const current = parse(get(endpoint))
  const attempt = parse(get(`${endpoint}/attempts/1`))
  same(
    { status: attempt.status, conclusion: attempt.conclusion },
    { status: current.status, conclusion: current.conclusion },
    'facts-preparation-attempt-changed',
  )
  same(parse(get(`${endpoint}/attempts/1`)), attempt, 'facts-preparation-attempt-changed')
  same(parse(get(endpoint)), current, 'facts-preparation-run-changed')
  return current
}

export function findPreparedFactsRun(
  deployment: FactsDeployment,
  input: FactsRunInput,
  read: GhRead,
): PreparedFactsRun | null {
  const endpoint = `repos/${deployment.repository}/actions/workflows/${deployment.workflow.id}/runs`
  const title = factsRunName(input),
    ids = new Set<number>(),
    matches: number[] = []
  let expected: number | undefined
  for (let page = 1; ; page++) {
    const value = object(
      read(
        ['api', '--method', 'GET', ...REST_HEADERS, `${endpoint}?per_page=100&page=${page}`],
        15_000,
      ),
      'facts preparation runs',
    )
    const count = value.total_count
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new InputError('facts-preparation-run-count')
    if (expected !== undefined && expected !== count)
      throw new InputError('facts-preparation-runs-changed')
    expected = count
    const runs = array(value.workflow_runs, 'workflow_runs')
    if (runs.length > 100) throw new InputError('facts-preparation-run-page')
    for (const raw of runs) {
      const run = object(raw, 'workflow run'),
        id = integer(run.id, 'run.id')
      if (ids.has(id)) throw new InputError('facts-preparation-run-page-duplicate')
      ids.add(id)
      if (run.display_title === title) matches.push(id)
    }
    if (ids.size > expected) throw new InputError('facts-preparation-runs-incomplete')
    if (runs.length < 100) break
  }
  if (ids.size !== expected) throw new InputError('facts-preparation-runs-incomplete')
  if (matches.length > 1) throw new InputError('facts-preparation-run-duplicated')
  return matches[0] === undefined ? null : readPreparedFactsRun(deployment, input, matches[0], read)
}
