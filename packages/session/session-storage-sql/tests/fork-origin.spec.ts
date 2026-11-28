import { judgeMessage } from '@omne-harness/message'
import type { SessionCommand } from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { expect, it } from 'vitest'
import { app, TENANT_A, type App } from './fixtures/app.ts'
import { childOf, wholeOf } from './fixtures/forked.ts'

const origin = { name: 'skill:review', layer: 'tenant', version: '3', digest: 'sha-1' }

async function commitNamed(a: App, session: string) {
  const named = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'system_reminder',
    blocks: [
      {
        kind: 'text',
        id: 'body',
        text: '先读改动。',
        visibility: { toHuman: false, toModel: true },
        origin,
      },
    ],
  })
  if (!('ok' in named)) throw new Error('the fixture is invalid')
  const work = await a.port.readWork(a.access(TENANT_A, session))
  if (!('ok' in work)) throw new Error(JSON.stringify(work))
  const command: SessionCommand = {
    kind: 'commitDerived',
    input: {
      tenant: TENANT_A,
      session: sessionId(session),
      operation: operationId(`named-${session}`),
      expected: work.ok.revision,
      value: { kind: 'context-reminder', message: named.ok, source: evidence('named') },
    },
  }
  return a.port.commit({ access: a.access(TENANT_A, session), command, guards: [] })
}

it('a named text stored in a session is read back with its origin, from the session and from a session forked off it', async () => {
  const a = await app()
  expect('ok' in (await a.create(TENANT_A))).toBe(true)
  expect('ok' in (await commitNamed(a, 'session-1'))).toBe(true)
  expect(
    'ok' in
      (await a.create(TENANT_A, 'child-1', childOf('session-1', await wholeOf(a, 'session-1')))),
  ).toBe(true)
  for (const [session, inherited] of [
    ['session-1', false],
    ['child-1', true],
  ] as const) {
    const page = await a.port.history.begin({
      ...a.access(TENANT_A, session),
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 10_000_000,
      ...(inherited ? { inherited: true as const } : {}),
    })
    if (!('ok' in page)) throw new Error(JSON.stringify(page))
    const text = JSON.stringify(page.ok.entries.map(entry => entry.payload))
    expect(text).toContain('skill:review')
    expect(text).toContain('先读改动。')
  }
})
