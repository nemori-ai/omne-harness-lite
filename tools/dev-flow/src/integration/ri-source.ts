import { readTaskBinding } from '../delivery/binding.ts'
import {
  GhReadError,
  readIssueCard,
  REST_HEADERS,
  runGhRead,
  type GhRead,
} from '../delivery/github-read.ts'
import { LINES_PATH, parseDeliveryLines } from '../delivery/lines.ts'
import { InputError, record, text } from '../delivery/protocol.ts'
import { ancestor, git, GitError, lines, maybeBlob, repository } from './git.ts'
import { integer, json, sha, string, IntegrationError } from './parse.ts'
import { POLICY_PATH, parsePolicy, registeredTrack, type Policy } from './policy.ts'
import type {
  CardBinding,
  CardRead,
  CommitUnit,
  ContractDiffProvider,
  LowerBound,
  PullRead,
  RiInput,
  TrackCommit,
  TrackFacts,
  UnitRecord,
} from './ri-notes.ts'
import { fetchObject, fetchObjects, remoteRefs, tagMessage } from './transport.ts'
import { cutoverEntries, GATE_BRANCH, gateRecord, startTag, trustedParent } from './upstream.ts'

const UNIT_PREFIX = 'refs/tags/omne/gate/unit/'

function unitRecord(text: string, commit: string): UnitRecord {
  const v = gateRecord(text, `Unit tag of ${commit}`)
  return {
    target: string(v.target, 'unit.target'),
    result: sha(v.result, 'unit.result'),
    pr: v.pr === undefined || v.pr === null ? null : integer(v.pr, 'unit.pr'),
  }
}
/** A unit tag's record. A Git failure propagates; a tag or record defect is an invalid unit. */
export function readUnit(root: string, policy: Policy, commit: string, oid: string): CommitUnit {
  let message: string
  try {
    message = tagMessage(root, policy.transport.location, oid, policy.timeouts.networkMs)
  } catch (error) {
    if (error instanceof GitError || !(error instanceof IntegrationError)) throw error
    return { kind: 'invalid', reason: error.message }
  }
  try {
    return { kind: 'found', record: unitRecord(message, commit) }
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
    return { kind: 'invalid', reason: error.message }
  }
}
function shas(output: string): string[] {
  return lines(output).map(line => sha(line, 'rev-list'))
}
/** `%H NUL %s` lines of `git log`, refused unless each line has both fields. */
function subjects(root: string, commits: readonly string[]): Map<string, string> {
  if (commits.length === 0) return new Map()
  const output = git(
    root,
    ['log', '--no-walk=unsorted', '--format=%H%x00%s', '--stdin'],
    `${commits.join('\n')}\n`,
  )
  return new Map(
    lines(output).map(line => {
      const parts = line.split('\0')
      if (parts.length !== 2) throw new IntegrationError('unknown', 'Unexpected git log line')
      return [sha(parts[0], 'git log'), parts[1] ?? '']
    }),
  )
}

/**
 * The gate's check lower bound: the cutover commit, else the commit of the start tag, else none.
 * Each is fetched when missing and judged against the track head.
 */
function lowerBoundOf({
  root,
  policy,
  head,
  cutover,
  tag,
}: {
  root: string
  policy: Policy
  head: string
  cutover: string | undefined
  tag: string | undefined
}): LowerBound | null {
  const { location } = policy.transport,
    timeout = policy.timeouts.networkMs
  if (cutover !== undefined) {
    fetchObject(root, location, cutover, timeout)
    return { commit: cutover, source: 'cutover', ancestor: ancestor(root, cutover, head) }
  }
  if (tag === undefined) return null
  fetchObject(root, location, tag, timeout)
  const commit = sha(git(root, ['rev-parse', `${tag}^{commit}`]))
  return { commit, source: 'start-tag', ancestor: ancestor(root, commit, head) }
}

/**
 * Reads the Git facts of one track. Its upstream is the trusted one, in the gate's order. The
 * range is every first-parent commit of the track that the upstream does not contain, oldest
 * first, each with its unit record. The lower bound follows the gate: the cutover entry first,
 * else the start tag's commit.
 */
export function trackFacts(root: string, policy: Policy, trackId: string): TrackFacts {
  const track = registeredTrack(policy, trackId),
    { location } = policy.transport,
    timeout = policy.timeouts.networkMs
  const refs = remoteRefs(root, location, timeout, [
    `refs/heads/${track.branch}`,
    startTag(track.id),
    GATE_BRANCH,
    `${UNIT_PREFIX}*`,
  ])
  const head = refs.get(`refs/heads/${track.branch}`)
  if (head === undefined)
    throw new IntegrationError('refused', `Remote branch ${track.branch} does not exist`)
  let cutover: ReadonlyMap<string, string> | undefined
  const readCutover = () => (cutover ??= cutoverEntries(root, policy, refs.get(GATE_BRANCH)))
  const tag = refs.get(startTag(track.id)),
    parentName = trustedParent({ root, policy, track, tag, cutover: readCutover }),
    parentBranch = parentName === 'main' ? 'main' : `integration/${parentName}`
  const parentHead = remoteRefs(root, location, timeout, `refs/heads/${parentBranch}`).get(
    `refs/heads/${parentBranch}`,
  )
  if (parentHead === undefined)
    throw new IntegrationError('refused', `Remote branch ${parentBranch} does not exist`)
  fetchObjects(root, location, [head, parentHead], timeout)

  const lowerBound = lowerBoundOf({
    root,
    policy,
    head,
    cutover: readCutover().get(track.branch),
    tag,
  })
  const range = shas(git(root, ['rev-list', '--first-parent', '--reverse', head, `^${parentHead}`]))
  const checked = new Set(
    lowerBound === null || !lowerBound.ancestor
      ? range
      : shas(git(root, ['rev-list', '--first-parent', head, `^${lowerBound.commit}`])),
  )
  const subject = subjects(root, range)
  const units = new Map(
    [...refs]
      .filter(([ref]) => ref.startsWith(UNIT_PREFIX))
      .map(([ref, oid]) => [ref.slice(UNIT_PREFIX.length), oid]),
  )
  fetchObjects(
    root,
    location,
    range.flatMap(commit => units.get(commit) ?? []),
    timeout,
  )
  const commits = range.map((commit): TrackCommit => {
    const oid = units.get(commit),
      title = subject.get(commit)
    if (title === undefined)
      throw new IntegrationError('unknown', `git log did not list commit ${commit}`)
    return {
      commit,
      subject: title,
      coverage: checked.has(commit) ? 'checked' : 'before-lower-bound',
      unit: oid === undefined ? { kind: 'missing' } : readUnit(root, policy, commit, oid),
    }
  })
  return {
    track,
    head,
    parent: { name: parentName, branch: parentBranch, head: parentHead },
    registryParent: track.parent,
    mergeBase: sha(git(root, ['merge-base', head, parentHead])),
    lowerBound,
    commits,
  }
}

/** The known failures of one read; anything else is a defect and propagates. */
function readFailure(error: unknown): string | undefined {
  if (error instanceof InputError || error instanceof IntegrationError) return error.message
  if (error instanceof GhReadError) return error.message
  return undefined
}
function bindingOf(
  issue: Record<string, unknown>,
  body: string,
  identity: { repository: string; number: number; url: string },
): CardBinding {
  try {
    const found = readTaskBinding(body, { ...identity, id: text(issue.node_id, 'Issue.node_id') })
    return found === undefined
      ? { kind: 'absent' }
      : { kind: 'found', revision: found.revision, attempt: found.attempt }
  } catch (error) {
    const reason = readFailure(error)
    if (reason === undefined) throw error
    return { kind: 'invalid', reason }
  }
}
/**
 * Reads PRs and cards through `gh api`. A known read failure becomes an unreadable result with
 * its message; any other error propagates.
 */
export function githubReaders({
  repository,
  read,
  timeoutMs,
}: {
  repository: string
  read: GhRead
  timeoutMs: number
}): Pick<RiInput, 'readPull' | 'readCard'> {
  const get = (path: string) => read(['api', '--method', 'GET', ...REST_HEADERS, path], timeoutMs)
  function guarded<T>(attempt: () => T, unreadable: (reason: string) => T): T {
    try {
      return attempt()
    } catch (error) {
      const reason = readFailure(error)
      if (reason === undefined) throw error
      return unreadable(reason)
    }
  }
  return {
    readPull: number =>
      guarded<PullRead>(
        () => {
          const raw = record(get(`repos/${repository}/pulls/${number}`), 'PR'),
            url = `https://github.com/${repository}/pull/${number}`
          if (raw.number !== number || raw.html_url !== url)
            throw new InputError('PR identity mismatch')
          return {
            kind: 'read',
            pull: {
              number,
              url,
              headRef: text(record(raw.head, 'PR.head').ref, 'PR.head.ref'),
              baseRef: text(record(raw.base, 'PR.base').ref, 'PR.base.ref'),
              body: raw.body === null ? '' : text(raw.body, 'PR.body'),
            },
          }
        },
        reason => ({ kind: 'unreadable', reason }),
      ),
    readCard: number =>
      guarded<CardRead>(
        () => {
          const card = readIssueCard(
            get(`repos/${repository}/issues/${number}`),
            repository,
            number,
          )
          return {
            kind: 'read',
            card: {
              url: card.url,
              attributes: card.attributes,
              binding: bindingOf(card.issue, card.body, { repository, number, url: card.url }),
            },
          }
        },
        reason => ({ kind: 'unreadable', reason }),
      ),
  }
}

/**
 * Collects every input of `riNotes` for one track. The registry and the line table come from
 * the HEAD commit of `root`, like `start`.
 */
export function riInput({
  root,
  track,
  read = runGhRead,
  contractDiffProvider,
}: {
  root: string
  track: string
  read?: GhRead
  contractDiffProvider: ContractDiffProvider
}): RiInput {
  const info = repository(root)
  const committed = (path: string) => {
    const file = maybeBlob(info.root, info.head, path)
    if (file === null) throw new IntegrationError('unknown', `Committed ${path} is missing`)
    return json(file.text, path)
  }
  const policy = parsePolicy(committed(POLICY_PATH))
  return {
    ...trackFacts(info.root, policy, track),
    repository: policy.repository,
    lines: parseDeliveryLines(committed(LINES_PATH)),
    registry: policy,
    ...githubReaders({ repository: policy.repository, read, timeoutMs: policy.timeouts.networkMs }),
    diffContracts: contractDiffProvider({ root: info.root, timeoutMs: policy.timeouts.networkMs }),
  }
}
