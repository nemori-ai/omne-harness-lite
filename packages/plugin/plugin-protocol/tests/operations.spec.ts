import { describe, expect, it } from 'vitest'
import { pluginProtocol } from '@omne-harness/plugin-protocol'

const FIXED = ['basis-unavailable', 'denied', 'protocol-rejected']
const own = (name: keyof typeof pluginProtocol.operations): string[] =>
  Object.keys(pluginProtocol.operations[name].outcomes)
    .filter(outcome => !FIXED.includes(outcome) && outcome !== 'unknown')
    .sort()

describe('plugin/v1', () => {
  it('is plugin major 1 with four operations and one observation', () => {
    expect([pluginProtocol.name, pluginProtocol.major]).toEqual(['plugin', 1])
    expect(Object.keys(pluginProtocol.operations)).toEqual([
      'list-wanted',
      'read-file',
      'report-loaded',
      'list-reports',
    ])
    expect(Object.keys(pluginProtocol.observations)).toEqual(['observe-wanted'])
    expect(pluginProtocol.observations['observe-wanted']).toMatchObject({
      identity: 'login',
      ends: [],
    })
  })

  it.each([
    ['list-wanted', 'read'],
    ['read-file', 'read'],
    ['list-reports', 'read'],
  ] as const)('%s is a login %s of the small limit that counts as access', (name, effect) => {
    const operation = pluginProtocol.operations[name]
    expect({
      identity: operation.identity,
      effect: operation.effect,
      limit: operation.limit,
      countsAsAccess: operation.countsAsAccess,
    }).toEqual({ identity: 'login', effect, limit: 'small', countsAsAccess: true })
    for (const fixed of FIXED) expect(Object.keys(operation.outcomes)).toContain(fixed)
    expect('unknown' in operation.outcomes).toBe(false)
  })

  it('report-loaded is a login commit that may carry a whole tree of the interface, and sending it again is safe', () => {
    const operation = pluginProtocol.operations['report-loaded']
    expect({
      identity: operation.identity,
      effect: operation.effect,
      limit: operation.limit,
      countsAsAccess: operation.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'commit', limit: 'input', countsAsAccess: true })
    for (const fixed of FIXED) expect(Object.keys(operation.outcomes)).toContain(fixed)
    expect('unknown' in operation.outcomes).toBe(true)
  })

  it('each operation answers its own outcomes and no other', () => {
    expect(own('list-wanted')).toEqual(['succeeded'])
    expect(own('read-file')).toEqual(['limited', 'not-found', 'succeeded'])
    expect(own('report-loaded')).toEqual(['succeeded'])
    expect(own('list-reports')).toEqual(['succeeded'])
  })
})
