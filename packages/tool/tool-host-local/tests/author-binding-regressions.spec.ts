import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, createIndependentToolScope } from '@omne-harness/tool'
import type { FixedToolRequest, ToolStartRecord } from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineToolOperation,
  type ToolAuthority,
  type ToolImplementationModule,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import { completedFinal, createMemoryToolStartAuthority } from '@omne-harness/tool-contract/testing'
import { createLocalToolBindings, type LocalToolBindingsInput } from '@omne-harness/tool-host-local'
import {
  authorAccess,
  authorAuthority,
  authorModule,
  loadAuthor,
  settings,
  unbox,
} from './author-values.ts'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  loadedFor,
  scriptedVerifier,
  tenantB,
} from './binding-values.ts'
import { localAuthorEvidence } from '../src/live-author-execution.ts'
import { adoption, callId, instanceId, operationId, request } from './coordinator-values.ts'

type Start = Extract<ToolStartRecord, { kind: 'start' }>
type Settlement = Parameters<LocalToolBindingsInput<string, unknown, ContentBlock>['settle']>[0]
const fallbackAuthority = authorityFor({ kind: 'official' }, 'read_file', 'fallback-holding', '2')

type Fixture = Awaited<ReturnType<typeof harness>>

async function harness(
  module: ToolImplementationModule<unknown, ContentBlock>,
  consumeWith?: ToolStartAuthority<string>['consume'],
  settleWith?: LocalToolBindingsInput<string, unknown, ContentBlock>['settle'],
) {
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
  const closes: string[] = []
  const bindings = createLocalToolBindings({
    registry,
    catalog: { inspect: async () => succeed(fixed.availability) },
    authority: {
      ...authority,
      consume: input => {
        consumed += 1
        return (consumeWith ?? authority.consume)(input)
      },
    },
    scope: input => {
      const real = unbox(
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
      )
      return {
        ...real,
        finish: (kind: 'returned' | 'failed') => {
          closes.push(kind)
          return real.finish(kind)
        },
      }
    },
    settle: async input => {
      settlements.push(input)
      return settleWith === undefined ? succeed(completedFinal()) : settleWith(input)
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
    closes,
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
    expect(await binding.start(await fixture.input(), {})).toEqual({
      failure: { kind: 'invalid', field: 'executor', reason: 'original executor mismatch' },
    })
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

describe('author binding start identity and consume outcomes', () => {
  const other = callId('other')
  const identityCases = {
    'the tenant of the input': (input: Awaited<ReturnType<Fixture['input']>>) => ({
      ...input,
      tenant: accessOf(tenantB).tenant,
      permit: { ...input.permit, tenant: accessOf(tenantB).tenant },
    }),
    'the call of the input': (input: Awaited<ReturnType<Fixture['input']>>) => ({
      ...input,
      call: other,
      permit: { ...input.permit, call: other },
    }),
    'the call of the permit': (input: Awaited<ReturnType<Fixture['input']>>) => ({
      ...input,
      permit: { ...input.permit, call: other },
    }),
    'the tenant of the permit': (input: Awaited<ReturnType<Fixture['input']>>) => ({
      ...input,
      permit: { ...input.permit, tenant: accessOf(tenantB).tenant },
    }),
    'the start of the permit': (input: Awaited<ReturnType<Fixture['input']>>) => ({
      ...input,
      permit: { ...input.permit, start: { ...input.start, operation: operationId('another') } },
    }),
  }
  it.each(Object.entries(identityCases))(
    'refuses a start when %s alone disagrees with the rest, before any consume',
    async (_name, disagree) => {
      const fixture = await harness(authorModule(async () => 'unused'))
      const binding = await fixture.resolve()
      const refused = await binding.start(disagree(await fixture.input()) as never, {})
      expect(refused).toEqual({
        failure: { kind: 'invalid', field: 'permit', reason: 'start identity mismatch' },
      })
      expect(fixture.consumed()).toBe(0)
    },
  )

  it('refuses a start of another request, and a second start record under the same operation', async () => {
    const fixture = await harness(authorModule(async () => 'ok'))
    const binding = await fixture.resolve()
    const input = await fixture.input()
    expect(
      await binding.start({ ...input, request: { ...input.request, command: 'another' } }, {}),
    ).toEqual({
      failure: { kind: 'invalid', field: 'request', reason: 'resolved request mismatch' },
    })
    expect(fixture.consumed()).toBe(0)
    unbox(await binding.start(input, {}))
    const moved = {
      ...input.start,
      execution: { ...input.start.execution, generation: '2' },
    }
    const second = {
      ...input,
      start: moved,
      permit: { ...input.permit, start: moved },
    }
    expect(await binding.start(second, {})).toEqual({
      failure: { kind: 'conflict', operation: input.start.operation },
    })
    expect(fixture.consumed()).toBe(1)
  })

  it('pins a call of its own for the first start of another call than the one it was resolved for', async () => {
    const fixture = await harness(authorModule(async () => 'A'))
    const binding = await fixture.resolve(fixture.fixed, 'first')
    expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('1')
    unbox(await binding.start(await fixture.input(fixture.fixed, 'second'), {}))
    expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('2')
  })

  it.each(['denied', 'invalid', 'conflict', 'unsupported'] as const)(
    'releases the pin when consume refuses the start as %s, and not when it only cannot answer',
    async kind => {
      const refusing = await harness(
        authorModule(async () => 'unused'),
        async () => fail({ kind } as never),
      )
      expect(await (await refusing.resolve()).start(await refusing.input(), {})).toEqual({
        failure: { kind },
      })
      expect(unbox(refusing.registry.pins(refusing.loaded.key))).toBe('0')
    },
  )

  it('keeps the pin when consume cannot answer, since the start may have been accepted', async () => {
    const fixture = await harness(
      authorModule(async () => 'unused'),
      async () => fail({ kind: 'unavailable', dependency: 'authority', diagnostic: 'down' }),
    )
    expect(await (await fixture.resolve()).start(await fixture.input(), {})).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('1')
  })

  it.each(['not-started', 'rejected'] as const)(
    'denies the start and releases the pin when consume reports %s',
    async kind => {
      const exclusion = (await import('./coordinator-values.ts')).evidence('excluded')
      const fixture = await harness(
        authorModule(async () => 'unused'),
        async () =>
          succeed(kind === 'rejected' ? { kind, reason: 'no', exclusion } : { kind, exclusion }),
      )
      expect(await (await fixture.resolve()).start(await fixture.input(), {})).toEqual({
        failure: { kind: 'denied', action: 'start-author' },
      })
      expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('0')
    },
  )

  it('answers commit-unknown and keeps the pin when consume cannot tell whether it started', async () => {
    const fixture = await harness(
      authorModule(async () => 'unused'),
      async () => succeed({ kind: 'unknown', diagnostic: 'lost' }),
    )
    const input = await fixture.input()
    expect(await (await fixture.resolve()).start(input, {})).toEqual({
      failure: { kind: 'commit-unknown', operation: input.start.operation },
    })
    expect(unbox(fixture.registry.pins(fixture.loaded.key))).toBe('1')
  })
})

describe('author binding of a live author', () => {
  const settled = async (fixture: Fixture) => {
    unbox(await (await fixture.resolve()).start(await fixture.input(), {}))
    await new Promise<void>(resolve => setImmediate(resolve))
  }

  it('closes the scope of the author as returned when it returns, and as failed when it throws', async () => {
    const returning = await harness(authorModule(async () => 'done'))
    await settled(returning)
    expect(returning.closes).toEqual(['returned'])
    expect(returning.settlements).toMatchObject([{ outcome: { kind: 'returned', value: 'done' } }])
    const throwing = await harness(
      authorModule(async () => {
        throw new Error('author threw')
      }),
    )
    await settled(throwing)
    expect(throwing.closes).toEqual(['failed'])
    expect(throwing.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'author threw' } },
    ])
  })

  it('settles a call whose parameters do not parse as failed, with no scope to close', async () => {
    const fixture = await harness(
      authorModule(
        async () => 'unused',
        () => fail({ kind: 'invalid', reason: 'bad parameters' }),
      ),
    )
    await settled(fixture)
    expect(fixture.closes).toEqual([])
    expect(fixture.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'bad parameters' } },
    ])
  })

  it('fixes the request of a call at its first resolution', async () => {
    const fixture = await harness(authorModule(async () => 'unused'))
    const first = await fixture.resolve()
    expect(await fixture.resolve()).toBe(first)
    expect(
      await fixture.bindings.resolve({
        ...authorAccess,
        call: callId('first'),
        request: { ...fixture.fixed, command: 'another' },
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'request', reason: 'call already has a fixed request' },
    })
  })

  it('has no suspension to inspect on recovery for an author that is no checkpointed one', async () => {
    const fixture = await harness(authorModule(async () => 'unused'))
    const input = await fixture.input()
    unbox(await (await fixture.resolve()).start(input, {}))
    const recovered = unbox(
      await fixture.bindings.recover({
        ...authorAccess,
        call: callId('first'),
        start: input.start,
      }),
    )
    expect(
      await recovered.inspectSuspension({
        tenant: authorAccess.tenant,
        call: callId('first'),
        operation: operationId('suspension'),
        adoption: input.start.executor,
        inputDigest: 'sha256:plan',
        start: input.start,
        schema: adoption('state'),
      }),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'toolBindings',
        diagnostic: 'live-only author has no checkpoint',
      },
    })
    expect(
      await fixture.bindings.recover({
        ...authorAccess,
        call: callId('never'),
        start: input.start,
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

function commandModule(events: string[]): ToolImplementationModule<unknown, ContentBlock> {
  const operation = (name: string) =>
    unbox(
      defineToolOperation({
        parameters: {
          kind: 'executor-owned',
          usage: `Pass ${name}`,
          protocol: adoption(`protocol-${name}`),
        },
        returns: { kind: 'ordinary', program: { kind: 'none' } },
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
    expect(await binding.start(await fixture.input(fixed), {})).toEqual({
      failure: { kind: 'invalid', field: 'command', reason: 'original author has no operation' },
    })
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

describe('author binding of a call that has no operation to run', () => {
  const refusal = {
    failure: { kind: 'invalid', field: 'command', reason: 'original author has no operation' },
  }

  it('refuses a call of a function tool that names a command, before consume or author execution', async () => {
    let launched = 0
    const fixture = await harness(
      authorModule(async () => {
        launched += 1
        return 'unused'
      }),
    )
    const fixed: FixedToolRequest = { ...fixture.fixed, command: 'first' }
    const binding = await fixture.resolve(fixed)
    expect(await binding.start(await fixture.input(fixed), {})).toEqual(refusal)
    expect(fixture.consumed()).toBe(0)
    expect(launched).toBe(0)
  })

  it('binds a tool that no author registered, and refuses its start for lack of an operation', async () => {
    const { registry, asFiber } = fiberedRegistry(scriptedVerifier([authorAuthority]))
    const loaded = loadedFor(authorAuthority)
    unbox(
      asFiber('plain', () =>
        registry.register({ ...authorAccess, authority: authorAuthority, loaded }),
      ),
    )
    const fixed = request({
      availability: {
        kind: 'available',
        definition: loaded.definition,
        executor: loaded.executor,
        layer: loaded.key.layer,
      },
      settings,
    })
    const authority = createMemoryToolStartAuthority<string>()
    const bindings = createLocalToolBindings({
      registry,
      catalog: { inspect: async () => succeed(fixed.availability) },
      authority,
      scope: () => {
        throw new Error('no scope is made for a tool without an operation')
      },
      settle: async () => succeed(completedFinal()),
    })
    const binding = unbox(
      await bindings.resolve({ ...authorAccess, call: callId('first'), request: fixed }),
    )
    const start: Start = {
      kind: 'start',
      executor: loaded.executor,
      operation: operationId('start-first'),
      execution: {
        tenant: authorAccess.tenant,
        call: callId('first'),
        instance: instanceId,
        generation: '1',
      },
    }
    const value = { ...authorAccess, call: callId('first'), start, request: fixed }
    const permit = unbox(await authority.prepare(value))
    expect(await binding.start({ ...value, permit }, {})).toEqual(refusal)
  })
})

describe('author binding of a live author that ends badly', () => {
  const tick = () => new Promise<void>(resolve => setImmediate(resolve))

  it('settles an author that throws something that is no error with the reason of an author failure', async () => {
    const fixture = await harness(
      authorModule(async () => {
        throw 'plain text'
      }),
    )
    unbox(await (await fixture.resolve()).start(await fixture.input(), {}))
    await tick()
    expect(fixture.closes).toEqual(['failed'])
    expect(fixture.settlements).toMatchObject([
      { outcome: { kind: 'failed', reason: 'author failed' } },
    ])
  })

  it('keeps the live execution observable and publishes nothing when the settlement answers a failure', async () => {
    const fixture = await harness(
      authorModule(async () => 'done'),
      undefined,
      async () => fail({ kind: 'unavailable', dependency: 'settlement', diagnostic: 'down' }),
    )
    const input = await fixture.input()
    const live = unbox(await (await fixture.resolve()).start(input, {}))
    await tick()
    const binding = await fixture.resolve()
    expect(
      unbox(
        await binding.inspectStart({ ...authorAccess, call: callId('first'), start: input.start }),
      ).kind,
    ).toBe('live')
    const seen: unknown[] = []
    for await (const batch of live.facts({ after: null, signal: AbortSignal.timeout(50) }))
      seen.push(batch)
    expect(seen).toEqual([])
  })

  it('binds the receipt of the executor to the start record and the request', async () => {
    const consumed: { executorReceipt: unknown }[] = []
    const fixture = await harness(
      authorModule(async () => 'unused'),
      async input => {
        consumed.push(input)
        return fail({ kind: 'denied', action: 'start' })
      },
    )
    const input = await fixture.input()
    await (await fixture.resolve()).start(input, {})
    const key = canonicalDigest([authorAccess.tenant, callId('first'), input.start.operation])
    expect(consumed[0]?.executorReceipt).toEqual(
      localAuthorEvidence(`start/${key}`, [input.start, input.request]),
    )
  })
})
