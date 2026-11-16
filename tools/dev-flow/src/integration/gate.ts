import { REST_HEADERS, type GhCommand } from '../shared/gh.ts'
import { array, record } from '../shared/input.ts'
import { IntegrationError } from './parse.ts'

export const NOTE_LIMIT = 1024
const TIMEOUT_MS = 15_000
const utf8 = new TextEncoder()

export function confirmationNote(value: string): string {
  const note = value.trim()
  if (note.length === 0) throw new IntegrationError('input-error', 'The confirmation note is empty')
  const bytes = utf8.encode(note).length
  if (bytes > NOTE_LIMIT)
    throw new IntegrationError(
      'input-error',
      `The confirmation note has ${bytes} bytes; GitHub keeps at most ${NOTE_LIMIT}. Shorten it and point to a comment for the rest`,
    )
  return note
}

export type GateWait = { run: number; conclusion: string; approvals: number[][] }
export async function waitGate({
  repository,
  run,
  note,
  environments,
  call,
  sleep,
  now,
  intervalMs = 10_000,
  timeoutMs = 90 * 60_000,
}: {
  repository: string
  run: number
  note: string
  environments: readonly string[]
  call: GhCommand
  sleep: (ms: number) => Promise<void>
  now: () => number
  intervalMs?: number
  timeoutMs?: number
}): Promise<GateWait> {
  const comment = confirmationNote(note)
  if (environments.length === 0)
    throw new IntegrationError('input-error', 'Name at least one environment to approve')
  const deadline = now() + timeoutMs,
    approvals: number[][] = [],
    path = `repos/${repository}/actions/runs/${run}`
  const get = (endpoint: string) =>
    call(['api', '--method', 'GET', ...REST_HEADERS, endpoint], TIMEOUT_MS)
  for (;;) {
    const status = record(get(path), 'run')
    if (status.status === 'completed')
      return { run, conclusion: String(status.conclusion ?? 'unknown'), approvals }
    const ids = array(get(`${path}/pending_deployments`), 'pending_deployments')
      .map(item => record(item, 'pending deployment'))
      .filter(item => item.current_user_can_approve === true)
      .map(item => record(item.environment, 'environment'))
      .filter(environment => environments.some(name => name === environment.name))
      .map(environment => environment.id)
      .filter((id): id is number => typeof id === 'number')
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
      approvals.push(ids)
    }
    if (now() >= deadline)
      throw new IntegrationError('unknown', `Run ${run} did not complete within the wait`)
    await sleep(intervalMs)
  }
}
