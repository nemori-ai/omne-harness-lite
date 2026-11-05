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
  const help = await run(author, 'help', { name: 'execute' }, fixture.environment)
  expect(help).toContain('Usage: Shell {"command": "execute", "params": {script, terminal?')
  expect(help).toContain('JSON Schema')
  expect(help).toContain('unsupported')
  const info = await run(author, 'info', {}, fixture.environment)
  expect(info).toContain('fixtureOS')
  // The shell that runs a script is a placement fact of info, not of the declaration (D-96).
  expect(info).toContain('shell=["/explicit-shell","-c"] cwd="/initial"')
})

it('states the four lifetime rules in help, one phrase per rule', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  const help = await run(author, 'help', {}, fixture.environment)
  // One-shot execution: what is left in the background becomes a retained process.
  expect(help).toContain('a process left running in the background by a one-shot command')
  expect(help).toContain('stays running after the call returns as a retained process')
  expect(help).toContain('info lists retained processes')
  expect(help).toContain('until it exits or the execution environment closes its retention scope')
  expect(help).toContain('is stopped when it cannot be retained; the residue line gives the reason')
  // Background execution is unsupported; a one-shot call waits for the main process.
  expect(help).toContain('run_in_background is not supported now')
  expect(help).toContain(
    'a one-shot command waits until the main process exits and output is quiet',
  )
  // Terminal tasks live with the terminal.
  expect(help).toContain('background tasks in a terminal live as long as the terminal')
  expect(help).toContain('close_session stops every process in the terminal')
  // Services meant to outlive the tool belong to the host service manager.
  expect(help).toContain('systemd-run --user')
  expect(help).toContain('an external effect of the command itself')
  // The deployment does not stop retention scopes when a session ends, so help must not say so.
  expect(help).not.toContain('session ends')
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
  // info lists each live terminal on its own line after the placement facts.
  expect(await run(author, 'info', {}, fixture.environment)).toContain(
    '\nterminal={"id":"session","generation":"1"} state=idle observed_cwd="/next"',
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
