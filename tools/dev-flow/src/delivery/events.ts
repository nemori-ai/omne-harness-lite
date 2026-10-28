import { InputError } from './protocol.ts'

/** The GitHub events that the receiver forwards and the wait commands understand. */
export const FORWARDED_EVENTS = ['issues', 'pull_request', 'issue_comment'] as const

export type ChannelReceiverIdentity = {
  instanceId: string
  repository: string
  mode: 'channel'
  requiresReconcile: true
}

export type ReceiverDiagnostic = {
  reasonCode: string
  connectionEpoch: number
  coverage: 'coverage-gap'
}

export type EventSubject = {
  runId: number | null
  runAttempt: number | null
  workflowJobId: number | null
  checkRunId: number | null
  checkSuiteId: number | null
  deploymentId: number | null
  deploymentStatusId: number | null
  reviewId: number | null
  pullNumber: number | null
  headSha: string | null
  ref: string | null
}

/** One webhook delivery reduced to the fields the wait commands judge. */
export type EventRecord = {
  /** `X-GitHub-Delivery`; null only when the header is absent, then the record is never deduplicated. */
  delivery: string | null
  event: string
  action: string | null
  number: number | null
  state: string | null
  draft: boolean | null
  /** Base branch of a pull request. */
  base: string | null
  /** Head commit of a pull request, lower case. */
  head: string | null
  /** The name inside the `<!-- ... -->` on the first line of a comment, e.g. `line-delta`. */
  marker: string | null
  html_url: string | null
  /** ISO time at which the receiver accepted the delivery. */
  receivedAt: string
  receiver?: ChannelReceiverIdentity
  diagnostic?: ReceiverDiagnostic
  subject?: EventSubject
}

/** One pull request at one head commit. */
export type PullKey = { number: number; head: string }

export type AtomicPredicate =
  | { kind: 'issue-closed'; issue: number }
  /** `ignore` skips a pull request whose number and head are both listed. */
  | { kind: 'pr-ready'; base: string; ignore?: readonly PullKey[] }
  | { kind: 'comment'; issue: number; marker: string }
export type EventPredicate = AtomicPredicate | { kind: 'any'; of: readonly AtomicPredicate[] }

/** True when `ignore` lists the pull request `number` at `head`. Heads compare in lower case. */
export function pullIgnored(
  ignore: readonly PullKey[] | undefined,
  number: number | null,
  head: string | null,
): boolean {
  return (
    number !== null &&
    head !== null &&
    (ignore ?? []).some(key => key.number === number && key.head.toLowerCase() === head)
  )
}

type Headers = Record<string, string | string[] | undefined>

function headerValue(headers: Headers, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue
    const first = Array.isArray(value) ? value[0] : value
    return first === undefined || first === '' ? undefined : first
  }
  return undefined
}
function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

/**
 * The name in the marker comment on the first line of `body`: `<!-- line-delta -->` and
 * `<!-- line-delta 3 -->` both give `line-delta`. Null when the first line has no such comment.
 */
export function commentMarker(body: string): string | null {
  const first = body.split('\n', 1)[0] ?? ''
  const match = /^\s*<!--\s*(\S+?)(?:\s[\s\S]*?)?\s*-->/.exec(first)
  return match?.[1] ?? null
}

/**
 * Reduces one webhook delivery to an `EventRecord`. The `X-GitHub-Event` header is required.
 * Fields the event does not carry are null. Throws `InputError` for a missing event header
 * or a payload that is not a JSON object.
 */
export function normalizeGithubEvent(
  headers: Headers,
  payload: unknown,
  receivedAt: string = new Date().toISOString(),
): EventRecord {
  const event = headerValue(headers, 'x-github-event'),
    body = object(payload)
  if (event === undefined) throw new InputError('Missing X-GitHub-Event header')
  if (body === undefined) throw new InputError('Webhook payload is not a JSON object')
  const issue = object(body.issue),
    pull = object(body.pull_request),
    comment = object(body.comment)
  const record: EventRecord = {
    delivery: headerValue(headers, 'x-github-delivery') ?? null,
    event,
    action: text(body.action),
    number: null,
    state: null,
    draft: null,
    base: null,
    head: null,
    marker: null,
    html_url: null,
    receivedAt,
  }
  if (event === 'pull_request' && pull !== undefined) {
    record.number = integer(body.number) ?? integer(pull.number)
    record.state = text(pull.state)
    record.draft = typeof pull.draft === 'boolean' ? pull.draft : null
    record.base = text(object(pull.base)?.ref)
    record.head = text(object(pull.head)?.sha)?.toLowerCase() ?? null
    record.html_url = text(pull.html_url)
  } else if (issue !== undefined) {
    record.number = integer(issue.number)
    record.state = text(issue.state)
    record.html_url = text(issue.html_url)
    if (event === 'issue_comment' && comment !== undefined) {
      const commentBody = text(comment.body)
      record.marker = commentBody === null ? null : commentMarker(commentBody)
      record.html_url = text(comment.html_url) ?? record.html_url
    }
  }
  return record
}

/**
 * True when `record` satisfies `predicate`. Only the first delivery of an event can satisfy a
 * comment predicate: `created` counts, `edited` does not. A pull request is ready when it is
 * not a draft and was opened, made ready or got a new head, unless `ignore` lists its head.
 */
export function matchEvent(record: EventRecord, predicate: EventPredicate): boolean {
  return matchedMember(record, predicate) !== undefined
}

/** The atomic predicate that `record` satisfies: `predicate` itself, or the first member of `any`. */
export function matchedMember(
  record: EventRecord,
  predicate: EventPredicate,
): AtomicPredicate | undefined {
  if (predicate.kind === 'any') return predicate.of.find(member => matchAtomic(record, member))
  return matchAtomic(record, predicate) ? predicate : undefined
}

function matchAtomic(record: EventRecord, predicate: AtomicPredicate): boolean {
  switch (predicate.kind) {
    case 'issue-closed':
      return (
        record.event === 'issues' && record.action === 'closed' && record.number === predicate.issue
      )
    case 'pr-ready':
      return (
        record.event === 'pull_request' &&
        (record.action === 'ready_for_review' ||
          ((record.action === 'opened' || record.action === 'synchronize') &&
            record.draft === false)) &&
        record.base === predicate.base &&
        !pullIgnored(predicate.ignore, record.number, record.head)
      )
    case 'comment':
      return (
        record.event === 'issue_comment' &&
        record.action === 'created' &&
        record.number === predicate.issue &&
        record.marker === predicate.marker
      )
  }
}

/** The `code` of a Node.js system error, such as `ENOENT`; undefined when there is none. */
export function errorCode(error: unknown): string | undefined {
  const code = object(error)?.code
  return typeof code === 'string' ? code : undefined
}

/** Reads one JSONL line as an `EventRecord`; undefined for a line that is not one. */
export function parseEventLine(line: string): EventRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  const body = object(value)
  if (body === undefined || typeof body.event !== 'string' || typeof body.receivedAt !== 'string')
    return undefined
  const receiver = parseReceiverIdentity(body.receiver)
  const diagnostic = parseReceiverDiagnostic(body.diagnostic)
  const subject = parseEventSubject(body.subject)
  if (body.receiver !== undefined && receiver === undefined) return undefined
  if (body.diagnostic !== undefined && (diagnostic === undefined || receiver === undefined))
    return undefined
  if (body.subject !== undefined && subject === undefined) return undefined
  return {
    delivery: text(body.delivery),
    event: body.event,
    action: text(body.action),
    number: integer(body.number),
    state: text(body.state),
    draft: typeof body.draft === 'boolean' ? body.draft : null,
    base: text(body.base),
    head: text(body.head),
    marker: text(body.marker),
    html_url: text(body.html_url),
    receivedAt: body.receivedAt,
    ...(receiver === undefined ? {} : { receiver }),
    ...(diagnostic === undefined ? {} : { diagnostic }),
    ...(subject === undefined ? {} : { subject }),
  }
}

function parseEventSubject(value: unknown): EventSubject | undefined {
  const candidate = object(value)
  if (candidate === undefined) return undefined
  const idKeys = [
    'runId',
    'runAttempt',
    'workflowJobId',
    'checkRunId',
    'checkSuiteId',
    'deploymentId',
    'deploymentStatusId',
    'reviewId',
    'pullNumber',
  ] as const
  for (const key of idKeys) {
    const value = candidate[key]
    if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0))
      return undefined
  }
  if (
    candidate.headSha !== null &&
    (typeof candidate.headSha !== 'string' ||
      !/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(candidate.headSha))
  )
    return undefined
  if (candidate.ref !== null && (typeof candidate.ref !== 'string' || candidate.ref.length === 0))
    return undefined
  return {
    runId: integer(candidate.runId),
    runAttempt: integer(candidate.runAttempt),
    workflowJobId: integer(candidate.workflowJobId),
    checkRunId: integer(candidate.checkRunId),
    checkSuiteId: integer(candidate.checkSuiteId),
    deploymentId: integer(candidate.deploymentId),
    deploymentStatusId: integer(candidate.deploymentStatusId),
    reviewId: integer(candidate.reviewId),
    pullNumber: integer(candidate.pullNumber),
    headSha: text(candidate.headSha)?.toLowerCase() ?? null,
    ref: text(candidate.ref),
  }
}

function parseReceiverIdentity(value: unknown): ChannelReceiverIdentity | undefined {
  const candidate = object(value)
  if (
    candidate === undefined ||
    candidate.mode !== 'channel' ||
    candidate.requiresReconcile !== true ||
    typeof candidate.instanceId !== 'string' ||
    candidate.instanceId.trim() === '' ||
    typeof candidate.repository !== 'string' ||
    !/^[\w.-]+\/[\w.-]+$/.test(candidate.repository)
  )
    return undefined
  return {
    instanceId: candidate.instanceId,
    repository: candidate.repository,
    mode: 'channel',
    requiresReconcile: true,
  }
}

function parseReceiverDiagnostic(value: unknown): ReceiverDiagnostic | undefined {
  const candidate = object(value)
  if (
    candidate === undefined ||
    typeof candidate.reasonCode !== 'string' ||
    candidate.reasonCode.trim() === '' ||
    typeof candidate.connectionEpoch !== 'number' ||
    !Number.isSafeInteger(candidate.connectionEpoch) ||
    candidate.connectionEpoch < 0 ||
    candidate.coverage !== 'coverage-gap'
  )
    return undefined
  return {
    reasonCode: candidate.reasonCode,
    connectionEpoch: candidate.connectionEpoch,
    coverage: 'coverage-gap',
  }
}

/** `owner/name` from a Git remote URL of github.com; undefined for any other form. */
export function repositoryFromRemote(url: string): string | undefined {
  const match =
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(
      url.trim(),
    )
  return match?.[1]
}
