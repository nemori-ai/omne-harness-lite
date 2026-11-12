// A call at the new address that gets through (#1233 spec C2, C4, C9, C10, C11): the answer's
// bytes and headers, the message id, what the handler receives, failures, and the report of a
// successful business access.
import { afterEach, describe, expect, it } from 'vitest'
import { send, startFixture, type Fixture, type HttpReply } from './support/harness.ts'
import {
  MESSAGE_ID,
  PROOF,
  TENANT,
  call,
  held,
  rawCall,
  rawHeaders,
  startAccessFixture,
  turn,
  type AccessFixture,
} from './support/pipeline-kit.ts'

let fixture: AccessFixture | Fixture

afterEach(async () => {
  await fixture.stop()
})

async function access(): Promise<AccessFixture> {
  const started = await startAccessFixture()
  fixture = started
  return started
}

function expectAnswer(reply: HttpReply, status: number, text: string): void {
  expect(reply.status).toBe(status)
  expect(reply.text).toBe(text)
  expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(reply.headers['cache-control']).toBe('no-store')
  expect(reply.headers['content-length']).toBe(String(reply.body.byteLength))
}

describe('C2: the new address answers', () => {
  it('a legal call gets the handler answer with the four headers', async () => {
    const entry = await access()
    const reply = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expectAnswer(reply, 200, '{"outcome":"succeeded","body":{"noteId":"n-1","title":"first note"}}')
    expect(reply.headers['omne-message-id']).toBe(MESSAGE_ID)
    expect(reply.headers.connection).not.toBe('close')
  })

  it('the status code follows the outcome table', async () => {
    const entry = await access()
    entry.notes.scripts['read-note'] = async () => ({ outcome: 'not-found', body: {} })
    const reply = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expectAnswer(reply, 404, '{"outcome":"not-found","body":{}}')
  })

  it('an entry without access answers 404 at the same address', async () => {
    fixture = await startFixture()
    const reply = await send(fixture.port, '/api/notes/v1/read-note', {
      headers: { authorization: `Bearer ${PROOF}`, 'omne-message-id': MESSAGE_ID },
      body: '{"noteId":"n-1"}',
    })
    expect(reply.status).toBe(404)
    expect(reply.text).toBe('')
  })
})

describe('C4: the message id', () => {
  const rejected = '{"outcome":"protocol-rejected","body":{}}'

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['longer than 128', 'm'.repeat(129)],
    ['with a space', 'msg 1'],
    ['with a character outside ASCII', 'msg-é'],
  ])('%s is protocol-rejected without the id', async (_case, id) => {
    const entry = await access()
    const reply = await call(entry.port, 'read-note', {
      headers: { 'omne-message-id': id },
      body: '{"noteId":"n-1"}',
    })
    expectAnswer(reply, 400, rejected)
    expect(reply.headers['omne-message-id']).toBeUndefined()
    expect(reply.headers.connection).toBe('close')
    expect(entry.accessIdentity.calls).toEqual([])
    expect(entry.log.entries).toEqual([{ name: 'read-note', left: true }])
  })

  it('a repeated header is protocol-rejected', async () => {
    const entry = await access()
    const body = '{"noteId":"n-1"}'
    const reply = await rawCall(
      entry.port,
      '/api/notes/v1/read-note',
      rawHeaders(body.length, ['Omne-Message-Id: msg-0002']),
      body,
    )
    expect(reply).toMatch(/^HTTP\/1\.1 400 /)
    expect(reply).not.toMatch(/omne-message-id/i)
    expect(reply.endsWith(rejected)).toBe(true)
  })

  it('128 visible ASCII characters are accepted and echoed', async () => {
    const entry = await access()
    const id = '!~'.repeat(64)
    const reply = await call(entry.port, 'read-note', {
      headers: { 'omne-message-id': id },
      body: '{"noteId":"n-1"}',
    })
    expect(reply.status).toBe(200)
    expect(reply.headers['omne-message-id']).toBe(id)
  })

  it('every answer after step 7 echoes the id', async () => {
    const entry = await access()
    const denied = await call(entry.port, 'read-note', {
      headers: { authorization: 'Bearer unknown-proof' },
      body: '{"noteId":"n-1"}',
    })
    const malformed = await call(entry.port, 'read-note', { body: '{' })
    entry.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'basis-unavailable' } }
    const unavailable = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expectAnswer(denied, 403, '{"outcome":"denied","body":{}}')
    expectAnswer(malformed, 400, '{"outcome":"protocol-rejected","body":{}}')
    expectAnswer(unavailable, 503, '{"outcome":"basis-unavailable","body":{}}')
    for (const reply of [denied, malformed, unavailable])
      expect(reply.headers['omne-message-id']).toBe(MESSAGE_ID)
  })
})

describe('C9: what the handler receives', () => {
  it('the login the identity port gave, the same object', async () => {
    const entry = await access()
    await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expect(entry.notes.calls[0]?.call.principal).toBe(entry.accessIdentity.logins.get(PROOF))
    expect(entry.notes.calls[0]?.call.messageId).toBe(MESSAGE_ID)
    expect(entry.notes.calls[0]?.body).toEqual({ noteId: 'n-1' })
  })

  it('the principal actFor issued, and a body tenant the pipeline does not judge', async () => {
    const entry = await access()
    const reply = await call(entry.port, 'tag-note', {
      body: '{"noteId":"n-1","tenant":"tenant-other"}',
    })
    expect(reply.status).toBe(200)
    const login = entry.accessIdentity.logins.get(PROOF)
    if (login === undefined) throw new Error('the proof has no login')
    expect(entry.notes.calls[0]?.call.principal).toBe(
      entry.accessIdentity.principalOf(login, TENANT),
    )
    expect(entry.notes.calls[0]?.body).toEqual({ noteId: 'n-1', tenant: 'tenant-other' })
    expect(entry.accessIdentity.calls).toEqual([
      { method: 'identifyLogin', proof: PROOF },
      { method: 'actFor', login, tenant: TENANT },
    ])
  })

  it('no principal for an operation that needs no login', async () => {
    const entry = await access()
    await call(entry.port, 'ping')
    expect(entry.notes.calls[0]?.call.principal).toBeUndefined()
  })
})

describe('C10: failures and refusals', () => {
  it('a handler that throws answers basis-unavailable for a read and unknown for a commit', async () => {
    const entry = await access()
    entry.notes.scripts['read-note'] = async () => {
      throw new Error('read fault')
    }
    entry.notes.scripts['save-note'] = async () => {
      throw new Error('commit fault')
    }
    const read = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    const commit = await call(entry.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    expectAnswer(read, 503, '{"outcome":"basis-unavailable","body":{}}')
    expectAnswer(commit, 500, '{"outcome":"unknown","body":{}}')
    expect(entry.log.entries.every(line => line.left)).toBe(true)
  })

  it('a denied from an invalid login and a denied from the handler are the same bytes', async () => {
    const entry = await access()
    const fromIdentity = await call(entry.port, 'read-note', {
      headers: { authorization: 'Bearer unknown-proof' },
      body: '{"noteId":"n-1"}',
    })
    entry.notes.scripts['read-note'] = async () => ({ outcome: 'denied' })
    const fromHandler = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expect(fromHandler.status).toBe(fromIdentity.status)
    expect(Buffer.from(fromHandler.body).equals(Buffer.from(fromIdentity.body))).toBe(true)
    expect({ ...fromHandler.headers, date: undefined }).toEqual({
      ...fromIdentity.headers,
      date: undefined,
    })
    expect(fromIdentity.headers.connection).toBe('close')
  })
})

describe('C11: the report of a successful business access', () => {
  it('reports once after a success of an operation that counts', async () => {
    const entry = await access()
    const reply = await call(entry.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    expect(reply.status).toBe(200)
    await entry.accessIdentity.called('reportAccess')
    await turn()
    expect(entry.accessIdentity.calls.filter(line => line.method === 'reportAccess')).toEqual([
      { method: 'reportAccess', login: entry.accessIdentity.logins.get(PROOF) },
    ])
  })

  it('a report that never settles does not hold the answer', async () => {
    const entry = await access()
    entry.accessIdentity.reportAccess = { kind: 'hold', held: held<void>() }
    const reply = await call(entry.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    expect(reply.status).toBe(200)
  })

  it.each([
    ['an operation that does not count', 'read-note', '{"noteId":"n-1"}', undefined],
    ['an answer that is not succeeded', 'save-note', '{"noteId":"n-1","title":"t"}', 'conflict'],
    ['an operation with no login that counts', 'ping', '{}', undefined],
  ] as const)('%s is not reported', async (_case, name, body, outcome) => {
    const entry = await access()
    if (outcome !== undefined)
      entry.notes.scripts['save-note'] = async () => ({ outcome, body: {} })
    await call(entry.port, name, { body })
    await turn()
    expect(entry.accessIdentity.calls.filter(line => line.method === 'reportAccess')).toEqual([])
  })

  it.each(['throw', 'reject'] as const)(
    'a report that fails by %s changes no answer and leaves one diagnostic',
    async kind => {
      const entry = await access()
      entry.accessIdentity.reportAccess = { kind }
      const reply = await call(entry.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
      expectAnswer(reply, 200, '{"outcome":"succeeded","body":{}}')
      await entry.accessIdentity.returned('reportAccess')
      await turn()
      expect(entry.diagnostics.filter(event => event.code === 'access.report-fault')).toEqual([
        {
          code: 'access.report-fault',
          path: '/api/notes/v1/save-note',
          protocol: 'notes',
          major: 1,
          operation: 'save-note',
        },
      ])
    },
  )
})
