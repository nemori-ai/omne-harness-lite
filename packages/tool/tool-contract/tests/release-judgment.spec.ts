import { describe, expect, it } from 'vitest'
import { judgeConsumerRef, judgeHandoff } from '@omne-harness/tool-contract'
import { evidence } from './tool-values.ts'

const consumer = {
  owner: 'consumer',
  work: 'work-1',
  position: 'position-1',
  purpose: 'tool-result',
}

describe('release judgment', () => {
  it('release judgment: a consumer position is closed and copied', () => {
    const judged = judgeConsumerRef(consumer)
    expect(judged).toEqual({ ok: consumer })
    if ('ok' in judged) expect(Object.isFrozen(judged.ok)).toBe(true)
    expect(judgeConsumerRef({ ...consumer, note: 'extra' })).toEqual({
      failure: { field: 'note', reason: 'unknown-field' },
    })
    expect(judgeConsumerRef({ ...consumer, work: () => 'work-1' })).toEqual({
      failure: { field: 'work', reason: 'type' },
    })
    expect(judgeConsumerRef({ ...consumer, position: '' })).toEqual({
      failure: { field: 'position', reason: 'empty' },
    })
    expect(judgeConsumerRef(null)).toEqual({ failure: { field: 'ConsumerRef', reason: 'type' } })
  })

  it('release judgment: a handoff is retained with custody or processed with completion', () => {
    const retained = { kind: 'retained', custody: evidence('kept') }
    expect(judgeHandoff(retained)).toEqual({ ok: retained })
    const processed = { kind: 'processed', completion: evidence('done') }
    expect(judgeHandoff(processed)).toEqual({ ok: processed })
    expect(judgeHandoff({ kind: 'kept' })).toEqual({ failure: { field: 'kind', reason: 'value' } })
    expect(judgeHandoff({ kind: 'retained', completion: evidence('done') })).toEqual({
      failure: { field: 'custody', reason: 'missing' },
    })
    expect(judgeHandoff({ ...retained, custody: { ...evidence('kept'), extra: 1 } })).toEqual({
      failure: { field: 'custody.extra', reason: 'unknown-field' },
    })
  })

  it('release judgment: a value that throws on read is unreadable, not a thrown error', () => {
    const trap = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error('trap')
        },
      },
    )
    expect(judgeHandoff(trap)).toMatchObject({ failure: { reason: 'unreadable' } })
  })
})
