import type { Route } from '../delivery/binding.ts'
import { branch, object, sha, IntegrationError } from './parse.ts'
import { activeTrack, parentName, registeredTrack, type Policy, type Track } from './policy.ts'
import { fetchObject, remoteFile, remoteRefs, tagMessage } from './transport.ts'

const GATE_BRANCH = 'refs/heads/github-gate'
const CUTOVER_PATH = 'gate/cutover.json'
const RECORD_SCHEMA = 'omne-gate-record:v1'

function startTag(id: string): string {
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

/** The upstream a start tag records; an old tag without `parent` records `main`. */
function tagParent(root: string, policy: Policy, id: string, oid: string): string {
  const text = tagMessage(root, policy.transport.location, oid, policy.timeouts.networkMs)
  let record: Record<string, unknown>
  try {
    record = object(JSON.parse(text), 'record')
  } catch {
    throw new IntegrationError('unknown', `Start tag of ${id} does not hold a JSON object`)
  }
  if (record.schema !== RECORD_SCHEMA)
    throw new IntegrationError('unknown', `Start tag of ${id} is not an ${RECORD_SCHEMA} record`)
  if (!Object.hasOwn(record, 'parent')) return 'main'
  try {
    return parentName(record.parent, 'record.parent')
  } catch {
    throw new IntegrationError('unknown', `Start tag of ${id} has an invalid parent`)
  }
}

/** Branch names registered in `gate/cutover.json`; empty when the gate branch or file is absent. */
function cutoverBranches(root: string, policy: Policy, gate: string | undefined): Set<string> {
  if (gate === undefined) return new Set()
  const text = remoteFile(
    root,
    policy.transport.location,
    gate,
    CUTOVER_PATH,
    policy.timeouts.networkMs,
  )
  if (text === null) return new Set()
  try {
    const entries = Object.entries(object(JSON.parse(text), CUTOVER_PATH))
    for (const [name, commit] of entries) {
      branch(name, CUTOVER_PATH)
      sha(commit, CUTOVER_PATH)
    }
    return new Set(entries.map(([name]) => name))
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
  let cutover: Set<string> | undefined
  for (const track of chain) {
    const tag = refs.get(startTag(track.id))
    let trusted: string
    if (tag !== undefined) trusted = tagParent(root, policy, track.id, tag)
    else {
      cutover ??= cutoverBranches(root, policy, refs.get(GATE_BRANCH))
      if (!cutover.has(track.branch))
        throw new IntegrationError(
          'refused',
          `Track ${track.id} has neither a start tag nor a cutover entry`,
        )
      trusted = 'main'
    }
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
