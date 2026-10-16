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
  strings,
  IntegrationError,
} from './parse.ts'

export const DESCRIPTOR_PATH = 'docs/engineering/integration-bootstrap.json'
export const POLICY_PATH = 'docs/engineering/integration-policy.json'
export const ADOPTION_PREFIX = 'refs/tags/omne/integration/adoption/'
export const UNIT_PREFIX = 'refs/tags/omne/integration/unit/'
export type Descriptor = ReturnType<typeof parseDescriptor>
export function parseDescriptor(value: unknown) {
  const v = fields(
    value,
    ['schemaVersion', 'repository', 'policyPath', 'adoptionPrefix', 'remote'],
    'descriptor',
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    repository: string(v.repository, 'repository'),
    policyPath: safePath(v.policyPath, 'policyPath'),
    adoptionPrefix: literal(v.adoptionPrefix, ADOPTION_PREFIX, 'adoptionPrefix'),
    remote: branch(v.remote, 'remote'),
  }
}
export type Track = ReturnType<typeof parseTrack>
export function parseTrack(value: unknown) {
  const v = fields(
    value,
    ['id', 'branch', 'owner', 'source', 'status', 'initialMain', 'checks'],
    'track',
  )
  const id = branch(v.id, 'track.id')
  if (id.includes('/')) throw new IntegrationError('input-error', 'Track ID must be one segment')
  return {
    id,
    branch: literal(v.branch, `integration/${id}`, 'track.branch'),
    owner: string(v.owner, 'track.owner'),
    source: string(v.source, 'track.source'),
    status: choice(v.status, ['active', 'paused', 'retiring'], 'track.status'),
    initialMain: sha(v.initialMain, 'track.initialMain'),
    checks: strings(v.checks, 'track.checks'),
  }
}
export const modes = ['work', 'fi', 'ri', 'joint', 'task-sync', 'checkpoint'] as const
export type Mode = (typeof modes)[number]
export type Policy = ReturnType<typeof parsePolicy>
export function parsePolicy(value: unknown) {
  const v = fields(
    value,
    [
      'schemaVersion',
      'revision',
      'repository',
      'deliveryConfig',
      'owners',
      'tracks',
      'commands',
      'profiles',
      'timeouts',
      'requiredFiles',
      'transport',
      'checkpointCoverage',
    ],
    'policy',
  )
  const tracks = array(v.tracks, 'tracks').map(parseTrack)
  if (new Set(tracks.map(track => track.id)).size !== tracks.length)
    throw new IntegrationError('input-error', 'Duplicate track')
  const commands = array(v.commands, 'commands').map(item => {
    const c = fields(item, ['id', 'argv', 'cwd'], 'command')
    const argv = strings(c.argv, 'command.argv')
    if (argv.length === 0 || argv.some(arg => arg.includes('{candidateRunner}')))
      throw new IntegrationError('input-error', 'Invalid command argv')
    return {
      id: string(c.id, 'command.id'),
      argv,
      cwd: choice(c.cwd, ['runner', 'subject'], 'command.cwd'),
    }
  })
  if (commands.length === 0 || new Set(commands.map(c => c.id)).size !== commands.length)
    throw new IntegrationError('input-error', 'Policy requires unique commands')
  const profiles = fields(v.profiles, ['integration', 'full'], 'profiles')
  const integration = strings(profiles.integration, 'profiles.integration'),
    full = strings(profiles.full, 'profiles.full')
  for (const profile of [integration, full]) {
    if (profile.length === 0 || profile.some(id => !commands.some(c => c.id === id)))
      throw new IntegrationError('input-error', 'Profile has missing commands')
  }
  if (tracks.some(track => track.checks.some(id => !commands.some(c => c.id === id))))
    throw new IntegrationError('input-error', 'Track check is not registered')
  const t = fields(v.timeouts, ['commandMs', 'networkMs'], 'timeouts')
  const transport = fields(v.transport, ['kind', 'location'], 'transport')
  const coverage = fields(
    v.checkpointCoverage,
    ['startup', 'install', 'migration', 'mainPath'],
    'checkpointCoverage',
  )
  const checkpointCoverage: Record<string, string[] | null> = Object.fromEntries(
    Object.entries(coverage).map(([key, value]): [string, string[] | null] => {
      if (value === null) return [key, null]
      const ids = strings(value, `checkpointCoverage.${key}`)
      if (ids.length === 0 || ids.some(id => !full.includes(id)))
        throw new IntegrationError(
          'input-error',
          'Checkpoint coverage must name mandatory full commands',
        )
      return [key, ids]
    }),
  )
  if (Object.keys(coverage).length !== 4)
    throw new IntegrationError(
      'input-error',
      'Checkpoint coverage must declare all four categories',
    )
  return {
    checkpointCoverage,
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    revision: string(v.revision, 'revision'),
    repository: string(v.repository, 'repository'),
    deliveryConfig: safePath(v.deliveryConfig, 'deliveryConfig'),
    owners: array(v.owners, 'owners').map(item => {
      const o = fields(item, ['login', 'nodeId', 'actions'], 'owner')
      return {
        login: string(o.login, 'owner.login'),
        nodeId: string(o.nodeId, 'owner.nodeId'),
        actions: array(o.actions, 'owner.actions').map(action =>
          choice(
            action,
            ['adopt', 'dispatch', 'publish', 'policy-adopt', 'track-bootstrap'],
            'owner.action',
          ),
        ),
      }
    }),
    tracks,
    commands,
    profiles: { integration, full },
    timeouts: {
      commandMs: integer(t.commandMs, 'commandMs'),
      networkMs: integer(t.networkMs, 'networkMs'),
    },
    requiredFiles: array(v.requiredFiles, 'requiredFiles').map(item =>
      safePath(item, 'requiredFiles'),
    ),
    transport: {
      kind: choice(transport.kind, ['remote', 'local-bare'], 'transport.kind'),
      location: string(transport.location, 'transport.location'),
    },
  }
}
export function activeTrack(policy: Policy, id: string): Track {
  const track = policy.tracks.find(item => item.id === id)
  if (track === undefined || track.status !== 'active')
    throw new IntegrationError('refused', `Track ${id} is not active and registered`)
  return track
}

export function requireCheckpointCoverage(policy: Policy): void {
  const missing = Object.entries(policy.checkpointCoverage)
    .filter(([, value]) => value === null)
    .map(([key]) => key)
  if (missing.length > 0)
    throw new IntegrationError(
      'unknown',
      `Checkpoint evidence is not configured: ${missing.join(', ')}`,
    )
}
