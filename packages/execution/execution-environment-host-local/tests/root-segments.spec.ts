import { expect, it } from 'vitest'
import { hostSegmentsBelowRoot } from '../src/root-segments.ts'

const below = (root: string, path: string) => hostSegmentsBelowRoot(root, path, 'linux')

it('gives the segments below the root, and none for the root itself', async () => {
  expect(await below('/srv/ws', '/srv/ws/a/b.txt')).toEqual(['a', 'b.txt'])
  expect(await below('/srv/ws/', '/srv/ws')).toEqual([])
  expect(await below('/srv/ws', '/srv//ws/./a')).toEqual(['a'])
})

it('refuses a sibling with the same prefix, a parent, a `..`, a relative path and a NUL', async () => {
  expect(await below('/srv/ws', '/srv/ws2/a')).toBeUndefined()
  expect(await below('/srv/ws', '/srv')).toBeUndefined()
  expect(await below('/srv/ws', '/srv/ws/../ws/a')).toBeUndefined()
  expect(await below('/srv/ws', 'srv/ws/a')).toBeUndefined()
  expect(await below('/srv/ws', '/srv/ws/a\0')).toBeUndefined()
})

it('compares case on POSIX', async () => {
  expect(await below('/srv/ws', '/srv/WS/a')).toBeUndefined()
})
