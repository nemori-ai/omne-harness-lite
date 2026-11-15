import { request, type ClientRequest } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createServerEntry, type AccessDiagnostic } from '../src/index.ts'
import { baseConfig, send, startEntry, type Entry } from './support/entry.ts'
import {
  MESSAGE_ID,
  PROOF,
  TENANT,
  accessSide,
  call,
  held,
  startAccessFixture,
  type AccessFixture,
} from './support/access-kit.ts'

let fixture: Entry | AccessFixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

const READ_NOTE = {
  path: '/api/notes/v1/read-note',
  protocol: 'notes',
  major: 1,
  operation: 'read-note',
}

describe('listening', () => {
  it('binds 127.0.0.1 only and refuses another address at start', async () => {
    fixture = await startEntry()
    expect(fixture.port).toBeGreaterThan(0)
    for (const listenAddress of ['0.0.0.0', '::']) {
      const other = createServerEntry({ config: baseConfig({ listenAddress }) })
      await expect(other.start()).rejects.toThrow(/127\.0\.0\.1/)
    }
  })

  it('reports the bound loopback address', async () => {
    fixture = await startEntry()
    const listening = await fixture.entry.start()
    expect(listening.address).toBe('127.0.0.1')
    expect(listening.port).toBe(fixture.port)
  })
})

describe('stop', () => {
  it('stops accepting new connections', async () => {
    const entry = await startEntry()
    await entry.stop()
    await expect(send(entry.port, '/api/notes/v1/read-note', { body: '{}' })).rejects.toThrow()
  })
})

describe('bounded request admission', () => {
  it('releases a disconnected request slot without cancelling its pending work', async () => {
    const entry = await startAccessFixture({ config: { maxInFlightRequests: 1 } })
    fixture = entry
    const answer = held<{ outcome: 'succeeded'; body: { noteId: string; title: string } }>()
    entry.notes.scripts['read-note'] = () => answer.promise
    const body = '{"noteId":"n-1"}'
    const client: ClientRequest = request({
      hostname: '127.0.0.1',
      port: entry.port,
      path: '/api/notes/v1/read-note',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        authorization: `Bearer ${PROOF}`,
        'omne-acting-tenant': TENANT,
        'omne-message-id': MESSAGE_ID,
      },
    })
    client.on('error', () => {})
    client.end(body)
    await entry.notes.called()
    expect((await call(entry.port, 'ping')).status).toBe(429)
    client.destroy()
    await expect.poll(async () => (await call(entry.port, 'ping')).status).toBe(200)
    expect(entry.notes.calls[0]?.call.signal.aborted).toBe(false)
    answer.resolve({ outcome: 'succeeded', body: { noteId: 'n-1', title: 't' } })
  })
})

describe('the pipeline diagnostics of a call', () => {
  it('leaves access.basis-unavailable when the handler answers basis-unavailable', async () => {
    const entry = await startAccessFixture()
    fixture = entry
    entry.notes.scripts['read-note'] = async () => ({ outcome: 'basis-unavailable', body: {} })
    const reply = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expect(reply.status).toBe(503)
    expect(entry.diagnostics).toEqual([{ code: 'access.basis-unavailable', ...READ_NOTE }])
  })

  it('leaves no diagnostic when the handler answers another outcome', async () => {
    const entry = await startAccessFixture()
    fixture = entry
    expect((await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })).status).toBe(200)
    entry.notes.scripts['read-note'] = async () => ({ outcome: 'not-found', body: {} })
    expect((await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })).status).toBe(404)
    expect(entry.diagnostics).toEqual([])
  })

  it('leaves access.request-fault when the handler throws, and answers by the effect', async () => {
    const entry = await startAccessFixture()
    fixture = entry
    entry.notes.scripts['read-note'] = async () => {
      throw new Error(`handler fault ${PROOF}`)
    }
    const reply = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expect(reply.text).toBe('{"outcome":"basis-unavailable","body":{}}')
    expect(entry.diagnostics).toEqual([{ code: 'access.request-fault', ...READ_NOTE }])
  })

  it('leaves access.request-fault and writes an empty 500 when a step of the pipeline throws', async () => {
    const diagnostics: AccessDiagnostic[] = []
    const side = accessSide({}, event => diagnostics.push(event))
    const entry = await startEntry({
      access: {
        ...side.access,
        registry: {
          ...side.access.registry,
          enter: () => {
            throw new Error(`registry fault ${PROOF}`)
          },
        },
      },
    })
    fixture = entry
    const reply = await call(entry.port, 'read-note', { body: '{"noteId":"n-1"}' })
    expect(reply.status).toBe(500)
    expect(reply.body.byteLength).toBe(0)
    expect(reply.headers.connection).toBe('close')
    expect(diagnostics).toEqual([{ code: 'access.request-fault', ...READ_NOTE }])
  })
})
