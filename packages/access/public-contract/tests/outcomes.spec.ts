import { expect, it } from 'vitest'
import { OUTCOMES } from '@omne-harness/public-contract'

const BINDING_TABLE = [
  'succeeded',
  'no-change',
  'not-committed',
  'need-decision',
  'protocol-rejected',
  'invalid',
  'uniform-auth-failure',
  'denied',
  'not-loginable',
  'not-visible',
  'not-found',
  'conflict',
  'archived',
  'frozen',
  'limited',
  'unsupported',
  'not-writable',
  'stage-not-provided',
  'basis-unavailable',
  'unknown',
]

it('lists the twenty outcomes of the binding page, each once', () => {
  expect(new Set(OUTCOMES).size).toBe(OUTCOMES.length)
  expect([...OUTCOMES].sort()).toEqual([...BINDING_TABLE].sort())
  expect(OUTCOMES).toHaveLength(20)
})

it('cannot be changed by a consumer', () => {
  expect(Object.isFrozen(OUTCOMES)).toBe(true)
})
