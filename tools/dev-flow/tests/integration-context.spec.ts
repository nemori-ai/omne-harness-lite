import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readTaskBinding, parseTaskBinding } from '../src/delivery/binding.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { parseContext } from '../src/integration/context.ts'
import { parseCommand } from '../src/integration/cli.ts'
import { policyDocument, trackEntry } from './fixtures/integration.ts'

const commit = 'a'.repeat(40)
describe('policy registry', () => {
  it('parses the registry fields the tools still read', () => {
    const policy = parsePolicy(policyDocument(commit, '/remote.git'))
    expect(Object.keys(policy).sort()).toEqual(
      [
        'deliveryConfig',
        'repository',
        'revision',
        'schemaVersion',
        'timeouts',
        'tracks',
        'transport',
      ].sort(),
    )
    expect(policy.tracks[0]).toEqual({
      id: 'runtime',
      branch: 'integration/runtime',
      owner: 'human',
      source: 'https://github.com/owner/repo/issues/1',
      status: 'active',
      parent: 'main',
      initialBase: commit,
    })
    const retired = policyDocument(commit, '/remote.git')
    retired.tracks[0] = { ...retired.tracks[0]!, status: 'retired' }
    expect(parsePolicy(retired).tracks[0]?.status).toBe('retired')
  })
  it('parses the repository registry with every track and its owner', () => {
    const policy = parsePolicy(
      JSON.parse(
        readFileSync(
          new URL('../../../docs/engineering/integration-policy.json', import.meta.url),
          'utf8',
        ),
      ),
    )
    expect(policy.repository).toBe('nemori-ai/omne-harness-lite')
    expect(policy.tracks.map(track => [track.id, track.parent])).toEqual([
      ['mainline', 'main'],
      ['session-run', 'mainline'],
      ['app-access', 'mainline'],
      ['model', 'mainline'],
      ['tool-exec', 'mainline'],
      ['m2-toolchain', 'mainline'],
    ])
    expect(policy.tracks.every(track => track.owner !== '')).toBe(true)
  })
  it.each(['parent', 'initialBase'] as const)('refuses a track without %s', field => {
    const { [field]: _, ...track } = trackEntry('runtime', commit)
    expect(() => parsePolicy(policyDocument(commit, '/remote.git', [track]))).toThrow(
      `track.${field} must be`,
    )
  })
  it('refuses the renamed initialMain field', () => {
    const track = { ...trackEntry('runtime', commit), initialMain: commit }
    expect(() => parsePolicy(policyDocument(commit, '/remote.git', [track]))).toThrow(
      'track: unknown fields initialMain',
    )
  })
  it.each(['main', 'stable', 'release', 'github-gate'])(
    'refuses the reserved track ID %s and the same name as a parent',
    name => {
      const id = { ...trackEntry('runtime', commit), id: name, branch: `integration/${name}` }
      expect(() => parsePolicy(policyDocument(commit, '/remote.git', [id]))).toThrow(
        'track.id is a reserved name',
      )
      if (name === 'main') return
      const parent = trackEntry('runtime', commit, name)
      expect(() => parsePolicy(policyDocument(commit, '/remote.git', [parent]))).toThrow(
        'track.parent is a reserved name',
      )
    },
  )
  it('refuses a track that is its own parent or a parent that is not one segment', () => {
    expect(() =>
      parsePolicy(
        policyDocument(commit, '/remote.git', [trackEntry('runtime', commit, 'runtime')]),
      ),
    ).toThrow('cannot be its own parent')
    expect(() =>
      parsePolicy(
        policyDocument(commit, '/remote.git', [trackEntry('runtime', commit, 'integration/a')]),
      ),
    ).toThrow('track.parent must be one segment')
  })
  it('accepts a parent that names an unregistered track; the upstream chain is checked at start', () => {
    const policy = parsePolicy(
      policyDocument(commit, '/remote.git', [
        trackEntry('child', commit, 'runtime', 'paused'),
        trackEntry('orphan', commit, 'missing', 'retired'),
      ]),
    )
    expect(policy.tracks.map(track => [track.id, track.parent])).toEqual([
      ['child', 'runtime'],
      ['orphan', 'missing'],
    ])
  })
  it.each([
    ['owners', []],
    ['commands', []],
    ['profiles', { integration: [], full: [] }],
    ['checkpointCoverage', {}],
    ['requiredFiles', []],
  ])('refuses the retired field %s', (field, value) => {
    expect(() => parsePolicy({ ...policyDocument(commit, '/remote.git'), [field]: value })).toThrow(
      `policy: unknown fields ${field}`,
    )
  })
  it('refuses retired track checks and a missing required field', () => {
    const document = policyDocument(commit, '/remote.git')
    expect(() =>
      parsePolicy({ ...document, tracks: [{ ...document.tracks[0], checks: ['check'] }] }),
    ).toThrow('track: unknown fields checks')
    const { transport: _, ...missing } = document
    expect(() => parsePolicy(missing)).toThrow('transport must be an object')
  })
  it('refuses the retired command timeout', () => {
    const document = policyDocument(commit, '/remote.git')
    expect(parsePolicy(document).timeouts).toEqual({ networkMs: 30000 })
    expect(() =>
      parsePolicy({ ...document, timeouts: { commandMs: 30000, networkMs: 30000 } }),
    ).toThrow('timeouts: unknown fields commandMs')
  })
})

describe('task context and commands', () => {
  it('reads a context written with the retired anchor key and does not return it', () => {
    const binding = {
      schemaVersion: 1,
      issue: {
        repository: 'owner/repo',
        id: 'I_1',
        url: 'https://github.com/owner/repo/issues/1',
        number: 1,
      },
      revision: 1,
      attempt: 'one',
      responsible: 'human',
      branch: 'human/task',
      route: { kind: 'track', track: 'runtime' },
      completionTarget: 'stable',
      taskBase: commit,
      writeScope: ['feature'],
      dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-1',
      conditions: [],
      authorization: [],
    }
    const context = {
      schemaVersion: 1,
      root: '/work',
      gitDir: '/work/.git',
      branch: 'human/task',
      targetBase: commit,
      tasks: [{ binding, taskSource: commit }],
      ownerTask: binding,
      operation: null,
    }
    expect(parseContext({ ...context, anchor: null })).toEqual(context)
    expect(parseContext(context)).toEqual(context)
    expect(() => parseContext({ ...context, anchor: 'not-a-commit' })).toThrow('anchor')
  })
  it('parses task-sync and refuses every retired command kind', () => {
    expect(parseCommand({ kind: 'task-sync', target: commit })).toEqual({
      kind: 'task-sync',
      target: commit,
    })
    expect(() => parseCommand({ kind: 'task-sync', target: 'main' })).toThrow('full SHA-1')
    for (const kind of [
      'policy-handoff',
      'policy-check',
      'policy-adopt',
      'bootstrap',
      'activation-check',
      'activate',
      'prepare',
      'seal',
      'verify',
      'publish',
      'resume',
      'track-register',
      'track-bootstrap-plan',
      'track-bootstrap',
      'track-retire',
    ])
      expect(() => parseCommand({ kind }), kind).toThrow('Unsupported integration command')
  })
})

describe('task binding', () => {
  it('rejects ambiguous, unbound and old task identities', () => {
    const issue = {
      repository: 'owner/repo',
      id: 'I_1',
      url: 'https://github.com/owner/repo/issues/1',
      number: 1,
    }
    const binding = {
      schemaVersion: 1,
      issue,
      revision: 2,
      attempt: 'attempt-1',
      responsible: 'human',
      branch: 'human/task',
      route: { kind: 'track', track: 'runtime' },
      completionTarget: 'main',
      taskBase: 'a'.repeat(40),
      writeScope: ['src'],
      dispatch: `${issue.url}#issuecomment-1`,
      conditions: [],
      authorization: [],
    }
    const block = `\`\`\`json omne-integration-binding:v1\n${JSON.stringify(binding)}\n\`\`\``
    expect(readTaskBinding(`- 交付修订: 2\n${block}`, issue)).toEqual(binding)
    expect(() => readTaskBinding(`- 交付修订: 2\n${block}\n${block}`, issue)).toThrow('Duplicate')
    expect(() => readTaskBinding(`- 交付修订: 1\n${block}`, issue)).toThrow('revision')
    expect(() => readTaskBinding(`- 交付修订: 2\n${block}`, { ...issue, id: 'I_2' })).toThrow(
      'identity',
    )
    expect(() => parseTaskBinding({ ...binding, extra: true })).toThrow('unknown fields')
    expect(() => parseTaskBinding({ ...binding, branch: 'integration/runtime' })).toThrow(
      'human prefix',
    )
  })
  it.each(['global', 'cross-track'] as const)(
    'requires a named track and affected owners on a %s route',
    kind => {
      const binding = {
        schemaVersion: 1,
        issue: {
          repository: 'owner/repo',
          id: 'I_1',
          url: 'https://github.com/owner/repo/issues/1',
          number: 1,
        },
        revision: 1,
        attempt: 'one',
        responsible: 'human',
        branch: 'human/task',
        route: { kind, track: 'runtime', owners: ['human'] },
        completionTarget: 'track',
        taskBase: commit,
        writeScope: ['src'],
        dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-1',
        conditions: [],
        authorization: [],
      }
      expect(parseTaskBinding(binding).route).toEqual({ kind, track: 'runtime', owners: ['human'] })
      for (const completionTarget of ['main', 'stable'])
        expect(parseTaskBinding({ ...binding, completionTarget }).completionTarget).toBe(
          completionTarget,
        )
      expect(() => parseTaskBinding({ ...binding, route: { kind, owners: ['human'] } })).toThrow(
        'route.track must be',
      )
      expect(() =>
        parseTaskBinding({ ...binding, route: { kind, track: 'runtime', owners: [] } }),
      ).toThrow('affected owners')
      expect(() => parseTaskBinding({ ...binding, route: { kind, track: 'runtime' } })).toThrow(
        'route.owners must be an array',
      )
      expect(() =>
        parseTaskBinding({ ...binding, route: { kind, track: 'a/b', owners: ['human'] } }),
      ).toThrow('one branch segment')
    },
  )
  it('accepts track as the completion target of a track route and refuses owners on it', () => {
    const route = { kind: 'track', track: 'runtime' }
    const binding = {
      schemaVersion: 1,
      issue: {
        repository: 'owner/repo',
        id: 'I_1',
        url: 'https://github.com/owner/repo/issues/1',
        number: 1,
      },
      revision: 1,
      attempt: 'one',
      responsible: 'human',
      branch: 'human/task',
      route,
      completionTarget: 'track',
      taskBase: commit,
      writeScope: ['src'],
      dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-1',
      conditions: [],
      authorization: [],
    }
    expect(parseTaskBinding(binding).route).toEqual(route)
    expect(() => parseTaskBinding({ ...binding, route: { ...route, owners: ['human'] } })).toThrow(
      'route: unknown fields owners',
    )
  })
})
