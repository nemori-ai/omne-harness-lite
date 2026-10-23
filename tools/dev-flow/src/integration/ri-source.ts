import { readCardAttributes } from '../delivery/attributes.ts'
import { readTaskBinding } from '../delivery/binding.ts'
import type { GhCommand } from '../delivery/github-read.ts'
import { LINES_PATH, parseDeliveryLines } from '../delivery/lines.ts'
import { array, milestoneOf, record, text } from '../delivery/protocol.ts'
import { git, lines, maybeBlob, repository } from './git.ts'
import { integer, json, object, sha, string, IntegrationError } from './parse.ts'
import { POLICY_PATH, parsePolicy, registeredTrack, type Policy } from './policy.ts'
import type {
  CardRead,
  ContractDiff,
  PullRead,
  RiInput,
  TrackCommit,
  UnitRecord,
} from './ri-notes.ts'
import { fetchObject, remoteRefs, tagMessage } from './transport.ts'
import { cutoverEntries, GATE_BRANCH, RECORD_SCHEMA, startTag } from './upstream.ts'

const UNIT_PREFIX = 'refs/tags/omne/gate/unit/'
const HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
]
const GH_TIMEOUT_MS = 15_000

/** Fetches every listed object that is missing locally, in one fetch. */
function fetchMissing(root: string, location: string, oids: readonly string[], timeoutMs: number) {
  if (oids.length === 0) return
  const missing = lines(git(root, ['cat-file', '--batch-check'], `${oids.join('\n')}\n`))
    .filter(line => line.endsWith(' missing'))
    .map(line => sha(line.split(' ')[0]))
  if (missing.length > 0)
    git(root, ['fetch', '--no-tags', '--', location, ...missing], undefined, timeoutMs)
}
export function parseUnitRecord(text: string): UnitRecord {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new IntegrationError('unknown', 'The tag message is not JSON')
  }
  const v = object(value, 'unit record')
  if (v.schema !== RECORD_SCHEMA)
    throw new IntegrationError('unknown', `The tag message is not an ${RECORD_SCHEMA} record`)
  return {
    target: string(v.target, 'unit.target'),
    result: sha(v.result, 'unit.result'),
    pr: v.pr === undefined || v.pr === null ? null : integer(v.pr, 'unit.pr'),
  }
}

/**
 * Reads the Git facts of one track: its remote head, its parent's head, the check lower bound
 * and every first-parent commit the parent does not contain, oldest first, with its unit record.
 */
export function trackFacts(root: string, policy: Policy, trackId: string) {
  const track = registeredTrack(policy, trackId),
    parentBranch = track.parent === 'main' ? 'main' : registeredTrack(policy, track.parent).branch,
    { location } = policy.transport,
    timeout = policy.timeouts.networkMs
  const refs = remoteRefs(root, location, timeout, [
    `refs/heads/${track.branch}`,
    `refs/heads/${parentBranch}`,
    startTag(track.id),
    GATE_BRANCH,
    `${UNIT_PREFIX}*`,
  ])
  const head = refs.get(`refs/heads/${track.branch}`),
    parentHead = refs.get(`refs/heads/${parentBranch}`)
  if (head === undefined)
    throw new IntegrationError('refused', `Remote branch ${track.branch} does not exist`)
  if (parentHead === undefined)
    throw new IntegrationError('refused', `Remote branch ${parentBranch} does not exist`)
  fetchMissing(root, location, [head, parentHead], timeout)
  let lowerBound: RiInput['lowerBound'] = null
  const cutover = cutoverEntries(root, policy, refs.get(GATE_BRANCH)).get(track.branch),
    tag = refs.get(startTag(track.id))
  if (cutover !== undefined) {
    fetchObject(root, location, cutover, timeout)
    lowerBound = { commit: cutover, source: 'cutover' }
  } else if (tag !== undefined) {
    fetchObject(root, location, tag, timeout)
    lowerBound = { commit: sha(git(root, ['rev-parse', `${tag}^{commit}`])), source: 'start-tag' }
  }
  const range = lines(
    git(root, ['rev-list', '--first-parent', '--reverse', head, `^${parentHead}`]),
  )
  const checked = new Set(
    lowerBound === null
      ? range
      : lines(git(root, ['rev-list', '--first-parent', head, `^${lowerBound.commit}`])),
  )
  const subjects = new Map(
    lines(
      git(root, ['log', '--no-walk=unsorted', '--format=%H%x00%s', '--stdin'], range.join('\n')),
    ).map(line => {
      const [commit = '', subject = ''] = line.split('\0')
      return [commit, subject]
    }),
  )
  const units = new Map(
    [...refs]
      .filter(([ref]) => ref.startsWith(UNIT_PREFIX))
      .map(([ref, oid]) => [ref.slice(UNIT_PREFIX.length), oid]),
  )
  fetchMissing(
    root,
    location,
    range.flatMap(commit => {
      const oid = units.get(commit)
      return oid === undefined ? [] : [oid]
    }),
    timeout,
  )
  const commits = range.map((commit): TrackCommit => {
    const oid = units.get(commit)
    let unit: TrackCommit['unit'] = { kind: 'missing' }
    if (oid !== undefined)
      try {
        unit = { kind: 'found', record: parseUnitRecord(tagMessage(root, location, oid, timeout)) }
      } catch (error) {
        unit = { kind: 'invalid', reason: error instanceof Error ? error.message : String(error) }
      }
    return {
      commit,
      subject: subjects.get(commit) ?? '',
      coverage: checked.has(commit) ? 'checked' : 'before-lower-bound',
      unit,
    }
  })
  return {
    track,
    head,
    parent: { name: track.parent, branch: parentBranch, head: parentHead },
    lowerBound,
    commits,
  }
}

function failure(error: unknown): string {
  return error instanceof IntegrationError
    ? error.message
    : 'GitHub read failed. API output omitted.'
}
/** Reads one PR through `gh api`; any failure is an unreadable PR, never a thrown error. */
export function pullReader(repository: string, call: GhCommand): (n: number) => PullRead {
  return number => {
    try {
      const raw = record(
        call(
          ['api', '--method', 'GET', ...HEADERS, `repos/${repository}/pulls/${number}`],
          GH_TIMEOUT_MS,
        ),
        'PR',
      )
      const url = `https://github.com/${repository}/pull/${number}`
      if (raw.number !== number || raw.html_url !== url)
        return { kind: 'unreadable', reason: 'PR identity mismatch' }
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
    } catch (error) {
      return { kind: 'unreadable', reason: failure(error) }
    }
  }
}
/** Reads one card through `gh api`: its attributes and, when readable, its binding. */
export function cardReader(repository: string, call: GhCommand): (n: number) => CardRead {
  return number => {
    try {
      const raw = record(
        call(
          ['api', '--method', 'GET', ...HEADERS, `repos/${repository}/issues/${number}`],
          GH_TIMEOUT_MS,
        ),
        'Issue',
      )
      const url = `https://github.com/${repository}/issues/${number}`
      if ('pull_request' in raw || raw.number !== number || raw.html_url !== url)
        return { kind: 'unreadable', reason: 'Issue identity mismatch or pull request' }
      const body = raw.body === null ? '' : text(raw.body, 'Issue.body')
      let binding: { revision: number; attempt: string } | undefined
      try {
        const found = readTaskBinding(body, {
          repository,
          id: text(raw.node_id, 'Issue.node_id'),
          number,
          url,
        })
        if (found !== undefined) binding = { revision: found.revision, attempt: found.attempt }
      } catch {
        binding = undefined
      }
      return {
        kind: 'read',
        card: {
          url,
          binding,
          attributes: readCardAttributes(body, {
            url,
            labels: array(raw.labels, 'Issue.labels').map(item =>
              text(record(item, 'label').name, 'label.name'),
            ),
            ...milestoneOf(raw),
          }),
        },
      }
    } catch (error) {
      return { kind: 'unreadable', reason: failure(error) }
    }
  }
}

/** The C4 port before P1-2 (#645) delivers contract API snapshots. */
export const NO_CONTRACT_DIFF: ContractDiff = {
  kind: 'unavailable',
  reason:
    'P1-2（#645）的契约 API 快照尚未进入本轨道，「契约变化」只汇总 PR 声明，未与快照差异核对。',
}

/**
 * Collects every input of `riNotes` for one track. The registry and the line table come from
 * the HEAD commit of `root`, like `start`.
 */
export function riInput({
  root,
  track,
  call,
  contractDiff = NO_CONTRACT_DIFF,
}: {
  root: string
  track: string
  call: GhCommand
  contractDiff?: ContractDiff
}): RiInput {
  const info = repository(root)
  const read = (path: string) => {
    const file = maybeBlob(info.root, info.head, path)
    if (file === null) throw new IntegrationError('unknown', `Committed ${path} is missing`)
    return json(file.text, path)
  }
  const policy = parsePolicy(read(POLICY_PATH)),
    table = parseDeliveryLines(read(LINES_PATH)),
    facts = trackFacts(info.root, policy, track)
  return {
    repository: policy.repository,
    ...facts,
    lines: table,
    registry: policy,
    readPull: pullReader(policy.repository, call),
    readCard: cardReader(policy.repository, call),
    contractDiff,
  }
}
