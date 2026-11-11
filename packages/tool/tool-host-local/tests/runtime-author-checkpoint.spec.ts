// What the runtime author execution keeps of a suspended segment: the state bytes and the Ask
// request, each under the operation its start derives; and what a resume reads back from custody.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolConfiguration } from '@omne-harness/tool'
import type {
  ToolMessageContentBlock,
  ToolOutputCustody,
} from '@omne-harness/tool-contract/provider'
import { createLiveAuthorExecution } from '../src/live-author-execution.ts'
import { createRuntimeAuthorExecution } from '../src/runtime-author.ts'
import { authorAccess, unbox } from './author-values.ts'
import { adoption, callId, evidence, instanceId, operationId } from './coordinator-values.ts'

type Preserved = Parameters<ToolOutputCustody<unknown>['preserve']>[0]
type Checkpoint = Parameters<ReturnType<typeof createRuntimeAuthorExecution>['checkpoint']>[0]

const codec = adoption('state-codec')

type PreserveAnswer = Awaited<ReturnType<ToolOutputCustody<unknown>['preserve']>>
type Reads = Pick<Parameters<typeof createRuntimeAuthorExecution>[0], 'recovery' | 'readOutput'>
type Recovery = Reads['recovery']
type ReadOutput = Reads['readOutput']

function setup(
  answer: (request: Preserved, nth: number) => PreserveAnswer | Promise<PreserveAnswer>,
  reads: Partial<Reads> = {},
) {
  const preserved: Preserved[] = []
  const custody = {
    preserve: async (request: Preserved) => {
      preserved.push(request)
      return answer(request, preserved.length)
    },
    inspect: async () => succeed({ kind: 'unknown' as const }),
    retainResult: async () => fail({ kind: 'invalid', field: 'x', reason: 'unused' }),
  } as unknown as ToolOutputCustody<unknown>
  const runtime = createRuntimeAuthorExecution({
    configuration: { driverRetryDelayMs: 1 } as ToolConfiguration,
    custody,
    recovery: reads.recovery ?? (async () => succeed({ waits: [] } as never)),
    readOutput: reads.readOutput ?? (async () => succeed(null)),
  })
  return { runtime, preserved }
}

const kept = (request: Preserved) =>
  succeed({ codec: request.codec, custody: evidence(`kept/${request.operation}`) } as never)

function callOf(
  over: Readonly<{
    operation?: string
    state?: Uint8Array
    request?: unknown
    maxBytes?: number
  }> = {},
): Checkpoint {
  const operation = operationId(over.operation ?? 'c1/start')
  const start = {
    kind: 'start' as const,
    operation,
    executor: adoption('exec'),
    execution: {
      tenant: authorAccess.tenant,
      call: callId('c1'),
      instance: instanceId,
      generation: '1',
    },
  }
  return {
    ...authorAccess,
    call: callId('c1'),
    start,
    request: {} as never,
    state: over.state ?? new Uint8Array([1, 2, 3]),
    codec,
    wait: {
      kind: 'ask',
      key: 'k',
      request: over.request ?? { q: 'which?' },
      contract: { request: { maxBytes: over.maxBytes ?? 1_024 } },
    } as never,
    execution: createLiveAuthorExecution<ToolMessageContentBlock>({ start, release() {} }),
  }
}

describe('the checkpoint custody of the runtime author execution', () => {
  it('keeps the state and the request under the operations the start derives, and answers both custody records', async () => {
    const { runtime, preserved } = setup(kept)
    const call = callOf({ request: { q: 'which?' } })
    const answered = unbox(await runtime.checkpoint(call))
    expect(preserved.map(request => request.operation)).toEqual([
      'c1/start/checkpoint',
      'c1/start/wait-request',
    ])
    expect(preserved[0]?.codec).toBe(codec)
    expect([...(preserved[0]?.bytes ?? [])]).toEqual([1, 2, 3])
    expect(new TextDecoder().decode(preserved[1]?.bytes)).toBe('{"q":"which?"}')
    expect(preserved[1]?.codec).not.toEqual(codec)
    expect(answered).toEqual({
      payload: evidence('kept/c1/start/checkpoint'),
      request: evidence('kept/c1/start/wait-request'),
    })
  })

  it('refuses a request over the size its wait contract declares, and keeps one of exactly that size', async () => {
    const size = new TextEncoder().encode(JSON.stringify({ q: 'which?' })).byteLength
    const over = setup(kept)
    expect(
      await over.runtime.checkpoint(callOf({ request: { q: 'which?' }, maxBytes: size - 1 })),
    ).toEqual({ failure: { kind: 'invalid', field: 'wait.request', reason: 'too-large' } })
    expect(over.preserved).toEqual([])
    const exact = setup(kept)
    expect('ok' in (await exact.runtime.checkpoint(callOf({ maxBytes: size })))).toBe(true)
  })

  it('refuses a start whose derived operations are no legal identity, whichever of the two fails', async () => {
    // 'a' x 244 still takes `/checkpoint`, but not `/wait-request`; 'a' x 246 takes neither.
    for (const length of [244, 246]) {
      const { runtime, preserved } = setup(kept)
      expect(await runtime.checkpoint(callOf({ operation: 'a'.repeat(length) }))).toEqual({
        failure: { kind: 'invalid', field: 'operation', reason: 'derived-operation' },
      })
      expect(preserved).toEqual([])
    }
  })

  it('answers the custody failure of the state without keeping the request, and that of the request', async () => {
    const first = setup(() => fail({ kind: 'invalid', field: 'bytes', reason: 'refused' }))
    expect(await first.runtime.checkpoint(callOf())).toEqual({
      failure: { kind: 'invalid', field: 'bytes', reason: 'refused' },
    })
    expect(first.preserved).toHaveLength(1)
    const second = setup((request, nth) =>
      nth === 1 ? kept(request) : fail({ kind: 'invalid', field: 'bytes', reason: 'no room' }),
    )
    expect(await second.runtime.checkpoint(callOf())).toEqual({
      failure: { kind: 'invalid', field: 'bytes', reason: 'no room' },
    })
    expect(second.preserved).toHaveLength(2)
  })

  it('gives custody a copy of the state, so what custody does to its bytes does not reach the author buffer', async () => {
    const { runtime, preserved } = setup(request => {
      request.bytes.fill(0)
      return kept(request)
    })
    const state = new Uint8Array([1, 2, 3])
    const call = callOf({ state })
    unbox(await runtime.checkpoint(call))
    expect(preserved[0]?.bytes).not.toBe(state)
    expect([...state]).toEqual([1, 2, 3])
  })
})

describe('the resume input of the runtime author execution', () => {
  const at = evidence('kept/c1/start/checkpoint')
  // The ResponseRecord names the suspended segment's start, under which the state was kept.
  const response = { operation: 'accept', start: { operation: operationId('c1/start') } } as never
  const mine = { phase: 'responding', intent: { resume: at }, response }
  const waitsOf =
    (...waits: unknown[]): Recovery =>
    async () =>
      succeed({ waits } as never)
  const resumeCall = (checkpoint = at) =>
    ({
      ...authorAccess,
      call: callId('c1'),
      start: { kind: 'resume', checkpoint },
      request: {},
    }) as never
  /** A custody read that keeps `bytes` under `c1/start/checkpoint` with the evidence `custody`. */
  const keeps =
    (bytes = new Uint8Array([1, 2, 3]), custody = at): ReadOutput =>
    async input =>
      succeed(
        input.call === callId('c1') && input.operation === operationId('c1/start/checkpoint')
          ? { codec, bytes, custody }
          : null,
      )

  it('reads the state that an earlier process kept, from custody alone', async () => {
    // One process suspends and keeps the state; another, which never held it, resumes.
    const durable = new Map<string, Uint8Array>()
    const before = setup(request => {
      durable.set(request.operation, request.bytes.slice())
      return kept(request)
    })
    unbox(await before.runtime.checkpoint(callOf({ state: new Uint8Array([4, 5, 6]) })))
    before.runtime.close()
    const after = setup(kept, {
      recovery: waitsOf(mine),
      readOutput: async input => {
        const bytes = durable.get(input.operation)
        return succeed(bytes === undefined ? null : { codec, bytes, custody: at })
      },
    })
    expect(unbox(await after.runtime.resumption(resumeCall()))).toEqual({
      checkpoint: new Uint8Array([4, 5, 6]),
      response,
    })
  })

  it('hands back the response of the responding wait that resumes at this checkpoint, and no other', async () => {
    const otherResponding = {
      phase: 'responding',
      intent: { resume: evidence('kept/other') },
      response: { operation: 'other', start: { operation: operationId('c2/start') } },
    }
    const stillOpen = { phase: 'open', intent: { resume: at } }
    const { runtime } = setup(kept, {
      recovery: waitsOf(otherResponding, stillOpen, mine),
      readOutput: keeps(),
    })
    expect(unbox(await runtime.resumption(resumeCall()))).toEqual({
      checkpoint: new Uint8Array([1, 2, 3]),
      response,
    })
    for (const waits of [[otherResponding, stillOpen], []])
      expect(
        await setup(kept, { recovery: waitsOf(...waits), readOutput: keeps() }).runtime.resumption(
          resumeCall(),
        ),
      ).toEqual({ failure: { kind: 'invalid', field: 'start', reason: 'no-accepted-decision' } })
  })

  it('refuses a checkpoint that custody does not keep, or keeps under other evidence', async () => {
    for (const readOutput of [
      async () => succeed(null),
      keeps(new Uint8Array([1, 2, 3]), evidence('kept/other')),
    ] satisfies ReadOutput[])
      expect(
        await setup(kept, { recovery: waitsOf(mine), readOutput }).runtime.resumption(resumeCall()),
      ).toEqual({ failure: { kind: 'invalid', field: 'start', reason: 'checkpoint-not-kept' } })
  })

  it('answers the failure of the recovery read, and that of the custody read', async () => {
    const refused = fail({ kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' } as never)
    expect(
      await setup(kept, { recovery: async () => refused, readOutput: keeps() }).runtime.resumption(
        resumeCall(),
      ),
    ).toEqual(refused)
    expect(
      await setup(kept, {
        recovery: waitsOf(mine),
        readOutput: async () => refused,
      }).runtime.resumption(resumeCall()),
    ).toEqual(refused)
  })
})
