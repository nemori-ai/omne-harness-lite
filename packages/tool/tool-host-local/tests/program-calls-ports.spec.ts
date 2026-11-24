import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { createIndependentToolScope } from '@omne-harness/tool'
import {
  programToolsOf,
  type ProgramCallAnswer,
  type ToolFailure,
  type ToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolResultVersion,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  toolInvokeRequestOf,
  type NestedAdmission,
  type PositionExclusion,
  type ProgramParent,
  type ProgramPosition,
  type ToolChildren,
} from '@omne-harness/tool-contract/provider'
import { createLocalProgramCalls, type ArgumentsVerdict } from '../src/program-calls.ts'
import {
  createProgramArrivals,
  positionTargetOf,
  programConsumer,
  type PreparedPosition,
} from '../src/program-source.ts'
import { adoption, callId, operationId, request, tenantA } from './coordinator-values.ts'

const fixed = request()
const parentCall = callId('call-parent')
const parent: ProgramParent<unknown> = {
  principal: 'alice',
  tenant: tenantA,
  call: parentCall,
  request: fixed,
  start: { kind: 'start', operation: operationId('start-1') } as Extract<
    ToolStartRecord,
    { kind: 'start' }
  >,
}
const base = {
  ordinal: 1,
  child: callId('call-child'),
  admission: operationId('admit-child'),
  target: positionTargetOf(fixed),
}
const at = (state: 'registered' | 'handed'): ProgramPosition =>
  state === 'registered' ? { ...base, state } : { ...base, state, background: false }
const excludedAt = (exclusion: PositionExclusion): ProgramPosition => ({
  ...base,
  state: 'excluded',
  exclusion,
})
const unavailable: ToolFailure = { kind: 'unavailable', dependency: 'store', diagnostic: 'down' }
const handedOff: ToolFailure = { kind: 'invalid', field: 'position', reason: 'handed-off' }
const reference = 'tb1.reference' as ToolInvocationRef
const object: JsonValue = { kind: 'object', entries: [] }

type Over = Partial<{
  absent: 'source' | 'runtime' | 'children' | 'admission'
  target: ToolFailure
  prepared: PreparedPosition
  arguments: ArgumentsVerdict
  register: Awaited<ReturnType<ToolChildren<unknown>['register']>>
  admit: () => Promise<NestedAdmission>
  handOff: ToolFailure
  exclude: ToolFailure
  invoke: ToolInvokeOutcome
  table: readonly ProgramPosition[]
}>

function world(over: Over = {}) {
  const log: string[] = []
  const arrivals = createProgramArrivals()
  const consumer = programConsumer(parentCall, 1)
  const prepared: PreparedPosition = over.prepared ?? {
    kind: 'prepared',
    parent: {} as Extract<PreparedPosition, { kind: 'prepared' }>['parent'],
    consumer,
    child: base.child,
    admission: base.admission,
    request: fixed,
    requestDigest: 'sha256:request',
    target: base.target,
  }
  const children: ToolChildren<unknown> = {
    register: async () => {
      log.push('register')
      return over.register ?? succeed(at('registered'))
    },
    exclude: async given => {
      log.push(`exclude:${given.exclusion.kind}`)
      return over.exclude === undefined ? succeed(excludedAt(given.exclusion)) : fail(over.exclude)
    },
    handOff: async () => {
      log.push('handOff')
      return over.handOff === undefined ? succeed(at('handed')) : fail(over.handOff)
    },
    background: async () => succeed(at('handed')),
    retain: async () => succeed(at('handed')),
    seal: async () => {
      log.push('seal')
      return succeed({ phase: 'sealed', positions: over.table ?? [] })
    },
    table: async () =>
      succeed({
        phase: 'sealed',
        positions: log.some(one => one.startsWith('exclude')) ? [] : (over.table ?? []),
      }),
  }
  const controller = new AbortController()
  const scope = createIndependentToolScope({
    limits: {
      authorBufferBytes: 1024,
      authorBufferItems: 8,
      authorWaitHistoryBytes: 1024,
      authorWaitHistoryItems: 8,
    },
    signal: controller.signal,
    process: null,
    waits: null,
  })
  if ('failure' in scope) throw new Error('scope')
  const present = <T>(name: Over['absent'], value: T) => (over.absent === name ? undefined : value)
  const calls = createLocalProgramCalls<unknown>({
    source: () =>
      present('source', {
        prepare: async () => prepared,
        arrivals,
        source: { resolve: async () => ({ kind: 'association-unknown' }) },
        recoverBinding: async () => fail(unavailable),
        receiver: { push: async () => fail({ kind: 'denied' }) },
      }),
    runtime: () =>
      present('runtime', {
        invoke: async () => {
          log.push('invoke')
          return (
            over.invoke ?? { kind: 'accepted', reference, state: {} as never, recovered: false }
          )
        },
      }),
    children: () => present('children', children),
    admission: () =>
      present('admission', {
        admit: async () => {
          log.push('admit')
          return (await over.admit?.()) ?? { kind: 'allowed' }
        },
      }),
    functions: async () => succeed([]),
    prepareTarget: async () =>
      over.target === undefined ? succeed(toolInvokeRequestOf(fixed)) : fail(over.target),
    checkArguments: async () => over.arguments ?? { kind: 'valid' },
    retryMs: 5,
  })
  const bound = calls.bind(parent, scope.ok)
  const tools = programToolsOf(bound.context)
  if (tools === undefined) throw new Error('not attached')
  return {
    tools,
    log,
    stop: () => controller.abort(),
    finish: bound.finish,
    call: (argumentsValue: JsonValue = object) =>
      tools.call({ ordinal: 1, entry: 'Echo.say', arguments: argumentsValue }),
    arrive: (terminal: Parameters<typeof arrivals.arrived>[2]['terminal']) =>
      arrivals.arrived(tenantA, consumer, {
        result: 'v1' as ToolResultVersion,
        terminal,
        effect: { kind: 'not-started' },
        data: { kind: 'none' },
      }),
  }
}
const failureOf = (answer: ProgramCallAnswer) =>
  answer.kind === 'failure' ? [answer.failure.kind, answer.failure.effect] : ['value', answer.value]

describe('one program position, port by port (TL-65, TL-68, TL-72)', () => {
  it.each(['source', 'runtime', 'children', 'admission'] as const)(
    'without the %s the call answers unavailable and registers nothing',
    async absent => {
      const w = world({ absent })
      expect(failureOf(await w.call())).toEqual(['unavailable', 'none'])
      expect(w.log).toEqual([])
    },
  )

  it.each([
    ['arguments that are not one object', {}, { kind: 'array', items: [] } as JsonValue, 'invalid'],
    ['a name the view does not have', { target: handedOff }, object, 'unsupported'],
    ['a view that cannot be read', { target: unavailable }, object, 'unavailable'],
    [
      'a target closed to programs',
      {
        prepared: {
          kind: 'rejected',
          failure: { kind: 'unsupported', adoption: adoption('x'), reason: 'closed' },
        },
      },
      object,
      'unsupported',
    ],
    [
      'a parent that cannot be verified',
      { prepared: { kind: 'association-unknown' } },
      object,
      'unavailable',
    ],
    [
      'arguments outside the contract',
      { arguments: { kind: 'invalid', reason: 'text' } },
      object,
      'invalid',
    ],
    ['a parser that is absent', { arguments: { kind: 'unavailable' } }, object, 'unavailable'],
  ] as const)(
    '%s is refused by name before the position is registered',
    async (_, over, args, kind) => {
      const w = world(over as Over)
      expect(failureOf(await w.call(args))).toEqual([kind, 'none'])
      expect(w.log).toEqual([])
    },
  )

  it('a view whose answer is not known gives unknown, and still registers nothing', async () => {
    const w = world({ target: { kind: 'commit-unknown', operation: operationId('op') } })
    expect(failureOf(await w.call())).toEqual(['unknown', 'unknown'])
    expect(w.log).toEqual([])
  })

  it('asks, hands off, then invokes, in that order, and answers with what arrives', async () => {
    const w = world()
    const answer = w.call()
    await expect.poll(() => w.log).toEqual(['register', 'admit', 'handOff', 'invoke'])
    w.arrive({ kind: 'unavailable', reason: 'the target left' })
    expect(failureOf(await answer)).toEqual(['unavailable', 'none'])
  })

  it('an admission that throws is asked again at the same position; a denial excludes it and nothing is invoked', async () => {
    let asked = 0
    const w = world({
      admit: async () => {
        if (asked++ === 0) throw new Error('down')
        return { kind: 'denied', reason: 'no' }
      },
    })
    expect(await w.call()).toEqual({
      kind: 'failure',
      failure: { kind: 'denied', effect: 'none', message: 'no' },
    })
    expect(w.log).toEqual(['register', 'admit', 'admit', 'exclude:denied'])
  })

  it('a position that could not be handed off is not invoked', async () => {
    const w = world({ handOff: unavailable })
    expect(failureOf(await w.call())).toEqual(['unavailable', 'none'])
    expect(w.log).toEqual(['register', 'admit', 'handOff'])
  })

  it('a position recalled as excluded answers its exclusion without asking again', async () => {
    const w = world({ register: succeed(excludedAt({ kind: 'denied', reason: 'before' })) })
    expect(await w.call()).toMatchObject({ failure: { kind: 'denied', message: 'before' } })
    expect(w.log).toEqual(['register'])
  })

  it('a call that was not accepted is excluded under its own identity and answers the refusal', async () => {
    const invoke: ToolInvokeOutcome = {
      kind: 'rejected',
      failure: { kind: 'unsupported', adoption: adoption('x'), reason: 'closed at the ledger' },
    }
    const w = world({ invoke })
    expect(await w.call()).toEqual({
      kind: 'failure',
      failure: { kind: 'unsupported', effect: 'none', message: 'closed at the ledger' },
    })
    expect(w.log.at(-1)).toBe('exclude:not-accepted')
  })

  it('when neither the acceptance nor its exclusion is known, the program is told unknown', async () => {
    const w = world({ invoke: { kind: 'commit-unknown', reference }, exclude: unavailable })
    expect(failureOf(await w.call())).toEqual(['unknown', 'unknown'])
  })

  it('when the exclusion finds the call accepted after all, the position waits for its result', async () => {
    const w = world({ invoke: { kind: 'association-unknown' }, exclude: handedOff })
    const answer = w.call()
    await expect.poll(() => w.log.at(-1)).toBe('exclude:not-accepted')
    w.arrive({ kind: 'completed' })
    expect(await answer).toEqual({ kind: 'value', value: null, external: false })
  })

  it('a program that ends while a call waits is told interrupted; after the end no call is made', async () => {
    const w = world()
    const answer = w.call()
    await expect.poll(() => w.log.at(-1)).toBe('invoke')
    w.stop()
    expect(failureOf(await answer)).toEqual(['interrupted', 'unknown'])
    const late = await w.tools.call({ ordinal: 2, entry: 'Echo.say', arguments: object })
    expect(failureOf(late)).toEqual(['interrupted', 'none'])
    expect(await w.tools.functions()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(w.log.filter(one => one === 'register')).toHaveLength(1)
  })

  it('a program that ends while the admission cannot answer leaves the position registered', async () => {
    const w = world({ admit: async () => ({ kind: 'unanswerable', diagnostic: 'later' }) })
    const answer = w.call()
    await expect.poll(() => w.log.filter(one => one === 'admit').length).toBeGreaterThan(1)
    w.stop()
    expect(failureOf(await answer)).toEqual(['interrupted', 'none'])
    expect(w.log).not.toContain('handOff')
    expect(w.log.some(one => one.startsWith('exclude'))).toBe(false)
  })

  it('settling closes registration and excludes a position that was never released', async () => {
    const w = world({ handOff: unavailable, table: [at('registered')] })
    await w.call()
    const settling = w.tools.settle()
    await expect.poll(() => w.log.slice(-2)).toEqual(['seal', 'exclude:unavailable'])
    expect(await settling).toMatchObject({ ok: { phase: 'sealed', positions: [] } })
  })

  it('settling without the position table answers unavailable', async () => {
    expect(await world({ absent: 'children' }).tools.settle()).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})
