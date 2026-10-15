import { expect, it } from 'vitest'
import { STREAM_ARRIVAL_STEPS, judgeStreamArrival } from '@omne-harness/stream-arrival'

it('exports the five streaming steps', () => {
  expect([...STREAM_ARRIVAL_STEPS]).toEqual(['open', 'fill', 'close', 'trim', 'finish'])
})

it('admits each step name with an index', () => {
  for (const step of STREAM_ARRIVAL_STEPS) {
    expect(judgeStreamArrival({ step, index: '0' })).toEqual({ ok: { step, index: '0' } })
  }
})

it('rejects a Cordis-style event name', () => {
  expect(judgeStreamArrival({ step: 'event', index: '0' })).toEqual({ rejected: 'step' })
})

it('rejects a missing, empty, or non-string index', () => {
  expect(judgeStreamArrival({ step: 'open' })).toEqual({ rejected: 'index' })
  expect(judgeStreamArrival({ step: 'open', index: '' })).toEqual({ rejected: 'index' })
  expect(judgeStreamArrival({ step: 'open', index: 0 })).toEqual({ rejected: 'index' })
})
