import {
  array,
  branch,
  choice,
  fields,
  integer,
  literal,
  safePath,
  sha,
  string,
  IntegrationError,
} from './parse.ts'

export const POLICY_PATH = 'docs/engineering/integration-policy.json'
/** Trunk and gate branch names. A track with one of these IDs would make `parent` ambiguous. */
const RESERVED = ['main', 'stable', 'release', 'github-gate']
/** A one-segment track ID that is not a reserved name. */
function trackId(value: unknown, path: string): string {
  const id = branch(value, path)
  if (id.includes('/')) throw new IntegrationError('input-error', `${path} must be one segment`)
  if (RESERVED.includes(id)) throw new IntegrationError('input-error', `${path} is a reserved name`)
  return id
}
/** An upstream name: `main` or the ID of another track. */
export function parentName(value: unknown, path: string): string {
  return value === 'main' ? 'main' : trackId(value, path)
}
export type Track = ReturnType<typeof parseTrack>
function parseTrack(value: unknown) {
  const v = fields(
    value,
    ['id', 'branch', 'owner', 'source', 'status', 'parent', 'initialBase'],
    'track',
  )
  const id = trackId(v.id, 'track.id'),
    parent = parentName(v.parent, 'track.parent')
  if (parent === id)
    throw new IntegrationError('input-error', `Track ${id} cannot be its own parent`)
  return {
    id,
    branch: literal(v.branch, `integration/${id}`, 'track.branch'),
    owner: string(v.owner, 'track.owner'),
    source: string(v.source, 'track.source'),
    status: choice(v.status, ['active', 'paused', 'retiring', 'retired'], 'track.status'),
    parent,
    initialBase: sha(v.initialBase, 'track.initialBase'),
  }
}
export type Policy = ReturnType<typeof parsePolicy>
/** Parses the policy registry. Unknown or retired fields are refused, not ignored. */
export function parsePolicy(value: unknown) {
  const v = fields(
    value,
    [
      'schemaVersion',
      'revision',
      'repository',
      'deliveryConfig',
      'tracks',
      'transport',
      'timeouts',
    ],
    'policy',
  )
  const tracks = array(v.tracks, 'tracks').map(parseTrack)
  if (new Set(tracks.map(track => track.id)).size !== tracks.length)
    throw new IntegrationError('input-error', 'Duplicate track')
  const t = fields(v.timeouts, ['networkMs'], 'timeouts')
  const transport = fields(v.transport, ['kind', 'location'], 'transport')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    revision: string(v.revision, 'revision'),
    repository: string(v.repository, 'repository'),
    deliveryConfig: safePath(v.deliveryConfig, 'deliveryConfig'),
    tracks,
    timeouts: { networkMs: integer(t.networkMs, 'networkMs') },
    transport: {
      kind: choice(transport.kind, ['remote', 'local-bare'], 'transport.kind'),
      location: string(transport.location, 'transport.location'),
    },
  }
}
/** A registered track in any status; refuses an unregistered ID. */
export function registeredTrack(policy: Policy, id: string): Track {
  const track = policy.tracks.find(item => item.id === id)
  if (track === undefined) throw new IntegrationError('refused', `Track ${id} is not registered`)
  return track
}
export function activeTrack(policy: Policy, id: string): Track {
  const track = registeredTrack(policy, id)
  if (track.status !== 'active')
    throw new IntegrationError('refused', `Track ${id} is not active and registered`)
  return track
}
