import { expect, it } from 'vitest'
import {
  decodeHitlCommand,
  decideReply,
  invalidateCard,
  QuestionSchema,
} from '@omne-harness/human-intervention'

it('exposes the accepted command boundary and pure card decisions', () => {
  expect(decodeHitlCommand('submitReply', '{}')).toEqual({ kind: 'invalid-input', reason: 'shape' })
  expect(QuestionSchema.safeParse({ kind: 'question', options: [] }).success).toBe(false)
  expect(typeof decideReply).toBe('function')
  expect(typeof invalidateCard).toBe('function')
})
