import { request } from 'node:http'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { connectable, freePort, sleep, until } from '../../support/listening.ts'
import { startTree, waitListening } from './support.ts'

type Observed = { listeningAtBusinessStop?: boolean; answerWrittenAtBusinessStop?: boolean }
type Reply = Readonly<{ status: number; body: string }>

const empty = ruleCodec({ kind: 'object', fields: {} })

const heldProtocol = defineProtocol({
  name: 'held',
  major: 1,
  operations: {
    hold: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
  },
  observations: {},
})

function heldRow(gate: { calls: number; release: () => void }) {
  const plugin = defineAccessPlugin({
    name: 'held-access',
    protocol: heldProtocol,
    handlers: () => ({
      operations: {
        hold: async () => {
          gate.calls += 1
          await new Promise<void>(resolve => {
            gate.release = resolve
          })
          return { outcome: 'succeeded', body: {} }
        },
      },
      observations: {},
    }),
  })
  return defineRow({
    row: 'held-access',
    implementation: 'real',
    manifest: { provides: [], injects: [accessRegistryKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: { ...plugin, inject: [accessRegistryKey] },
  })
}

function hold(port: number): Promise<Reply> {
  const body = '{}'
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/held/v1/hold',
        headers: {
          host: `127.0.0.1:${port}`,
          'content-type': 'application/json',
          'content-length': String(body.length),
          'omne-message-id': 'm-hold',
        },
      },
      res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('server-entry row: planned stop', () => {
  it('stops first, refuses new connections, lets the request in flight finish, and only then stops the next phase', async () => {
    const port = await freePort()
    const observed: Observed = {}
    let answered: Reply | undefined
    const gate = { calls: 0, release: () => {} }
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
      extraRows: [
        { id: 'business-probe', plugin: 'business' },
        { id: 'held-access', plugin: 'held' },
      ],
      extraPlugins: { business, held: heldRow(gate) },
    })
    await waitListening(tree, port)

    const inFlight = hold(port).then(reply => {
      answered = reply
      return reply
    })
    await until(() => gate.calls === 1, 'hold in flight')

    let ended = false
    const stopping = tree.stop('test: planned stop').then(run => {
      ended = true
      return run
    })
    await until(async () => !(await connectable('127.0.0.1', port)), 'the port to refuse')
    await sleep(150)
    expect(ended).toBe(false)
    expect(answered).toBeUndefined()

    gate.release()
    const reply = await inFlight
    const run = await stopping

    expect(reply.status).toBe(200)
    expect((JSON.parse(reply.body) as { outcome: string }).outcome).toBe('succeeded')
    expect(run.result.exitCode).toBe(0)

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
