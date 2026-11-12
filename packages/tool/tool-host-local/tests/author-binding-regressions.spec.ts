import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, createIndependentToolScope } from '@omne-harness/tool'
import type { FixedToolRequest, ToolStartRecord } from '@omne-harness/tool-contract'
import {
  returnGuide,
  defineCommandTool,
  defineToolOperation,
  type ToolAuthority,
  type ToolImplementationModule,
  type ToolStartAuthority,
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
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  loadedFor,
  scriptedVerifier,
  tenantB,
} from './binding-values.ts'
import { localAuthorEvidence } from '../src/live-author-execution.ts'
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

type Fixture = Awaited<ReturnType<typeof harness>>

async function harness(
  module: ToolImplementationModule<unknown, ContentBlock>,
  consumeWith?: ToolStartAuthority<string>['consume'],
  settleWith?: LocalToolBindingsInput<string, unknown, ContentBlock>['settle'],
  inspectWith?: ToolStartAuthority<string>['inspect'],
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
  // A rebuild over the same registry and authority stands for a new process: it holds no attempt.
  const make = () =>
    createLocalToolBindings({
      registry,
      catalog: { inspect: async () => succeed(fixed.availability) },
      authority: {
        ...authority,
        consume: input => {
          consumed += 1
          return (consumeWith ?? authority.consume)(input)
        },
        inspect: input => (inspectWith ?? authority.inspect)(input),
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
  const bindings = make()
  const resolve = async (fixedRequest = fixed, call = 'first', over = bindings) =>
    unbox(await over.resolve({ ...authorAccess, call: callId(call), request: fixedRequest }))
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
    authority,
    rebuild: make,
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

// A consume that did not answer `started` never entered the author, so the binding keeps no answer
// of it: the same start asks the fence again, and an inspection asks the fence what it decided
// (U2, U3). The author still runs at most once.
describe('author binding of a start whose consume did not answer started', () => {
  const counted = () => {
    let entered = 0
    return {
      module: authorModule(async () => {
        entered += 1
        return 'done'
      }),
      entered: () => entered,
    }
  }
  const settled = () => new Promise<void>(resolve => setImmediate(resolve))
  const unavailableOnce = (fixture: () => Fixture) => {
    let first = true
    return (input: Parameters<ToolStartAuthority<string>['consume']>[0]) => {
      if (!first) return fixture().authority.consume(input)
      first = false
      return Promise.resolve(
        fail({ kind: 'unavailable' as const, dependency: 'start-ledger', diagnostic: 'busy' }),
      )
    }
  }

  it.each(['unavailable', 'throws'] as const)(
    'after a consume that %s, the same start consumes again and runs the author once',
    async answer => {
      const author = counted()
      let fixture: Fixture
      const once = unavailableOnce(() => fixture)
      let thrown = false
      fixture = await harness(author.module, input => {
        if (answer === 'throws' && !thrown) {
          thrown = true
          return Promise.reject(new Error('lost'))
        }
        return answer === 'throws' ? fixture.authority.consume(input) : once(input)
      })
      const binding = await fixture.resolve()
      const input = await fixture.input()
      expect(await binding.start(input, {})).toMatchObject({ failure: {} })
      unbox(await binding.start(input, {}))
      await settled()
      expect(fixture.consumed()).toBe(2)
      expect(author.entered()).toBe(1)
      expect(fixture.settlements).toHaveLength(1)
      // The start that ran is not run again.
      unbox(await binding.start(input, {}))
      expect(fixture.consumed()).toBe(2)
    },
  )

  it('an inspection of a start the fence did not accept answers not-started, and a new permit runs it', async () => {
    const author = counted()
    let fixture: Fixture
    const once = unavailableOnce(() => fixture)
    fixture = await harness(author.module, input => once(input))
    const binding = await fixture.resolve()
    const input = await fixture.input()
    expect(await binding.start(input, {})).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(unbox(await binding.inspectStart(input))).toMatchObject({
      kind: 'not-started',
      exclusion: expect.anything(),
    })
    unbox(await binding.start(await fixture.input(), {}))
    await settled()
    expect(author.entered()).toBe(1)
  })

  it('an inspection of a start the fence accepted, whose answer was lost, runs the author once', async () => {
    const author = counted()
    let fixture: Fixture
    fixture = await harness(author.module, async input => {
      unbox(await fixture.authority.consume(input))
      return succeed({ kind: 'unknown' as const, diagnostic: 'the answer was lost' })
    })
    const binding = await fixture.resolve()
    const input = await fixture.input()
    expect(await binding.start(input, {})).toMatchObject({ failure: { kind: 'commit-unknown' } })
    expect(author.entered()).toBe(0)
    const [one, two] = await Promise.all([binding.inspectStart(input), binding.inspectStart(input)])
    expect([unbox(one).kind, unbox(two).kind]).toEqual(['live', 'live'])
    await settled()
    expect(author.entered()).toBe(1)
    expect(fixture.settlements).toHaveLength(1)
  })

  /** A binding whose first consume answers unavailable, and whose fence answers `inspect`. */
  const askingFence = async (inspect: ToolStartAuthority<string>['inspect']) => {
    const author = counted()
    let fixture: Fixture
    const once = unavailableOnce(() => fixture)
    fixture = await harness(author.module, input => once(input), undefined, inspect)
    const binding = await fixture.resolve()
    const input = await fixture.input()
    expect(await binding.start(input, {})).toMatchObject({ failure: { kind: 'unavailable' } })
    return { binding, input, author }
  }

  it('an inspection that the fence answers rejected answers not-started, and never enters the author', async () => {
    const exclusion = (await import('./coordinator-values.ts')).evidence('rejected')
    const { binding, input, author } = await askingFence(() =>
      Promise.resolve(succeed({ kind: 'rejected' as const, reason: 'revoked', exclusion })),
    )
    expect(unbox(await binding.inspectStart(input))).toEqual({ kind: 'not-started', exclusion })
    await settled()
    expect(author.entered()).toBe(0)
  })

  it('an inspection that the fence answers unknown answers unknown, and never enters the author', async () => {
    const { binding, input, author } = await askingFence(() =>
      Promise.resolve(succeed({ kind: 'unknown' as const, diagnostic: 'the ledger is behind' })),
    )
    expect(unbox(await binding.inspectStart(input))).toEqual({
      kind: 'unknown',
      diagnostic: 'the ledger is behind',
    })
    await settled()
    expect(author.entered()).toBe(0)
  })

  it('an inspection whose fence cannot answer gives that failure, and never enters the author', async () => {
    const down = fail({
      kind: 'unavailable' as const,
      dependency: 'start-ledger',
      diagnostic: 'down',
    })
    const { binding, input, author } = await askingFence(() => Promise.resolve(down))
    expect(await binding.inspectStart(input)).toEqual(down)
    await settled()
    expect(author.entered()).toBe(0)
  })

  it('an inspection of a start that entered the author answers from the execution, not the fence', async () => {
    let fenceDown = false
    let fixture: Fixture
    fixture = await harness(counted().module, undefined, undefined, input =>
      fenceDown
        ? Promise.resolve(
            fail({ kind: 'unavailable' as const, dependency: 'start-ledger', diagnostic: 'down' }),
          )
        : fixture.authority.inspect(input),
    )
    const binding = await fixture.resolve()
    const input = await fixture.input()
    unbox(await binding.start(input, {}))
    fenceDown = true
    expect(unbox(await binding.inspectStart(input)).kind).not.toBe('unknown')
  })

  it('an inspection that arrives while the consume is still out waits for its answer', async () => {
    const author = counted()
    const held = Promise.withResolvers<void>()
    let fixture: Fixture
    fixture = await harness(author.module, async input => {
      await held.promise
      return fixture.authority.consume(input)
    })
    const binding = await fixture.resolve()
    const input = await fixture.input()
    const started = binding.start(input, {})
    const inspected = binding.inspectStart(input)
    held.resolve()
    expect(await started).toHaveProperty('ok')
    // The answer comes from the execution (it may have settled by now), not from the fence.
    expect(['live', 'settled']).toContain(unbox(await inspected).kind)
    await settled()
    expect(author.entered()).toBe(1)
  })

  it('an inspection of another start record under the same start operation is a conflict', async () => {
    const fixture = await harness(counted().module)
    const binding = await fixture.resolve()
    const input = await fixture.input()
    unbox(await binding.start(input, {}))
    const moved = { ...input.start, execution: { ...input.start.execution, generation: '2' } }
    expect(await binding.inspectStart({ ...input, start: moved })).toEqual({
      failure: { kind: 'conflict', operation: input.start.operation },
    })
  })

  it('a rebuilt binding (a new process) does not enter the author for a start the fence accepted', async () => {
    const author = counted()
    let fixture: Fixture
    fixture = await harness(author.module, async input => {
      unbox(await fixture.authority.consume(input))
      return succeed({ kind: 'unknown' as const, diagnostic: 'the answer was lost' })
    })
    const input = await fixture.input()
    expect(await (await fixture.resolve()).start(input, {})).toMatchObject({
      failure: { kind: 'commit-unknown' },
    })
    const rebuilt = await fixture.resolve(fixture.fixed, 'first', fixture.rebuild())
    expect(unbox(await rebuilt.inspectStart(input))).toMatchObject({ kind: 'unknown' })
    await settled()
    expect(author.entered()).toBe(0)
  })

  it('a rebuilt binding (a new process) answers not-started for a start the fence did not accept', async () => {
    let fixture: Fixture
    const once = unavailableOnce(() => fixture)
    fixture = await harness(counted().module, input => once(input))
    const input = await fixture.input()
    expect(await (await fixture.resolve()).start(input, {})).toMatchObject({ failure: {} })
    const rebuilt = await fixture.resolve(fixture.fixed, 'first', fixture.rebuild())
    expect(unbox(await rebuilt.inspectStart(input))).toMatchObject({ kind: 'not-started' })
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

  it('reports the execution as unobservable and publishes nothing when the settlement answers a failure', async () => {
    const fixture = await harness(
      authorModule(async () => 'done'),
      undefined,
      async () => fail({ kind: 'unavailable', dependency: 'settlement', diagnostic: 'down' }),
    )
    const input = await fixture.input()
    const live = unbox(await (await fixture.resolve()).start(input, {}))
    await tick()
    const binding = await fixture.resolve()
    // A call whose end was not settled has no final to give: its start is looked up as unknown.
    expect(
      unbox(
        await binding.inspectStart({ ...authorAccess, call: callId('first'), start: input.start }),
      ),
    ).toEqual({ kind: 'unknown', diagnostic: 'execution observation unavailable' })
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
