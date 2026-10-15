import { expect, it } from 'vitest'
import { STREAM_ARRIVAL_STEPS, judgeStreamArrival } from '@omne-harness/stream-arrival'

it('exports the five streaming steps', () => {
  expect([...STREAM_ARRIVAL_STEPS]).toEqual(['open', 'fill', 'close', 'trim', 'finish'])
})

it('rejects a Cordis-style event name', () => {
  expect(judgeStreamArrival({ step: 'event', index: '0' })).toEqual({ rejected: 'step' })
})

it('admits an open step', () => {
  expect(judgeStreamArrival({ step: 'open', index: '0' })).toEqual({ ok: { step: 'open', index: '0' } })
})
