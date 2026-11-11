import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { createIndependentToolScope } from '@omne-harness/tool'
import type { FixedToolRequest, ToolStartRecord } from '@omne-harness/tool-contract'
import {
  returnGuide,
  defineCommandTool,
  defineToolOperation,
  type ToolAuthority,
  type ToolImplementationModule,
} from '@omne-harness/tool-contract/provider'
import { completedFinal, createMemoryToolStartAuthority } from '@omne-harness/tool-contract/testing'
import {
  createLocalToolBindings,
  createLocalToolCatalog,
  type LocalToolBindingsInput,
} from '@omne-harness/tool-host-local'
import {
  authorAccess,
  authorAuthority,
  authorModule,
  loadAuthor,
  settings,
  unbox,
} from './author-values.ts'
import { authorityFor, fiberedRegistry, scriptedVerifier } from './binding-values.ts'
import {
  adoption,
  callId,
  evidence,
  instanceId,
  operationId,
  request,
} from './coordinator-values.ts'

import { catalogSearch, catalogView } from './catalog-view-fixture.ts'

type Start = Extract<ToolStartRecord, { kind: 'start' }>
type Settlement = Parameters<LocalToolBindingsInput<string, unknown, ContentBlock>['settle']>[0]
const fallbackAuthority = authorityFor({ kind: 'official' }, 'read_file', 'fallback-holding', '2')

async function harness(module: ToolImplementationModule<unknown, ContentBlock>) {
  const loaded = unbox(await loadAuthor(module))
  const { registry, asFiber } = fiberedRegistry(
    scriptedVerifier([authorAuthority, fallbackAuthority]),
  )
  const register = (value = loaded, authority: ToolAuthority = authorAuthority) =>
    unbox(asFiber('author', () => registry.register({ ...authorAccess, authority, loaded: value })))
  const contribution = register()
  const fixed = request({
    availability: {
      kind: 'available',
      definition: loaded.definition,
      executor: loaded.executor,
      layer: loaded.key.layer,
    },
    settings,
  })
  let consumed = 0
  const authority = createMemoryToolStartAuthority<string>()
  const settlements: Settlement[] = []
  const bindings = createLocalToolBindings({
    registry,
    catalog: { inspect: async () => succeed(fixed.availability) },
    authority: {
      ...authority,
      consume: input => {
        consumed += 1
        return authority.consume(input)
      },
    },
    scope: input =>
      unbox(
        createIndependentToolScope({
          signal: input.execution.signal,
          limits: {
            authorBufferBytes: 10000,
            authorBufferItems: 100,
            authorWaitHistoryBytes: 10000,
            authorWaitHistoryItems: 100,
          },
          process: null,
          waits: null,
        }),
      ),
    settle: async input => {
      settlements.push(input)
      return succeed(completedFinal())
    },
  })
  const resolve = async (fixedRequest = fixed, call = 'first') =>
    unbox(await bindings.resolve({ ...authorAccess, call: callId(call), request: fixedRequest }))
  const input = async (fixedRequest = fixed, call = 'first', executor = loaded.executor) => {
    const start: Start = {
      kind: 'start',
      executor,
      operation: operationId(`start-${call}`),
      execution: {
        tenant: authorAccess.tenant,
        call: callId(call),
        instance: instanceId,
        generation: '1',
      },
    }
    const value = { ...authorAccess, call: callId(call), start, request: fixedRequest }
    return { ...value, permit: unbox(await authority.prepare(value)) }
  }
  return {
    loaded,
    registry,
    contribution,
    register,
    fixed,
    bindings,
    resolve,
    input,
    settlements,
    consumed: () => consumed,
  }
}

describe('author binding registration ownership', () => {
  it('preserves reserved and active pins when rejecting invalid start inputs', async () => {
    const completion = Promise.withResolvers<unknown>()
    const fixture = await harness(authorModule(() => completion.promise))
    const binding = await fixture.resolve()
    const input = await fixture.input()
    try {
      expect(await binding.start({ ...input, call: callId('other') }, {})).toHaveProperty(
        'failure.field',
        'permit',
      )
      expect(unbox(fixture.registry.drain(fixture.loaded.key))).toEqual({
        pins: '1',
        inflight: [callId('first')],
      })
      unbox(await binding.start(input, {}))
      expect(
        await binding.start(
          { ...input, start: { ...input.start, executor: adoption('wrong') } },
          {},
        ),
      ).toHaveProperty('failure.field', 'executor')
      expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('1')
      expect(fixture.consumed()).toBe(1)
    } finally {
      completion.resolve('finished')
    }
  })

  it('returns unavailable when no same-shape author remains', async () => {
    const fixture = await harness(authorModule(async () => 'unused'))
    fixture.contribution.release()
    expect(
      await fixture.bindings.resolve({
        ...authorAccess,
        call: callId('first'),
        request: fixture.fixed,
      }),
    ).toMatchObject({ failure: { kind: 'unavailable', dependency: 'toolBindings' } })
    expect(fixture.consumed()).toBe(0)
  })

  it.each(['different load', 'same loaded handle'])(
    'cannot pin a successor through an old binding: %s',
    async successorKind => {
      let launched = 0
      const module = authorModule(async () => {
        launched += 1
        return 'A'
      })
      const fixture = await harness(module)
      const binding = await fixture.resolve()
      const first = await fixture.input()
      const live = unbox(await binding.start(first, {}))
      expect(fixture.contribution.release()).toEqual({ removed: true })
      const successor =
        successorKind === 'same loaded handle'
          ? fixture.loaded
          : unbox(await loadAuthor({ ...module, executor: adoption('successor') }))
      fixture.register(successor)
      const rejected = await binding.start(await fixture.input(fixture.fixed, 'second'), {})
      expect(rejected).toHaveProperty('failure')
      expect(fixture.consumed()).toBe(1)
      expect(launched).toBe(1)
      expect(unbox(fixture.registry.drain(successor.key))).toEqual({ pins: '0', inflight: [] })
      expect(unbox(await binding.start(first, {}))).toBe(live)
      expect(fixture.consumed()).toBe(1)
    },
  )

  it('rejects a different executor fallback without retaining its resolution pin', async () => {
    let launched = 0
    const module = authorModule(async () => {
      launched += 1
      return 'B'
    })
    const fixture = await harness(module)
    fixture.contribution.release()
    const successor = unbox(
      await loadAuthor({ ...module, executor: adoption('fallback') }, fallbackAuthority),
    )
    fixture.register(successor, fallbackAuthority)
    const binding = await fixture.resolve()
    expect(unbox(fixture.registry.pins(successor.key))).toBe('1')
    expect(await binding.start(await fixture.input(), {})).toHaveProperty(
      'failure.field',
      'executor',
    )
    expect(unbox(fixture.registry.drain(successor.key))).toEqual({ pins: '0', inflight: [] })
    expect(fixture.consumed()).toBe(0)
    expect(launched).toBe(0)
  })

  it('reacquires its own registration pin after a rejected executor input', async () => {
    const fixture = await harness(authorModule(async () => 'A'))
    const binding = await fixture.resolve()
    expect(
      await binding.start(await fixture.input(fixture.fixed, 'first', adoption('wrong')), {}),
    ).toHaveProperty('failure.field', 'executor')
    expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('0')
    unbox(await binding.start(await fixture.input(), {}))
    expect(unbox(fixture.registry.drain(fixture.loaded.key))).toEqual({
      pins: '1',
      inflight: [callId('first')],
    })
    expect(fixture.consumed()).toBe(1)
  })
})

function commandModule(
  events: string[],
  limits?: Readonly<Record<'first' | 'second', number>>,
): ToolImplementationModule<unknown, ContentBlock> {
  const declared = request().availability.definition
  if (declared.kind !== 'function') throw new Error('expected function parameters')
  const operation = (name: 'first' | 'second') =>
    unbox(
      defineToolOperation({
        parameters:
          limits === undefined
            ? {
                kind: 'executor-owned',
                usage: `Pass ${name}`,
                protocol: adoption(`protocol-${name}`),
              }
            : { kind: 'declared', value: declared.parameters },
        returns: {
          ...ordinaryReturnFixture(adoption(`codec-${name}`)),
          ...(limits === undefined
            ? {}
            : {
                offloading: {
                  inline: { kind: 'bounded' as const, maxInlineUtf8Bytes: limits[name] },
                  retention: { kind: 'system' as const },
                },
              }),
        },
        author: {
          kind: 'ordinary',
          parameters: {
            adoption: adoption(`parameters-${name}`),
            parse: value => {
              events.push(`parse-${name}`)
              // The command codec receives the parameters only, cut out of the whole call.
              if (value.effective === '{"v":"partial"}')
                return fail({ kind: 'incomplete', reason: 'partial' })
              return value.effective === `{"v":"${name}"}`
                ? succeed(`${name}-parsed`)
                : fail({ kind: 'invalid', reason: `expected ${name}` })
            },
          },
          waits: [],
          executor: {
            execute: async value => {
              events.push(`execute-${name}:${value}`)
              return `${name}-result`
            },
          },
          codec: {
            adoption: adoption(`codec-${name}`),
            encode: () => succeed(new Uint8Array()),
            decode: () => succeed(''),
          },
          output: { adoption: adoption(`output-${name}`), check: ({ value }) => succeed(value) },
          renderer: { render: () => succeed(name) },
          program: { kind: 'none' },
        },
      }),
    )
  return {
    executor: adoption('commands'),
    createAuthor: () =>
      defineCommandTool({
        encoding: 'wrapped',
        implementation: {
          description: 'Two distinct commands',
          backgroundAllowed: false,
          declarations: request().availability.definition.declarations,
        },
        commands: {
          first: { summary: 'First command', operation: operation('first') },
          second: { summary: 'Second command', operation: operation('second') },
        },
      }),
  }
}

/** The whole call text of a wrapped command call. */
function call(command: string, value: string): string {
  return JSON.stringify({ command, params: { v: value } })
}

describe('author binding command selection', () => {
  it('keeps two command limits aligned across definition, usage and binding replacement', async () => {
    const events: string[] = []
    const fixture = await harness(commandModule(events, { first: 2048, second: 4096 }))
    const catalog = createLocalToolCatalog({
      registry: fixture.registry,
      view: catalogView(fixture.registry),
      search: catalogSearch,
      availability: {
        judge: async () =>
          succeed({
            qualification: 'allowed',
            dependencies: [],
            inputCompatible: true,
            outputCompatible: true,
            attachmentsReadable: true,
          }),
      },
    })
    const consumer = {
      capabilities: evidence('capabilities'),
      conversion: null,
      attachmentAccess: evidence('attachments'),
    }
    const definitions = [fixture.loaded]
    const old = new Map<
      string,
      {
        binding: Awaited<ReturnType<typeof fixture.resolve>>
        input: Awaited<ReturnType<typeof fixture.input>>
        live: unknown
      }
    >()
    for (const command of ['first', 'second'] as const) {
      const fixed = {
        ...fixture.fixed,
        command,
        arguments: {
          original: call(command, command),
          effective: call(command, command),
          complete: true,
        },
      }
      const binding = await fixture.resolve(fixed, command)
      const input = await fixture.input(fixed, command)
      old.set(command, { binding, input, live: unbox(await binding.start(input, {})) })
    }
    await new Promise<void>(resolve => setImmediate(resolve))
    for (const command of ['first', 'second'] as const) {
      const usage = unbox(
        await catalog.usage({
          ...authorAccess,
          name: 'read_file',
          command,
          consumer,
          adoption: fixture.loaded.definition.adoption,
        }),
      )
      const definition = fixture.loaded.definition
      if (definition.kind !== 'commands') throw new Error('expected command definition')
      expect(usage.returns).toEqual(
        definition.commands.find(item => item.name === command)?.returns,
      )
      expect(
        fixture.settlements.find(item => item.request.command === command)?.operation.returns,
      ).toEqual(usage.returns)
    }
    expect(fixture.contribution.release()).toEqual({ removed: true })
    const successor = unbox(
      await loadAuthor({
        ...commandModule(events, { first: 4096, second: 2048 }),
        executor: adoption('commands-next'),
      }),
    )
    fixture.register(successor)
    definitions.push(successor)
    for (const command of ['first', 'second'] as const) {
      const prior = old.get(command)
      if (prior === undefined) throw new Error('missing original binding')
      expect(unbox(await prior.binding.start(prior.input, {}))).toBe(prior.live)
      const fixed = {
        ...fixture.fixed,
        command,
        availability: {
          kind: 'available' as const,
          definition: successor.definition,
          executor: successor.executor,
          layer: successor.key.layer,
        },
        arguments: {
          original: call(command, command),
          effective: call(command, command),
          complete: true,
        },
      }
      const binding = await fixture.resolve(fixed, `next-${command}`)
      unbox(
        await binding.start(await fixture.input(fixed, `next-${command}`, successor.executor), {}),
      )
      const usage = unbox(
        await catalog.usage({
          ...authorAccess,
          name: 'read_file',
          command,
          consumer,
          adoption: successor.definition.adoption,
        }),
      )
      const definition = successor.definition
      if (definition.kind !== 'commands') throw new Error('expected command definition')
      expect(usage.returns).toEqual(
        definition.commands.find(item => item.name === command)?.returns,
      )
    }
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(fixture.settlements.map(item => item.operation.returns.offloading.inline)).toEqual([
      { kind: 'bounded', maxInlineUtf8Bytes: 2048 },
      { kind: 'bounded', maxInlineUtf8Bytes: 4096 },
      { kind: 'bounded', maxInlineUtf8Bytes: 4096 },
      { kind: 'bounded', maxInlineUtf8Bytes: 2048 },
    ])
    expect(events.filter(event => event.startsWith('execute-'))).toHaveLength(4)
    expect(definitions[0]?.definition).not.toEqual(definitions[1]?.definition)
  })

  it('dispatches the second command with its parser and settlement operation', async () => {
    const events: string[] = []
    const fixture = await harness(commandModule(events))
    const fixed: FixedToolRequest = {
      ...fixture.fixed,
      command: 'second',
      arguments: {
        original: call('second', 'second'),
        effective: call('second', 'second'),
        complete: true,
      },
    }
    const binding = await fixture.resolve(fixed)
    unbox(await binding.start(await fixture.input(fixed), {}))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual(['parse-second', 'execute-second:second-parsed'])
    expect(fixture.settlements).toHaveLength(1)
    expect(fixture.settlements[0]?.operation.author.parameters.adoption.name).toBe(
      'parameters-second',
    )
    expect(fixture.settlements[0]?.arguments).toBe('second-parsed')
    expect(fixture.settlements[0]?.outcome).toEqual({ kind: 'returned', value: 'second-result' })
  })

  it('rejects an unknown command before consume or author execution', async () => {
    const events: string[] = []
    const fixture = await harness(commandModule(events))
    const fixed: FixedToolRequest = {
      ...fixture.fixed,
      command: 'missing',
      arguments: { original: 'first', effective: 'first', complete: true },
    }
    const binding = await fixture.resolve(fixed)
    expect(await binding.start(await fixture.input(fixed), {})).toHaveProperty(
      'failure.field',
      'command',
    )
    expect(fixture.consumed()).toBe(0)
    expect(events).toEqual([])
    expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('0')
  })

  it('does not accept the first command arguments for the second command', async () => {
    const events: string[] = []
    const fixture = await harness(commandModule(events))
    const fixed: FixedToolRequest = {
      ...fixture.fixed,
      command: 'second',
      arguments: {
        original: call('second', 'first'),
        effective: call('second', 'first'),
        complete: true,
      },
    }
    const binding = await fixture.resolve(fixed)
    unbox(await binding.start(await fixture.input(fixed), {}))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual(['parse-second'])
    // The reason of the codec comes with the guide of the admitted command (D-104).
    expect(fixture.settlements[0]?.outcome).toEqual({
      kind: 'failed',
      reason: [
        'read_file second: expected second.',
        'Usage: read_file {"command": "second", "params": {…}}',
        'Second command',
        returnGuide(ordinaryReturnFixture(adoption('codec-second'))),
      ].join('\n'),
    })
    expect(fixture.settlements[0]?.operation.author.parameters.adoption.name).toBe(
      'parameters-second',
    )
  })

  it('gives only the reason, without a guide, for incomplete parameters', async () => {
    const fixture = await harness(commandModule([]))
    const fixed: FixedToolRequest = {
      ...fixture.fixed,
      command: 'second',
      arguments: {
        original: call('second', 'partial'),
        effective: call('second', 'partial'),
        complete: true,
      },
    }
    const binding = await fixture.resolve(fixed)
    unbox(await binding.start(await fixture.input(fixed), {}))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(fixture.settlements[0]?.outcome).toEqual({ kind: 'failed', reason: 'partial' })
  })

  it('gives only the reason, without a guide, for invalid parameters of a function tool', async () => {
    const fixture = await harness(
      authorModule(
        async () => 'unused',
        () => fail({ kind: 'invalid', reason: 'bad-args' }),
      ),
    )
    const binding = await fixture.resolve()
    unbox(await binding.start(await fixture.input(), {}))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(fixture.settlements[0]?.outcome).toEqual({ kind: 'failed', reason: 'bad-args' })
  })

  it('fails a call that names another command than the admitted one, before the author parses it', async () => {
    const events: string[] = []
    const fixture = await harness(commandModule(events))
    const fixed: FixedToolRequest = {
      ...fixture.fixed,
      command: 'second',
      arguments: {
        original: call('first', 'first'),
        effective: call('first', 'first'),
        complete: true,
      },
    }
    const binding = await fixture.resolve(fixed)
    unbox(await binding.start(await fixture.input(fixed), {}))
    await new Promise<void>(resolve => setImmediate(resolve))
    // The failure is a result the model reads, not a silent run of the other command.
    expect(events).toEqual([])
    const outcome = fixture.settlements[0]?.outcome
    if (outcome?.kind !== 'failed') throw new Error('the call did not fail')
    expect(outcome.reason.split('\n')[0]).toBe(
      'read_file second: the call names "first" but "second" was admitted.',
    )
  })
})
