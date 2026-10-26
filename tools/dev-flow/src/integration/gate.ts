import { REST_HEADERS, type GhCommand } from '../delivery/github-read.ts'
import { IntegrationError } from './parse.ts'

/** GitHub keeps at most this many characters of a deployment review comment. */
export const NOTE_LIMIT = 1024
const TIMEOUT_MS = 15_000

/** The confirmation note: non-empty and within the review comment limit, counted in characters. */
export function confirmationNote(value: string): string {
  const note = value.trim()
  const length = [...note].length
  if (length === 0) throw new IntegrationError('input-error', 'The confirmation note is empty')
  if (length > NOTE_LIMIT)
    throw new IntegrationError(
      'input-error',
      `The confirmation note has ${length} characters; GitHub keeps at most ${NOTE_LIMIT}. Shorten it and point to a comment for the rest`,
    )
  return note
}

export type GateWait = {
  run: number
  conclusion: string
  /** The environment IDs this command approved, in order. */
  approved: number[]
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new IntegrationError('unknown', `${path} is not an object`)
  return value as Record<string, unknown>
}
/**
 * Waits for one workflow run and approves its pending deployments with the note. Each poll
 * reads the run; a completed run ends the wait with its conclusion. Otherwise every pending
 * deployment the caller can approve and this command has not approved yet is approved in one
 * request. The caller's authority to confirm is not judged here: run this only after the admin
 * authorized the confirmation. Stops with `unknown` after `timeoutMs`.
 */
export async function waitGate({
  repository,
  run,
  note,
  call,
  sleep,
  now,
  intervalMs = 10_000,
  timeoutMs = 90 * 60_000,
}: {
  repository: string
  run: number
  note: string
  call: GhCommand
  sleep: (ms: number) => Promise<void>
  now: () => number
  intervalMs?: number
  timeoutMs?: number
}): Promise<GateWait> {
  const comment = confirmationNote(note),
    deadline = now() + timeoutMs,
    approved: number[] = [],
    path = `repos/${repository}/actions/runs/${run}`
  const get = (endpoint: string) =>
    call(['api', '--method', 'GET', ...REST_HEADERS, endpoint], TIMEOUT_MS)
  for (;;) {
    const status = object(get(path), 'run')
    if (status.status === 'completed')
      return { run, conclusion: String(status.conclusion ?? 'unknown'), approved }
    const pending = get(`${path}/pending_deployments`)
    if (!Array.isArray(pending))
      throw new IntegrationError('unknown', 'pending_deployments is not a list')
    const ids = pending
      .map(item => object(item, 'pending deployment'))
      .filter(item => item.current_user_can_approve === true)
      .map(item => object(item.environment, 'environment').id)
      .filter((id): id is number => typeof id === 'number' && !approved.includes(id))
    if (ids.length > 0) {
      try {
        call(
          [
            'api',
            '--method',
            'POST',
            ...REST_HEADERS,
            `${path}/pending_deployments`,
            ...ids.flatMap(id => ['-F', `environment_ids[]=${id}`]),
            '-f',
            'state=approved',
            '-f',
            `comment=${comment}`,
          ],
          TIMEOUT_MS,
        )
      } catch {
        throw new IntegrationError('unknown', `Approving run ${run} failed. API output omitted.`)
      }
      approved.push(...ids)
    }
    if (now() >= deadline)
      throw new IntegrationError('unknown', `Run ${run} did not complete within the wait`)
    await sleep(intervalMs)
  }
}
