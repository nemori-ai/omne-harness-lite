import { stripTypeScriptTypes } from 'node:module'
import { expect, it } from 'vitest'
import { programSignature, type ToolDefinition } from '@omne-harness/tool-contract/provider'
import { createFilesAuthor, PROGRAM_DATA_MAX_BYTES } from '@omne-harness/tool-definitions'
import { READ_PAGE_MAX_BYTES } from '../src/files.ts'
import { bounded } from '../src/text.ts'
import { filesFixture } from './fixtures/files.ts'
import { runRaw, value } from './run-author.ts'

const author = (fixture: ReturnType<typeof filesFixture>) =>
  value(createFilesAuthor(fixture.config))
const answered = async (fixture: ReturnType<typeof filesFixture>, command: string, args: unknown) =>
  (await runRaw(author(fixture), command, args, fixture.environment)) as {
    text: string
    data?: unknown
  }

function definitionOf(implementation: ReturnType<typeof author>): ToolDefinition {
  const { facts } = implementation
  return {
    ...facts,
    ...facts.implements,
    adoption: { owner: 'test', name: 'Files', revision: '1', digest: 'sha256:files' },
    name: 'Files',
    requiredCapabilities: [],
    programmable: true,
  } as unknown as ToolDefinition
}

it('says of every command how it faces a program', () => {
  const definition = definitionOf(author(filesFixture()))
  if (definition.kind !== 'commands') throw new Error('commands')
  expect(Object.fromEntries(definition.commands.map(one => [one.name, one.program?.kind]))).toEqual(
    {
      read: 'open',
      open: 'closed',
      write: 'open',
      edit: 'open',
      patch: 'open',
      list: 'open',
      find: 'open',
      info: 'open',
      move: 'open',
      copy: 'open',
      delete: 'open',
      mkdir: 'open',
      help: 'closed',
    },
  )
  const reads = definition.commands.filter(one =>
    ['read', 'list', 'find', 'info'].includes(one.name),
  )
  expect(
    reads.map(one => one.returns.program.kind === 'json' && one.returns.program.external),
  ).toEqual([false, false, false, false])
})

it('gives a program the whole page of a read while the reader gets a bounded text', async () => {
  const body = `${'line of text\n'.repeat(16_000)}end`
  const fixture = filesFixture({ '/big.txt': body })
  expect(body.length).toBeGreaterThan(200_000)
  const read = await answered(fixture, 'read', { path: '/big.txt', limit_bytes: 300_000 })
  expect(new TextEncoder().encode(bounded(read.text, 32_768)).byteLength).toBeLessThanOrEqual(
    32_768,
  )
  expect(bounded(read.text, 32_768)).toContain('[tool truncated bytes ')
  expect(read.data).toEqual({
    text: body,
    offset_bytes: 0,
    next_offset_bytes: body.length,
    eof: true,
    version: '1',
  })
  const first = await answered(fixture, 'read', { path: '/big.txt' })
  expect(first.data).toMatchObject({ offset_bytes: 0, next_offset_bytes: 32_768, eof: false })
  const paged = await answered(fixture, 'read', {
    path: '/big.txt',
    offset_bytes: 13,
    limit_bytes: 26,
  })
  expect(paged.data).toMatchObject({
    text: 'line of text\nline of text\n',
    offset_bytes: 13,
    next_offset_bytes: 39,
    eof: false,
  })
})

it('never takes a page larger than the value a program may be given', async () => {
  const fixture = filesFixture({ '/huge.txt': 'x'.repeat(READ_PAGE_MAX_BYTES + 10) })
  const read = await answered(fixture, 'read', { path: '/huge.txt', limit_bytes: 50_000_000 })
  expect(read.data).toMatchObject({ next_offset_bytes: READ_PAGE_MAX_BYTES, eof: false })
  expect(PROGRAM_DATA_MAX_BYTES).toBeGreaterThanOrEqual(6 * READ_PAGE_MAX_BYTES)
})

it('gives no value when the facility refuses, so that a program sees a failure', async () => {
  const fixture = filesFixture({ '/a.txt': 'alpha' })
  const read = await answered(fixture, 'read', { path: '/absent.txt' })
  expect(read.text).toMatch(/^rejected /)
  expect('data' in read).toBe(false)
  const environment = {
    ...fixture.environment,
    files: {
      ...fixture.environment.files,
      write: async () => ({ kind: 'rejected', requestId: 'fixture', reason: 'conflict' }) as const,
    },
  }
  const written = (await runRaw(
    author(fixture),
    'write',
    { path: '/a.txt', text: 'x', mode: 'create' },
    environment,
  )) as { text: string }
  expect(written.text).toMatch(/^rejected /)
  expect('data' in written).toBe(false)
})

it('gives the entries, hits and facts of the reading commands as values', async () => {
  const fixture = filesFixture({ '/a.txt': 'alpha', '/b.txt': 'beta' })
  expect((await answered(fixture, 'list', { path: '/' })).data).toEqual({
    entries: [
      { name: 'a.txt', type: 'file', size_bytes: 5 },
      { name: 'b.txt', type: 'file', size_bytes: 4 },
    ],
    next_offset: 7,
  })
  expect((await answered(fixture, 'info', { path: '/a.txt' })).data).toEqual({
    type: 'file',
    size_bytes: 5,
    modified_ms: 123,
    version: '1',
  })
  const found = await answered(fixture, 'find', { path: '/', pattern: 'a', match: 'name' })
  expect(found.data).toMatchObject({ hits: expect.any(Array), truncated: expect.any(Boolean) })
})

it('gives the writing commands a small value that says they were done', async () => {
  const fixture = filesFixture({ '/a.txt': 'alpha' })
  const created = await answered(fixture, 'write', { path: '/new.txt', text: 'x', mode: 'create' })
  expect(created.data).toMatchObject({ version: expect.any(String) })
  const edited = await answered(fixture, 'edit', {
    path: '/a.txt',
    old_text: 'alpha',
    new_text: 'beta',
  })
  expect(edited.data).toMatchObject({ version: expect.any(String) })
  expect(fixture.text('/a.txt')).toBe('beta')
  const missed = await answered(fixture, 'edit', {
    path: '/a.txt',
    old_text: 'nope',
    new_text: 'x',
  })
  expect('data' in missed).toBe(false)
})

it('derives the functions a program writes, and TypeScript accepts them', () => {
  const text = programSignature(definitionOf(author(filesFixture())))
  expect(text).toContain(
    'read(params: { path: string; offset_bytes?: number; limit_bytes?: number }): Promise<{ text: string; offset_bytes: number; next_offset_bytes: number; eof: boolean; version: string }>',
  )
  expect(text).toContain(
    'list(params: { path: string; offset?: number; limit?: number }): Promise<{ entries: { name: string; type: "file" | "directory" | "symlink"; size_bytes: number }[]; next_offset: number | null }>',
  )
  expect(text).not.toMatch(/\bopen\(|\bhelp\(/)
  expect(
    stripTypeScriptTypes(text)
      .replaceAll(/\/\*\*.*?\*\//gs, '')
      .trim(),
  ).toBe('')
})
