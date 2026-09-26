import { expect, it } from 'vitest'
import { Input } from '@earendil-works/pi-tui'
import { FrameWriter, layout, safeText } from '../src/tui/screen.ts'

it('never grants delivery to an old revision; backpressure retains only latest', async () => {
  const writes: string[] = [],
    delivered: number[] = []
  const fence = Promise.withResolvers<void>()
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
      await fence.promise
    },
    () => {},
  )
  const submit = (revision: number) =>
    writer.submit({
      revision,
      bytes: String(revision),
      delivered: () => {
        delivered.push(revision)
      },
    })
  submit(1)
  await Promise.resolve()
  for (let i = 2; i <= 1000; i++) submit(i)
  expect(writes).toEqual(['1'])
  expect(delivered).toEqual([])
  fence.resolve()
  await new Promise(resolve => setImmediate(resolve))
  expect(writes).toEqual(['1', '1000'])
  expect(delivered).toEqual([1000])
  await writer.close()
})
it('close drops unsent frames, waits actual write and suppresses late callbacks', async () => {
  const fence = Promise.withResolvers<void>(),
    writes: string[] = []
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
      await fence.promise
    },
    () => {},
  )
  writer.submit({
    revision: 1,
    bytes: 'first',
    delivered: () => {
      throw new Error('late callback')
    },
  })
  await Promise.resolve()
  writer.submit({ revision: 2, bytes: 'unsent', delivered: () => {} })
  let closed = false
  const close = writer.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  fence.resolve()
  await close
  writer.submit({ revision: 3, bytes: 'late', delivered: () => {} })
  expect(writes).toEqual(['first'])
})
it('output failure stops output and propagates a single observable failure', async () => {
  let failures = 0
  const writer = new FrameWriter(
    async () => {
      throw new Error('broken')
    },
    () => {
      failures++
    },
  )
  writer.submit({
    revision: 1,
    bytes: '',
    delivered: () => {
      throw new Error('not delivered')
    },
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(writer.failed).toBe(true)
  expect(failures).toBe(1)
  await writer.close()
})
it('layout preserves full identities, paginates body and never changes private modes', () => {
  const input = new Input({ prompt: '> ' })
  input.focused = true
  input.setValue('中文🙂'.repeat(1000))
  const screen = {
    identity: ['Center: ' + 'c'.repeat(100), 'Account: alice', 'Organization: org'],
    title: 'Name',
    body: Array.from({ length: 100 }, (_, i) => `item ${i}`),
    footer: 'Enter: continue',
    input,
    page: 0,
  }
  const frame = layout(screen, 60, 16)
  expect(frame.fits).toBe(true)
  expect(frame.pages).toBeGreaterThan(1)
  expect(frame.bytes.replaceAll('\r\n', '')).toContain(screen.identity[0])
  expect(frame.bytes).not.toMatch(/\x1b\[\?\d+[hl]/)
  expect(input.getValue()).toBe('中文🙂'.repeat(1000))
  expect(layout(screen, 40, 10).fits).toBe(false)
  expect(layout(screen, Number.NaN, 30)).toEqual({ bytes: '', fits: false, page: 0, pages: 1 })
  expect(layout({ ...screen, identity: ['c'.repeat(3000)] }, 60, 16).fits).toBe(false)
  expect(safeText('\x1b[31m\u202e')).toBe('\\u001b[31m\\u202e')
})
