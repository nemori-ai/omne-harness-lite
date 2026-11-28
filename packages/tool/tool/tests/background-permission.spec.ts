import { describe, expect, it } from 'vitest'
import type {
  FixedToolRequest,
  ToolDefinition,
  ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { backgroundAllowed } from '../src/ledger-background.ts'
import {
  available,
  evidence,
  fixedRequestForNamedSourceGuard,
  functionDefinition,
  harness,
  judged,
  request,
} from './runtime-values.ts'

type Metadata = Omit<
  Extract<ToolDefinition, { kind: 'function' }>,
  'kind' | 'parameters' | 'returns'
>

function shell(
  allowed = true,
  unless: readonly string[] = ['terminal'],
  start?: 'launch',
): ToolDefinition {
  const base = functionDefinition({ backgroundAllowed: allowed })
  if (base.kind !== 'function') throw new Error('function')
  const { kind: _kind, parameters, returns, ...metadata } = base
  const declared = { kind: 'declared', value: parameters } as const
  return {
    ...(metadata as Metadata),
    adoption: {
      ...metadata.adoption,
      revision: `shell-${String(allowed)}-${unless.join('+')}-${start ?? 'asked'}`,
    },
    name: 'shell',
    kind: 'commands',
    encoding: 'wrapped',
    commands: [
      {
        name: 'execute',
        summary: 'Run once or in a terminal.',
        parameters: declared,
        returns,
        ...(allowed ? { background: { unless, ...(start === undefined ? {} : { start }) } } : {}),
      },
      { name: 'info', summary: 'Describe the placement.', parameters: declared, returns },
    ],
  }
}

function call(
  definition: ToolDefinition,
  command: string | null,
  params: Record<string, unknown>,
  effective = JSON.stringify({ command, intent: 'run it', params }),
): ToolInvokeRequest {
  return request({
    availability: available(definition, { ...definition.adoption }),
    command,
    arguments: { original: effective, effective, complete: true },
  })
}

const fixed = (value: ToolInvokeRequest): FixedToolRequest =>
  fixedRequestForNamedSourceGuard({
    ...value,
    invocation: { kind: 'direct', source: evidence('entry') },
  })

describe('the background permission of one call', () => {
  it.each([
    ['a definition that does not permit it', call(shell(false), 'execute', { path: 'a' }), false],
    [
      'a function tool that permits it',
      request({
        availability: available(functionDefinition({ backgroundAllowed: true }), {
          ...functionDefinition().adoption,
        }),
      }),
      true,
    ],
    ['a command that declares nothing', call(shell(), 'info', { path: 'a' }), false],
    ['call text that does not decode', call(shell(), 'execute', {}, '{'), false],
    [
      'call text naming another command than the admitted one',
      call(shell(), 'execute', {}, JSON.stringify({ command: 'info', params: { path: 'a' } })),
      false,
    ],
    ['a parameter named in unless', call(shell(), 'execute', { path: 'a', terminal: 't1' }), false],
    ['a command the definition does not have', call(shell(), 'restart', { path: 'a' }), false],
    [
      'the second of two names in unless',
      call(shell(true, ['terminal', 'stdin']), 'execute', { path: 'a', stdin: 'x' }),
      false,
    ],
    ['a declared command without those parameters', call(shell(), 'execute', { path: 'a' }), true],
  ] as const)('%s: %s', (_, value, expected) => {
    expect(backgroundAllowed(fixed(value))).toBe(expected)
  })
})

describe('admission asks the same question of a launch in the background', () => {
  const refused = {
    kind: 'rejected',
    failure: { kind: 'invalid', field: 'request.mode', reason: 'background-not-allowed' },
  }

  it('refuses a terminal execution and a command that declares nothing, before any commit', async () => {
    const assembly = harness()
    for (const value of [
      call(shell(), 'execute', { path: 'a', terminal: 't1' }),
      call(shell(), 'info', { path: 'a' }),
    ])
      expect(await assembly.admitInternal({ ...value, mode: 'background' })).toEqual(refused)
    expect(assembly.store.commits).toBe(0)
  })

  it('launches a one-shot execution in the background', async () => {
    const assembly = harness()
    const launched = { ...call(shell(), 'execute', { path: 'a' }), mode: 'background' as const }
    const admitted = await assembly.admitInternal(launched)
    if (admitted.kind !== 'accepted') throw new Error(JSON.stringify(admitted))
    expect(judged(admitted.state)).toMatchObject({
      relation: 'background',
      foreground: { kind: 'background', source: { kind: 'launched' } },
    })
  })

  it('accepts a call of a command that starts at launch in the background, though the request asks the foreground', async () => {
    const assembly = harness()
    const asked = {
      ...call(shell(true, [], 'launch'), 'execute', { path: 'a' }),
      mode: 'foreground' as const,
    }
    const admitted = await assembly.admitInternal(asked)
    if (admitted.kind !== 'accepted') throw new Error(JSON.stringify(admitted))
    expect(judged(admitted.state)).toMatchObject({
      relation: 'background',
      foreground: { kind: 'background', source: { kind: 'launched' } },
    })
  })

  it('leaves the other commands of that tool in the foreground', async () => {
    const assembly = harness()
    const asked = {
      ...call(shell(true, [], 'launch'), 'info', { path: 'a' }),
      mode: 'foreground' as const,
    }
    const admitted = await assembly.admitInternal(asked)
    if (admitted.kind !== 'accepted') throw new Error(JSON.stringify(admitted))
    expect(judged(admitted.state)).toMatchObject({ relation: 'foreground' })
  })
})
