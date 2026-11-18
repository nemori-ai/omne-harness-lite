import { expect, it } from 'vitest'
import { fetchBlobClosure } from '../src/cordis/block-read.ts'
import type { Reader } from '../src/cordis/journal-read.ts'

const unread: Reader = async () => ({ kind: 'unread', reason: 'closing' })

it('a block the store does not answer is not readable, and nothing is kept for it', async () => {
  const into = new Map<string, string>()
  expect(await fetchBlobClosure(unread, 'tenant', ['row-1'], into)).toBe('row-1')
  expect(into.size).toBe(0)
})
