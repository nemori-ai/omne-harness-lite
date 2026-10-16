import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  defineToolWaitContract,
  judgeToolDefinition,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
  type ToolWaitProtocolDefinition,
} from '@omne-harness/tool'
import {
  adoption,
  metadata,
  ordinaryAuthor,
  ordinaryReturns,
  parameters,
  structuredAuthor,
  structuredReturns,
  valueSchema,
} from './tool-values.ts'

type Operation = ToolOperation<null, ToolMessageContentBlock>

type Declared = Extract<ToolOperationParameters, { kind: 'declared' }>

function readOperation() {
  // The ordinary author does not fix the block type, so the test names it.
  const defined = defineToolOperation<JsonValue, unknown, null, ToolMessageContentBlock, Declared>({
    parameters: { kind: 'declared', value: parameters() },
    returns: ordinaryReturns,
    author: ordinaryAuthor(),
  })
  if (!('ok' in defined)) throw new Error(defined.failure.field)
  return defined.ok
}

function shellOperation(): Operation {
  const defined = defineToolOperation({
    parameters: {
      kind: 'executor-owned',
      usage: 'Run one shell command.',
      protocol: adoption('shell'),
    },
    returns: structuredReturns,
    author: structuredAuthor(),
  })
  if (!('ok' in defined)) throw new Error(defined.failure.field)
  return defined.ok
}

describe('author registration', () => {
  it('author registration: a function tool projects its one operation into a judged definition', () => {
    let runs = 0
    const author = ordinaryAuthor()
    const defined = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: ordinaryReturns,
      author: { ...author, executor: { execute: () => Promise.resolve((runs += 1)) } },
    })
    if (!('ok' in defined)) throw new Error(defined.failure.field)
    expect(Object.keys(defined.ok).sort()).toEqual(['parameters', 'returns'])
    const registered = defineFunctionTool({ metadata: metadata(), operation: defined.ok })
    if (!('ok' in registered)) throw new Error(registered.failure.field)
    const expected = {
      ...metadata(),
      kind: 'function',
      parameters: parameters(),
      returns: ordinaryReturns,
    }
    expect(registered.ok.definition).toEqual(expected)
    expect(judgeToolDefinition(registered.ok.definition)).toEqual({ ok: expected })
    expect(Object.keys(registered.ok)).toEqual(['definition'])
    expect(runs).toBe(0)
  })

  it('author registration: a command tool keeps each command with its own return mode', () => {
    const registered = defineCommandTool({
      metadata: { ...metadata(), name: 'files' },
      commands: {
        read: { summary: 'Read a file.', operation: readOperation() },
        shell: { summary: 'Run a command.', operation: shellOperation() },
      },
    })
    if (!('ok' in registered)) throw new Error(registered.failure.field)
    const { definition } = registered.ok
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.commands).toEqual([
      {
        name: 'read',
        summary: 'Read a file.',
        parameters: { kind: 'declared', value: parameters() },
        returns: ordinaryReturns,
      },
      {
        name: 'shell',
        summary: 'Run a command.',
        parameters: { kind: 'executor-owned' },
        returns: structuredReturns,
      },
    ])
  })

  it('author registration: takes command names only from the own keys of the table', () => {
    const inherited = { write: { summary: 'Write a file.', operation: readOperation() } }
    const table = Object.assign(Object.create(inherited) as Record<string, unknown>, {
      read: { summary: 'Read a file.', operation: readOperation() },
    })
    const registered = defineCommandTool({
      metadata: metadata(),
      commands: table as Record<string, { summary: string; operation: Operation }>,
    })
    if (!('ok' in registered)) throw new Error(registered.failure.field)
    const { definition } = registered.ok
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.commands.map(command => command.name)).toEqual(['read'])
  })

  it('author registration: rejects an empty command table at construction', () => {
    expect(defineCommandTool({ metadata: metadata(), commands: {} })).toEqual({
      failure: { field: 'commands', reason: 'empty' },
    })
  })

  it('author registration: rejects an illegal command name and an illegal tool name at construction', () => {
    expect(
      defineCommandTool({
        metadata: metadata(),
        commands: { '': { summary: 'Nameless.', operation: readOperation() } },
      }),
    ).toEqual({ failure: { field: 'commands[""]', reason: 'empty' } })
    expect(
      defineFunctionTool({ metadata: { ...metadata(), name: '' }, operation: readOperation() }),
    ).toEqual({
      failure: { field: 'metadata.name', reason: 'incomplete-reference' },
    })
  })

  it('author registration: rejects an ordinary declaration paired with a structured author', () => {
    const mismatched = {
      parameters: { kind: 'declared', value: parameters() },
      returns: ordinaryReturns,
      author: structuredAuthor(),
    } as const
    // The types reject this pairing; the construction check must reject it at run time too.
    expect(
      defineToolOperation(mismatched as unknown as Parameters<typeof defineToolOperation>[0]),
    ).toEqual({
      failure: { field: 'author.kind', reason: 'mode-mismatch' },
    })
  })

  it('author registration: rejects a program contract that differs from the declared program', () => {
    const schema = valueSchema('listing')
    const declared = {
      kind: 'json',
      contract: adoption('listing'),
      schema: schema.identity,
      definition: parameters(['entries']),
      maxBytes: schema.maxBytes,
    } as const
    const author = ordinaryAuthor()
    const program = {
      kind: 'json',
      adoption: adoption('listing'),
      schema,
      encode: () => ({ ok: { kind: 'null' } as JsonValue }),
    } as const
    const accepted = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: { kind: 'ordinary', program: declared },
      author: { ...author, program },
    })
    expect('ok' in accepted).toBe(true)
    const none = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: { kind: 'ordinary', program: declared },
      author,
    })
    expect(none).toEqual({ failure: { field: 'author.program.kind', reason: 'program-mismatch' } })
    const other = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: { kind: 'ordinary', program: declared },
      author: { ...author, program: { ...program, adoption: adoption('other') } },
    })
    expect(other).toEqual({
      failure: { field: 'author.program.adoption', reason: 'program-mismatch' },
    })
  })

  it('author registration: rejects a forged operation handle and a function tool with executor-owned parameters', () => {
    const forged = {
      parameters: { kind: 'declared', value: parameters() },
      returns: ordinaryReturns,
    }
    expect(
      defineFunctionTool({
        metadata: metadata(),
        operation: forged as unknown as ReturnType<typeof readOperation>,
      }),
    ).toEqual({ failure: { field: 'operation', reason: 'type' } })
    const shell = shellOperation() as unknown as ReturnType<typeof readOperation>
    expect(defineFunctionTool({ metadata: metadata(), operation: shell })).toEqual({
      failure: { field: 'operation.parameters.kind', reason: 'executor-owned' },
    })
  })
})

describe('wait contract', () => {
  function protocol<K extends 'ask' | 'resource'>(
    kind: K,
    expiry: ToolWaitProtocolDefinition<string, K>['expiry'],
  ): ToolWaitProtocolDefinition<string, K> {
    return {
      kind,
      adoption: adoption(`${kind}-protocol`),
      request: valueSchema('request'),
      response: valueSchema('response') as ToolWaitProtocolDefinition<string, K>['response'],
      expiry,
    }
  }

  it('author registration: a wait contract fixes its declaration without loading a schema', () => {
    let loads = 0
    const definition = protocol('resource', 'supported')
    const counted = {
      ...definition,
      request: {
        ...definition.request,
        ref: {
          ...definition.request.ref,
          load: () => ((loads += 1), Promise.reject(new Error('load'))),
        },
      },
    }
    const fixed = defineToolWaitContract(counted)
    if (!('ok' in fixed)) throw new Error(fixed.failure.reason)
    expect(fixed.ok).toEqual(counted)
    expect(fixed.ok.request.ref).toBe(counted.request.ref)
    expect(Object.isFrozen(fixed.ok)).toBe(true)
    expect(loads).toBe(0)
  })

  it('author registration: an Ask wait contract rejects a supported expiry', () => {
    const ask = { ...protocol('ask', 'forbidden'), expiry: 'supported' }
    expect(
      defineToolWaitContract(ask as unknown as ToolWaitProtocolDefinition<string, 'ask'>),
    ).toEqual({
      failure: { reason: 'expiry: value' },
    })
  })

  it('author registration: an author accepts only fixed wait contracts', () => {
    const fixed = defineToolWaitContract(protocol('ask', 'forbidden'))
    if (!('ok' in fixed)) throw new Error(fixed.failure.reason)
    const withWait = (waits: readonly unknown[]) =>
      defineToolOperation({
        parameters: { kind: 'declared', value: parameters() },
        returns: ordinaryReturns,
        author: { ...ordinaryAuthor(), waits: waits as never },
      })
    expect('ok' in withWait([fixed.ok])).toBe(true)
    expect(withWait([protocol('ask', 'forbidden')])).toEqual({
      failure: { field: 'author.waits[0]', reason: 'type' },
    })
  })
})
