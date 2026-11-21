import { describe, expect, it } from 'vitest'
import { mediaProtocol } from '@omne-harness/media-protocol'

const FIXED = ['basis-unavailable', 'denied', 'protocol-rejected']
const own = (name: keyof typeof mediaProtocol.operations): string[] =>
  Object.keys(mediaProtocol.operations[name].outcomes)
    .filter(outcome => !FIXED.includes(outcome) && outcome !== 'unknown')
    .sort()

describe('media/v1', () => {
  it('is media major 1 with seven operations and one observation', () => {
    expect([mediaProtocol.name, mediaProtocol.major]).toEqual(['media', 1])
    expect(Object.keys(mediaProtocol.operations)).toEqual([
      'begin-upload',
      'append-upload-part',
      'commit-upload',
      'query-upload',
      'read-media-page',
      'describe-media',
      'prepare-media',
    ])
    expect(Object.keys(mediaProtocol.observations)).toEqual(['observe-media'])
    expect(mediaProtocol.observations['observe-media']).toMatchObject({
      identity: 'login',
      ends: [],
    })
  })

  it.each([
    ['begin-upload', 'commit', 'small'],
    ['append-upload-part', 'commit', 'input'],
    ['commit-upload', 'commit', 'small'],
    ['query-upload', 'read', 'small'],
    ['read-media-page', 'read', 'small'],
    ['describe-media', 'read', 'small'],
    ['prepare-media', 'commit', 'small'],
  ] as const)('%s is a login %s of the %s limit that counts as access', (name, effect, limit) => {
    const operation = mediaProtocol.operations[name]
    expect({
      identity: operation.identity,
      effect: operation.effect,
      limit: operation.limit,
      countsAsAccess: operation.countsAsAccess,
    }).toEqual({ identity: 'login', effect, limit, countsAsAccess: true })
    for (const fixed of FIXED) expect(Object.keys(operation.outcomes)).toContain(fixed)
    expect('unknown' in operation.outcomes).toBe(effect === 'commit')
  })

  it('each operation answers its own outcomes and no other', () => {
    expect(own('begin-upload')).toEqual(['invalid', 'limited', 'succeeded', 'unsupported'])
    expect(own('append-upload-part')).toEqual([
      'conflict',
      'invalid',
      'limited',
      'not-found',
      'succeeded',
    ])
    expect(own('commit-upload')).toEqual(['invalid', 'not-found', 'succeeded'])
    expect(own('query-upload')).toEqual(['not-found', 'succeeded'])
    expect(own('read-media-page')).toEqual(['limited', 'not-found', 'succeeded'])
    expect(own('describe-media')).toEqual(['not-found', 'succeeded'])
    expect(own('prepare-media')).toEqual(['not-found', 'succeeded'])
  })
})
