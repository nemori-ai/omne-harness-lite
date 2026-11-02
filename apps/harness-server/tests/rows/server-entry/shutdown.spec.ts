// The planned stop: the entry phase stops first, the entry stops accepting and lets the requests in
// flight write their answers, and only then the next phase stops.
import { describe, expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import {
  SESSION_PATH,
  connectable,
  createSessionBody,
  freePort,
  login,
  post,
  sleep,
  startTree,
  until,
  waitListening,
  type Reply,
} from './support.ts'

type Observed = { listeningAtBusinessStop?: boolean; answerWrittenAtBusinessStop?: boolean }

describe('server-entry row: planned stop', () => {
  it('stops first, refuses new connections, lets the request in flight finish, and only then stops the next phase', async () => {
    const port = await freePort()
    const observed: Observed = {}
    let answered: Reply | undefined
    // A business-phase row: when its stop runs, the entry phase must be completely done.
    const business = defineRow({
      row: 'business-probe',
      implementation: 'real',
      manifest: { provides: [], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'body', phase: 'business' },
      body: async () => ({
        stop: async () => {
          observed.listeningAtBusinessStop = await connectable('127.0.0.1', port)
          await sleep(30)
          observed.answerWrittenAtBusinessStop = answered !== undefined
          return { kind: 'settled' as const }
        },
      }),
    })
    const tree = startTree({
      config: { listenPort: port },
      extraRows: [{ id: 'business-probe', plugin: 'business' }],
      extraPlugins: { business },
    })
    await waitListening(tree, port)
    const who = await login(port, 'alice', 'pw-1')

    // Hold one create-session inside the Session faces.
    let release: () => void = () => {}
    tree.recorder.gate.create = () =>
      new Promise<void>(resolve => {
        release = resolve
      })
    const inFlight = post(port, SESSION_PATH, createSessionBody(who, 'create-1')).then(reply => {
      answered = reply
      return reply
    })
    await until(() => tree.recorder.calls.some(call => call.face === 'create'), 'create in flight')

    let ended = false
    const stopping = tree.stop('test: planned stop').then(run => {
      ended = true
      return run
    })
    // The entry has stopped accepting, but the stop waits for the request in flight.
    await until(async () => !(await connectable('127.0.0.1', port)), 'the port to refuse')
    await sleep(150)
    expect(ended).toBe(false)
    expect(answered).toBeUndefined()

    release()
    const reply = await inFlight
    const run = await stopping

    // The answer was written in full, not cut off with the connection.
    expect(reply.status).toBe(200)
    expect((reply.json as { outcome: string }).outcome).toBe('succeeded')
    expect(run.result.exitCode).toBe(0)

    // The entry phase stopped first, the business phase after it.
    const calls = run
      .of('shutdown-step')
      .filter(step => step['action'] === 'stop-call')
      .map(step => [step['phase'], step['row']])
    expect(calls[0]).toEqual(['entry', 'server-entry'])
    expect(calls).toContainEqual(['business', 'business-probe'])
    expect(observed).toEqual({
      listeningAtBusinessStop: false,
      answerWrittenAtBusinessStop: true,
    })
    const overall = run.of('shutdown-result')[0]
    expect(overall?.['overall']).toBe('settled')
  })

  it('refuses every connection once the run has ended', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port } })
    await waitListening(tree, port)
    await tree.stop()
    expect(await connectable('127.0.0.1', port)).toBe(false)
  })
})
