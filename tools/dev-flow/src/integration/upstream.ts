import type { Route } from '../delivery/binding.ts'
import { branch, object, sha, IntegrationError } from './parse.ts'
import { activeTrack, parentName, registeredTrack, type Policy, type Track } from './policy.ts'
import { fetchObject, remoteFile, remoteRefs, tagMessage } from './transport.ts'

export const GATE_BRANCH = 'refs/heads/github-gate'
const CUTOVER_PATH = 'gate/cutover.json'
const RECORD_SCHEMA = 'omne-gate-record:v1'

export function startTag(id: string): string {
  return `refs/tags/omne/gate/track/${id}`
}

/**
 * The route's track followed by its upstream tracks, read from the registry up to `main`.
 * Only this chain is checked; other registry entries do not affect the route.
 */
function chainOf(policy: Policy, route: Route): Track[] {
  const target = registeredTrack(policy, route.track)
  if (route.kind !== 'track' && target.parent !== 'main')
    throw new IntegrationError(
      'refused',
      `A ${route.kind} route must name a top-level track; ${target.id} has parent ${target.parent}`,
    )
  const chain = [target]
  for (let track = target; track.parent !== 'main';) {
    const parent = track.parent
    if (chain.some(item => item.id === parent))
      throw new IntegrationError('refused', `Track ${parent} appears twice in the upstream chain`)
    const next = policy.tracks.find(item => item.id === parent)
    if (next === undefined)
      throw new IntegrationError(
        'refused',
        `Upstream track ${parent} of ${track.id} is not registered`,
      )
    chain.push(next)
    track = next
  }
  activeTrack(policy, target.id)
  for (const track of chain.slice(1))
    if (track.status !== 'active' && track.status !== 'paused')
      throw new IntegrationError(
        'refused',
        `Upstream track ${track.id} is ${track.status}; it must be active or paused`,
      )
  return chain
}

/**
 * The JSON object of an `omne-gate-record:v1` tag message, as the gate writes for start and unit
 * tags. `label` names the tag in errors. Both defects are unknown.
 */
export function gateRecord(text: string, label: string): Record<string, unknown> {
  let record: Record<string, unknown>
  try {
    record = object(JSON.parse(text), 'record')
  } catch {
    throw new IntegrationError('unknown', `${label} does not hold a JSON object`)
  }
  if (record.schema !== RECORD_SCHEMA)
    throw new IntegrationError('unknown', `${label} is not an ${RECORD_SCHEMA} record`)
  return record
}

/** The upstream a start tag records; an old tag without `parent` records `main`. */
function tagParent(root: string, policy: Policy, id: string, oid: string): string {
  const text = tagMessage(root, policy.transport.location, oid, policy.timeouts.networkMs)
  const record = gateRecord(text, `Start tag of ${id}`)
  // Same reading as the gate's jq `.parent // "main"`: a missing or null parent is main.
  if (record.parent === undefined || record.parent === null) return 'main'
  try {
    return parentName(record.parent, 'record.parent')
  } catch {
    throw new IntegrationError('unknown', `Start tag of ${id} has an invalid parent`)
  }
}

/**
 * The trusted upstream of a track, in the gate's order: the `parent` of its start tag (`main`
 * when the tag has none), else `main` for a branch in `gate/cutover.json`. A track with neither
 * is refused. `cutover` is read only when the track has no start tag.
 */
export function trustedParent({
  root,
  policy,
  track,
  tag,
  cutover,
}: {
  root: string
  policy: Policy
  track: Track
  /** The object ID of the remote start tag, or undefined without one. */
  tag: string | undefined
  cutover: () => ReadonlyMap<string, string>
}): string {
  if (tag !== undefined) return tagParent(root, policy, track.id, tag)
  if (!cutover().has(track.branch))
    throw new IntegrationError(
      'refused',
      `Track ${track.id} has neither a start tag nor a cutover entry`,
    )
  return 'main'
}

/**
 * The entries of `gate/cutover.json`, from branch name to cutover commit; empty when the gate
 * branch or file is absent.
 */
export function cutoverEntries(
  root: string,
  policy: Policy,
  gate: string | undefined,
): Map<string, string> {
  if (gate === undefined) return new Map()
  const text = remoteFile(
    root,
    policy.transport.location,
    gate,
    CUTOVER_PATH,
    policy.timeouts.networkMs,
  )
  if (text === null) return new Map()
  try {
    const entries = Object.entries(object(JSON.parse(text), CUTOVER_PATH))
    return new Map(
      entries.map(([name, commit]) => [branch(name, CUTOVER_PATH), sha(commit, CUTOVER_PATH)]),
    )
  } catch {
    throw new IntegrationError(
      'unknown',
      `${CUTOVER_PATH} is not an object from branch names to commits`,
    )
  }
}
/**
 * I14: checks the route's track and its upstream chain before a start, and returns the target
 * branch and its current remote commit, fetched locally. The trusted upstream is the start tag's
 * `parent`, else `main` for a branch registered in `gate/cutover.json`, else the start is refused.
 */
export function checkUpstream(
  root: string,
  policy: Policy,
  route: Route,
): { ref: string; head: string } {
  const chain = chainOf(policy, route),
    { location } = policy.transport,
    timeout = policy.timeouts.networkMs
  const refs = remoteRefs(root, location, timeout, [
    ...chain.flatMap(track => [`refs/heads/${track.branch}`, startTag(track.id)]),
    GATE_BRANCH,
  ])
  for (const track of chain)
    if (!refs.has(`refs/heads/${track.branch}`))
      throw new IntegrationError('refused', `Remote branch ${track.branch} does not exist`)
  let cutover: ReadonlyMap<string, string> | undefined
  for (const track of chain) {
    const trusted = trustedParent({
      root,
      policy,
      track,
      tag: refs.get(startTag(track.id)),
      cutover: () => (cutover ??= cutoverEntries(root, policy, refs.get(GATE_BRANCH))),
    })
    if (trusted !== track.parent)
      throw new IntegrationError(
        'refused',
        `Registry parent ${track.parent} of ${track.id} differs from the trusted upstream ${trusted}`,
      )
  }
  const target = chain[0]
  if (target === undefined) throw new IntegrationError('invariant', 'Empty upstream chain')
  const ref = `refs/heads/${target.branch}`,
    head = refs.get(ref)
  if (head === undefined) throw new IntegrationError('invariant', `Lost remote ${ref}`)
  fetchObject(root, location, head, timeout)
  return { ref, head }
}
