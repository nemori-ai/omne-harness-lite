import { expect, it } from 'vitest'
import { ack, fail, isSuccess, succeed } from '@omne-harness/kernel-basis'

it('returns a valued success without a string ok', () => {
  const valued = succeed({ id: 'job-1' })
  expect(valued).toEqual({ ok: { id: 'job-1' } })
  expect(isSuccess(valued)).toBe(true)
  if (isSuccess(valued)) expect(valued.ok).toEqual({ id: 'job-1' })
})

it('returns an empty acknowledgement whose ok is true', () => {
  const empty = ack()
  expect(empty).toEqual({ ok: true })
  expect(isSuccess(empty)).toBe(true)
  if (isSuccess(empty)) expect(empty.ok).toBe(true)
})

it('returns a failure object that is not success', () => {
  const broken = fail('rejected' as const)
  expect(broken).toEqual({ failure: 'rejected' })
  expect(isSuccess(broken)).toBe(false)
  expect('ok' in broken).toBe(false)
})
