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
export type Track = ReturnType<typeof parseTrack>
function parseTrack(value: unknown) {
  const v = fields(value, ['id', 'branch', 'owner', 'source', 'status', 'initialMain'], 'track')
  const id = branch(v.id, 'track.id')
  if (id.includes('/')) throw new IntegrationError('input-error', 'Track ID must be one segment')
  return {
    id,
    branch: literal(v.branch, `integration/${id}`, 'track.branch'),
    owner: string(v.owner, 'track.owner'),
    source: string(v.source, 'track.source'),
    status: choice(v.status, ['active', 'paused', 'retiring', 'retired'], 'track.status'),
    initialMain: sha(v.initialMain, 'track.initialMain'),
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
