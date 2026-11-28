import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { LoginResult } from '@omne-harness/access-cordis-contract'
import { send, type HttpReply } from './support/entry.ts'
import {
  PROOF,
  call,
  held,
  rawHeaders,
  startAccessFixture,
  turn,
  type AccessFixture,
  type ApiOptions,
} from './support/access-kit.ts'

let fixture: AccessFixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

describe('the new address keeps the proof, the tenant text and the body out of every output', () => {
  it('searches the answer of every error point of the pipeline and every diagnostic', async () => {
    const tenantText = 'TENANT-HEADER-9b2c'
    const bodyMarker = 'BODY-MARKER-5d1e'
    const entry = await startAccessFixture({ config: { maxInFlightRequests: 1 } })
    fixture = entry
    const replies: HttpReply[] = []
    const ask = async (name: string, options: ApiOptions = {}): Promise<HttpReply> => {
      const reply = await call(entry.port, name, {
        ...options,
        headers: { 'omne-acting-tenant': tenantText, ...options.headers },
      })
      replies.push(reply)
      return reply
    }
    const note = `{"noteId":"${bodyMarker}"}`
    const both = `{"noteId":"${bodyMarker}","title":"${bodyMarker}"}`

    replies.push(
      await send(entry.port, `/api/notes/v1/read-note?token=${PROOF}`, {
        headers: { authorization: `Bearer ${PROOF}` },
        body: note,
      }),
    )
    await ask('read-note', { method: 'PUT', body: note })
    await ask('read-note', { headers: { host: 'evil.example' }, body: note })
    await ask('read-note', { headers: { 'content-type': 'text/plain' }, body: note })
    replies.push(
      await send(entry.port, '/api/other/v1/read-note', {
        headers: { authorization: `Bearer ${PROOF}`, 'omne-acting-tenant': tenantText },
        body: note,
      }),
    )
    entry.notes.sources['watch-note'] = async () => {
      throw new Error(`frame source fault ${PROOF} ${bodyMarker}`)
    }
    await ask('watch-note', { body: note })
    delete entry.notes.sources['watch-note']
    await ask('read-note', { headers: { 'omne-message-id': undefined }, body: note })
    await ask('save-note', { headers: { authorization: `Bearer ${PROOF}-revoked` }, body: both })
    entry.accessIdentity.identifyLogin = {
      kind: 'answer',
      value: { outcome: 'basis-unavailable' },
    }
    await ask('read-note', { body: note })
    entry.accessIdentity.identifyLogin = { kind: 'throw' }
    await ask('read-note', { body: note })
    delete entry.accessIdentity.identifyLogin
    entry.accessIdentity.actFor = { kind: 'reject' }
    await ask('save-note', { body: both })
    delete entry.accessIdentity.actFor
    await ask('read-note', { body: `{"noteId":"${bodyMarker}${'x'.repeat(3000)}"}` })
    await ask('read-note', { body: `{"noteId":"${bodyMarker}","extra":"${bodyMarker}"}` })
    entry.accessIdentity.reportAccess = { kind: 'reject' }
    await ask('save-note', { body: both })
    await entry.accessIdentity.returned('reportAccess')
    const answer = held<{ outcome: 'succeeded'; body: { noteId: string; title: string } }>()
    entry.notes.scripts['read-note'] = () => answer.promise
    const holding = ask('read-note', { body: note })
    await entry.notes.called()
    await ask('read-note', { body: note })
    answer.resolve({ outcome: 'succeeded', body: { noteId: 'n', title: 't' } })
    await holding
    entry.notes.scripts['read-note'] = async () => {
      throw new Error(`handler fault ${PROOF} ${bodyMarker}`)
    }
    await ask('read-note', { body: note })
    entry.notes.scripts['read-note'] = async () => ({ outcome: 'basis-unavailable', body: {} })
    await ask('read-note', { body: note })
    delete entry.notes.scripts['read-note']
    const identified = entry.accessIdentity.calls.filter(
      line => line.method === 'identifyLogin',
    ).length
    const recognised = held<LoginResult>()
    entry.accessIdentity.identifyLogin = { kind: 'hold', held: recognised }
    const socket = connect({ host: '127.0.0.1', port: entry.port }, () => {
      socket.write(
        ['POST /api/notes/v1/read-note HTTP/1.1', ...rawHeaders(note.length), '', note].join(
          '\r\n',
        ),
      )
    })
    socket.on('error', () => {})
    await entry.accessIdentity.called('identifyLogin', identified + 1)
    socket.destroy()
    while (!entry.diagnostics.some(event => event.code === 'access.caller-gone')) await turn()
    recognised.resolve({ outcome: 'denied' })
    entry.accessIdentity.identifyLogin = { kind: 'hold', held: held<LoginResult>() }
    const aborted = ask('read-note', { body: note })
    await entry.accessIdentity.called('identifyLogin', identified + 2)
    await entry.takeDown()
    await aborted

    const texts = replies.map(
      reply => `${reply.status} ${JSON.stringify(reply.headers)} ${reply.text}`,
    )
    const haystack = [...texts, JSON.stringify(entry.diagnostics)].join('\n')
    expect(haystack).not.toContain(PROOF)
    expect(haystack).not.toContain(tenantText)
    // The body comes back only to the caller who sent it, inside the reason of its own rejection.
    const echoed = replies.filter(reply => reply.text.includes(bodyMarker))
    expect(echoed.map(reply => JSON.parse(reply.text) as unknown)).toEqual([
      {
        outcome: 'protocol-rejected',
        body: {
          rejection: {
            at: ['extra'],
            given: `"${bodyMarker}"`,
            allows: 'no field "extra" here: an object with the fields noteId',
          },
        },
      },
    ])
    expect(
      [
        ...replies.map(reply => JSON.stringify(reply.headers)),
        JSON.stringify(entry.diagnostics),
      ].join('\n'),
    ).not.toContain(bodyMarker)

    const pipelineEvents = entry.diagnostics.filter(event => event.code.startsWith('access.'))
    expect(new Set(pipelineEvents.map(event => event.code))).toEqual(
      new Set([
        'access.path-rejected',
        'access.method-rejected',
        'access.host-rejected',
        'access.content-type-rejected',
        'access.not-mounted',
        'access.frame-source-fault',
        'access.message-id-rejected',
        'access.identity-denied',
        'access.identity-unavailable',
        'access.identity-fault',
        'access.body-over-limit',
        'access.body-rejected',
        'access.report-fault',
        'access.busy',
        'access.caller-gone',
        'access.aborted',
        'access.basis-unavailable',
        'access.request-fault',
      ]),
    )
    const allowed = new Set(['code', 'path', 'protocol', 'major', 'operation'])
    for (const event of pipelineEvents)
      expect(Object.keys(event).filter(key => !allowed.has(key))).toEqual([])
    for (const event of entry.diagnostics) expect(event.path ?? '').not.toContain('?')
    expect(entry.diagnostics).toContainEqual({
      code: 'access.request-fault',
      path: '/api/notes/v1/read-note',
      protocol: 'notes',
      major: 1,
      operation: 'read-note',
    })
  })
})
