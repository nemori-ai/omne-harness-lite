import type { Context } from '@deepseek-ai/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { request } from 'node:http'
import { expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { freePort } from '../../r9/support.ts'
import { startTree, waitListening } from './support.ts'

// The rules are not the entry's: a second declaration of its point that differs from the first.
const rival = {
  name: 'access.protocols',
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'another key',
  gives: 'nothing',
  item: { kind: 'data', fields: {} },
  resolve: 'conflict',
  binding: 'run',
  onError: 'nothing',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'A second declaration of the point of the protocols.',
}

// A declaration is an entry of the catalog, keyed by the name of the point it declares.
const declaration = {
  point: 'dynamis.points',
  key: rival.name,
  id: '',
  scope: [],
  rank: 0,
  digest: 'rival',
  item: rival,
}

const rivalRow = defineRow({
  row: 'rival-host',
  implementation: 'contract-double',
  manifest: { provides: [], injects: [dynamisKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'rival-host',
    inject: [dynamisKey],
    apply: (ctx: Context) => void ctx.dynamis.put([declaration]),
  },
})

function post(port: number, path: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${port}`,
          'content-type': 'application/json',
          'content-length': '2',
          'omne-message-id': 'm-1',
        },
      },
      res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (text += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
      },
    )
    req.on('error', reject)
    req.end('{}')
  })
}

it('the point of the protocols declared twice: a call answers 503 that says nothing ran, and the client reads it as not sent', async () => {
  const port = await freePort()
  const tree = startTree({
    config: { listenPort: port },
    extraRows: [{ id: 'rival-host', plugin: 'rivalHost' }],
    extraPlugins: { rivalHost: rivalRow },
  })
  await waitListening(tree, port)
  const reply = await post(port, '/api/access/v1/availability')
  expect(reply.status).toBe(503)
  expect(reply.text).toBe('{"kind":"not-executed","reason":"unavailable"}')

  const access = createClient(
    accessProtocol,
    createHttpProtocolTransport({ origin: `http://127.0.0.1:${port}` }),
  )
  const frames = access.observe.availability({}, { signal: new AbortController().signal })
  expect(await frames.next()).toEqual({ done: true, value: { kind: 'unavailable' } })

  const run = await tree.stop()
  expect(run.result.exitCode).toBe(0)
  const codes = run.records
    .filter(record => record.kind === 'telemetry' && record['name'] === 'omne.access.diagnostic')
    .map(record => (record['fields'] as { code: string }).code)
  expect(codes).toEqual(['access.registry-unavailable', 'access.registry-unavailable'])
})
