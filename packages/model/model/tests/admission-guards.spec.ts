// Machine guards of the Admission model (model-contract verification/models/Admission.tla):
//   P1 one accepted call per work: while an admit is commit-unknown, recall never answers
//      not-accepted; after the reveal, recall and a re-entry with the same identity agree; the
//      same call under another operation is a conflict that leaves the record as it was;
//   P5 the share is honest: admits reserve what they ask, a refusal reserves nothing;
//   P6 a principal of another tenant learns nothing about the call.
// The cases are enumerated, not sampled: every legal effect and reveal of an unknown admit.
import { describe, expect, it } from 'vitest'
import { tenantEquals } from '@omne-harness/legal-identity'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { callId, fixture, identity, op, unbox } from './memory-fixture.ts'

type Reveal = 'committed' | 'rolled-back' | 'not-committed'
const CASES: readonly (readonly ['applied' | 'not-applied', Reveal])[] = [
  ['applied', 'committed'],
  ['not-applied', 'rolled-back'],
  ['not-applied', 'not-committed'],
]

describe('Admission guard P1: an unknown admit is never answered as not accepted', () => {
  it.each(CASES)('effect %s, revealed %s', async (effect, reveal) => {
    const f = fixture()
    const { commands, control } = createMemoryModelCommands(f.options)
    const recall = () => commands.recall({ ...f.admit, admission: f.admit.operation })
    control.injectUnknown({ ...f.admit, method: 'admit', effect })
    expect(await commands.admit(f.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
    // While the write is unresolved, every read and every re-entry stays unknown.
    for (let i = 0; i < 3; i++) {
      expect(await recall()).toMatchObject({ failure: { kind: 'commit-unknown' } })
      expect(await commands.admit(f.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
    }
    control.reveal({ ...f.admit, result: reveal })
    const after = unbox(await recall())
    const again = unbox(await commands.admit(f.admit))
    if (reveal === 'committed') {
      expect(after.kind).toBe('found')
      expect(again.recovered).toBe(true)
    } else {
      expect(after.kind).toBe('not-accepted')
      expect(again.recovered).toBe(false)
    }
    // Now the call is accepted exactly once: a further re-entry recovers it.
    expect(unbox(await commands.admit(f.admit)).recovered).toBe(true)
    expect(unbox(await recall()).kind).toBe('found')
  })

  it('the same call under another operation is a conflict and the record does not change', async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    unbox(await commands.admit(f.admit))
    const before = unbox(await commands.recall({ ...f.admit, admission: f.admit.operation }))
    expect(await commands.admit({ ...f.admit, operation: op('another') })).toMatchObject({
      failure: { kind: 'conflict' },
    })
    expect(unbox(await commands.recall({ ...f.admit, admission: f.admit.operation }))).toEqual(
      before,
    )
  })
})

describe('Admission guard P5: the share reserves what admits ask and nothing for a refusal', () => {
  it('600000 twice in 1000000 refuses the second; 400000 then fits exactly', async () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    const ask = (call: string, bytes: string) => ({
      ...f.admit,
      call: callId(call),
      operation: op(`admit-${call}`),
      capacity: { ...f.admit.capacity, bytes },
    })
    unbox(await commands.admit(ask('a', '600000')))
    expect(await commands.admit(ask('b', '600000'))).toMatchObject({
      failure: { kind: 'capacity' },
    })
    unbox(await commands.admit(ask('c', '400000')))
    expect(await commands.admit(ask('d', '1'))).toMatchObject({ failure: { kind: 'capacity' } })
  })
})

describe('Admission guard P6: another tenant learns nothing about the call', () => {
  it('recall and query by a principal of another tenant do not disclose the call', async () => {
    const f = fixture()
    const other = identity('6')
    const both = {
      ...f.options,
      authority: {
        ...f.options.authority,
        authorize: (i: Parameters<typeof f.options.authority.authorize>[0]) =>
          i.access.principal === f.principal &&
          (tenantEquals(f.tenant, i.access.tenant) || tenantEquals(other, i.access.tenant))
            ? { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
            : { failure: { kind: 'denied' as const, action: i.action } },
      },
    }
    const { commands } = createMemoryModelCommands(both)
    unbox(await commands.admit(f.admit))
    const foreign = { ...f.admit, tenant: other }
    expect(unbox(await commands.recall({ ...foreign, admission: f.admit.operation })).kind).toBe(
      'not-accepted',
    )
    expect(unbox(await commands.query(foreign))).toEqual({ kind: 'not-committed' })
    // The owner's own read still finds it: the answer above is isolation, not loss.
    expect(unbox(await commands.recall({ ...f.admit, admission: f.admit.operation })).kind).toBe(
      'found',
    )
  })
})
