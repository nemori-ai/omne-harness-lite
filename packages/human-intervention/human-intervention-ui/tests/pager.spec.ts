import { expect, it } from 'vitest'
import { pageAfter } from '../src/model/pager.ts'

it('shows nothing when the paper has no section', () => {
  expect(pageAfter([], null, undefined)).toBeUndefined()
  expect(pageAfter([], { key: 'a', at: 0 }, 'a')).toBeUndefined()
})

it('opens on the first unanswered section, or on the first when every section is answered', () => {
  expect(pageAfter(['a', 'b', 'c'], null, 'b')).toBe('b')
  expect(pageAfter(['a', 'b', 'c'], null, undefined)).toBe('a')
})

it('keeps the section it shows while that section is still on the paper, wherever it now stands', () => {
  expect(pageAfter(['a', 'b', 'c', 'd'], { key: 'b', at: 1 }, 'a')).toBe('b')
  expect(pageAfter(['x', 'a', 'b'], { key: 'b', at: 1 }, 'x')).toBe('b')
})

it('hands over to the section now standing where the gone one stood, or to the last one', () => {
  expect(pageAfter(['a', 'c', 'd'], { key: 'b', at: 1 }, 'a')).toBe('c')
  expect(pageAfter(['a', 'b'], { key: 'c', at: 2 }, 'a')).toBe('b')
  expect(pageAfter(['a'], { key: 'b', at: 5 }, undefined)).toBe('a')
})
