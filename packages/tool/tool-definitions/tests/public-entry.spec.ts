import { expect, it } from 'vitest'
import { createFilesAuthor } from '@omne-harness/tool-definitions'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { run, value } from './run-author.ts'
import { filesFixture } from './fixtures/files.ts'

it('publishes declared commands and the same complete help table', async () => {
  const author = value(
    createFilesAuthor({
      kind: 'object',
      entries: [{ key: 'resultMaxBytes', value: { kind: 'number', lexeme: '32768' } }],
    }),
  )
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
  const help = await run(author, 'help', {}, filesFixture().environment)
  for (const command of commands) expect(help).toContain(command)
  expect(help).toContain('unsupported')
  expect(help).toContain('JSON Schema')
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
