import { expect, it } from 'vitest'
import { createFilesAuthor } from '@omne-harness/tool-definitions'
import {
  commandGuide,
  deriveDefinition,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { run, value } from './run-author.ts'
import { filesConstruction, filesFixture } from './fixtures/files.ts'

it('publishes declared commands and the same complete help table', async () => {
  const author = value(createFilesAuthor(filesConstruction()))
  const adoption = { owner: 'test', name: 'Files', revision: '1', digest: 'sha256:files' }
  const definition = deriveDefinition(
    { asset: { name: 'Files', adoption }, requiredCapabilities: [] },
    author.facts,
  )
  expect(judgeToolDefinition(definition)).toHaveProperty('ok')
  const commands = [
    'read',
    'open',
    'write',
    'edit',
    'patch',
    'list',
    'find',
    'info',
    'move',
    'copy',
    'delete',
    'mkdir',
    'help',
  ]
  expect(author.facts.implements.kind).toBe('commands')
  if (author.facts.implements.kind !== 'commands') throw new Error('commands')
  expect(author.facts.implements.commands.map(item => item.name).sort()).toEqual(commands.sort())
  expect(author.facts.implements.commands.every(item => item.parameters.kind === 'declared')).toBe(
    true,
  )
  expect(author.facts.description).not.toContain('mkdir')
  const menu = await run(author, 'help', {}, filesFixture().environment)
  expect(menu.startsWith('done Files help\nCall with ')).toBe(true)
  for (const command of commands) expect(menu).toContain(`\n${command} {`)
  expect(menu).toContain(
    '\nopen {path} - Open one static PNG, JPEG or WebP picture so the model sees it. Returns ToolResult',
  )
  expect(author.facts.implements.commands.find(item => item.name === 'open')?.modalities).toEqual([
    'image',
  ])
  expect(author.facts.implements.commands.filter(item => 'modalities' in item)).toHaveLength(1)
  expect(author.facts.declarations.outputModalities).toEqual(['text'])
  const write = await run(author, 'help', { name: 'write' }, filesFixture().environment)
  expect(write).toContain(
    'Usage: Files {"command": "write", "params": {path, text, mode=create|replace, parents?, expected_version?}}',
  )
  expect(write.startsWith('done Files help write\nUsage: ')).toBe(true)
  expect(write).toContain('\nparents: Create missing parent directories first. Omit for false.\n')
  expect(write).toContain('JSON Schema')
  if (definition.kind !== 'commands') throw new Error('commands')
  expect(menu).toBe(`done Files help\n${commandGuide(definition)}`)
  expect(write).toBe(`done Files help write\n${commandGuide(definition, 'write')}`)
  await expect(run(author, 'help', { name: 'nope' }, filesFixture().environment)).rejects.toThrow(
    /"kind":"invalid","reason":"invalid-field:name"/,
  )
  const registration = readToolRegistration(author)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const codec = registration.operations.find(([name]) => name === 'write')![1].author.parameters
  const partial = codec.parse({ original: '{"pa', effective: '{"pa', complete: false })
  expect(partial).toMatchObject({ failure: { kind: 'incomplete' } })
})

it('checks the text a command returns against the byte budget, and codes it as strict UTF-8', () => {
  const author = value(createFilesAuthor(filesConstruction({ resultMaxBytes: 8 })))
  const registration = readToolRegistration(author)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const read = registration.operations.find(([name]) => name === 'help')![1].author
  if (read.kind !== 'ordinary') throw new Error('ordinary')
  const check = (candidate: unknown) => read.output.check({ value: candidate } as never)
  expect(check('12345678')).toEqual({ ok: '12345678' })
  expect(check('123456789')).toEqual({ failure: { reason: 'bounded-text-required' } })
  expect(check('中中中')).toEqual({ failure: { reason: 'bounded-text-required' } })
  expect(check(8)).toEqual({ failure: { reason: 'bounded-text-required' } })
  expect(read.codec.encode('中')).toEqual({ ok: new TextEncoder().encode('中') })
  expect(read.codec.encode(1 as never)).toEqual({ failure: { reason: 'text-required' } })
  expect(read.codec.decode(new TextEncoder().encode('中'))).toEqual({ ok: '中' })
  expect(read.codec.decode(new Uint8Array([0xff]))).toEqual({ failure: { reason: 'invalid-utf8' } })
})

it('checks the answer of a command that gives a program a value, and codes it as JSON', () => {
  const author = value(createFilesAuthor(filesConstruction({ resultMaxBytes: 8 })))
  const registration = readToolRegistration(author)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const read = registration.operations.find(([name]) => name === 'read')![1].author
  if (read.kind !== 'ordinary') throw new Error('ordinary')
  const check = (candidate: unknown) => read.output.check({ value: candidate } as never)
  const fits = { text: '12345678', data: { text: 'a whole page that is longer than the text' } }
  expect(check(fits)).toEqual({ ok: fits })
  expect(check({ text: '123456789' })).toEqual({ failure: { reason: 'bounded-answer-required' } })
  expect(check('12345678')).toEqual({ failure: { reason: 'bounded-answer-required' } })
  const coded = read.codec.encode(fits as never)
  if (!('ok' in coded)) throw new Error('encode')
  expect(read.codec.decode(coded.ok)).toEqual({ ok: fits })
  expect(read.codec.encode('text' as never)).toEqual({ failure: { reason: 'answer-required' } })
  expect(read.codec.decode(new TextEncoder().encode('"text"'))).toEqual({
    failure: { reason: 'answer-required' },
  })
  expect(read.codec.decode(new Uint8Array([0xff]))).toEqual({
    failure: { reason: 'invalid-answer' },
  })
  if (read.program.kind !== 'json') throw new Error('json')
  expect(read.program.encode(fits as never)).toEqual({
    ok: {
      kind: 'object',
      entries: [{ key: 'text', value: { kind: 'string', value: fits.data.text } }],
    },
  })
  expect(read.program.encode({ text: 'refused' } as never)).toEqual({ ok: null })
  expect(read.renderer.render(fits as never)).toEqual({ ok: '12345678' })
})

it('creates missing parents before a write only when asked', async () => {
  const fixture = filesFixture()
  const author = value(createFilesAuthor(fixture.config))
  const write = (path: string, parents: boolean) =>
    run(author, 'write', { path, text: 'x', mode: 'create', parents }, fixture.environment)
  expect(await write('/src/lib/a.ts', true)).toContain('done')
  expect(await write('/exists/b.ts', true)).toContain('done')
  expect(await write('/plain/c.ts', false)).toContain('done')
  expect(await write('/d.ts', true)).toContain('done')
  expect(await write('C:/e.ts', true)).toContain('done')
  expect(await write('/refused/f.ts', true)).toMatch(/^rejected request=.* reason=unsupported$/u)
  expect(fixture.mkdirs).toEqual([
    { path: '/src/lib', parents: true },
    { path: '/exists', parents: true },
    { path: '/refused', parents: true },
  ])
  expect(fixture.writes.map(item => item.path)).toEqual([
    '/src/lib/a.ts',
    '/exists/b.ts',
    '/plain/c.ts',
    '/d.ts',
    'C:/e.ts',
  ])
})

it('edits exactly one match without changing Chinese, CRLF or missing final newline', async () => {
  const fixture = filesFixture({ '/a': '中文\r\nold\r\n末尾' })
  const author = value(createFilesAuthor(fixture.config))
  const result = await run(
    author,
    'edit',
    { path: '/a', old_text: 'old', new_text: 'new' },
    fixture.environment,
  )
  expect(result).toContain('done')
  expect(result).toContain('--- /a')
  expect(result).toContain('+new\r')
  expect(fixture.text('/a')).toBe('中文\r\nnew\r\n末尾')
  expect(fixture.writes[0]?.expectedVersion).toBe('1')
  for (const old_text of ['missing', '末']) {
    fixture.set('/a', '末末')
    expect(
      await run(author, 'edit', { path: '/a', old_text, new_text: 'x' }, fixture.environment),
    ).toContain('rejected')
  }
  expect(fixture.writes).toHaveLength(1)
})
