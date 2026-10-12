import { describe, expect, it, vi } from 'vitest'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import {
  modelEntry,
  toolAttributeDeclarations,
  judgeToolReturn,
  type ToolReturn,
} from '@omne-harness-lite/tool-definition'
import { createShellTool, SHELL_CONTEXT_KEY } from '../src/index.ts'
import { fixture } from './fixture.ts'

const options = {
  shell: { executable: '/bin/bash', args: ['--noprofile', '--norc'] },
  maxOutputBytes: 4096,
}
function decoded(result: ToolReturn) {
  if (typeof result === 'string') throw new Error('Structured result required')
  const block = result.content[0]
  if (block?.kind !== 'text') throw new Error('Text result required')
  return JSON.parse(block.text)
}
describe('Shell declarations and explicit context', () => {
  it('rejects invalid construction policy before any execution', () => {
    for (const maxOutputBytes of [0, -1, 1.5, NaN, Infinity])
      expect(() => createShellTool({ ...options, maxOutputBytes })).toThrow(TypeError)
    expect(createShellTool({ ...options, maxOutputBytes: 1 }).definition.name).toBe('Shell')
    for (const executable of ['', '/bin/bash\0'])
      expect(() => createShellTool({ ...options, shell: { executable, args: [] } })).toThrow(
        TypeError,
      )
    expect(() =>
      createShellTool({
        ...options,
        shell: { executable: '/bin/bash', args: ['valid', 'bad\0argument'] },
      }),
    ).toThrow(TypeError)
    expect(() => createShellTool({ ...options, contextKey: '' })).toThrow(TypeError)
  })
  it('returns the exact created terminal observation and preserves creation overrides', async () => {
    const h = fixture()
    const result = await createShellTool(options).executor(
      { command: 'create_session', args: { cwd: '/explicit', envs: { NOTE: 'override' } } },
      h.deps,
    )
    expect(h.command.createTerminal).toHaveBeenCalledExactlyOnceWith({
      cwd: '/explicit',
      env: { PATH: '/custom/path', NOTE: 'override' },
    })
    expect(decoded(result)).toEqual({
      kind: 'session',
      terminal_id: JSON.stringify(h.terminal),
      environment: h.deps.environment!.description,
      observation: { terminal: h.terminal, state: 'idle', observedCwd: '/selected/workspace' },
    })
    expect(result).not.toHaveProperty('isError')
  })
  it.each(['id', 'generation'] as const)(
    'does not accept an observation with another %s',
    async key => {
      const h = fixture()
      vi.mocked(h.command.terminals).mockResolvedValue({
        kind: 'terminals',
        values: [
          { terminal: { ...h.terminal, [key]: 'different' }, state: 'idle', observedCwd: '/other' },
        ],
      })
      const result = await createShellTool(options).executor({ command: 'create_session' }, h.deps)
      expect(decoded(result)).toEqual({
        kind: 'rejected',
        reason: 'created:observation:missing',
        detail: { terminal_id: JSON.stringify(h.terminal) },
      })
      expect(result).toMatchObject({ isError: true })
      expect(h.command.createTerminal).toHaveBeenCalledTimes(1)
    },
  )
  it.each(['empty', 'wrongKey', 'multiple'] as const)(
    'rejects %s context value sets without external effects',
    async mode => {
      const h = fixture(),
        current = await h.deps.context.read([SHELL_CONTEXT_KEY])
      if (current.kind !== 'values') throw new Error('Fixture context unavailable')
      vi.mocked(h.deps.context.read).mockResolvedValue({
        kind: 'values',
        values:
          mode === 'empty'
            ? []
            : mode === 'multiple'
              ? [...current.values, ...current.values]
              : current.values.map(value => ({ ...value, key: 'wrong' })),
      })
      const result = await createShellTool(options).executor(
        { command: 'execute', args: { command: 'work' } },
        h.deps,
      )
      expect(decoded(result).reason).toBe('context:missingValue')
      expect(result).toMatchObject({ isError: true })
      expect(h.command.start).not.toHaveBeenCalled()
    },
  )
  it.each(['create_session', 'execute', 'info'] as const)(
    'cancellation during context read prevents %s from starting',
    async command => {
      const h = fixture(),
        value = await h.deps.context.read([SHELL_CONTEXT_KEY])
      vi.mocked(h.deps.context.read).mockImplementation(async () => {
        h.controller.abort()
        return value
      })
      const result = await createShellTool(options).executor(
        { command, ...(command === 'execute' ? { args: { command: 'work' } } : {}) },
        h.deps,
      )
      expect(decoded(result).reason).toBe('interrupted')
      expect(h.command.start).not.toHaveBeenCalled()
      expect(h.command.createTerminal).not.toHaveBeenCalled()
    },
  )
  it('declares background eligibility and configurable PT10M upper waiting threshold', () => {
    const { definition } = createShellTool(options)
    expect(definition.allowBackground).toBe(true)
    expect(definition.settings?.backgroundThreshold).toEqual({
      category: 'preference',
      default: 'PT10M',
    })
    expect(definition.settings?.timeout).toBeUndefined()
    expect(definition.settings?.targetEnvironment).toEqual({
      category: 'placement_identity',
      default: { bindingLayer: 'host_machine', facilities: ['command'] },
    })
    expect(definition.permissions).toEqual({ execute: { default: 'ask' } })
    const custom = createShellTool({ ...options, backgroundThreshold: 'PT30S' })
    expect(custom.definition.settings?.backgroundThreshold?.default).toBe('PT30S')
    expect(custom.definition.help).toContain('threshold is PT30S')
    expect(custom.definition.help).not.toContain('The default threshold is 10 minutes.')
    expect(toolAttributeDeclarations(custom.definition)).toContainEqual(
      expect.objectContaining({
        item: 'backgroundThreshold',
        kind: 'setting',
        category: 'preference',
        default: 'PT30S',
      }),
    )
    expect(() => createShellTool({ ...options, backgroundThreshold: 'ten minutes' })).toThrow()
  })
  it('projects only five command summaries, while help supplies complete arguments', async () => {
    const tool = createShellTool(options),
      h = fixture()
    expect(Object.keys(tool.definition.commands)).toEqual([
      'help',
      'create_session',
      'execute',
      'close_session',
      'info',
    ])
    const model = modelEntry(tool.definition)
    expect(JSON.stringify(model)).not.toContain('run_in_background')
    const help = await tool.executor({ command: 'help', args: { command: 'execute' } }, h.deps)
    expect(help).toContain('--run-in-background')
    expect(h.deps.context.read).not.toHaveBeenCalled()
    expect(h.command.start).not.toHaveBeenCalled()
  })
  it('reads current initial values and overlays only explicit one-time values', async () => {
    const tool = createShellTool(options),
      h = fixture()
    const result = await tool.executor(
      { command: 'execute', args: { command: 'printf original', envs: { NOTE: 'override' } } },
      h.deps,
    )
    expect(h.deps.context.read).toHaveBeenCalledWith([SHELL_CONTEXT_KEY])
    expect(h.command.start).toHaveBeenCalledWith({
      executable: '/bin/bash',
      args: ['--noprofile', '--norc', '-c', 'printf original'],
      cwd: '/selected/workspace',
      env: { PATH: '/custom/path', NOTE: 'override' },
    })
    expect(decoded(result).environment.instance.id).toBe('selected-instance')
    expect(decoded(result).output.streams[0].text).toBe('from-selected-provider')
    expect(judgeToolReturn(result)).toEqual({ ok: true })
  })
  it('fails unavailable context without ambient fallback or effects', async () => {
    const h = fixture()
    vi.mocked(h.deps.context.read).mockResolvedValue({
      kind: 'rejected',
      reason: 'missingRegistration',
    })
    const result = await createShellTool(options).executor(
      { command: 'execute', args: { command: 'pwd', cwd: '/override' } },
      h.deps,
    )
    expect(decoded(result).reason).toBe('context:missingRegistration')
    expect(h.command.start).not.toHaveBeenCalled()
  })
  it.each<JsonValue>([
    { cwd: '/selected', envs: { SECRET: 4 } },
    { cwd: '/selected', envs: { VALID: 'yes', SECRET: 4 } },
    { cwd: '/selected', envs: { VALID: 'yes', 'BAD=NAME': 'value' } },
    { cwd: '', envs: {} },
    { cwd: 7, envs: {} },
    { cwd: true, envs: {} },
    { cwd: {}, envs: {} },
    { cwd: '/bad\0path', envs: {} },
    { cwd: '/selected', envs: { '': 'empty-name' } },
    { cwd: '/selected', envs: { 'BAD=NAME': 'value' } },
    { cwd: '/selected', envs: { 'BAD\0NAME': 'value' } },
    { cwd: '/selected', envs: { NAME: 'bad\0value' } },
    { cwd: '/selected', envs: [] },
    { cwd: '/selected', envs: 'ambient' },
    { cwd: '/selected', envs: {}, extra: 'undeclared' },
    null,
  ])('rejects invalid initial values before starting (%j)', async value => {
    const h = fixture()
    vi.mocked(h.deps.context.read).mockResolvedValue({
      kind: 'values',
      values: [
        {
          key: SHELL_CONTEXT_KEY,
          revision: 'bad',
          value,
          observedAt: '2026-10-07T00:00:00Z',
        },
      ],
    })
    expect(
      decoded(await createShellTool(options).executor({ command: 'create_session' }, h.deps))
        .reason,
    ).toBe('context:invalidValue')
    expect(h.command.createTerminal).not.toHaveBeenCalled()
  })
  it('does not reset a persistent terminal from initial context', async () => {
    const h = fixture()
    const session_id = JSON.stringify(h.terminal)
    await createShellTool(options).executor(
      { command: 'execute', args: { session_id, command: 'pwd', envs: { TEMP: 'yes' } } },
      h.deps,
    )
    expect(h.deps.context.read).not.toHaveBeenCalled()
    expect(h.command.executeTerminal).toHaveBeenCalledWith({
      terminal: h.terminal,
      script: 'pwd',
      env: { TEMP: 'yes' },
    })
    expect(h.command.start).not.toHaveBeenCalled()
  })
  it('uses the declared default context key and permits an explicitly empty environment', async () => {
    const h = fixture()
    vi.mocked(h.deps.context.read).mockImplementation(async keys => ({
      kind: 'values',
      values:
        keys[0] === 'shell.initial'
          ? [
              {
                key: 'shell.initial',
                revision: 'empty-env',
                observedAt: '2026-10-07T00:00:00Z',
                value: { cwd: '/selected/empty', envs: {} },
              },
            ]
          : [],
    }))
    const result = await createShellTool(options).executor(
      { command: 'execute', args: { command: 'pwd' } },
      h.deps,
    )
    expect(result).not.toHaveProperty('isError')
    expect(h.command.start).toHaveBeenCalledExactlyOnceWith({
      executable: '/bin/bash',
      args: ['--noprofile', '--norc', '-c', 'pwd'],
      cwd: '/selected/empty',
      env: {},
    })
  })
  it('rejects malformed or duplicate-member terminal references without fallback', async () => {
    const tool = createShellTool(options),
      h = fixture()
    for (const session_id of [
      'missing',
      'null',
      '[]',
      '{"id":"","generation":"g"}',
      '{"id":4,"generation":"g"}',
      '{"id":"a","generation":""}',
      '{"id":"a","generation":4}',
      '{"id":"one","id":"two","generation":"g"}',
      '{"id":"a","generation":"g","extra":1}',
    ]) {
      expect(
        decoded(
          await tool.executor({ command: 'execute', args: { command: 'pwd', session_id } }, h.deps),
        ).reason,
      ).toBe('arguments:invalidTerminal')
    }
    expect(h.command.start).not.toHaveBeenCalled()
    expect(h.command.executeTerminal).not.toHaveBeenCalled()
  })
  it('rejects unknown parameters and commands before facility calls', async () => {
    const tool = createShellTool(options),
      h = fixture()
    for (const args of [
      { command: 'execute', args: { command: 'pwd', background: true } },
      { command: 'missing' },
      { command: 'execute', args: { command: '' } },
      { command: 'execute', args: {} },
      { command: 'close_session', args: {} },
    ]) {
      expect(decoded(await tool.executor(args, h.deps)).reason).toBe('arguments:invalid')
    }
    expect(h.command.start).not.toHaveBeenCalled()
    expect(h.command.closeTerminal).not.toHaveBeenCalled()
  })
  it('retains the original created reference when subsequent observation fails', async () => {
    const tool = createShellTool(options),
      h = fixture()
    vi.mocked(h.command.terminals).mockResolvedValue({ kind: 'rejected', reason: 'unavailable' })
    const result = await tool.executor({ command: 'create_session' }, h.deps)
    expect(decoded(result)).toEqual({
      kind: 'rejected',
      reason: 'created:observation:unavailable',
      detail: { terminal_id: JSON.stringify(h.terminal) },
    })
    expect(h.command.createTerminal).toHaveBeenCalledTimes(1)
    expect(h.command.closeTerminal).not.toHaveBeenCalled()
  })
  it('does not turn an unconfirmed closure into success', async () => {
    const h = fixture()
    vi.mocked(h.command.closeTerminal).mockResolvedValue({ kind: 'closed', status: 'unconfirmed' })
    const result = await createShellTool(options).executor(
      { command: 'close_session', args: { session_id: JSON.stringify(h.terminal) } },
      h.deps,
    )
    expect(decoded(result).status).toBe('unconfirmed')
    expect(result).toMatchObject({ isError: true })
  })
  it('returns confirmed closure for the original reference', async () => {
    const h = fixture(),
      session_id = JSON.stringify(h.terminal)
    const result = await createShellTool(options).executor(
      { command: 'close_session', args: { session_id } },
      h.deps,
    )
    expect(decoded(result)).toEqual({
      kind: 'closure',
      terminal_id: session_id,
      status: 'confirmed',
    })
    expect(result).not.toHaveProperty('isError')
    expect(h.command.closeTerminal).toHaveBeenCalledExactlyOnceWith(h.terminal)
    expect(h.deps.context.read).not.toHaveBeenCalled()
  })
  it.each(['create_session', 'execute', 'close_session', 'info'] as const)(
    'preserves facility refusal without author retry for %s',
    async command => {
      const h = fixture()
      vi.mocked(h.command.createTerminal).mockResolvedValue({
        kind: 'rejected',
        reason: 'unavailable',
      })
      vi.mocked(h.command.start).mockResolvedValue({ kind: 'rejected', reason: 'unavailable' })
      vi.mocked(h.command.closeTerminal).mockResolvedValue({
        kind: 'rejected',
        reason: 'unavailable',
      })
      const result = await createShellTool(options).executor(
        {
          command,
          ...(command === 'execute'
            ? { args: { command: 'work' } }
            : command === 'close_session'
              ? { args: { session_id: JSON.stringify(h.terminal) } }
              : {}),
        },
        h.deps,
      )
      expect(decoded(result)).toEqual({ kind: 'rejected', reason: 'facility:unavailable' })
      expect(result).toMatchObject({ isError: true })
      expect(
        vi.mocked(h.command.start).mock.calls.length +
          vi.mocked(h.command.createTerminal).mock.calls.length +
          vi.mocked(h.command.closeTerminal).mock.calls.length,
      ).toBe(1)
    },
  )
  it.each(['environment', 'command'] as const)(
    'rejects a missing %s dependency before context or effects',
    async missing => {
      const h = fixture()
      const { environment: _environment, ...withoutEnvironment } = h.deps
      const deps =
        missing === 'environment'
          ? withoutEnvironment
          : { ...h.deps, environment: { description: h.deps.environment!.description } }
      const result = await createShellTool(options).executor(
        { command: 'execute', args: { command: 'work' } },
        deps,
      )
      expect(decoded(result)).toEqual({ kind: 'rejected', reason: 'facility:unavailable' })
      expect(h.deps.context.read).not.toHaveBeenCalled()
      expect(h.command.start).not.toHaveBeenCalled()
    },
  )
  it('queries info through the selected facility without local ambient observations', async () => {
    const h = fixture()
    const result = await createShellTool(options).executor({ command: 'info' }, h.deps)
    expect(h.command.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/selected/workspace',
        env: { PATH: '/custom/path', NOTE: 'from-context' },
      }),
    )
    expect(decoded(result).environment.instance.id).toBe('selected-instance')
  })
  it('keeps background intent independent of original execution and stop', async () => {
    const h = fixture()
    await createShellTool({ ...options, backgroundThreshold: 'PT0.001S' }).executor(
      { command: 'execute', args: { command: 'work', run_in_background: true } },
      h.deps,
    )
    expect(h.command.start).toHaveBeenCalledTimes(1)
    expect(h.process.stop).not.toHaveBeenCalled()
    expect(h.command.start).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['--noprofile', '--norc', '-c', 'work'] }),
    )
  })
})

it('uses explicit one-shot cwd and merges environment overrides with Runtime Context', async () => {
  const h = fixture()
  const result = await createShellTool(options).executor(
    {
      command: 'execute',
      args: { command: 'work', cwd: '/one-shot', envs: { NOTE: 'override', EXTRA: 'new' } },
    },
    h.deps,
  )
  expect(h.command.start).toHaveBeenCalledExactlyOnceWith({
    executable: '/bin/bash',
    args: ['--noprofile', '--norc', '-c', 'work'],
    cwd: '/one-shot',
    env: { PATH: '/custom/path', NOTE: 'override', EXTRA: 'new' },
  })
  expect(decoded(result).kind).toBe('execution')
})
it('returns overview help without accessing execution dependencies', async () => {
  const h = fixture(),
    tool = createShellTool(options)
  expect(await tool.executor({ command: 'help' }, h.deps)).toBe(tool.definition.help)
  expect(h.deps.context.read).not.toHaveBeenCalled()
  expect(h.command.start).not.toHaveBeenCalled()
})
it.each(['help', 'create_session', 'execute', 'close_session', 'info'] as const)(
  'returns the declared %s command help without external effects',
  async command => {
    const h = fixture(),
      tool = createShellTool(options)
    expect(await tool.executor({ command: 'help', args: { command } }, h.deps)).toBe(
      tool.definition.commands[command]!.help,
    )
    expect(h.deps.context.read).not.toHaveBeenCalled()
    expect(h.command.start).not.toHaveBeenCalled()
  },
)
it.each([7, null, ['value']])(
  'rejects a non-string environment override %j before execution',
  async value => {
    const h = fixture()
    const result = await createShellTool(options).executor(
      { command: 'execute', args: { command: 'work', envs: { BAD: value } } },
      h.deps,
    )
    expect(result).toMatchObject({ isError: true })
    expect(decoded(result).reason).toBe('arguments:invalid')
    expect(h.command.start).not.toHaveBeenCalled()
    expect(h.deps.context.read).not.toHaveBeenCalled()
  },
)
it('does not close a terminal when the call is already cancelled', async () => {
  const h = fixture()
  h.controller.abort()
  const result = await createShellTool(options).executor(
    { command: 'close_session', args: { session_id: JSON.stringify(h.terminal) } },
    h.deps,
  )
  expect(decoded(result)).toEqual({ kind: 'rejected', reason: 'interrupted' })
  expect(h.command.closeTerminal).not.toHaveBeenCalled()
})

it('rejects a malformed terminal reference before invoking close', async () => {
  const h = fixture()
  const result = await createShellTool(options).executor(
    { command: 'close_session', args: { session_id: 'not-a-terminal-reference' } },
    h.deps,
  )
  expect(decoded(result)).toEqual({ kind: 'rejected', reason: 'arguments:invalidTerminal' })
  expect(h.command.closeTerminal).not.toHaveBeenCalled()
})
