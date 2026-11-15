import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpReply } from './support/entry.ts'
import {
  MESSAGE_ID,
  OTHER_PROOF,
  PROOF,
  call,
  rawCall,
  startAccessFixture,
  turn,
  type AccessFixture,
} from './support/access-kit.ts'

const DENIED = '{"outcome":"denied","body":{}}'
const UNAVAILABLE = '{"outcome":"basis-unavailable","body":{}}'

let fixture: AccessFixture

beforeEach(async () => {
  fixture = await startAccessFixture()
})

afterEach(async () => {
  await fixture.stop()
})

function expectDenied(reply: HttpReply): void {
  expect(reply.status).toBe(403)
  expect(reply.text).toBe(DENIED)
  expect(reply.headers.connection).toBe('close')
  expect(reply.headers['omne-message-id']).toBe(MESSAGE_ID)
}

function expectUnavailable(reply: HttpReply): void {
  expect(reply.status).toBe(503)
  expect(reply.text).toBe(UNAVAILABLE)
  expect(reply.headers.connection).toBe('close')
}

const methods = () => fixture.accessIdentity.calls.map(line => line.method)

describe('identity none', () => {
  it('reads neither identity header and does not call the port, even with a bad proof', async () => {
    const reply = await call(fixture.port, 'ping', {
      headers: { authorization: 'Basic broken', 'omne-acting-tenant': '' },
    })
    expect(reply.status).toBe(200)
    expect(fixture.accessIdentity.calls).toEqual([])
  })
})

describe('login and acting-tenant: the Authorization header', () => {
  it.each([
    ['missing', undefined],
    ['not Bearer', 'Basic cHJvb2Y='],
    ['a scheme that only ends in Bearer', `xBearer ${PROOF}`],
    ['an empty proof', 'Bearer '],
    ['a proof with a space', 'Bearer abc def'],
    ['no space after Bearer', `Bearer${PROOF}`],
  ])('%s is denied without calling the port', async (_case, value) => {
    for (const name of ['read-note', 'save-note']) {
      const reply = await call(fixture.port, name, {
        headers: { authorization: value },
        body: '{"noteId":"n-1","title":"t"}'.replace(
          name === 'read-note' ? ',"title":"t"' : '',
          '',
        ),
      })
      expectDenied(reply)
    }
    expect(fixture.accessIdentity.calls).toEqual([])
    expect(fixture.notes.calls).toEqual([])
  })

  it('a repeated header is denied without calling the port', async () => {
    const body = '{"noteId":"n-1"}'
    const reply = await rawCall(
      fixture.port,
      '/api/notes/v1/read-note',
      [
        'Host: 127.0.0.1',
        'Content-Type: application/json',
        `Authorization: Bearer ${PROOF}`,
        `Authorization: Bearer ${PROOF}`,
        `Omne-Message-Id: ${MESSAGE_ID}`,
        `Content-Length: ${body.length}`,
      ],
      body,
    )
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(reply.endsWith(DENIED)).toBe(true)
    expect(fixture.accessIdentity.calls).toEqual([])
  })

  it('the scheme is matched without regard to case', async () => {
    const reply = await call(fixture.port, 'read-note', {
      headers: { authorization: `bEaReR ${PROOF}` },
      body: '{"noteId":"n-1"}',
    })
    expect(reply.status).toBe(200)
    expect(fixture.accessIdentity.calls).toEqual([
      { method: 'identifyLogin', proof: PROOF },
      { method: 'identifyLogin', proof: PROOF },
    ])
  })
})

describe('login and acting-tenant: identifyLogin', () => {
  it('denied is denied', async () => {
    expectDenied(
      await call(fixture.port, 'read-note', {
        headers: { authorization: 'Bearer unknown-proof' },
        body: '{"noteId":"n-1"}',
      }),
    )
    expect(fixture.accessIdentity.calls).toEqual([
      { method: 'identifyLogin', proof: 'unknown-proof' },
    ])
  })

  it.each([
    ['answers basis-unavailable', { kind: 'answer', value: { outcome: 'basis-unavailable' } }],
    ['throws', { kind: 'throw' }],
    ['rejects', { kind: 'reject' }],
  ] as const)('%s is basis-unavailable', async (_case, behaviour) => {
    fixture.accessIdentity.identifyLogin = behaviour
    expectUnavailable(await call(fixture.port, 'read-note', { body: '{"noteId":"n-1"}' }))
    expect(fixture.notes.calls).toEqual([])
    expect(fixture.diagnostics.map(event => event.code)).toEqual([
      behaviour.kind === 'answer' ? 'access.identity-unavailable' : 'access.identity-fault',
    ])
  })

  it('identifies again on every call: no result is cached', async () => {
    const body = '{"noteId":"n-1","title":"t"}'
    await call(fixture.port, 'save-note', { body })
    await call(fixture.port, 'save-note', { body })
    expect(methods().filter(method => method === 'identifyLogin')).toEqual([
      'identifyLogin',
      'identifyLogin',
    ])
  })
})

describe('login: the acting tenant is not read', () => {
  it('a login operation without the tenant header gets through, and actFor is not called', async () => {
    const reply = await call(fixture.port, 'read-note', {
      headers: { 'omne-acting-tenant': undefined },
      body: '{"noteId":"n-1"}',
    })
    expect(reply.status).toBe(200)
    expect(methods()).toEqual(['identifyLogin', 'identifyLogin'])
  })
})

describe('acting-tenant: the Omne-Acting-Tenant header', () => {
  const body = '{"noteId":"n-1","title":"t"}'

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('%s is denied after the login, and actFor is not called', async (_case, value) => {
    expectDenied(
      await call(fixture.port, 'save-note', { headers: { 'omne-acting-tenant': value }, body }),
    )
    expect(methods()).toEqual(['identifyLogin'])
  })

  it('a repeated header is denied, and actFor is not called', async () => {
    const reply = await rawCall(
      fixture.port,
      '/api/notes/v1/save-note',
      [
        'Host: 127.0.0.1',
        'Content-Type: application/json',
        `Authorization: Bearer ${PROOF}`,
        'Omne-Acting-Tenant: tenant-a',
        'Omne-Acting-Tenant: tenant-b',
        `Omne-Message-Id: ${MESSAGE_ID}`,
        `Content-Length: ${body.length}`,
      ],
      body,
    )
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(methods()).toEqual(['identifyLogin'])
  })

  it('actFor denied is denied', async () => {
    fixture.accessIdentity.actFor = { kind: 'answer', value: { outcome: 'denied' } }
    expectDenied(await call(fixture.port, 'save-note', { body }))
    expect(fixture.notes.calls).toEqual([])
  })

  it.each([
    ['answers basis-unavailable', { kind: 'answer', value: { outcome: 'basis-unavailable' } }],
    ['throws', { kind: 'throw' }],
    ['rejects', { kind: 'reject' }],
  ] as const)('actFor %s is basis-unavailable', async (_case, behaviour) => {
    fixture.accessIdentity.actFor = behaviour
    expectUnavailable(await call(fixture.port, 'save-note', { body }))
    expect(fixture.notes.calls).toEqual([])
    expect(fixture.diagnostics.map(event => event.code)).toEqual([
      behaviour.kind === 'answer' ? 'access.identity-unavailable' : 'access.identity-fault',
    ])
  })

  it('the header text goes to actFor as given', async () => {
    await call(fixture.port, 'save-note', {
      headers: { 'omne-acting-tenant': 'Not A Tenant!' },
      body,
    })
    expect(fixture.accessIdentity.calls[1]).toMatchObject({
      method: 'actFor',
      tenant: 'Not A Tenant!',
    })
  })
})

describe('a call with no login is answered before its body is read', () => {
  it('declares 10 MB, sends no byte, and still gets denied with the connection closed', async () => {
    const reply = await rawCall(fixture.port, '/api/notes/v1/read-note', [
      'Host: 127.0.0.1',
      'Content-Type: application/json',
      `Omne-Message-Id: ${MESSAGE_ID}`,
      `Content-Length: ${10 * 1024 * 1024}`,
    ])
    expect(reply).toMatch(/^HTTP\/1\.1 403 /)
    expect(reply).toMatch(/\r\nconnection: close\r\n/i)
    expect(reply.endsWith(DENIED)).toBe(true)
  })
})

describe('a read checks the login again before its answer is written', () => {
  const noteBody = '{"noteId":"n-1"}'
  const secret = 'title read before the login ended'
  const readThen = (change: () => void) => async (_call: unknown, body: { noteId: string }) => {
    change()
    return { outcome: 'succeeded', body: { noteId: body.noteId, title: secret } }
  }
  const reports = () => methods().filter(method => method === 'reportAccess')

  it('a login revoked while the handler runs is denied, with none of what was read', async () => {
    fixture.notes.scripts['read-note'] = readThen(() => {
      fixture.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'denied' } }
    })
    const reply = await call(fixture.port, 'read-note', { body: noteBody })
    expect([reply.status, reply.text]).toEqual([403, DENIED])
    expect(reply.headers['omne-message-id']).toBe(MESSAGE_ID)
    expect(methods()).toEqual(['identifyLogin', 'identifyLogin'])
    expect(fixture.diagnostics).toEqual([
      {
        code: 'access.login-revoked-before-answer',
        path: '/api/notes/v1/read-note',
        protocol: 'notes',
        major: 1,
        operation: 'read-note',
      },
    ])
  })

  it('the same proof now naming another account is denied', async () => {
    const bob = fixture.accessIdentity.logins.get(OTHER_PROOF)!
    fixture.notes.scripts['open-note'] = readThen(() => {
      fixture.accessIdentity.identifyLogin = {
        kind: 'answer',
        value: { outcome: 'identified', login: bob },
      }
    })
    const reply = await call(fixture.port, 'open-note', { body: noteBody })
    expect([reply.status, reply.text]).toEqual([403, DENIED])
  })

  it.each([
    ['answers basis-unavailable', { kind: 'answer', value: { outcome: 'basis-unavailable' } }],
    ['throws', { kind: 'throw' }],
    ['rejects', { kind: 'reject' }],
  ] as const)('a second identifyLogin that %s is basis-unavailable', async (_case, behaviour) => {
    fixture.notes.scripts['read-note'] = readThen(() => {
      fixture.accessIdentity.identifyLogin = behaviour
    })
    const reply = await call(fixture.port, 'read-note', { body: noteBody })
    expect([reply.status, reply.text]).toEqual([503, UNAVAILABLE])
    expect(fixture.diagnostics.map(event => event.code)).toEqual([
      behaviour.kind === 'answer' ? 'access.identity-unavailable' : 'access.identity-fault',
    ])
  })

  it('a commit is not checked again: the port is asked once and the answer stands', async () => {
    fixture.notes.scripts['save-note'] = async () => {
      fixture.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'denied' } }
      return { outcome: 'succeeded', body: {} }
    }
    const reply = await call(fixture.port, 'save-note', { body: '{"noteId":"n-1","title":"t"}' })
    expect(reply.status).toBe(200)
    expect(methods().filter(method => method === 'identifyLogin')).toEqual(['identifyLogin'])
  })

  it('an operation that needs no login is not checked', async () => {
    const reply = await call(fixture.port, 'ping', { body: '{}' })
    expect(reply.status).toBe(200)
    await turn()
    expect(fixture.accessIdentity.calls).toEqual([])
  })

  it('a read that stands is reported once; a read turned to denied is not reported', async () => {
    const stands = await call(fixture.port, 'open-note', { body: noteBody })
    expect(stands.status).toBe(200)
    await fixture.accessIdentity.called('reportAccess')
    await turn()
    expect(reports()).toEqual(['reportAccess'])

    fixture.notes.scripts['open-note'] = readThen(() => {
      fixture.accessIdentity.identifyLogin = { kind: 'answer', value: { outcome: 'denied' } }
    })
    const turned = await call(fixture.port, 'open-note', { body: noteBody })
    expect(turned.status).toBe(403)
    await turn()
    expect(reports()).toEqual(['reportAccess'])
  })
})
