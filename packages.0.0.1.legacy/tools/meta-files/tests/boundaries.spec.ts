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

test('unsorted adjacent original edits apply from the end and count overlapping candidate starts', async () => {
  const h = fixture()
  h.seed('a', 'aaaabbcc')
  const result = await h.run('patch', {
    files: [
      {
        path: 'a',
        expectedVersion: 'v1',
        edits: [
          { match: { text: 'cc' }, replacement: 'longer' },
          { match: { text: 'bb' }, replacement: 'B' },
          { match: { text: 'aa', occurrence: 2 }, replacement: 'X' },
        ],
      },
    ],
  })
  expect(result).not.toHaveProperty('isError', true)
  expect(Buffer.from(h.data.get('/work/a')!.bytes).toString()).toBe('aXaBlonger')
  expect(text(result)).toContain('CONFIRMED DIFF')
})
test.each([null, [], { cwd: 'relative' }, { cwd: '/a\0b' }, { cwd: 3 }])(
  'invalid current context (%j) fails before any file call',
  async value => {
    const h = fixture()
    vi.mocked(h.deps.context.read).mockResolvedValue({
      kind: 'values',
      values: [{ key: 'files.initial', revision: 'r', observedAt: '2026-10-08T00:00:00Z', value }],
    })
    expect(text(await h.run('read', { path: '/absolute' }))).toContain('context:invalidValue')
    expect(h.files.read).not.toHaveBeenCalled()
  },
)
test('whole-file edit rejects capacity and version failures without target effects', async () => {
  const h = fixture({ maxReadBytes: 3 })
  h.seed('a', 'longer')
  expect(
    text(
      await h.run('edit', {
        path: 'a',
        expectedVersion: 'v1',
        match: { text: 'long' },
        replacement: 'x',
      }),
    ),
  ).toContain('capacity:wholeFileBytes')
  const conflict = fixture()
  conflict.seed('a', 'old')
  expect(
    text(
      await conflict.run('edit', {
        path: 'a',
        expectedVersion: 'different',
        match: { text: 'old' },
        replacement: 'new',
      }),
    ),
  ).toContain('facility:conflict')
  expect(h.files.write).not.toHaveBeenCalled()
  expect(conflict.files.write).not.toHaveBeenCalled()
})
test('original complete recognition is success and separates every observation without effects', async () => {
  const h = fixture()
  vi.mocked(h.files.recoverBatch).mockResolvedValue({
    kind: 'recognized',
    batch: { id: 'original', generation: 'g' },
    state: 'complete',
    published: ['/a'],
    matchingPrepared: ['/b'],
    conflicting: ['/c'],
  })
  const result = await h.run('patch', { recovery: { id: 'original', generation: 'g' } })
  expect(result).not.toHaveProperty('isError', true)
  expect(text(result)).toContain('recognition complete')
  expect(text(result)).toContain('/a')
  expect(text(result)).toContain('/b')
  expect(text(result)).toContain('/c')
  expect(h.files.commitBatch).not.toHaveBeenCalled()
  expect(h.files.write).not.toHaveBeenCalled()
})
