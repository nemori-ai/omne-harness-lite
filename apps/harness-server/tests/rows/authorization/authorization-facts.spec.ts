import { describe, expect, it } from 'vitest'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import {
  agentActionConsumer,
  onceAuthorizationFor,
  onceTarget,
  sessionGrantFor,
} from '../../../src/rows/authorization/authorization-facts.ts'

const definition = { owner: 'tool', name: 'Shell', revision: '1', digest: 'd' }
const consumer = { owner: '@omne-harness/agent', work: 'exe-1', position: 'act-1' }
const args = '{"command":"run"}'
const source = { owner: 'hitl', record: 'answer-1', revision: '1', digest: 's' }
const held = {
  consumer,
  target: onceTarget(definition),
  argumentsDigest: effectiveArgumentsOf(args).digest,
  source,
}
const input = { definition, effectiveArguments: args } as never
const read = (once: unknown, asked: unknown = consumer) =>
  ({
    request: null,
    reading: null,
    condition: null,
    authorizations: { revision: '1', once, session: null },
    consumer: asked,
  }) as never

describe('the once authorization a start may rest on', () => {
  it('names the Agent action as its consumer, and the adoption of the tool as its target', () => {
    expect(agentActionConsumer({ execution: 'exe-1', action: 'act-1' } as never)).toEqual(consumer)
    expect(onceTarget(definition)).toBe(
      '{"digest":"d","name":"Shell","owner":"tool","revision":"1"}',
    )
    expect(onceTarget({ ...definition, revision: '2' })).not.toBe(onceTarget(definition))
  })

  it('is the one held for this very consumer, target and arguments', () => {
    expect(onceAuthorizationFor(input, read(held))).toBe(held)
  })

  it.each([
    ['no authorization is held', read(null)],
    ['the read names no consumer', read(held, null)],
    ['the read carries no authorizations', { request: null, reading: null, condition: null }],
    ['another owner asks', read(held, { ...consumer, owner: 'tool' })],
    ['another work asks', read(held, { ...consumer, work: 'exe-2' })],
    ['another position asks', read(held, { ...consumer, position: 'act-2' })],
    ['it names another target', read({ ...held, target: 'Files' })],
    ['it names other arguments', read({ ...held, argumentsDigest: 'other' })],
  ])('is none when %s', (_what, current) => {
    expect(onceAuthorizationFor(input, current as never)).toBeNull()
  })
})

describe('the basis of a release for the session', () => {
  const request = { capabilityId: 'tool.Shell', enforcementKey: 'tool.invoke' } as never
  const granted = (session: unknown) =>
    ({
      request: null,
      reading: null,
      condition: null,
      authorizations: { revision: '1', once: null, session },
    }) as never
  const grant = {
    capabilityId: 'tool.Shell',
    enforcementKey: 'tool.invoke',
    basis: 'rev-7',
    source,
  }

  it('is the basis held for this capability and gate key', () => {
    expect(sessionGrantFor(request, granted(grant))).toBe('rev-7')
  })

  it.each([
    ['nothing is held', granted(null)],
    ['it is held for another capability', granted({ ...grant, capabilityId: 'tool.Files' })],
    ['it is held for another gate key', granted({ ...grant, enforcementKey: 'tool.other' })],
    ['the read carries no authorizations', { request: null, reading: null, condition: null }],
  ])('is none when %s', (_what, current) => {
    expect(sessionGrantFor(request, current as never)).toBeNull()
  })
})
