// The client core over the in-process transport (#1249 C12, C13): calls are written and read by
// the contract, and the three results of a transport become an answer, `unavailable` or
// `uncertain`, never a success or a failure that did not come from the peer.
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

/** A peer that answers each send with the next report of the script and keeps every request. */
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

  it('refuses a body the contract cannot write, before anything is sent', async () => {
    const { requests, client } = scripted([])
    await expect(client['read-note']({ noteId: 7 as unknown as string })).rejects.toBeInstanceOf(
      ClientRequestError,
    )
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
    ]
    for (const report of cases) {
      const { requests, client } = scripted([report])
      expect(await client['read-note']({ noteId: 'n-1' })).toEqual({ outcome: 'uncertain' })
      expect(requests).toHaveLength(1)
    }
  })
})

describe('the in-process transport', () => {
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
