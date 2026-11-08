import { expect, it } from 'vitest'
import {
  SESSION_PROTOCOL,
  SESSION_READ_PROTOCOL,
  sessionCommitCommands,
  sessionCommitDigest,
} from '../src/participants.ts'

const query = {
  participant: 'session',
  facts: { intent: 'query', tenant: 'tenant-1', session: 'session-1', operation: 'lookup-1' },
}

it('keeps read protocol 1 when the write participant advances to 2', () => {
  expect(SESSION_PROTOCOL).toBe('2')
  expect(SESSION_READ_PROTOCOL).toBe('1')
})

it('does not add a Session participant to an execution-record-only publication', () => {
  const commands = [{ participant: 'execution-record', facts: { intent: 'publish' } }]
  expect(sessionCommitCommands(commands)).toBe(commands)
})

it('rejects duplicate Session commands and repeated ordinary assembly', () => {
  expect(() => sessionCommitCommands([query, query])).toThrow('more than one Session participation')
  expect(() => sessionCommitCommands(sessionCommitCommands([query]))).toThrow(
    'Session basis was already supplied',
  )
})

it('binds JSON values independently of property insertion order', () => {
  const reordered = {
    facts: { operation: 'lookup-1', session: 'session-1', tenant: 'tenant-1', intent: 'query' },
    participant: 'session',
  }
  expect(sessionCommitDigest([query])).toBe(sessionCommitDigest([reordered]))
  expect(sessionCommitDigest([query])).not.toBe(
    sessionCommitDigest([{ ...query, facts: { ...query.facts, operation: 'lookup-2' } }]),
  )
})
