import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import type { FixedToolRequest, ToolCallId, ToolDecision } from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  defineToolWaitContract,
  type ToolEntrySource,
  type ToolExecutionContext,
  type ToolSegmentContext,
  type ToolSourceAnswer,
  type ToolSourceCall,
  type ToolSourceResume,
  type ToolSourceSuspension,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import { testingSourceEntry } from '@omne-harness/tool-contract/testing'
import { carryCallFacts, createLocalEntrySources, noteCallFacts } from '../src/entry-sources.ts'
import { accessOf, fiberedRegistry, tenantA } from './binding-values.ts'
import { adoption } from './coordinator-values.ts'

function schema(id: string): ToolValueSchema<unknown> {
  return {
    identity: { id, revision: '1', digest: `sha256:${id}` },
    ref: { id: id as never, load: () => Promise.reject(new Error('no schema is loaded')) },
    maxBytes: 1_024,
  }
}

const unbox = <T>(answer: Outcome<T, unknown>): T => {
  if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
  return answer.ok
}

const ask = unbox(
  defineToolWaitContract({
    kind: 'ask',
    adoption: adoption('peer-input'),
    request: schema('peer-input-request'),
    response: schema('peer-input-response'),
    expiry: 'forbidden',
  }),
)

const asA = accessOf(tenantA)
const call = 'call-1' as ToolCallId
const entry = testingSourceEntry({ name: 'peer__book', category: 'mcp', commands: ['run'] })
const declaration = {
  schema: { id: 'peer-state', revision: '1', digest: 'sha256:peer-state' },
  codec: adoption('peer-state-codec'),
  maxBytes: 4096,
}
const SUSPENDED: ToolSourceSuspension = {
  kind: 'suspended',
  state: new TextEncoder().encode('{"round":1}'),
  wait: {
    kind: 'ask',
    key: 'date',
    contract: ask,
    request: { kind: 'string', value: 'which day?' },
  },
  closedResult: 'The peer asked for a day and nobody answered.',
}
const result = (text: string) => ({
  content: [
    {
      kind: 'text' as const,
      id: 'peer.result',
      visibility: { toHuman: true, toModel: true },
      text,
    },
  ],
  data: { kind: 'none' as const },
  original: { kind: 'none' as const },
  attachments: [],
})

type Source = ToolEntrySource<string, ContentBlock>
type Seen = Readonly<{ executed: ToolSourceCall<string>[]; resumed: ToolSourceResume<string>[] }>

function source(
  pair: Readonly<{ checkpoint?: boolean; resume?: boolean }>,
  first: ToolSourceAnswer<ContentBlock> = SUSPENDED,
): Source & Seen {
  const executed: ToolSourceCall<string>[] = []
  const resumed: ToolSourceResume<string>[] = []
  return {
    prefix: 'peer__',
    executed,
    resumed,
    list: async () => succeed({ entries: [entry], withheld: [] }),
    select: (_access, name) => (name === entry.definition.name ? entry : undefined),
    async execute(given) {
      executed.push(given)
      return first
    },
    ...(pair.checkpoint === true ? { checkpoint: { declaration, waits: [ask] } } : {}),
    ...(pair.resume === true
      ? {
          async resume(given: ToolSourceResume<string>) {
            resumed.push(given)
            return result('booked for Tuesday') as never
          },
        }
      : {}),
  }
}

function slotOf(offered: Source) {
  const { registry } = fiberedRegistry(null)
  const sourced = createLocalEntrySources<string, unknown, ContentBlock>({
    sources: () => [offered],
    hold: () => () => undefined,
    codec: createToolMessageResultCodec(4096) as never,
  })
  const fixed = {
    availability: {
      kind: 'available',
      definition: entry.definition,
      executor: entry.executor,
      layer: { kind: 'tenant', tenant: tenantA },
    },
    command: 'run',
  } as FixedToolRequest
  const selected = unbox(sourced.registry(registry).selectAndPin(asA, fixed, call))
  const registration = readToolRegistration(selected.loaded.implementation)
  if (registration?.kind !== 'commands') throw new Error('registration')
  const slot = registration.operations[0]?.[1]
  if (slot === undefined) throw new Error('slot')
  return slot
}

const args = { kind: 'object', entries: [] } as const

describe('a source that gives a checkpoint and resume (C108, TL-78)', () => {
  it('its entry runs in segments: it declares the checkpoint and the waits of the source, suspends as the source answered, and resumes from that checkpoint with the decision', async () => {
    const offered = source({ checkpoint: true, resume: true })
    const slot = slotOf(offered)
    expect(slot.segments?.checkpoint).toEqual(declaration)
    expect(slot.author.waits).toEqual([ask])
    const signal = new AbortController().signal
    const first: ToolSegmentContext = {
      signal,
      emit: async () => succeed({ sequence: '1', kind: 'local' }),
    }
    noteCallFacts(first, { ...asA, call, program: false })
    expect(await slot.segments?.initial(args, undefined, first)).toEqual(succeed(SUSPENDED))
    expect(offered.executed).toEqual([
      {
        ...asA,
        name: 'peer__book',
        command: 'run',
        declared: entry.definition.kind === 'commands' ? entry.definition.commands[0] : null,
        arguments: args,
        invocation: call,
        program: false,
        signal,
      },
    ])
    const response: ToolDecision<unknown> = { kind: 'answer', value: 'Tuesday' }
    const again: ToolSegmentContext = {
      signal,
      emit: async () => succeed({ sequence: '2', kind: 'local' }),
    }
    noteCallFacts(again, { ...asA, call, program: false })
    expect(
      await slot.segments?.resume({ checkpoint: SUSPENDED.state, response }, undefined, again),
    ).toEqual(succeed({ kind: 'completed', value: result('booked for Tuesday') }))
    expect(offered.resumed).toEqual([
      {
        ...asA,
        name: 'peer__book',
        command: 'run',
        declared: entry.definition.kind === 'commands' ? entry.definition.commands[0] : null,
        invocation: call,
        program: false,
        signal,
        checkpoint: SUSPENDED.state,
        response,
      },
    ])
  })

  it('a segment carries the facts of its call over from the context of the call, and a call with none tells it nothing', async () => {
    const offered = source({ checkpoint: true, resume: true })
    const slot = slotOf(offered)
    const signal = new AbortController().signal
    const emit = async () => succeed({ sequence: '1', kind: 'local' as const })
    const known = { signal } as ToolExecutionContext
    noteCallFacts(known, { ...asA, call })
    const carried: ToolSegmentContext = { signal, emit }
    carryCallFacts(known, carried)
    await slot.segments?.initial(args, undefined, carried)
    expect(offered.executed.map(given => [given.invocation, given.program])).toEqual([
      [call, false],
    ])
    const bare: ToolSegmentContext = { signal, emit }
    carryCallFacts({ signal } as ToolExecutionContext, bare)
    await expect(slot.segments?.initial(args, undefined, bare)).rejects.toThrow(
      'the call of the source entry is not known',
    )
  })

  it('a segment answered in one go completes at once', async () => {
    const slot = slotOf(source({ checkpoint: true, resume: true }, result('done') as never))
    const context: ToolSegmentContext = {
      signal: new AbortController().signal,
      emit: async () => succeed({ sequence: '1', kind: 'local' }),
    }
    noteCallFacts(context, { ...asA, call })
    expect(await slot.segments?.initial(args, undefined, context)).toEqual(
      succeed({ kind: 'completed', value: result('done') }),
    )
  })
})

describe('a source without the pair (C108, TL-78)', () => {
  it.each([
    ['neither', {}],
    ['only the checkpoint', { checkpoint: true }],
    ['only resume', { resume: true }],
  ] as const)(
    'with %s, its entry does not run in segments and waits for nothing',
    (_label, pair) => {
      const slot = slotOf(source(pair))
      expect(slot.segments).toBeNull()
      expect(slot.author.waits).toEqual([])
    },
  )

  it('that answers a suspension breaks its contract: the call fails', async () => {
    const slot = slotOf(source({ checkpoint: true }))
    const context = { signal: new AbortController().signal } as ToolExecutionContext
    noteCallFacts(context, { ...asA, call })
    await expect(slot.author.executor.execute(args, undefined, context)).rejects.toThrow(
      'the entry source suspended the call without declaring a checkpoint',
    )
  })

  it('that answers a result gives it as before', async () => {
    const slot = slotOf(source({}, result('plain') as never))
    const context = { signal: new AbortController().signal } as ToolExecutionContext
    noteCallFacts(context, { ...asA, call })
    expect(await slot.author.executor.execute(args, undefined, context)).toEqual(result('plain'))
  })
})
