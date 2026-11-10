import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePolicy, POLICY_PATH } from '../src/integration/policy.ts'

const registry = JSON.parse(
  readFileSync(new URL(`../../../${POLICY_PATH}`, import.meta.url), 'utf8'),
) as { tracks: Record<string, unknown>[] }
const mainline = registry.tracks[0] ?? {}

describe('the policy registry', () => {
  it('registers one track, integration/mainline, whose upstream is main', () => {
    const policy = parsePolicy(registry)
    expect(policy.tracks.map(track => [track.branch, track.parent])).toEqual([
      ['integration/mainline', 'main'],
    ])
  })
  it('refuses a sub-track: every track merges into main', () => {
    const child = { ...mainline, id: 'child', branch: 'integration/child', parent: 'mainline' }
    expect(() => parsePolicy({ ...registry, tracks: [mainline, child] })).toThrow(
      'track.parent must be main',
    )
  })
  it.each(['main', 'stable', 'release', 'github-gate'])('refuses a track named %s', id => {
    const track = { ...mainline, id, branch: `integration/${id}` }
    expect(() => parsePolicy({ ...registry, tracks: [track] })).toThrow('reserved name')
  })
  it('refuses a duplicate track and an unknown field', () => {
    expect(() => parsePolicy({ ...registry, tracks: [mainline, mainline] })).toThrow(
      'Duplicate track',
    )
    expect(() => parsePolicy({ ...registry, lines: [] })).toThrow('unknown fields lines')
  })
})
