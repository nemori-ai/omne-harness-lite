import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readTaskBinding, parseTaskBinding } from '../src/delivery/binding.ts'
import { parsePolicy } from '../src/integration/policy.ts'
import { parseContext } from '../src/integration/context.ts'
import { parseCommand } from '../src/integration/cli.ts'
import { policyDocument } from './fixtures/integration.ts'

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
      initialMain: commit,
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
    expect(policy.tracks.map(track => track.id)).toEqual([
      'development',
      'legacy-refactor',
      'engineering-toolchain',
    ])
    expect(policy.tracks.every(track => track.owner !== '')).toBe(true)
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
})
