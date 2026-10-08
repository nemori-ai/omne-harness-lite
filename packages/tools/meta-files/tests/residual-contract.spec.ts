import { expect, test, vi } from 'vitest'
import { fixture, text } from './fixture.ts'

test.each(['\0a', 'a\0', 'a\0b'])(
  'a NUL at any path position is rejected before context or facilities (%j)',
  async path => {
    const h = fixture()
    expect(text(await h.run('read', { path }))).toContain('arguments:invalid')
    expect(h.deps.context.read).not.toHaveBeenCalled()
    expect(h.files.read).not.toHaveBeenCalled()
  },
)

test('every command has callable help and an unknown help command has no effects', async () => {
  const h = fixture()
  for (const [command, definition] of Object.entries(h.tool.definition.commands)) {
    expect(await h.run('help', { command })).toBe(definition.help)
    expect(definition.help).toContain('USAGE:')
  }
  expect(text(await h.run('help', { command: 'missing' }))).toContain('arguments:invalid')
  expect(h.deps.context.read).not.toHaveBeenCalled()
  expect(h.files.read).not.toHaveBeenCalled()
})

test.each([{ keys: [] }, { keys: ['other'] }, { keys: ['files.initial', 'files.initial'] }])(
  'context must return exactly the requested key (%j)',
  async ({ keys }) => {
    const h = fixture()
    vi.mocked(h.deps.context.read).mockResolvedValue({
      kind: 'values',
      values: keys.map(key => ({
        key,
        revision: 'r1',
        value: { cwd: '/work' },
        observedAt: '2026-10-08T00:00:00Z',
      })),
    })
    expect(text(await h.run('read', { path: 'a' }))).toContain('context:missingValue')
    expect(h.files.read).not.toHaveBeenCalled()
  },
)

test('stop while context is read prevents a later filesystem mutation', async () => {
  const h = fixture()
  vi.mocked(h.deps.context.read).mockImplementation(async keys => {
    h.controller.abort()
    return {
      kind: 'values',
      values: keys.map(key => ({
        key,
        revision: 'r1',
        value: { cwd: '/work' },
        observedAt: '2026-10-08T00:00:00Z',
      })),
    }
  })
  expect(text(await h.run('mkdir', { path: 'new', parents: false }))).toContain('interrupted')
  expect(h.files.mkdir).not.toHaveBeenCalled()
})

test('an incomplete small read cannot be mistaken for the complete edit source', async () => {
  const h = fixture({ maxReadBytes: 4 })
  vi.mocked(h.files.read).mockResolvedValue({
    kind: 'read',
    path: '/work/a',
    data: Buffer.from('ab'),
    offsetBytes: 0,
    nextOffsetBytes: 2,
    eof: false,
    version: 'v1',
  })
  expect(
    text(
      await h.run('edit', {
        path: 'a',
        expectedVersion: 'v1',
        match: { text: 'a' },
        replacement: 'A',
      }),
    ),
  ).toContain('capacity:wholeFileBytes')
  expect(h.files.write).not.toHaveBeenCalled()
})

test('patch permits the exact edit count limit and rejects the next edit before submission', async () => {
  for (const count of [2, 3]) {
    const h = fixture({ maxEditsPerFile: 2 })
    h.seed('a', 'abc')
    const result = await h.run('patch', {
      files: [
        {
          path: 'a',
          expectedVersion: 'v1',
          edits: ['a', 'b', 'c'].slice(0, count).map(value => ({
            match: { text: value },
            replacement: value.toUpperCase(),
          })),
        },
      ],
    })
    if (count === 2) {
      expect(result).not.toHaveProperty('isError', true)
      expect(Buffer.from(h.data.get('/work/a')!.bytes).toString()).toBe('ABc')
    } else {
      expect(text(result)).toContain('capacity:edits')
      expect(h.files.commitBatch).not.toHaveBeenCalled()
      expect(Buffer.from(h.data.get('/work/a')!.bytes).toString()).toBe('abc')
    }
  }
})

test('edit permits the exact output byte limit and rejects an oversized replacement without effects', async () => {
  for (const replacement of ['AB', 'ABC']) {
    const h = fixture({ maxWriteBytes: 2 })
    h.seed('a', 'ab')
    const result = await h.run('edit', {
      path: 'a',
      expectedVersion: 'v1',
      match: { text: 'ab' },
      replacement,
    })
    if (replacement === 'AB') {
      expect(result).not.toHaveProperty('isError', true)
      expect(Buffer.from(h.data.get('/work/a')!.bytes).toString()).toBe('AB')
    } else {
      expect(text(result)).toContain('capacity:writeBytes')
      expect(h.files.write).not.toHaveBeenCalled()
      expect(Buffer.from(h.data.get('/work/a')!.bytes).toString()).toBe('ab')
    }
  }
})

test.each(['move', 'copy'] as const)(
  '%s reports both confirmed paths and preserves explicit replacement policy',
  async command => {
    const h = fixture()
    const result = await h.run(command, { from: 'a', to: 'b', replace: false })
    expect(result).not.toHaveProperty('isError', true)
    expect(text(result)).toContain(
      command === 'move' ? 'Path move confirmed.' : 'File copy confirmed.',
    )
    expect(text(result)).toContain('/work/a')
    expect(text(result)).toContain('/work/b')
    expect(h.files[command]).toHaveBeenCalledWith({
      source: '/work/a',
      target: '/work/b',
      replace: false,
    })
    vi.mocked(h.files[command]).mockResolvedValue({ kind: 'rejected', reason: 'conflict' })
    const rejected = await h.run(command, { from: 'a', to: 'b', replace: true })
    expect(rejected).toHaveProperty('isError', true)
    expect(text(rejected)).toContain('facility:conflict')
  },
)

test('mkdir and delete expose confirmed paths and original failures', async () => {
  const h = fixture()
  for (const [command, args] of [
    ['mkdir', { path: 'a', parents: false }],
    ['delete', { path: 'a', recursive: false }],
  ] as const) {
    const result = await h.run(command, args)
    expect(result).not.toHaveProperty('isError', true)
    expect(text(result)).toContain('/work/a')
  }
  vi.mocked(h.files.mkdir).mockResolvedValue({ kind: 'rejected', reason: 'conflict' })
  vi.mocked(h.files.remove).mockResolvedValue({ kind: 'rejected', reason: 'conflict' })
  for (const [command, args] of [
    ['mkdir', { path: 'a', parents: false }],
    ['delete', { path: 'a', recursive: false }],
  ] as const) {
    const result = await h.run(command, args)
    expect(result).toHaveProperty('isError', true)
    expect(text(result)).toContain('facility:conflict')
  }
})
