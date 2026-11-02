import { expect, it } from 'vitest'
import { createFilesAuthor } from '@omne-harness/tool-definitions'
import { filesFixture } from './fixtures/files.ts'
import { run, value } from './run-author.ts'

it('preflights every patch target before any write and commits one versioned batch', async () => {
  const fixture = filesFixture({ '/a': 'a中\r\n', '/b': 'b', '/c': 'c' })
  const author = value(createFilesAuthor(fixture.config))
  const edits = [
    { path: '/a', old_text: 'a', new_text: 'A' },
    { path: '/b', old_text: 'b', new_text: 'B' },
    { path: '/c', old_text: 'absent', new_text: 'C' },
  ]
  expect(await run(author, 'patch', { edits }, fixture.environment)).toContain(
    'zero target changes',
  )
  expect(fixture.batches).toHaveLength(0)
  expect(fixture.writes).toHaveLength(0)
  expect(fixture.text('/a')).toBe('a中\r\n')
  edits[2] = { path: '/c', old_text: 'c', new_text: 'C' }
  const result = await run(author, 'patch', { edits }, fixture.environment)
  expect(result).toContain('confirmed published=["/a","/b","/c"]')
  expect(result).toContain('--- /a')
  expect(fixture.batches).toHaveLength(1)
  expect(fixture.writes).toHaveLength(0)
  expect(fixture.text('/a')).toBe('A中\r\n')
})

it('rejects duplicate and overlapping patch ranges without a batch', async () => {
  const fixture = filesFixture({ '/a': 'abcdef' })
  const author = value(createFilesAuthor(fixture.config))
  for (const oldTexts of [
    ['abc', 'abc'],
    ['abc', 'bc'],
  ]) {
    const edits = oldTexts.map(old_text => ({ path: '/a', old_text, new_text: 'x' }))
    expect(await run(author, 'patch', { edits }, fixture.environment)).toContain(
      'duplicate-or-overlapping',
    )
  }
  expect(fixture.batches).toHaveLength(0)
  expect(fixture.text('/a')).toBe('abcdef')
})

it('reports the original unknown batch with confirmed scope and planned diff without retry', async () => {
  const fixture = filesFixture({ '/a': 'a', '/b': 'b' })
  fixture.unknownBatch()
  const author = value(createFilesAuthor(fixture.config))
  const result = await run(
    author,
    'patch',
    {
      edits: [
        { path: '/a', old_text: 'a', new_text: 'A' },
        { path: '/b', old_text: 'b', new_text: 'B' },
      ],
    },
    fixture.environment,
  )
  expect(result).toContain('unknown batch={"id":"batch-original","generation":"g"}')
  expect(result).toMatch(/^unknown/)
  expect(result).toContain('confirmed published=["/a"]')
  expect(result).toContain('planned diff')
  expect(result).toContain('Do not resubmit')
  expect(fixture.batches).toHaveLength(1)
})

it('uses real entry names and preserves read, search and stat observations', async () => {
  const fixture = filesFixture({ '/中文': '中文\r\n末尾' })
  const author = value(createFilesAuthor(fixture.config))
  const listing = await run(author, 'list', { path: '/' }, fixture.environment)
  expect(listing).toContain('"中文"\tfile')
  expect(listing).toContain('next_offset=7')
  const read = await run(author, 'read', { path: '/中文' }, fixture.environment)
  expect(read).toContain('中文\r\n末尾')
  expect(read).toContain('eof=true')
  expect(read).toContain('version="1"')
  for (const match of ['name', 'content']) {
    const result = await run(
      author,
      'find',
      { path: '/', match, pattern: '中' },
      fixture.environment,
    )
    expect(result).toContain(`/${match}-hit`)
    expect(result).toContain('facility_truncated=true')
    expect(result).toContain('next_offset=2')
  }
  const info = await run(author, 'info', { path: '/中文' }, fixture.environment)
  expect(info).toContain('size_bytes=14 modified_ms=123')
  expect(info).toContain('binary_sample=no-binary-observed')
  expect(info).toContain('bounded observation')
})

it('passes file mutations through the facade and preserves refusal and unknown confirmations', async () => {
  const fixture = filesFixture()
  const author = value(createFilesAuthor(fixture.config))
  expect(
    await run(author, 'write', { path: '/a', text: '新\r\n', mode: 'create' }, fixture.environment),
  ).toContain('done')
  expect(fixture.text('/a')).toBe('新\r\n')
  expect(
    await run(
      author,
      'write',
      { path: '/a', text: 'bad', mode: 'replace', expected_version: 'stale' },
      fixture.environment,
    ),
  ).toContain('reason=conflict')
  for (const command of ['copy', 'move'])
    expect(await run(author, command, { path: '/a', target: '/b' }, fixture.environment)).toContain(
      'target="/b"',
    )
  expect(await run(author, 'mkdir', { path: '/dir' }, fixture.environment)).toContain('done')
  expect(await run(author, 'delete', { path: '/a' }, fixture.environment)).toContain('removed=')
  expect(await run(author, 'open', { path: '/image.png' }, fixture.environment)).toContain(
    'reason=unsupported',
  )
  const unknown = {
    ...fixture.environment,
    files: {
      ...fixture.environment.files,
      read: async () => ({ kind: 'unknown', requestId: 'original-read' }) as const,
    },
  }
  expect(await run(author, 'read', { path: '/a' }, unknown)).toBe('unknown request="original-read"')
})

it('requires a positive safe byte bound and rejects unexpected parameter fields', async () => {
  for (const resultMaxBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(
      createFilesAuthor({
        kind: 'object',
        entries: [
          { key: 'resultMaxBytes', value: { kind: 'number', lexeme: String(resultMaxBytes) } },
        ],
      }),
    ).toHaveProperty('failure')
  }
  expect(createFilesAuthor({ kind: 'object', entries: [] })).toHaveProperty('failure')
  const fixture = filesFixture()
  const author = value(createFilesAuthor(fixture.config))
  await expect(
    run(author, 'read', { path: '/a', unexpected: true }, fixture.environment),
  ).rejects.toThrow('invalid-field:unexpected')
})

it('reads edit pages across new handle generations and split UTF-8 while rejecting changed versions', async () => {
  const fixture = filesFixture({ '/a': '\ufeff中文old\r\n末' })
  const author = value(createFilesAuthor(fixture.config))
  let changing = false
  const environment = {
    files: {
      ...fixture.environment.files,
      read: async (args: Parameters<typeof fixture.environment.files.read>[0]) => {
        const result = await fixture.environment.files.read({ ...args, limitBytes: 2 })
        if (result.kind !== 'done') return result
        return {
          ...result,
          value: {
            ...result.value,
            version: changing && (args.offsetBytes ?? 0) > 0 ? '2' : '1',
            handle: { ...result.value.handle, generation: String(args.offsetBytes ?? 0) },
          },
        }
      },
    },
  }
  expect(
    await run(author, 'edit', { path: '/a', old_text: 'old', new_text: 'new' }, environment),
  ).toContain('applied diff')
  expect(fixture.text('/a')).toBe('\ufeff中文new\r\n末')
  changing = true
  expect(
    await run(author, 'edit', { path: '/a', old_text: 'new', new_text: 'wrong' }, environment),
  ).toContain('reason=conflict')
  expect(fixture.writes).toHaveLength(1)
})

it('bounds the complete Files text in UTF-8 and retains content head and tail', async () => {
  const fixture = filesFixture({ '/a': '首' + '中文'.repeat(500) + '尾' })
  for (const maximum of [1, 32, 512]) {
    const author = value(
      createFilesAuthor({
        kind: 'object',
        entries: [{ key: 'resultMaxBytes', value: { kind: 'number', lexeme: String(maximum) } }],
      }),
    )
    const result = await run(author, 'read', { path: '/a', limit_bytes: 4096 }, fixture.environment)
    expect(new TextEncoder().encode(result).byteLength).toBeLessThanOrEqual(maximum)
    expect(result).not.toContain('�')
    if (maximum === 512) {
      expect(result).toContain('首')
      expect(result).toContain('尾')
      expect(result).toContain('truncated bytes')
    }
  }
})

it('rejects duplicate construction fields rather than taking the last value', () => {
  const field = { key: 'resultMaxBytes', value: { kind: 'number', lexeme: '512' } } as const
  expect(createFilesAuthor({ kind: 'object', entries: [field, field] })).toHaveProperty('failure')
})

it('rejects aliased patch paths that identify the same object before commit', async () => {
  const fixture = filesFixture({ '/a': 'abc', '/alias': 'abc' })
  const author = value(createFilesAuthor(fixture.config))
  const environment = {
    files: {
      ...fixture.environment.files,
      read: async (args: Parameters<typeof fixture.environment.files.read>[0]) =>
        fixture.environment.files.read({ ...args, path: '/a' }),
    },
  }
  const result = await run(
    author,
    'patch',
    {
      edits: [
        { path: '/a', old_text: 'a', new_text: 'A' },
        { path: '/alias', old_text: 'b', new_text: 'B' },
      ],
    },
    environment,
  )
  expect(result).toContain('ambiguous-object-paths')
  expect(fixture.batches).toHaveLength(0)
  expect(fixture.writes).toHaveLength(0)
})

it('reports text-decoding refusal and bounded binary evidence without a successful text status', async () => {
  const fixture = filesFixture({ '/binary': '\0abc' })
  const author = value(createFilesAuthor(fixture.config))
  expect(await run(author, 'info', { path: '/binary' }, fixture.environment)).toContain(
    'binary_sample=binary-observed',
  )
  const environment = {
    files: {
      ...fixture.environment.files,
      read: async (args: Parameters<typeof fixture.environment.files.read>[0]) => {
        const result = await fixture.environment.files.read(args)
        return result.kind === 'done'
          ? { ...result, value: { ...result.value, bytes: new Uint8Array([0xff]) } }
          : result
      },
    },
  }
  expect(await run(author, 'read', { path: '/binary' }, environment)).toMatch(
    /^rejected.*unsupported/,
  )
})
