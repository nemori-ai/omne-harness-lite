import { expect, it } from 'vitest'
import { nonEmpty } from '../src/loop/initial-admission.ts'

it('a list with nothing in it is not a batch; any other list is, in the same order', () => {
  expect(nonEmpty([])).toBeNull()
  expect(nonEmpty(['a'])).toEqual(['a'])
  expect(nonEmpty(['a', 'b'])).toEqual(['a', 'b'])
})
