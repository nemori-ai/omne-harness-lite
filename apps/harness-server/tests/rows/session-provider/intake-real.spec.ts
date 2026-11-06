// @module-tag slow
// Real IdentitySql, SessionProvider, SQLite workers and loopback HTTP. Only adoption/context
// materials and the paid Agent execution are controlled by this fixture.
import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loginStateCodec, tenantCodec } from '@omne-harness/legal-identity'
import { evidence, operationId, sessionId, succeeded } from '@omne-harness/session-contract/testing'
import { openIntakeTree } from './intake-real-fixture.ts'
import {
  SESSION_PATH,
  GOVERNANCE_PATH,
  createSessionBody,
  login,
  post,
  sessionMessage,
  until,
  type Login,
} from '../server-entry/support.ts'

const sessionOf = (value: unknown) =>
  z.object({ body: z.object({ session: z.string() }) }).parse(value).body.session
const send = (who: Login, session: string, key: string, text = key) =>
  sessionMessage(
    'send-input',
    {
      tenant: who.tenantText,
      session,
      acceptId: key,
      inputId: key,
      message: {
        id: `msg_${key.padEnd(22, '0')}`,
        role: 'user',
        blocks: [{ kind: 'text', id: 'text', visibility: { toHuman: true, toModel: true }, text }],
      },
    },
    { loginProof: who.loginProof },
  )

async function discardResponse(port: number, body: string): Promise<void> {
  const bytes = Buffer.from(body, 'utf8')
  await new Promise<void>((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path: SESSION_PATH,
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': String(bytes.length) },
      },
      incoming => {
        // Close before consuming the receipt. Only a later query supplies the client with its outcome.
        incoming.destroy()
        resolve()
      },
    )
    outgoing.on('error', reject)
    outgoing.end(bytes)
  })
}

async function accessFor(
  app: Awaited<ReturnType<typeof openIntakeTree>>,
  who: Login,
  session: string,
) {
  const tenant = tenantCodec.parse(who.tenantText)
  const recognized = await app.identity.recognizeLogin({ loginProof: who.loginProof })
  if (!tenant.ok || recognized.kind !== 'recognized')
    throw new Error('real identity did not recognize the login')
  const loginText = loginStateCodec.encode(recognized.login)
  if (!loginText.ok) throw new Error('login is not minted')
  const actor = app.issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('system principal was not issued')
  const principal = app.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: tenant.value,
    work: { owner: 'identity-login', work: loginText.value },
  })
  if ('failure' in principal) throw new Error('tenant principal was not issued')
  return { principal: principal.ok, tenant: tenant.value, session: sessionId(session) }
}

describe('concurrent intake through real Identity, SQL and HTTP', () => {
  it('keeps both clients inputs, isolates sessions, serves control at capacity, and rejects revoked replay', async () => {
    const app = await openIntakeTree()
    try {
      expect(app.tree.allActive).toBe(true)
      const who = await login(app.port, 'intake-alice', 'C1-test-password')
      const another = await post(
        app.port,
        GOVERNANCE_PATH,
        JSON.stringify({
          protocolVersion: 'governance-public/1',
          messageId: 'second-login',
          operation: 'issue-login',
          body: { loginIdentifier: 'intake-alice', credential: 'C1-test-password' },
        }),
      )
      expect(another.status).toBe(200)
      const secondProof = z
        .object({ body: z.object({ loginProof: z.string() }) })
        .parse(another.json).body.loginProof
      const other: Login = { ...who, loginProof: secondProof }
      const firstCreated = await post(app.port, SESSION_PATH, createSessionBody(who, 'first'))
      const secondCreated = await post(app.port, SESSION_PATH, createSessionBody(who, 'second'))
      expect(firstCreated.status).toBe(200)
      expect(secondCreated.status).toBe(200)
      const first = sessionOf(firstCreated.json)
      const second = sessionOf(secondCreated.json)
      const access = await accessFor(app, who, first)
      const replies = await Promise.all([
        post(app.port, SESSION_PATH, send(who, first, 'client-a')),
        post(app.port, SESSION_PATH, send(other, first, 'client-b')),
      ])
      expect(replies.map(reply => reply.status)).toEqual([200, 200])
      await until(
        () => app.invoked.length >= 1,
        'the controlled Agent to hold its first invocation',
      )
      expect((await post(app.port, SESSION_PATH, send(who, first, 'overflow'))).json).toMatchObject(
        { outcome: 'limited', body: { resource: 'pending-inputs', limit: 2 } },
      )
      const before = succeeded(await app.coordinator.work.readWork(access), 'read pending')
      expect(before.pending).toHaveLength(2)
      expect(new Set(before.pending).size).toBe(2)
      const stored = await Promise.all(
        before.pending.map(input => app.coordinator.work.readInput({ ...access, input })),
      )
      expect(
        stored
          .map(value => succeeded(value, 'stored input').message)
          .map(message => message.blocks),
      ).toEqual(
        expect.arrayContaining([
          [expect.objectContaining({ text: 'client-a' })],
          [expect.objectContaining({ text: 'client-b' })],
        ]),
      )
      const retained = before.pending[0]
      if (retained === undefined) throw new Error('no retained input')
      expect((await post(app.port, SESSION_PATH, send(who, first, 'client-a'))).json).toMatchObject(
        { outcome: 'succeeded', body: { recovered: true } },
      )
      expect((await post(app.port, SESSION_PATH, send(other, first, 'client-a'))).status).toBe(409)
      expect(
        (await post(app.port, SESSION_PATH, send(who, first, 'client-a', 'changed'))).status,
      ).toBe(409)
      expect((await post(app.port, SESSION_PATH, send(who, second, 'client-a'))).status).toBe(200)
      await until(
        () => app.invoked.some(call => call.session === second),
        'another session to invoke while the first waits',
      )
      await discardResponse(app.port, send(who, second, 'lost-receipt'))
      expect(
        (
          await post(
            app.port,
            SESSION_PATH,
            sessionMessage(
              'query-send-input',
              {
                tenant: who.tenantText,
                session: second,
                acceptId: 'lost-receipt',
              },
              { loginProof: secondProof },
            ),
          )
        ).json,
      ).toMatchObject({ outcome: 'succeeded' })
      expect(
        (await post(app.port, SESSION_PATH, send(who, second, 'lost-receipt'))).json,
      ).toMatchObject({ outcome: 'succeeded', body: { recovered: true } })
      const queried = await post(
        app.port,
        SESSION_PATH,
        sessionMessage(
          'query-send-input',
          { tenant: who.tenantText, session: first, acceptId: 'client-a' },
          { loginProof: secondProof },
        ),
      )
      expect(queried.json).toMatchObject({ outcome: 'succeeded' })
      const active = succeeded(await app.coordinator.work.readWork(access), 'active')
      if (active.run.kind !== 'active') throw new Error('no active run')
      const run = active.run.run
      const cancel = await post(
        app.port,
        SESSION_PATH,
        sessionMessage(
          'cancel-run',
          {
            tenant: who.tenantText,
            session: first,
            controlId: 'cancel-first',
            run,
            urgency: 'force',
          },
          { loginProof: who.loginProof },
        ),
      )
      expect(cancel.status).toBe(200)
      const cancelled = succeeded(await app.coordinator.work.readWork(access), 'cancelled')
      expect(cancelled.run.kind).toBe('terminal')
      expect(cancelled.pending).toEqual(before.pending)
      succeeded(
        await app.intake.work.control({
          ...access,
          operation: operationId('archive'),
          intent: { kind: 'archive' },
        }),
        'archive',
      )
      expect(
        (await post(app.port, SESSION_PATH, send(who, first, 'after-archive'))).json,
      ).toMatchObject({ outcome: 'archived' })
      const archived = succeeded(await app.coordinator.work.readWork(access), 'archived')
      const receiveCount = () =>
        app
          .accessRequests()
          .filter(request => request.operation === 'receive' && request.target.session === first)
          .length
      const previousReceives = receiveCount()
      app.releaseAgent()
      await until(
        () => receiveCount() > previousReceives,
        'the late Agent handover to reach Session',
      )
      expect(
        await app.coordinator.reconciliation.receive({
          ...access,
          operation: operationId('late-handover'),
          fact: {
            kind: 'input-handover',
            execution: active.run.execution.execution,
            input: retained,
            result: { kind: 'accepted', receipt: evidence('late-agent') },
          },
        }),
      ).toMatchObject({ failure: { kind: 'archived' } })
      const afterLate = succeeded(
        await app.coordinator.work.readWork(access),
        'after late callback',
      )
      expect(afterLate.run).toEqual(archived.run)
      expect(afterLate.pending).toEqual(archived.pending)
      expect(afterLate.handed).toEqual(archived.handed)
      expect(
        succeeded(
          await app.coordinator.work.readInput({ ...access, input: retained }),
          'custody after archive',
        ).message,
      ).toMatchObject({ role: 'user' })
      const recognition = await app.identity.recognizeLogin({ loginProof: who.loginProof })
      if (recognition.kind !== 'recognized') throw new Error('login was lost')
      expect(
        await app.governance.revokeLogin({ login: recognition.login, target: recognition.login }),
      ).toMatchObject({ kind: 'succeeded' })
      expect((await post(app.port, SESSION_PATH, send(who, first, 'client-a'))).status).toBe(403)
      expect(
        (
          await post(
            app.port,
            SESSION_PATH,
            sessionMessage(
              'query-send-input',
              { tenant: who.tenantText, session: first, acceptId: 'client-a' },
              { loginProof: who.loginProof },
            ),
          )
        ).status,
      ).toBe(403)
    } finally {
      await app.close()
    }
  }, 30_000)

  it('rejects oversized input before custody and frees intake capacity on formal Agent handover', async () => {
    const app = await openIntakeTree(1, 1024)
    try {
      const who = await login(app.port, 'intake-bob', 'C1-test-password')
      const created = await post(app.port, SESSION_PATH, createSessionBody(who, 'capacity'))
      const session = sessionOf(created.json)
      const access = await accessFor(app, who, session)
      const over = await post(app.port, SESSION_PATH, send(who, session, 'large', '界'.repeat(400)))
      expect(over.status).toBe(429)
      expect(over.json).toMatchObject({
        outcome: 'limited',
        body: { resource: 'input-bytes', limit: 1024 },
      })
      expect(succeeded(await app.coordinator.work.readWork(access), 'unchanged').pending).toEqual(
        [],
      )
      expect((await post(app.port, SESSION_PATH, send(who, session, 'first'))).status).toBe(200)
      await until(() => app.invoked.length === 1, 'first Agent invocation')
      const active = succeeded(await app.coordinator.work.readWork(access), 'active')
      if (active.run.kind !== 'active') throw new Error('no active run')
      const handed = active.pending[0]
      if (handed === undefined) throw new Error('no input to hand over')
      succeeded(
        await app.coordinator.reconciliation.receive({
          ...access,
          operation: operationId('formal-handover'),
          fact: {
            kind: 'input-handover',
            execution: active.run.execution.execution,
            input: handed,
            result: { kind: 'accepted', receipt: evidence('agent-handover') },
          },
        }),
        'formal Agent handover',
      )
      expect((await post(app.port, SESSION_PATH, send(who, session, 'second'))).status).toBe(200)
      const final = succeeded(await app.coordinator.work.readWork(access), 'after handover')
      expect(final.handed).toContain(handed)
      expect(final.pending.filter(input => !final.handed.includes(input))).toHaveLength(1)
    } finally {
      await app.close()
    }
  }, 30_000)
})
