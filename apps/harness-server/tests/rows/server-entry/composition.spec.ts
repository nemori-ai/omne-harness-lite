// The row composed with the identity, Session and definition mapping rows and the real entry
// objects: a registered account logs in, and the session operations reach the Session faces with a
// principal that `principalIssuer` signed and `principalVerifier` verifies.
import { describe, expect, it } from 'vitest'
import {
  GOVERNANCE_PATH,
  SESSION_PATH,
  createSessionBody,
  freePort,
  governance,
  login,
  post,
  sessionMessage,
  startTree,
  waitListening,
} from './support.ts'

const CREDENTIAL = 'pw-secret-MARKER-1'

describe('server-entry row: composition', () => {
  it('delivers principals that the issuer signed and the verifier verifies, from the right caller class', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port } })
    await waitListening(tree, port)

    const who = await login(port, 'alice', CREDENTIAL)
    const created = await post(port, SESSION_PATH, createSessionBody(who, 'create-1'))
    expect(created.status).toBe(200)
    const session = (created.json as { body: { session: string } }).body.session

    const accepted = await post(
      port,
      SESSION_PATH,
      sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'accept-1',
          inputId: 'input-1',
          message: {
            id: 'msg_abcdefghijklmnopqrstuv',
            role: 'user',
            blocks: [
              {
                kind: 'text',
                id: 'block-1',
                visibility: { toHuman: true, toModel: true },
                text: 'hello',
              },
            ],
          },
        },
        { loginProof: who.loginProof },
      ),
    )
    expect(accepted.status).toBe(200)

    const history = await post(
      port,
      SESSION_PATH,
      sessionMessage(
        'read-history',
        { tenant: who.tenantText, session, cursor: null, direction: 'forward', pageBytes: '128' },
        { loginProof: who.loginProof },
      ),
    )
    expect(history.status).toBe(200)

    const run = await tree.stop()
    expect(run.result.exitCode).toBe(0)
    const calls = tree.recorder.calls
    expect(calls.map(call => call.face)).toEqual(['create', 'accept', 'begin'])
    // Every principal is verified, and the only system component behind them is the entry's own.
    expect(calls.map(call => call.verdict)).toEqual(['verified', 'verified', 'verified'])
    expect(new Set(calls.map(call => call.actorComponent))).toEqual(new Set(['server-entry']))
    // The caller classes of the assembly page: intake for management and work, reader for history.
    expect(calls.map(call => call.caller)).toEqual(['intake', 'intake', 'reader'])
  })

  it('shows no login proof, credential or issuer in any output of the run', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port } })
    await waitListening(tree, port)
    const who = await login(port, 'bob', CREDENTIAL)
    await post(port, SESSION_PATH, createSessionBody(who, 'create-1'))
    const run = await tree.stop()

    // Positive control: the proof and the credential exist and the issue reply carried the proof.
    expect(who.loginProof.length).toBeGreaterThan(8)
    expect(who.reply.body).toContain(who.loginProof)

    const printed = JSON.stringify(run.records) + run.stderr.join('\n')
    expect(printed).not.toContain(who.loginProof)
    expect(printed).not.toContain('MARKER')
    expect(printed).not.toMatch(/issueSystem|issueActingForTenant|authority/u)
  })

  it('reads identity operations on every call: without an identity row the entry still starts and answers basis-unavailable', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port }, withoutIdentity: true })
    await waitListening(tree, port)
    const issued = await post(
      port,
      GOVERNANCE_PATH,
      governance('issue-login', { loginIdentifier: 'carol', credential: CREDENTIAL }),
    )
    // `basis-unavailable` says the basis cannot answer: not a wrong credential, not a success.
    expect(issued.status).toBe(503)
    expect((issued.json as { outcome: string }).outcome).toBe('basis-unavailable')
    expect(issued.body).not.toContain(CREDENTIAL)
    const run = await tree.stop()
    expect(run.result.exitCode).toBe(0)
    expect(run.state('server-entry')).toMatchObject({ state: 'ACTIVE' })
  })
})
