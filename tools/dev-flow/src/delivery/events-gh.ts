import { execFileSync, spawn } from 'node:child_process'
import {
  commentMarker,
  FORWARDED_EVENTS,
  pullIgnored,
  repositoryFromRemote,
  type AtomicPredicate,
  type EventRecord,
} from './events.ts'
import { REST_HEADERS, type GhCommand } from './github-read.ts'
import { array, InputError, record, text } from './protocol.ts'

/** Runs one `gh` command and returns its stdout. An empty stdout is a valid answer. */
export type GhText = (argv: readonly string[], timeoutMs: number) => string
export const runGhText: GhText = (argv, timeoutMs) =>
  execFileSync('gh', [...argv], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

const GH_TIMEOUT_MS = 15_000
const FORWARDER_URL_PREFIX = 'https://webhook-forwarder.github.com/'

/** `owner/name` of the `origin` remote of the current checkout. */
export function originRepository(): string {
  let url: string
  try {
    url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
    })
  } catch {
    throw new InputError('Cannot read the origin remote. Pass --repo <owner/name>.')
  }
  const repository = repositoryFromRemote(url)
  if (repository === undefined)
    throw new InputError('The origin remote is not a github.com repository. Pass --repo.')
  return repository
}

/**
 * A one-time read of GitHub that tells whether the atomic predicate already holds. It returns a
 * record that describes the satisfied state, or undefined when the state does not hold.
 * `since` is an ISO time that limits comments.
 */
export type Reconcile = (
  predicate: AtomicPredicate,
  since: string | undefined,
) => EventRecord | undefined | Promise<EventRecord | undefined>

function synthetic(fields: Partial<EventRecord> & { event: string }): EventRecord {
  return {
    delivery: null,
    action: null,
    number: null,
    state: null,
    draft: null,
    base: null,
    head: null,
    marker: null,
    html_url: null,
    receivedAt: new Date().toISOString(),
    ...fields,
  }
}

/** The reconcile reads of the three predicates, each one `gh` call. */
export function githubReconcile(repository: string, call: GhCommand): Reconcile {
  return (predicate, since) => {
    switch (predicate.kind) {
      case 'issue-closed': {
        const view = record(
          call(
            ['issue', 'view', String(predicate.issue), '--repo', repository, '--json', 'state'],
            GH_TIMEOUT_MS,
          ),
          'issue view',
        )
        return view.state === 'CLOSED'
          ? synthetic({
              event: 'issues',
              action: 'closed',
              number: predicate.issue,
              state: 'closed',
              html_url: `https://github.com/${repository}/issues/${predicate.issue}`,
            })
          : undefined
      }
      case 'pr-ready': {
        const pulls = array(
          call(
            [
              'pr',
              'list',
              '--repo',
              repository,
              '--base',
              predicate.base,
              '--state',
              'open',
              '--json',
              'number,isDraft,headRefOid',
            ],
            GH_TIMEOUT_MS,
          ),
          'pr list',
        ).map(item => record(item, 'pull request'))
        const ready = pulls.find(pull => {
          const head = typeof pull.headRefOid === 'string' ? pull.headRefOid.toLowerCase() : null
          return (
            pull.isDraft === false &&
            typeof pull.number === 'number' &&
            !pullIgnored(predicate.ignore, pull.number, head)
          )
        })
        return ready === undefined || typeof ready.number !== 'number'
          ? undefined
          : synthetic({
              event: 'pull_request',
              action: 'ready_for_review',
              number: ready.number,
              state: 'open',
              draft: false,
              base: predicate.base,
              head: typeof ready.headRefOid === 'string' ? ready.headRefOid.toLowerCase() : null,
              html_url: `https://github.com/${repository}/pull/${ready.number}`,
            })
      }
      case 'comment': {
        const query = since === undefined ? '' : `?since=${encodeURIComponent(since)}`
        const pages = array(
          call(
            [
              'api',
              '--method',
              'GET',
              ...REST_HEADERS,
              '--paginate',
              '--slurp',
              `repos/${repository}/issues/${predicate.issue}/comments${query}`,
            ],
            GH_TIMEOUT_MS * 4,
          ),
          'comment pages',
        )
        const after = since === undefined ? undefined : Date.parse(since)
        const hits = pages
          .flatMap(page => array(page, 'comment page'))
          .map(item => record(item, 'comment'))
          .filter(comment => {
            const created = Date.parse(text(comment.created_at, 'comment.created_at'))
            return (
              commentMarker(typeof comment.body === 'string' ? comment.body : '') ===
                predicate.marker &&
              (after === undefined || created > after)
            )
          })
        const last = hits.at(-1)
        return last === undefined
          ? undefined
          : synthetic({
              event: 'issue_comment',
              action: 'created',
              number: predicate.issue,
              marker: predicate.marker,
              html_url: text(last.html_url, 'comment.html_url'),
            })
      }
    }
  }
}

/** Ids of the repository hooks that `gh webhook forward` created: name `cli`, forwarder URL. */
export function listForwarderHooks(repository: string, gh: GhText): number[] {
  const pages = array(
    JSON.parse(
      gh(
        ['api', '--method', 'GET', '--paginate', '--slurp', `repos/${repository}/hooks`],
        GH_TIMEOUT_MS * 4,
      ),
    ),
    'hook pages',
  )
  return pages
    .flatMap(page => array(page, 'hook page'))
    .map(item => record(item, 'hook'))
    .filter(hook => {
      const url = record(hook.config ?? {}, 'hook.config').url
      return hook.name === 'cli' && typeof url === 'string' && url.startsWith(FORWARDER_URL_PREFIX)
    })
    .flatMap(hook => (typeof hook.id === 'number' ? [hook.id] : []))
}

/** Ids in `current` that are not in `before`. */
export function newHooks(current: readonly number[], before: readonly number[]): number[] {
  return current.filter(id => !before.includes(id))
}

/** Deletes the hooks one by one and returns the ids whose deletion failed. */
export function deleteHooks(repository: string, ids: readonly number[], gh: GhText): number[] {
  return ids.filter(id => {
    try {
      gh(['api', '--method', 'DELETE', `repos/${repository}/hooks/${id}`], GH_TIMEOUT_MS)
      return false
    } catch {
      return true
    }
  })
}

/**
 * Deletes every forwarder hook of the repository, whoever created it, and returns the ids
 * deleted and the ids that could not be deleted. It stops the forwarders of other receivers.
 */
export function cleanForwarderHooks(
  repository: string,
  gh: GhText,
): { deleted: number[]; failed: number[] } {
  const ids = listForwarderHooks(repository, gh)
  const failed = deleteHooks(repository, ids, gh)
  return { deleted: ids.filter(id => !failed.includes(id)), failed }
}

/** A running forwarder: `exited` resolves with its exit code, `stop` ends it and waits. */
export type ForwardProcess = { exited: Promise<number | null>; stop: () => Promise<void> }
export type SpawnForward = (args: {
  repository: string
  port: number
  secret: string | undefined
}) => ForwardProcess

/** Argument list of `gh webhook forward` for the three forwarded events. */
export function forwardArgv(args: {
  repository: string
  port: number
  secret: string | undefined
}): string[] {
  return [
    'webhook',
    'forward',
    '--repo',
    args.repository,
    '--events',
    FORWARDED_EVENTS.join(','),
    '--url',
    `http://127.0.0.1:${args.port}`,
    ...(args.secret === undefined ? [] : ['-S', args.secret]),
  ]
}

const STOP_GRACE_MS = 5000

/** Starts `gh webhook forward` as a child that the caller owns. Its output goes to stderr. */
export const spawnGhForward: SpawnForward = args => {
  const child = spawn('gh', forwardArgv(args), { stdio: ['ignore', 2, 2], shell: false })
  let done = false
  const exited = new Promise<number | null>(resolve => {
    child.once('error', () => {
      done = true
      resolve(null)
    })
    child.once('exit', code => {
      done = true
      resolve(code)
    })
  })
  return {
    exited,
    stop: async () => {
      if (done) return
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS)
      await exited
      clearTimeout(timer)
    },
  }
}
