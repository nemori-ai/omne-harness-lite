import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  defineToolWaitContract,
  deriveDefinition,
  judgeImplementationFacts,
  judgeToolDefinition,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
  type ToolWaitProtocolDefinition,
} from '@omne-harness/tool-contract/provider'
import { readToolOperation, readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  adoption,
  declaration,
  governance,
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
  it('author registration: a function tool projects its one operation into judged implementation facts', () => {
    let runs = 0
    const author = ordinaryAuthor()
    const defined = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: ordinaryReturns,
      author: { ...author, executor: { execute: () => Promise.resolve((runs += 1)) } },
    })
    if (!('ok' in defined)) throw new Error(defined.failure.field)
    expect(Object.keys(defined.ok).sort()).toEqual(['parameters', 'returns'])
    const implemented = defineFunctionTool({ implementation: declaration(), operation: defined.ok })
    if (!('ok' in implemented)) throw new Error(implemented.failure.field)
    const facts = {
      ...declaration(),
      implements: { kind: 'function', parameters: parameters(), returns: ordinaryReturns },
    }
    expect(implemented.ok.facts).toEqual(facts)
    expect(judgeImplementationFacts(implemented.ok.facts)).toEqual({ ok: facts })
    // The implementation carries no name, adoption or governance: the asset supplies them.
    expect(Object.keys(implemented.ok)).toEqual(['facts'])
    expect(runs).toBe(0)
  })

  it('author registration: the loader derives the definition from the asset governance and the facts', () => {
    const implemented = defineFunctionTool({
      implementation: declaration(),
      operation: readOperation(),
    })
    if (!('ok' in implemented)) throw new Error(implemented.failure.field)
    const expected = {
      ...metadata(),
      kind: 'function',
      parameters: parameters(),
      returns: ordinaryReturns,
    }
    const derived = deriveDefinition(governance(), implemented.ok.facts)
    expect(derived).toEqual(expected)
    expect(judgeToolDefinition(derived)).toEqual({ ok: expected })
    // `programmable` stays omitted when the asset omits it, and comes from the asset otherwise.
    expect('programmable' in derived).toBe(false)
    expect(deriveDefinition({ ...governance(), programmable: true }, implemented.ok.facts)).toEqual(
      {
        ...expected,
        programmable: true,
      },
    )
  })

  it('author registration: a command tool keeps each command with its own return mode', () => {
    const implemented = defineCommandTool({
      implementation: declaration(),
      commands: {
        read: { summary: 'Read a file.', operation: readOperation() },
        shell: { summary: 'Run a command.', operation: shellOperation() },
      },
    })
    if (!('ok' in implemented)) throw new Error(implemented.failure.field)
    const shape = implemented.ok.facts.implements
    if (shape.kind !== 'commands') throw new Error('commands')
    expect(shape.commands).toEqual([
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
    const implemented = defineCommandTool({
      implementation: declaration(),
      commands: table as Record<string, { summary: string; operation: Operation }>,
    })
    if (!('ok' in implemented)) throw new Error(implemented.failure.field)
    const shape = implemented.ok.facts.implements
    if (shape.kind !== 'commands') throw new Error('commands')
    expect(shape.commands.map(command => command.name)).toEqual(['read'])
  })

  it('author registration: rejects an empty command table at construction', () => {
    expect(defineCommandTool({ implementation: declaration(), commands: {} })).toEqual({
      failure: { field: 'commands', reason: 'empty' },
    })
  })

  it('author registration: rejects an illegal command name and an asset-side field at construction', () => {
    expect(
      defineCommandTool({
        implementation: declaration(),
        commands: { '': { summary: 'Nameless.', operation: readOperation() } },
      }),
    ).toEqual({ failure: { field: 'commands[""]', reason: 'empty' } })
    // The name and the adoption belong to the asset: an implementation that carries them is rejected.
    const named = { ...declaration(), name: 'read_file' } as unknown as ReturnType<
      typeof declaration
    >
    expect(defineFunctionTool({ implementation: named, operation: readOperation() })).toEqual({
      failure: { field: 'implementation.name', reason: 'unknown-field' },
    })
    expect(
      defineFunctionTool({
        implementation: { ...declaration(), description: ' ' },
        operation: readOperation(),
      }),
    ).toEqual({ failure: { field: 'implementation.description', reason: 'blank' } })
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
        implementation: declaration(),
        operation: forged as unknown as ReturnType<typeof readOperation>,
      }),
    ).toEqual({ failure: { field: 'operation', reason: 'type' } })
    const shell = shellOperation() as unknown as ReturnType<typeof readOperation>
    expect(defineFunctionTool({ implementation: declaration(), operation: shell })).toEqual({
      failure: { field: 'operation.parameters.kind', reason: 'executor-owned' },
    })
  })

  it('author registration: reads author capabilities without running a getter', () => {
    class Executor {
      execute() {
        return Promise.resolve({ count: 1 })
      }
    }
    const define = (executor: unknown, codec = ordinaryAuthor().codec) =>
      defineToolOperation({
        parameters: { kind: 'declared', value: parameters() },
        returns: ordinaryReturns,
        author: { ...ordinaryAuthor(), executor: executor as never, codec },
      })
    expect('ok' in define(new Executor())).toBe(true)
    let reads = 0
    const getter = () => {
      reads += 1
      throw new Error('getter ran')
    }
    const owned = Object.defineProperty({}, 'execute', { get: getter })
    class Inherited {
      get execute() {
        return getter()
      }
    }
    for (const executor of [owned, new Inherited()])
      expect(define(executor)).toEqual({
        failure: { field: 'author.executor.execute', reason: 'accessor' },
      })
    const codec = Object.defineProperty({ ...ordinaryAuthor().codec }, 'adoption', { get: getter })
    expect(define(new Executor(), codec)).toEqual({
      failure: { field: 'author.codec.adoption', reason: 'accessor' },
    })
    expect(reads).toBe(0)
  })

  it('author registration: rejects a command table whose Proxy traps throw, without throwing', () => {
    const hostile = new Proxy(
      { shell: { summary: 'Run a command.', operation: shellOperation() } },
      {
        ownKeys: () => {
          throw new Error('trap')
        },
      },
    )
    expect(defineCommandTool({ implementation: declaration(), commands: hostile })).toEqual({
      failure: { field: 'input', reason: 'unreadable' },
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

  it('author registration: a wait contract whose Proxy traps throw is rejected, not thrown', () => {
    const hostile = new Proxy(protocol('ask', 'forbidden'), {
      getOwnPropertyDescriptor: () => {
        throw new Error('trap')
      },
    })
    expect(defineToolWaitContract(hostile)).toEqual({
      failure: { reason: 'definition: unreadable' },
    })
  })

  it('author registration: the binding provider reads the author of a handle and the operations of a registration', () => {
    const author = ordinaryAuthor()
    const defined = defineToolOperation({
      parameters: { kind: 'declared', value: parameters() },
      returns: ordinaryReturns,
      author,
    })
    if (!('ok' in defined)) throw new Error(defined.failure.field)
    const slot = readToolOperation(defined.ok)
    expect(slot?.author.executor).toBe(author.executor)
    expect(slot?.returns).toEqual(ordinaryReturns)
    const implemented = defineCommandTool({
      implementation: declaration(),
      commands: { read: { summary: 'Read a file.', operation: defined.ok } },
    })
    if (!('ok' in implemented)) throw new Error(implemented.failure.field)
    const table = readToolRegistration(implemented.ok)
    expect(table?.kind).toBe('commands')
    if (table?.kind === 'commands') expect(table.operations.map(([name]) => name)).toEqual(['read'])
    // A value that this module did not mark has no slot, so a forged handle cannot carry an author.
    expect(readToolOperation({ parameters: defined.ok.parameters, returns: ordinaryReturns })).toBe(
      undefined,
    )
    expect(readToolRegistration({ facts: implemented.ok.facts })).toBe(undefined)
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
