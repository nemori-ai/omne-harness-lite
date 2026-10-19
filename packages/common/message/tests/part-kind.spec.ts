import { expect, it } from 'vitest'
import { judgePart } from '@omne-harness/message'

const visibility = { toHuman: true, toModel: true }
const text = { kind: 'text', id: 't1', visibility, text: 'x' }
const marker = { kind: 'tool_result', id: 'r1', visibility, callId: 'c1' }

it('rejects null as kind', () => {
  expect(judgePart(null)).toEqual({ rejected: 'kind' })
})

it('rejects undefined as kind', () => {
  expect(judgePart(undefined)).toEqual({ rejected: 'kind' })
})

it('rejects a number as kind', () => {
  expect(judgePart(5)).toEqual({ rejected: 'kind' })
})

it('rejects a string as kind', () => {
  expect(judgePart('text')).toEqual({ rejected: 'kind' })
})

it('rejects a list as kind', () => {
  expect(judgePart([])).toEqual({ rejected: 'kind' })
})

it('rejects a part without kind as kind, before any other field is judged', () => {
  const { kind: _kind, ...withoutKind } = { ...text, text: 5 }
  expect(judgePart(withoutKind)).toEqual({ rejected: 'kind' })
})

it('rejects a part whose kind is a number as kind, not as unknown', () => {
  expect(judgePart({ ...text, kind: 5 })).toEqual({ rejected: 'kind' })
})

it('rejects a part whose kind is a list that names a kind as kind, not as unknown', () => {
  expect(judgePart({ ...text, kind: ['text'] })).toEqual({ rejected: 'kind' })
})

it('admits a content block and a tool part that have no prototype', () => {
  const bareText = Object.assign(Object.create(null) as object, text)
  expect(judgePart(bareText)).toEqual({ ok: text })
  const bareMarker = Object.assign(Object.create(null) as object, marker)
  expect(judgePart(bareMarker)).toEqual({ ok: marker })
})
