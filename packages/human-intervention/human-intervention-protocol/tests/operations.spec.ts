import { describe, expect, it } from 'vitest'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const table = {
  'list-cards': { identity: 'login', effect: 'read', limit: 'small' },
  'read-card': { identity: 'login', effect: 'read', limit: 'small' },
  'submit-reply': { identity: 'login', effect: 'commit', limit: 'small' },
  'query-submit-reply': { identity: 'login', effect: 'read', limit: 'small' },
} as const

const outcomes = {
  'list-cards': ['invalid', 'limited', 'conflict'],
  'read-card': ['invalid', 'limited'],
  'submit-reply': ['invalid', 'limited', 'conflict'],
  'query-submit-reply': ['not-committed', 'invalid', 'limited', 'conflict', 'unknown'],
} as const
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']

const operations = humanInterventionProtocol.operations

describe('human-intervention/v1', () => {
  it('is human-intervention major 1 with exactly the four operations and one observation', () => {
    expect(humanInterventionProtocol.name).toBe('human-intervention')
    expect(humanInterventionProtocol.major).toBe(1)
    expect(Object.keys(operations).sort()).toEqual(Object.keys(table).sort())
    expect(Object.keys(humanInterventionProtocol.observations)).toEqual(['observe-cards'])
  })

  it('observe-cards needs a login, opens on a tenant, and its frame says only that cards changed', () => {
    const observation = humanInterventionProtocol.observations['observe-cards']
    expect(observation.identity).toBe('login')
    expect(observation.ends).toEqual([])
    expect('countsAsAccess' in observation).toBe(false)
    expectRoundTrip(observation.open, { tenant })
    expect(readSample(observation.open, {}).ok).toBe(false)
    expect(readSample(observation.open, { tenant, session: 's' }).ok).toBe(false)
    expectRoundTrip(observation.frame, { kind: 'changed' })
    expect(readSample(observation.frame, { kind: 'changed', cardId: 'c' }).ok).toBe(false)
    expect(readSample(observation.frame, { kind: 'decided' }).ok).toBe(false)
  })

  it.each(Object.entries(table))(
    '%s has the identity, effect and limit of the table',
    (name, row) => {
      const operation = operations[name as keyof typeof table]
      expect({
        identity: operation.identity,
        effect: operation.effect,
        limit: operation.limit,
      }).toEqual(row)
      expect('countsAsAccess' in operation).toBe(false)
      expect('carriesCredential' in operation).toBe(false)
    },
  )

  it.each(Object.entries(outcomes))('%s answers exactly its outcomes', (name, own) => {
    const operation = operations[name as keyof typeof outcomes]
    const unknown = operation.effect === 'commit' ? ['unknown'] : []
    expect(Object.keys(operation.outcomes).sort()).toEqual([...always, ...own, ...unknown].sort())
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied', 'unknown'])
      if (fixed in operation.outcomes)
        expect(operation.outcomes[fixed as keyof typeof operation.outcomes]).toBe(true)
  })

  it('no operation can answer stage-not-provided', () => {
    for (const operation of Object.values(operations))
      expect('stage-not-provided' in operation.outcomes).toBe(false)
  })

  it('only the query still answers unknown among the reads, and only submit-reply commits', () => {
    expect(operations['query-submit-reply'].outcomes.unknown).toBe(true)
    const commits = Object.entries(operations).filter(
      ([, operation]) => operation.effect === 'commit',
    )
    expect(commits.map(([name]) => name)).toEqual(['submit-reply'])
  })
})
