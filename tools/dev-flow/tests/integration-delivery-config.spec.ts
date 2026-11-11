import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DELIVERY_CONFIG_PATH, parseConfig } from '../src/integration/delivery-config.ts'

const valid = {
  schemaVersion: 3,
  kind: 'github-delivery-config',
  repository: 'owner/repo',
}

describe('delivery configuration', () => {
  it('parses the repository file that gate-cli reads by default', () => {
    const file = new URL(`../../../${DELIVERY_CONFIG_PATH}`, import.meta.url)
    expect(parseConfig(JSON.parse(readFileSync(file, 'utf8'))).repository).toBe(
      'nemori-ai/omne-harness-lite',
    )
  })
  it('returns the repository of a valid configuration', () => {
    expect(parseConfig(valid)).toEqual(valid)
  })
  it('accepts an owner of one character', () => {
    expect(parseConfig({ ...valid, repository: 'a/repo' }).repository).toBe('a/repo')
  })
  it.each([
    ['another schema version', { ...valid, schemaVersion: 2 }, 'schemaVersion must be 3'],
    ['another kind', { ...valid, kind: 'other' }, 'kind must be github-delivery-config'],
    ['a missing repository', { ...valid, repository: undefined }, 'repository must be a string'],
    ['a repository without owner', { ...valid, repository: 'repo' }, 'owner/name'],
    ['a traversal segment', { ...valid, repository: 'owner/..' }, 'owner/name'],
    ['an owner that ends with a dash', { ...valid, repository: 'owner-/repo' }, 'owner/name'],
    ['an owner that starts with a dash', { ...valid, repository: '-owner/repo' }, 'owner/name'],
    ['more than two segments', { ...valid, repository: 'owner/repo/extra' }, 'owner/name'],
    ['a single dot as the name', { ...valid, repository: 'owner/.' }, 'owner/name'],
    ['a value that is no object', 'owner/repo', 'config must be an object'],
  ])('refuses %s', (_, value, message) => {
    expect(() => parseConfig(value)).toThrow(message)
  })
})
