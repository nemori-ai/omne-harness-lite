import { expect, it } from 'vitest'
import {
  MODALITIES,
  judgeModalities,
  judgeModality,
  missingModalities,
} from '@omne-harness/modality'

it('lists the four modalities in text, image, voice, video order and freezes the list', () => {
  expect(MODALITIES).toEqual(['text', 'image', 'voice', 'video'])
  expect(Object.isFrozen(MODALITIES)).toBe(true)
})

it.each(['text', 'image', 'voice', 'video'])('accepts the modality literal %s', literal => {
  expect(judgeModality(literal)).toEqual({ ok: literal })
})

it.each([
  ['audio', 'modality'],
  ['speech', 'modality'],
  ['Text', 'modality'],
  ['', 'modality'],
  ['file', 'modality'],
  ['thinking', 'modality'],
  [undefined, 'type'],
  [null, 'type'],
  [1, 'type'],
  [['text'], 'type'],
  [{ ok: 'text' }, 'type'],
] as const)('rejects %j with %s', (value, reason) => {
  expect(judgeModality(value)).toEqual({ rejected: reason })
})

it('accepts an empty list because non-empty is the consumer policy', () => {
  expect(judgeModalities([])).toEqual({ ok: [] })
})

it('accepts a list of known modalities and keeps their order', () => {
  expect(judgeModalities(['video', 'text'])).toEqual({ ok: ['video', 'text'] })
})

it('returns a new frozen array instead of the input array', () => {
  const input = ['text', 'image']
  const judgment = judgeModalities(input)
  if (!('ok' in judgment)) throw new Error('expected ok')
  expect(judgment.ok).not.toBe(input)
  expect(Object.isFrozen(judgment.ok)).toBe(true)
  input.push('voice')
  expect(judgment.ok).toEqual(['text', 'image'])
})

it.each([undefined, null, 'text', { length: 1, 0: 'text' }, new Set(['text'])])(
  'rejects the non-array %j with type and a null index',
  value => {
    expect(judgeModalities(value)).toEqual({ rejected: 'type', index: null })
  },
)

it('points at the first unknown element', () => {
  expect(judgeModalities(['text', 'audio', 'speech'])).toEqual({ rejected: 'modality', index: 1 })
})

it('points at a non-string element with type', () => {
  expect(judgeModalities(['text', 3])).toEqual({ rejected: 'type', index: 1 })
})

it('points at the later occurrence of a repeated modality', () => {
  expect(judgeModalities(['text', 'image', 'text'])).toEqual({ rejected: 'duplicate', index: 2 })
})

it('reports a hole in a sparse array as a type failure at the hole', () => {
  // eslint-disable-next-line no-sparse-arrays
  expect(judgeModalities(['text', , 'image'])).toEqual({ rejected: 'type', index: 1 })
})

it('reports the first error when an unknown element comes before a duplicate', () => {
  expect(judgeModalities(['audio', 'text', 'text'])).toEqual({ rejected: 'modality', index: 0 })
})

it('returns no missing modality when everything required is available', () => {
  expect(missingModalities(['text', 'image'], ['image', 'text', 'voice'])).toEqual([])
})

it('returns no missing modality when nothing is required', () => {
  expect(missingModalities([], [])).toEqual([])
})

it('returns every required modality when nothing is available', () => {
  expect(missingModalities(['image', 'text'], [])).toEqual(['text', 'image'])
})

it('orders the missing modalities by the MODALITIES order, not the input order', () => {
  expect(missingModalities(['video', 'voice', 'text'], ['text'])).toEqual(['voice', 'video'])
})

it('lists a repeated required modality once', () => {
  expect(missingModalities(['voice', 'voice', 'voice'], ['text'])).toEqual(['voice'])
})

it('ignores available modalities that nothing requires', () => {
  expect(missingModalities(['text'], ['image', 'video'])).toEqual(['text'])
})

it('returns a frozen array', () => {
  expect(Object.isFrozen(missingModalities(['text'], []))).toBe(true)
})
