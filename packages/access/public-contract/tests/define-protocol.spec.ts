// defineProtocol adds the outcomes the pipeline answers for the domain. The table covers every
// pair of identity requirement and effect; observations keep only their own end reasons.
import { describe, expect, it } from 'vitest'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const operation = (identity: 'none' | 'login' | 'acting-tenant', effect: 'read' | 'commit') =>
  ({ identity, effect, limit: 'small', body: empty, outcomes: { succeeded: empty } }) as const

const cases = [
  ['none', 'read', ['basis-unavailable', 'protocol-rejected', 'succeeded']],
  ['none', 'commit', ['basis-unavailable', 'protocol-rejected', 'succeeded', 'unknown']],
  ['login', 'read', ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded']],
  ['login', 'commit', ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded', 'unknown']],
  ['acting-tenant', 'read', ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded']],
  [
    'acting-tenant',
    'commit',
    ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded', 'unknown'],
  ],
] as const

describe('pipeline outcomes', () => {
  for (const [identity, effect, outcomes] of cases)
    it(`gives a ${identity} ${effect} operation ${outcomes.join(', ')}`, () => {
      const protocol = defineProtocol({
        name: 'example',
        major: 1,
        operations: { probe: operation(identity, effect) },
        observations: {},
      })
      expect(Object.keys(protocol.operations.probe.outcomes).sort()).toEqual([...outcomes])
      for (const name of outcomes)
        if (name !== 'succeeded') expect(protocol.operations.probe.outcomes[name]).toBe(true)
    })

  it('keeps the outcomes the owner listed and the codecs they carry', () => {
    const conflict = ruleCodec({
      kind: 'object',
      fields: { revision: { rule: { kind: 'revision' } } },
    })
    const protocol = defineProtocol({
      name: 'example',
      major: 1,
      operations: {
        save: {
          ...operation('login', 'commit'),
          outcomes: { succeeded: empty, conflict, 'stage-not-provided': true, unknown: true },
        },
      },
      observations: {},
    })
    expect(protocol.operations.save.outcomes.conflict).toBe(conflict)
    expect(protocol.operations.save.outcomes['stage-not-provided']).toBe(true)
    expect(Object.keys(protocol.operations.save.outcomes).sort()).toEqual([
      'basis-unavailable',
      'conflict',
      'denied',
      'protocol-rejected',
      'stage-not-provided',
      'succeeded',
      'unknown',
    ])
  })
})

describe('the definition', () => {
  it('does not change the object it was given', () => {
    const input = {
      name: 'example',
      major: 1,
      operations: { probe: operation('login', 'commit') },
      observations: {},
    } as const
    const before = JSON.stringify(Object.keys(input.operations.probe.outcomes))
    const protocol = defineProtocol(input)
    expect(JSON.stringify(Object.keys(input.operations.probe.outcomes))).toBe(before)
    expect(protocol).not.toBe(input)
    expect(protocol.operations.probe.body).toBe(empty)
    expect(protocol.name).toBe('example')
    expect(protocol.major).toBe(1)
  })

  it('keeps an observation as written, with only its own end reasons', () => {
    const observation = {
      identity: 'login',
      open: empty,
      frame: empty,
      ends: ['session-archived'],
      countsAsAccess: true,
    } as const
    const protocol = defineProtocol({
      name: 'example',
      major: 1,
      operations: {},
      observations: { watch: observation },
    })
    expect(protocol.observations.watch).toEqual(observation)
    expect(protocol.observations.watch.ends).toEqual(['session-archived'])
  })
})
