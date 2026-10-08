import { expect, test, vi } from 'vitest'
import { fixture, text } from './fixture.ts'

test('base64 padding does not reject a single decoded byte within the explicit write limit', async () => {
  const h = fixture({ maxWriteBytes: 1 })
  expect(
    text(await h.run('write', { path: 'a', content: 'YQ==', encoding: 'base64', mode: 'create' })),
  ).toContain('File write confirmed')
  expect(Array.from(h.data.get('/work/a')!.bytes)).toEqual([97])
  expect(
    text(await h.run('write', { path: 'b', content: 'YWI=', encoding: 'base64', mode: 'create' })),
  ).toContain('capacity:writeBytes')
  expect(h.data.has('/work/b')).toBe(false)
})

test('cancel and context denial never reach file effects', async () => {
  const h = fixture()
  h.controller.abort()
  expect(text(await h.run('read', { path: 'a' }))).toContain('interrupted')
  expect(h.deps.context.read).not.toHaveBeenCalled()
  const denied = fixture()
  vi.mocked(denied.deps.context.read).mockResolvedValue({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(text(await denied.run('read', { path: 'a' }))).toContain('context:notAuthorized')
  expect(denied.files.read).not.toHaveBeenCalled()
})
test('author rejects empty and duplicate patch batches before any submission', async () => {
  const h = fixture()
  h.seed('a', 'old')
  expect(text(await h.run('patch', { files: [] }))).toContain('arguments:invalid')
  const target = {
    path: 'a',
    expectedVersion: 'v1',
    edits: [{ match: { text: 'old' }, replacement: 'new' }],
  }
  expect(text(await h.run('patch', { files: [target, { ...target, path: './a' }] }))).toContain(
    'duplicatePath',
  )
  expect(h.files.commitBatch).not.toHaveBeenCalled()
  expect(h.files.read).not.toHaveBeenCalled()
})
test('read and paging capacities fail explicitly, search preserves coordinates and continuation', async () => {
  const h = fixture({ maxReadBytes: 4, maxPageEntries: 2 })
  expect(text(await h.run('read', { path: 'a', limitBytes: 5 }))).toContain('capacity:readBytes')
  expect(text(await h.run('list', { path: '.', limit: 3 }))).toContain('capacity:pageEntries')
  expect(
    text(
      await h.run('find', { root: '.', mode: 'content', pattern: 'x', recursive: false, limit: 3 }),
    ),
  ).toContain('capacity:pageEntries')
  expect(h.files.read).not.toHaveBeenCalled()
  expect(h.files.list).not.toHaveBeenCalled()
  const found = text(
    await h.run('find', {
      root: '.',
      mode: 'content',
      pattern: 'x',
      recursive: false,
      offset: 1,
      limit: 2,
    }),
  )
  expect(h.files.search).toHaveBeenCalledWith({
    path: '/work',
    match: 'content',
    pattern: 'x',
    recursive: false,
    offset: 1,
    limit: 2,
  })
  expect(found).toContain('/work/first')
  expect(found).toContain('7')
  expect(found).toContain('true')
  expect(found).toContain('3')
})
test('bounded info sample distinguishes binary, unavailable content and incomplete UTF8 tails', async () => {
  const h = fixture({ maxReadBytes: 4 })
  h.seed('a', new Uint8Array([65, 66, 67, 0xe4, 0xbd, 0xa0]))
  vi.mocked(h.files.stat).mockResolvedValue({
    kind: 'stat',
    value: { path: '/work/a', type: 'file', sizeBytes: 6, modifiedMs: 0, version: 'v1' },
  })
  const sampled = text(await h.run('info', { path: 'a' }))
  expect(sampled).toMatch(/binary_sample\s*: false/)
  expect(sampled).toMatch(/sample_complete\s*: false/)
  h.seed('a', new Uint8Array([0]))
  expect(text(await h.run('info', { path: 'a' }))).toMatch(/binary_sample\s*: true/)
  vi.mocked(h.files.read).mockResolvedValue({ kind: 'rejected', reason: 'notAuthorized' })
  expect(text(await h.run('info', { path: 'a' }))).toContain('unavailable:notAuthorized')
})
