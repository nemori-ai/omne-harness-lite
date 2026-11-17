import { describe, expect, it } from 'vitest'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { createReceiveRecord } from '../src/receive-evidence.ts'

const diagnostic: TransportFact = {
  kind: 'diagnostic',
  value: { kind: 'reasoning-disabled', reason: 'foreign-prefix' },
}
const open: TransportFact = { kind: 'block-open', index: '0', content: 'text', mode: 'append' }
const delta: TransportFact = { kind: 'block-delta', index: '0', delta: 'a' }
const failed: TransportFact = {
  kind: 'ended',
  termination: {
    kind: 'failed',
    fault: { cause: 'upstream-unavailable', diagnostic: 'http-503', upstreamStatus: '503' },
  },
}
const completed: TransportFact = {
  kind: 'ended',
  termination: { kind: 'completed', reason: 'stop' },
}

function record(...facts: TransportFact[]) {
  const made = createReceiveRecord()
  for (const fact of facts) made.yielded(fact)
  return made
}

describe('receive record: one proof request', () => {
  it('proves the whole tail before the transport reads the response body', () => {
    const made = record(diagnostic, failed)
    expect(made.prove('w1', [diagnostic, failed])).toBe(true)
  })

  it('proves the whole tail after the transport ended, with the body read', () => {
    const made = record(diagnostic)
    made.bodyClaimed()
    made.yielded(failed)
    expect(made.prove('w1', [diagnostic, failed])).toBe(true)
  })

  it('proves batch after batch while the body is unread, each batch the facts since the last proof', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(true)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(true)
  })

  it('answers a replay of the last proven window with the same batch and keeps its state', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(true)
    expect(made.prove('w1', [structuredClone(diagnostic)])).toBe(true)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(true)
  })

  it('refuses a replay of the last proven window with another batch, and every proof after it', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(true)
    expect(made.prove('w1', [failed])).toBe(false)
    expect(made.prove('w1', [diagnostic])).toBe(false)
  })

  it('refuses while the body is read and the transport did not end, and every proof after it', () => {
    const made = record()
    made.bodyClaimed()
    made.yielded(diagnostic)
    expect(made.prove('w1', [diagnostic])).toBe(false)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(false)
  })

  it.each([
    ['a fact is missing', [open, completed]],
    ['a fact is added', [open, delta, delta, completed]],
    ['the order differs', [delta, open, completed]],
    ['the end is not the one the transport yielded', [open, delta, failed]],
    ['the batch is empty', []],
  ] as const)('refuses when %s', (_name, batch) => {
    const made = record()
    made.bodyClaimed()
    for (const fact of [open, delta, completed]) made.yielded(fact)
    expect(made.prove('w1', batch)).toBe(false)
    expect(made.prove('w2', [open, delta, completed])).toBe(false)
  })

  it('does not record facts after it was voided', () => {
    const made = record(diagnostic)
    expect(made.prove('w1', [failed])).toBe(false)
    made.yielded(failed)
    expect(made.prove('w2', [failed])).toBe(false)
  })
})
