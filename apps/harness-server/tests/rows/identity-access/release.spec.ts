import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { onReleaseTree, type ReleaseTree } from '../../support/release-tree.ts'
import { until } from '../../support/listening.ts'

type Answer = Readonly<{
  status: number
  body: { outcome: string; body?: Record<string, unknown> }
}>

let messages = 0

function callIdentity(
  tree: ReleaseTree,
  name: string,
  body: unknown,
  proof?: string,
  revision?: number,
): Promise<Answer> {
  const text = JSON.stringify(body)
  messages += 1
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path: `/api/identity/v1/${name}`,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': `m-identity-${messages}`,
          ...(proof === undefined ? {} : { authorization: `Bearer ${proof}` }),
          ...(revision === undefined ? {} : { 'omne-contract-revision': String(revision) }),
        },
      },
      res => {
        let received = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          received += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(received) as Answer['body'] }),
        )
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

type Frame = Readonly<{ kind: string; protocols?: readonly { name: string; major: number }[] }>

function openAvailability(port: number) {
  const frames: Frame[] = []
  let buffered = ''
  const body = '{}'
  const req = request({
    host: '127.0.0.1',
    port,
    method: 'POST',
    path: '/api/access/v1/availability',
    headers: {
      host: `127.0.0.1:${port}`,
      'content-type': 'application/json',
      'content-length': String(body.length),
      'omne-message-id': 'm-availability',
    },
  })
  req.on('response', res => {
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => {
      buffered += chunk
      for (let end = buffered.indexOf('\n\n'); end !== -1; end = buffered.indexOf('\n\n')) {
        const block = buffered.slice(0, end)
        buffered = buffered.slice(end + 2)
        if (!block.startsWith('data: ')) continue
        const event = JSON.parse(block.slice('data: '.length)) as { kind: string; frame?: Frame }
        if (event.kind === 'frame' && event.frame !== undefined) frames.push(event.frame)
      }
    })
    res.on('error', () => {})
  })
  req.on('error', () => {})
  req.end(body)
  return { frames, close: () => req.destroy() }
}

const credentials = { loginIdentifier: 'vertical-alice', credential: 'vertical-secret-1' }

describe('identity-access row: identity/v1 on the release tree', () => {
  it(
    'registers, signs in and reads the current tenant at the new address',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: () => ({ status: 500, contentType: 'text/plain', body: 'no model call' }) },
        async tree => {
          const availability = openAvailability(tree.port)
          try {
            await until(() => availability.frames.length >= 1, 'the snapshot', 10_000)
            expect(availability.frames[0]?.protocols).toContainEqual({ name: 'identity', major: 1 })

            const registered = await callIdentity(tree, 'register-and-activate', credentials)
            expect(registered.status).toBe(200)
            expect(registered.body.outcome).toBe('succeeded')
            const tenantId = registered.body.body?.['tenantId']

            const login = await callIdentity(tree, 'issue-login', credentials)
            expect(login.body.outcome).toBe('succeeded')
            const proof = login.body.body?.['loginProof']
            expect(typeof proof).toBe('string')
            expect(typeof login.body.body?.['loginId']).toBe('string')

            const current = await callIdentity(tree, 'query-current-tenant', {}, proof as string)
            expect(current.body).toEqual({ outcome: 'succeeded', body: { tenantId } })

            const anonymous = await callIdentity(tree, 'query-current-tenant', {})
            expect(anonymous.body.outcome).toBe('denied')
          } finally {
            availability.close()
          }
        },
      )
      expect(exitCode).toBe(0)
    },
  )

  it(
    'keeps an account preference: another login reads it; of two writes from one revision the later is refused',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: () => ({ status: 500, contentType: 'text/plain', body: 'no model call' }) },
        async tree => {
          const owner = { loginIdentifier: 'pref-alice', credential: 'pref-secret-1' }
          expect((await callIdentity(tree, 'register-and-activate', owner)).body.outcome).toBe(
            'succeeded',
          )
          const proofOf = async () =>
            (await callIdentity(tree, 'issue-login', owner)).body.body?.['loginProof'] as string
          const [first, second] = [await proofOf(), await proofOf()]
          const read = (proof?: string) =>
            callIdentity(tree, 'read-account-preference', { name: 'keys.mac' }, proof, 2)
          const write = (proof: string, value: string, expected: string) =>
            callIdentity(
              tree,
              'write-account-preference',
              { name: 'keys.mac', value, expected },
              proof,
              2,
            )
          expect((await read(first)).body).toEqual({
            outcome: 'succeeded',
            body: { value: null, revision: '0' },
          })
          expect((await write(first, '{"a":1}', '0')).body).toEqual({
            outcome: 'succeeded',
            body: { revision: '1' },
          })
          expect((await read(second)).body).toEqual({
            outcome: 'succeeded',
            body: { value: '{"a":1}', revision: '1' },
          })
          expect((await write(second, '{"b":2}', '0')).body).toEqual({
            outcome: 'conflict',
            body: { revision: '1' },
          })
          expect((await read(first)).body.body?.['value']).toBe('{"a":1}')
          const stranger = { loginIdentifier: 'pref-bob', credential: 'pref-secret-2' }
          await callIdentity(tree, 'register-and-activate', stranger)
          const bob = (await callIdentity(tree, 'issue-login', stranger)).body.body?.['loginProof']
          expect((await read(bob as string)).body.body?.['value']).toBeNull()
          expect((await read()).body.outcome).toBe('denied')
          const unrevised = await callIdentity(
            tree,
            'read-account-preference',
            { name: 'keys.mac' },
            first,
          )
          expect(unrevised.body.outcome).toBe('protocol-rejected')
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
