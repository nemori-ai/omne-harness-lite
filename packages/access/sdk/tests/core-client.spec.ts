import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  ClientRequestError,
  createClient,
  createInProcessTransport,
  type CallReport,
  type CallRequest,
  type ObserveEnd,
  type Transport,
} from '@omne-harness/sdk/core'
import { notesProtocol } from './support/notes-protocol.ts'

const object = (entries: Record<string, string>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({
    key,
    value: { kind: 'string', value },
  })),
})

function scripted(reports: CallReport[]) {
  const requests: CallRequest[] = []
  const peer: Transport = {
    async call(request) {
      requests.push(request)
      const report = reports.shift()
      if (report === undefined) throw new Error('the script has no more reports')
      return report
    },
    // eslint-disable-next-line require-yield
    async *observe(): AsyncGenerator<JsonValue, ObserveEnd> {
      return { kind: 'uncertain' }
    },
  }
  return { requests, client: createClient(notesProtocol, createInProcessTransport(peer)) }
}

const NOTE = object({ noteId: 'n-1', title: 'first' })

describe('C12: a client from one protocol contract', () => {
  it('writes the body by the contract and reads the answer by the contract', async () => {
    const { requests, client } = scripted([{ kind: 'answered', outcome: 'succeeded', body: NOTE }])
    const answer = await client['read-note']({ noteId: 'n-1' }, { messageId: 'm-1' })
    expect(answer).toEqual({ outcome: 'succeeded', body: { noteId: 'n-1', title: 'first' } })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.protocol).toEqual({ name: 'notes', major: 1 })
    expect(requests[0]!.operation).toBe('read-note')
    expect(requests[0]!.messageId).toBe('m-1')
    expect(writeJsonText(requests[0]!.body)).toBe('{"noteId":"n-1"}')
    expect(Object.hasOwn(requests[0]!, 'signal')).toBe(false)
  })

  it('reads an outcome the pipeline adds, and gives a fresh message id when none is given', async () => {
    const { requests, client } = scripted([
      { kind: 'answered', outcome: 'denied', body: object({}) },
      { kind: 'answered', outcome: 'denied', body: object({}) },
    ])
    expect(await client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'denied' })
    await client['read-note']({ noteId: 'n-1' })
    expect(requests[0]!.messageId).not.toBe(requests[1]!.messageId)
    expect(requests[0]!.messageId).toMatch(/^[\x21-\x7e]{1,128}$/)
  })

  it('refuses a contract with an operation named observe: the observations would hide it', () => {
    const [name, operation] = Object.entries(notesProtocol.operations)[0]!
    const clashing = {
      ...notesProtocol,
      operations: { ...notesProtocol.operations, observe: operation },
    }
    expect(name).not.toBe('observe')
    expect(() => createClient(clashing, scripted([]).requests as never)).toThrow(
      'notes/v1/observe: an operation cannot take the name of the observations',
    )
  })

  it('refuses a body the contract cannot write, before anything is sent', async () => {
    const { requests, client } = scripted([])
    const refusal = await client['read-note']({ noteId: 7 as unknown as string }).catch(
      (error: unknown) => error,
    )
    expect(refusal).toBeInstanceOf(ClientRequestError)
    expect((refusal as Error).name).toBe('ClientRequestError')
    expect(requests).toEqual([])
  })
})

describe('C13: the three results of a transport', () => {
  it('sends once more when the first send did not leave, under the same message id', async () => {
    const { requests, client } = scripted([
      { kind: 'not-sent' },
      { kind: 'answered', outcome: 'succeeded', body: NOTE },
    ])
    expect(await client['read-note']({ noteId: 'n-1' })).toMatchObject({ outcome: 'succeeded' })
    expect(requests.map(request => request.messageId)).toEqual([
      requests[0]!.messageId,
      requests[0]!.messageId,
    ])
  })

  it('answers unavailable when the second send did not leave either: two sends in all', async () => {
    const { requests, client } = scripted([{ kind: 'not-sent' }, { kind: 'not-sent' }])
    expect(await client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'unavailable' })
    expect(requests).toHaveLength(2)
  })

  it('answers uncertain and does not send again when a byte may have left', async () => {
    const { requests, client } = scripted([{ kind: 'uncertain' }])
    expect(await client['save-note']({ noteId: 'n-1', title: 't' })).toEqual({
      outcome: 'uncertain',
    })
    expect(requests).toHaveLength(1)
    const again = scripted([{ kind: 'not-sent' }, { kind: 'uncertain' }])
    expect(await again.client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'uncertain' })
    expect(again.requests).toHaveLength(2)
  })

  it('answers uncertain to an answer outside the contract', async () => {
    const cases: CallReport[] = [
      { kind: 'answered', outcome: 'exploded', body: object({}) },
      { kind: 'answered', outcome: 'succeeded', body: object({ noteId: 'n-1' }) },
      { kind: 'answered', outcome: 'denied', body: object({ reason: 'x' }) },
      { kind: 'answered', outcome: 'denied', body: { kind: 'array', items: [] } },
    ]
    for (const report of cases) {
      const { requests, client } = scripted([report])
      expect(await client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'uncertain' })
      expect(requests).toHaveLength(1)
    }
  })
})

describe('the in-process transport', () => {
  it('gives the peer and the caller copies: the request, the opening and the answer', async () => {
    const body = object({ noteId: 'n-1', title: 'first' })
    const seen: { body?: JsonValue; open?: JsonValue; messageId?: string } = {}
    const peer: Transport = {
      call: async request => {
        seen.body = request.body
        return { kind: 'answered', outcome: 'succeeded', body }
      },
      // eslint-disable-next-line require-yield
      async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
        seen.open = request.open
        seen.messageId = request.messageId
        return { kind: 'ended', reason: 'note-deleted' }
      },
    }
    const transport = createInProcessTransport(peer)
    const request = object({ noteId: 'n-1' })
    const report = await transport.call({
      protocol: { name: 'notes', major: 1 },
      operation: 'read-note',
      messageId: 'm-1',
      body: request,
    })
    expect(report).toEqual({ kind: 'answered', outcome: 'succeeded', body })
    expect((report as { body: JsonValue }).body).not.toBe(body)
    expect(seen.body).toEqual(request)
    expect(seen.body).not.toBe(request)
    const open = object({ noteId: 'n-1' })
    const stream = transport.observe({
      protocol: { name: 'notes', major: 1 },
      observation: 'watch-note',
      messageId: 'o-1',
      open,
      signal: new AbortController().signal,
    })
    expect(await stream.next()).toEqual({
      done: true,
      value: { kind: 'ended', reason: 'note-deleted' },
    })
    expect([seen.open, seen.messageId]).toEqual([open, 'o-1'])
    expect(seen.open).not.toBe(open)
  })

  it('refuses a value that cannot cross as JSON text within the budgets', async () => {
    let deep: JsonValue = { kind: 'null' }
    for (let depth = 0; depth < 100; depth += 1) deep = { kind: 'array', items: [deep] }
    const transport = createInProcessTransport({
      call: async () => ({ kind: 'uncertain' }),
      // eslint-disable-next-line require-yield
      async *observe(): AsyncGenerator<JsonValue, ObserveEnd> {
        return { kind: 'uncertain' }
      },
    })
    await expect(
      transport.call({
        protocol: { name: 'notes', major: 1 },
        operation: 'read-note',
        messageId: 'm-1',
        body: deep,
      }),
    ).rejects.toThrow(new TypeError('in-process transport: a value did not cross as JSON'))
  })

  it('passes frames and the end through as copies, and closes the peer stream on return', async () => {
    let closed = false
    const frame = object({ noteId: 'n-1', title: 'first' })
    const peer: Transport = {
      call: async () => ({ kind: 'uncertain' }),
      async *observe(): AsyncGenerator<JsonValue, ObserveEnd> {
        try {
          yield frame
          yield frame
          return { kind: 'ended', reason: 'note-deleted' }
        } finally {
          closed = true
        }
      },
    }
    const notes = createClient(notesProtocol, createInProcessTransport(peer))
    const signal = new AbortController().signal
    const all = notes.observe['watch-note']({ noteId: 'n-1' }, { signal })
    expect(await all.next()).toEqual({ done: false, value: { noteId: 'n-1', title: 'first' } })
    expect(await all.next()).toMatchObject({ done: false })
    expect(await all.next()).toEqual({
      done: true,
      value: { kind: 'ended', reason: 'note-deleted' },
    })
    closed = false
    const early = notes.observe['watch-note']({ noteId: 'n-1' }, { signal })
    await early.next()
    await early.return({ kind: 'aborted' })
    expect(closed).toBe(true)
  })
})

function observing(frames: JsonValue[], end: ObserveEnd) {
  const seen: { signal?: AbortSignal; messageId: string }[] = []
  let closed = false
  const peer: Transport = {
    call: async request => {
      seen.push({
        messageId: request.messageId,
        ...(request.signal ? { signal: request.signal } : {}),
      })
      return { kind: 'answered', outcome: 'succeeded', body: object({ noteId: 'n', title: 't' }) }
    },
    async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
      seen.push({ messageId: request.messageId, signal: request.signal })
      try {
        for (const frame of frames) yield frame
        return end
      } finally {
        closed = true
      }
    },
  }
  return { seen, closed: () => closed, notes: createClient(notesProtocol, peer) }
}

async function endOf(frames: JsonValue[], end: ObserveEnd): Promise<unknown> {
  const { notes } = observing(frames, end)
  const stream = notes.observe['watch-note'](
    { noteId: 'n-1' },
    { signal: new AbortController().signal },
  )
  for (;;) {
    const next = await stream.next()
    if (next.done === true) return next.value
  }
}

describe('C14: how an observation ends', () => {
  it('passes the reasons the contract allows, and the two of the hub', async () => {
    for (const reason of ['note-deleted', 'denied', 'unavailable'])
      expect(await endOf([], { kind: 'ended', reason })).toEqual({ kind: 'ended', reason })
  })

  it('reads another reason as uncertain, and a stream that did not leave as unavailable', async () => {
    expect(await endOf([], { kind: 'ended', reason: 'note-archived' })).toEqual({
      kind: 'uncertain',
    })
    expect(await endOf([], { kind: 'not-sent' })).toEqual({ kind: 'unavailable' })
    expect(await endOf([], { kind: 'refused', outcome: 'denied' })).toEqual({
      kind: 'refused',
      outcome: 'denied',
    })
  })

  it('ends as uncertain on a frame outside the contract, and closes the stream', async () => {
    const { notes, closed } = observing([object({ noteId: 'n-1' })], { kind: 'ended', reason: 'x' })
    const stream = notes.observe['watch-note'](
      { noteId: 'n-1' },
      { signal: new AbortController().signal },
    )
    expect(await stream.next()).toEqual({ done: true, value: { kind: 'uncertain' } })
    expect(closed()).toBe(true)
  })

  it('gives the caller signal and message id to the transport, and refuses an opening outside the contract', async () => {
    const { notes, seen } = observing([], { kind: 'ended', reason: 'note-deleted' })
    const controller = new AbortController()
    await notes.observe['watch-note'](
      { noteId: 'n-1' },
      { signal: controller.signal, messageId: 'o-1' },
    ).next()
    await notes['read-note']({ noteId: 'n-1' }, { signal: controller.signal })
    expect(seen[0]).toEqual({ messageId: 'o-1', signal: controller.signal })
    expect(seen[1]!.signal).toBe(controller.signal)
    const refused = notes.observe['watch-note'](
      { noteId: 7 as unknown as string },
      { signal: controller.signal },
    )
    await expect(refused.next()).rejects.toThrow('notes/v1/watch-note')
  })
})

describe('读类调用对「现在读不到」按策略再问', () => {
  const unavailableBasis: CallReport = {
    kind: 'answered',
    outcome: 'basis-unavailable',
    body: object({}),
  }
  const succeeded: CallReport = { kind: 'answered', outcome: 'succeeded', body: NOTE }

  function retrying(
    reports: CallReport[],
    options: {
      delay?: (failures: number, elapsedMs: number) => number | null
      onWait?: (ms: number, signal: AbortSignal | undefined) => void
    } = {},
  ) {
    const requests: CallRequest[] = []
    const delays: { failures: number; elapsedMs: number }[] = []
    const waits: number[] = []
    const peer: Transport = {
      async call(request) {
        requests.push(request)
        const report = reports.shift()
        if (report === undefined) throw new Error('the script has no more reports')
        return report
      },
      // eslint-disable-next-line require-yield
      async *observe(): AsyncGenerator<JsonValue, ObserveEnd> {
        return { kind: 'uncertain' }
      },
    }
    const client = createClient(notesProtocol, createInProcessTransport(peer), {
      readRetry: {
        delayMs: (failures, elapsedMs) => {
          delays.push({ failures, elapsedMs })
          return options.delay === undefined ? 10 : options.delay(failures, elapsedMs)
        },
        wait: async (ms, signal) => {
          waits.push(ms)
          options.onWait?.(ms, signal)
        },
      },
    })
    return { requests, delays, waits, client }
  }

  it('asks again after each basis-unavailable, with a new message id each time', async () => {
    const { requests, delays, waits, client } = retrying([
      unavailableBasis,
      unavailableBasis,
      succeeded,
    ])
    expect(await client['read-note']({ noteId: 'n-1' }, { messageId: 'm-1' })).toMatchObject({
      outcome: 'succeeded',
    })
    expect(requests).toHaveLength(3)
    expect(delays.map(delay => delay.failures)).toEqual([1, 2])
    expect(waits).toEqual([10, 10])
    expect(delays[0]!.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(requests[0]!.messageId).toBe('m-1')
    expect(new Set(requests.map(request => request.messageId)).size).toBe(3)
  })

  it('counts a local unavailable as one failure and asks again', async () => {
    const { requests, delays, client } = retrying([
      { kind: 'not-sent' },
      { kind: 'not-sent' },
      succeeded,
    ])
    expect(await client['read-note']({ noteId: 'n-1' })).toMatchObject({ outcome: 'succeeded' })
    expect(requests).toHaveLength(3)
    expect(delays.map(delay => delay.failures)).toEqual([1])
  })

  it('counts an uncertain answer as one failure and asks again', async () => {
    const { requests, delays, client } = retrying([{ kind: 'uncertain' }, succeeded])
    expect(await client['read-note']({ noteId: 'n-1' })).toMatchObject({ outcome: 'succeeded' })
    expect(requests).toHaveLength(2)
    expect(delays.map(delay => delay.failures)).toEqual([1])
  })

  it('returns the answer in hand when the policy gives no delay', async () => {
    const { requests, delays, waits, client } = retrying([unavailableBasis, unavailableBasis], {
      delay: failures => (failures < 2 ? 5 : null),
    })
    expect(await client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'basis-unavailable' })
    expect(requests).toHaveLength(2)
    expect(delays).toHaveLength(2)
    expect(waits).toEqual([5])
  })

  it('does not ask again when the signal aborts during the wait', async () => {
    const controller = new AbortController()
    const { requests, client } = retrying([unavailableBasis, succeeded], {
      onWait: (_ms, signal) => {
        expect(signal).toBe(controller.signal)
        controller.abort()
      },
    })
    expect(await client['read-note']({ noteId: 'n-1' }, { signal: controller.signal })).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(requests).toHaveLength(1)
  })

  it('does not ask the policy when the signal is already aborted after the answer', async () => {
    const controller = new AbortController()
    const { requests, delays, client } = retrying([unavailableBasis, succeeded])
    controller.abort()
    expect(await client['read-note']({ noteId: 'n-1' }, { signal: controller.signal })).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(requests).toHaveLength(1)
    expect(delays).toEqual([])
  })

  it('does not return other answers to the policy', async () => {
    const { requests, delays, client } = retrying([
      { kind: 'answered', outcome: 'not-found', body: object({}) },
    ])
    expect(await client['read-note']({ noteId: 'n-1' })).toMatchObject({ outcome: 'not-found' })
    expect(requests).toHaveLength(1)
    expect(delays).toEqual([])
  })

  it('leaves a commit operation alone: one send, the policy is not asked', async () => {
    const { requests, delays, client } = retrying([unavailableBasis, succeeded])
    expect(await client['save-note']({ noteId: 'n-1', title: 't' })).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(requests).toHaveLength(1)
    expect(delays).toEqual([])
  })

  it('without a policy, a read answered basis-unavailable is sent once', async () => {
    const { requests, client } = scripted([unavailableBasis, succeeded])
    expect(await client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'basis-unavailable' })
    expect(requests).toHaveLength(1)
  })
})
