import { execFileSync } from 'node:child_process'
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
/** The `pr-ready` reconcile reads only this many open pull requests of the base branch. */
const PR_LIST_LIMIT = 200

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
 * `since` is an ISO time on the GitHub clock: only comments created at or after it count.
 * `seen` holds the ids of comments that the caller has handled; they never count. Absent: none.
 */
export type Reconcile = (
  predicate: AtomicPredicate,
  since: string | undefined,
  seen?: ReadonlySet<string>,
) => EventRecord | undefined | Promise<EventRecord | undefined>

/** The comment id at the end of a comment URL, `...#issuecomment-<id>`; undefined for any other URL. */
export function commentIdOf(htmlUrl: string | null): string | undefined {
  return htmlUrl === null ? undefined : /#issuecomment-(\d+)$/.exec(htmlUrl)?.[1]
}

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
  return (predicate, since, seen = new Set()) => {
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
              '--limit',
              String(PR_LIST_LIMIT),
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
        // The API lists comments oldest first; the first one that counts is the oldest unhandled.
        const first = pages
          .flatMap(page => array(page, 'comment page'))
          .map(item => record(item, 'comment'))
          .find(comment => {
            const created = Date.parse(text(comment.created_at, 'comment.created_at'))
            const id = commentIdOf(typeof comment.html_url === 'string' ? comment.html_url : null)
            return (
              commentMarker(typeof comment.body === 'string' ? comment.body : '') ===
                predicate.marker &&
              (after === undefined || created >= after) &&
              (id === undefined || !seen.has(id))
            )
          })
        return first === undefined
          ? undefined
          : synthetic({
              event: 'issue_comment',
              action: 'created',
              number: predicate.issue,
              marker: predicate.marker,
              html_url: text(first.html_url, 'comment.html_url'),
            })
      }
    }
  }
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
