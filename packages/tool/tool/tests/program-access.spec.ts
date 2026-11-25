import { describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolInvokeRequest } from '@omne-harness/tool-contract'
import { closedToPrograms } from '../src/ledger-background.ts'
import {
  admission,
  available,
  evidence,
  fixedRequestForNamedSourceGuard,
  functionDefinition,
  harness,
  request,
} from './runtime-values.ts'

type Metadata = Omit<
  Extract<ToolDefinition, { kind: 'function' }>,
  'kind' | 'parameters' | 'returns' | 'program'
>

/** A tool with one command open to programs unless it names a terminal, and one closed to them. */
function shell(programmable = true): ToolDefinition {
  const base = functionDefinition({ programmable })
  if (base.kind !== 'function') throw new Error('function')
  const { kind: _kind, parameters, returns, program: _program, ...metadata } = base
  const declared = { kind: 'declared', value: parameters } as const
  return {
    ...(metadata as Metadata),
    adoption: { ...metadata.adoption, revision: `shell-programs-${String(programmable)}` },
    name: 'shell',
    kind: 'commands',
    encoding: 'wrapped',
    commands: [
      {
        name: 'execute',
        summary: 'Run once or in a terminal.',
        parameters: declared,
        returns,
        program: { kind: 'open', unless: ['terminal', 'stdin'] },
      },
      {
        name: 'write',
        summary: 'Type into a terminal.',
        parameters: declared,
        returns,
        program: { kind: 'closed' },
      },
    ],
  }
}

function call(
  definition: ToolDefinition,
  command: string | null,
  params: Record<string, unknown>,
  effective = JSON.stringify({ command, params }),
): ToolInvokeRequest {
  return request({
    availability: available(definition, { ...definition.adoption }),
    command,
    arguments: { original: effective, effective, complete: true },
  })
}

const scripted = (value: ToolInvokeRequest) =>
  fixedRequestForNamedSourceGuard({
    ...value,
    invocation: { kind: 'programmatic', source: evidence('script') },
  })

describe('TL-71 what a program may call, read from the definition, the command and the given parameters', () => {
  it.each([
    ['an open command', call(shell(), 'execute', { path: 'a' }), null],
    [
      'a parameter the command closes',
      call(shell(), 'execute', { path: 'a', terminal: 't1' }),
      'shell.execute with terminal is not open to programs',
    ],
    [
      'the second parameter the command closes',
      call(shell(), 'execute', { path: 'a', stdin: 'x' }),
      'shell.execute with stdin is not open to programs',
    ],
    [
      'a closed command',
      call(shell(), 'write', { path: 'a' }),
      'shell write is not open to programs',
    ],
    [
      'a command the definition does not have',
      call(shell(), 'restart', { path: 'a' }),
      'shell restart is not open to programs',
    ],
    [
      'a tool that is not programmable',
      call(shell(false), 'execute', { path: 'a' }),
      'shell is not open to programs',
    ],
  ] as const)('%s', (_, value, expected) => {
    expect(closedToPrograms(scripted(value))).toBe(expected)
  })

  it('admission refuses each closed call as unsupported before any commit, and admits the open one', async () => {
    const { ledger, store } = harness()
    const closed = [
      call(shell(), 'execute', { path: 'a', terminal: 't1' }),
      call(shell(), 'write', { path: 'a' }),
      call(shell(false), 'execute', { path: 'a' }),
    ]
    for (const [index, value] of closed.entries())
      expect(
        await ledger.admissions.admit(admission(`call-${index}`, `op-${index}`, scripted(value))),
      ).toMatchObject({ failure: { kind: 'unsupported' } })
    expect(store.commits).toBe(0)
    const open = scripted(call(shell(), 'execute', { path: 'a' }))
    expect(await ledger.admissions.admit(admission('call-9', 'op-9', open))).toHaveProperty('ok')
  })

  it('the same closed command is still admitted when the model calls it', async () => {
    const { ledger } = harness()
    const direct = fixedRequestForNamedSourceGuard({
      ...call(shell(), 'write', { path: 'a' }),
      invocation: { kind: 'direct', source: evidence('entry') },
    })
    expect(await ledger.admissions.admit(admission('call-1', 'op-1', direct))).toHaveProperty('ok')
  })
})
