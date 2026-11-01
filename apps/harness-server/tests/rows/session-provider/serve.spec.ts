// The `session-provider` row in a `serve` tree beside the real `server-entry` row and the real
// principal entry objects: a login, a created session and a sent input cross the loopback port and
// arrive at the double with a principal that the assembly signed. Nothing of the login reaches the
// double or any record.
import { describe, expect, it } from 'vitest'
import { stubPlugin } from '../../../src/cordis.ts'
import { entryObjects } from '../../../src/entry/index.ts'
import { serverEntryRow } from '../../../src/rows/server-entry/index.ts'
import {
  createSessionProviderRow,
  type SessionProviderArrival,
} from '../../../src/rows/session-provider/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import {
  SESSION_PATH,
  connectable,
  createSessionBody,
  freePort,
  identityDoubleRow,
  login,
  mappingsDoubleRow,
  post,
  sessionMessage,
  until,
} from '../server-entry/support.ts'
import { accessCheckRow, delegatedTransactionsRow, sameTenantPolicy } from './support.ts'

const CREDENTIAL = 'pw-secret-MARKER-1'
const INPUT_TEXT = 'hello from the loopback port'

function userMessage(text: string) {
  return {
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'user',
    blocks: [{ kind: 'text', id: 'block-1', visibility: { toHuman: true, toModel: true }, text }],
  }
}

/** Whether `haystack` holds any of the `secrets`. */
function leaks(haystack: string, secrets: readonly string[]): boolean {
  return secrets.some(secret => haystack.includes(secret))
}

describe('session-provider row: serve tree', () => {
  it('is ACTIVE beside server-entry, and carries a created session and an input from HTTP to the double', async () => {
    const port = await freePort()
    const arrivals: SessionProviderArrival[] = []
    const controller = new AbortController()
    const finished = serveOnce({
      distribution: {
        rows: [
          { id: 'identity', plugin: 'identityDouble', config: {} },
          { id: 'authorization', plugin: 'accessCheck', config: {} },
          { id: 'session-storage', plugin: 'delegated', config: {} },
          { id: 'session-provider', plugin: 'sessionProvider', config: {} },
          { id: 'agent-adoptions', plugin: 'mappingsDouble', config: {} },
          { id: 'server-entry', plugin: 'serverEntryRow', config: { listenPort: port } },
        ],
      },
      plugins: {
        stubPlugin,
        identityDouble: identityDoubleRow,
        accessCheck: accessCheckRow(sameTenantPolicy).plugin,
        delegated: delegatedTransactionsRow,
        sessionProvider: createSessionProviderRow({ observe: arrival => arrivals.push(arrival) }),
        mappingsDouble: mappingsDoubleRow,
        serverEntryRow,
      },
      entryObjects,
      stopAfterStartup: false,
      stop: controller.signal,
      readinessTimeoutMs: 3000,
      shutdownDeadlineMs: 4000,
    })
    let ended = false
    void finished.then(
      () => (ended = true),
      () => (ended = true),
    )
    await until(async () => {
      if (ended) throw new Error('the tree ended before the entry listened')
      return connectable('127.0.0.1', port)
    }, `port ${port} to listen`)

    const who = await login(port, 'alice', CREDENTIAL)
    const created = await post(port, SESSION_PATH, createSessionBody(who, 'create-1'))
    expect(created.status).toBe(200)
    const session = (created.json as { body: { session: string } }).body.session

    const sent = await post(
      port,
      SESSION_PATH,
      sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'accept-1',
          inputId: 'input-1',
          message: userMessage(INPUT_TEXT),
        },
        { loginProof: who.loginProof },
      ),
    )
    expect(sent.status).toBe(200)

    // The input is in the history that the double keeps for the session.
    const history = await post(
      port,
      SESSION_PATH,
      sessionMessage(
        'read-history',
        { tenant: who.tenantText, session, cursor: null, direction: 'forward', pageBytes: '65536' },
        { loginProof: who.loginProof },
      ),
    )
    expect(history.status).toBe(200)
    expect(history.body).toContain(INPUT_TEXT)

    controller.abort('test: stop')
    const run = await finished
    expect(run.result.exitCode).toBe(0)
    expect(run.state('session-provider')).toMatchObject({ state: 'ACTIVE' })
    expect(run.state('server-entry')).toMatchObject({ state: 'ACTIVE' })
    expect(run.tree('session-provider')).toMatchObject({ implementation: 'contract-double' })

    // The principal that arrived: classification only, as the entry's own system component.
    const accepted = arrivals.filter(
      arrival => arrival.method === 'work.accept' && arrival.outcome === 'ok',
    )
    expect(accepted).toEqual([
      {
        method: 'work.accept',
        principalKind: 'acting-for-tenant',
        actorComponent: 'server-entry',
        access: 'allowed',
        outcome: 'ok',
      },
    ])
    expect(arrivals.map(arrival => arrival.method)).toEqual([
      'management.create',
      'work.accept',
      'history.begin',
    ])

    // No secret of the login in what the double reported, in the run records or in stderr.
    const secrets = [CREDENTIAL, who.loginProof]
    const output = JSON.stringify({ arrivals, records: run.records, stderr: run.stderr })
    expect(leaks(output, secrets)).toBe(false)
    // Positive control: the search does find the secrets where they are, in the requests.
    const sentBody = sessionMessage('send-input', {}, { loginProof: who.loginProof })
    expect(leaks(sentBody, secrets)).toBe(true)
    expect(leaks(JSON.stringify({ credential: CREDENTIAL }), secrets)).toBe(true)
  })
})
