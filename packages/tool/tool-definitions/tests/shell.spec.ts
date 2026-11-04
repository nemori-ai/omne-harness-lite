import { expect, it } from 'vitest'
import { createShellAuthor } from '@omne-harness/tool-definitions'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { shellFixture } from './fixtures/shell.ts'
import { run, value } from './run-author.ts'

it('declares all Shell commands and explains platform, background and terminal semantics', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  const definition = deriveDefinition(
    {
      asset: {
        name: 'Shell',
        adoption: { owner: 'test', name: 'Shell', revision: '1', digest: 'sha256:shell' },
      },
      requiredCapabilities: [],
    },
    author.facts,
  )
  expect(judgeToolDefinition(definition)).toHaveProperty('ok')
  if (author.facts.implements.kind !== 'commands') throw new Error('commands')
  expect(author.facts.implements.commands.map(item => item.name).sort()).toEqual([
    'close_session',
    'create_session',
    'execute',
    'help',
    'info',
  ])
  expect(author.facts.implements.commands.every(item => item.parameters.kind === 'declared')).toBe(
    true,
  )
  const help = await run(author, 'help', { command: 'execute' }, fixture.environment)
  expect(help).toContain('JSON Schema')
  expect(help).toContain('unsupported')
  expect(await run(author, 'info', {}, fixture.environment)).toContain('fixtureOS')
})

it('routes one-shot commands using explicit construction and per-call cwd/env', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  expect(
    await run(
      author,
      'execute',
      { script: 'echo hi', cwd: '/override', env: { A: 'override' }, stdin: '中' },
      fixture.environment,
    ),
  ).toContain('one-shot output')
  expect(fixture.starts).toEqual([
    {
      executable: '/explicit-shell',
      args: ['-c', 'echo hi'],
      cwd: '/override',
      env: { A: 'override', BASE: 'yes' },
      stdin: new TextEncoder().encode('中'),
      outputMode: 'separate',
    },
  ])
  expect(fixture.executions).toHaveLength(0)
})

it('retains terminal cwd through the fixture and never falls back for invalid or closed references', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  const terminal = { id: 'session', generation: '1' }
  expect(await run(author, 'create_session', {}, fixture.environment)).toContain('"id":"session"')
  expect(fixture.creates[0]).toMatchObject({ retain: 'session' })
  await run(author, 'execute', { terminal, script: 'cd /next' }, fixture.environment)
  expect(await run(author, 'execute', { terminal, script: 'pwd' }, fixture.environment)).toContain(
    '/next',
  )
  await run(
    author,
    'execute',
    { terminal, script: 'pwd', cwd: '/temporary', env: { A: 'one' } },
    fixture.environment,
  )
  expect(fixture.executions.at(-1)).toMatchObject({ cwd: '/temporary', env: { A: 'one' } })
  expect(await run(author, 'execute', { terminal, script: 'pwd' }, fixture.environment)).toContain(
    '/next',
  )
  expect(await run(author, 'close_session', { terminal }, fixture.environment)).toContain(
    'confirmed',
  )
  expect(await run(author, 'execute', { terminal, script: 'pwd' }, fixture.environment)).toContain(
    'closed',
  )
  expect(
    await run(
      author,
      'execute',
      { terminal: { id: 'missing', generation: '1' }, script: 'pwd' },
      fixture.environment,
    ),
  ).toContain('notFound')
  expect(fixture.starts).toHaveLength(0)
  expect(fixture.attachments.length).toBeGreaterThan(0)
})

it('refuses a missing or denied attachment before execute and never creates a replacement', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  const terminal = { id: 'session', generation: '1' }
  const unavailable = {
    ...fixture.environment,
    terminal: {
      create: fixture.environment.terminal.create,
      execute: fixture.environment.terminal.execute,
      close: fixture.environment.terminal.close,
      list: fixture.environment.terminal.list,
    },
  }
  expect(await run(author, 'execute', { terminal, script: 'pwd' }, unavailable)).toContain(
    'unavailable',
  )
  const denied = {
    ...fixture.environment,
    terminal: {
      ...fixture.environment.terminal,
      retention: {
        attach: async () =>
          ({ kind: 'rejected', requestId: 'denied', reason: 'notAuthorized' }) as const,
        detach: async () =>
          ({ kind: 'rejected', requestId: 'denied', reason: 'notAuthorized' }) as const,
      },
    },
  }
  expect(await run(author, 'execute', { terminal, script: 'pwd' }, denied)).toContain(
    'notAuthorized',
  )
  expect(fixture.executions).toHaveLength(0)
  expect(fixture.starts).toHaveLength(0)
  expect(fixture.creates).toHaveLength(0)
  expect(await run(author, 'create_session', {}, unavailable)).toContain('unavailable')
  expect(await run(author, 'close_session', { terminal }, unavailable)).toContain('unavailable')
  expect(fixture.creates).toHaveLength(0)
  expect(fixture.executions).toHaveLength(0)
  expect(fixture.starts).toHaveLength(0)
})

it('refuses background before either facility starts and drains split UTF-8 with a complete byte bound', async () => {
  const fixture = shellFixture('首' + '中文'.repeat(500) + '尾')
  const author = value(createShellAuthor(fixture.smallConfig))
  expect(
    await run(
      author,
      'execute',
      { script: 'anything', run_in_background: true },
      fixture.environment,
    ),
  ).toContain('unsupported')
  expect(fixture.starts).toHaveLength(0)
  const result = await run(author, 'execute', { script: 'print' }, fixture.environment)
  expect(new TextEncoder().encode(result).byteLength).toBeLessThanOrEqual(512)
  expect(result).toContain('首')
  expect(result).toContain('尾')
  expect(result).toContain('truncated bytes')
  expect(result).not.toContain('�')
  expect(fixture.drained()).toBe(true)
})
