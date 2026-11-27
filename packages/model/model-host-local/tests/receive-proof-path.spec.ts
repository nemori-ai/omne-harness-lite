// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { assembleLocalHost, decoded, isGatewayPath } from './support/local-host.ts'
import { readRecordFixture } from './support/records.ts'

const CASE_TIMEOUT_MS = 30_000

const [record] = OPENAI_RECORDS.filter(item => item.name === 'openai/gpt-5.6-sol')
if (record === undefined) throw new Error('no record openai/gpt-5.6-sol')
const recorded = readRecordFixture('pi-ai-openai', record)
const FIRST_EVENT = recorded.stream.slice(0, recorded.stream.indexOf('\n\n') + 2)

type Gateway = 'http-503' | 'http-429' | 'empty-body' | 'content-then-closed' | 'whole-answer'
let gateway: Gateway = 'http-503'

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-receive-')))
  server = await startHttpsServer(certificate, (res, request) => {
    if (!isGatewayPath(request.path)) {
      res.writeHead(404).end()
      return
    }
    switch (gateway) {
      case 'http-503':
        res.writeHead(503).end('{"error":"busy"}')
        return
      case 'http-429':
        res.writeHead(429).end('{"error":"slow down"}')
        return
      case 'empty-body':
        res.writeHead(200, { 'content-type': 'text/event-stream' }).end()
        return
      case 'content-then-closed':
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(FIRST_EVENT, () => res.destroy())
        return
      case 'whole-answer':
        res.writeHead(200, { 'content-type': 'text/event-stream' }).end(recorded.stream)
        return
    }
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(directory, { recursive: true, force: true })
})

async function firstDispatch(label: string, mode: Gateway | 'refused') {
  if (mode !== 'refused') gateway = mode
  const url = mode === 'refused' ? new URL('https://127.0.0.1:9/') : server.url
  const local = assembleLocalHost({
    request: recorded.request,
    label,
    directory,
    gateway: { url, ca: certificate.cert },
  })
  try {
    await local.drive()
    const dispatches = decoded(
      await local.commands.dispatches({ ...local.access, call: local.call }),
    )
    expect(dispatches).toHaveLength(1)
    const [dispatch] = dispatches
    if (dispatch === undefined) throw new Error('no dispatch')
    return dispatch
  } finally {
    await local.close()
  }
}

describe('first content of a sent request, through the real transport and the real receive reader', () => {
  it.each([
    ['http-503', 'http-503', '503', {}],
    ['http-429', 'http-429', '429', { throttled: true }],
  ] as const)(
    'an HTTP error answer (%s) proves that there was no content, and the saved fault keeps what the transport said',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async (mode, diagnostic, upstreamStatus, marks) => {
      const dispatch = await firstDispatch(`receive-${mode}`, mode)
      expect(dispatch.send).toBe('started')
      expect(dispatch.firstContent).toBe('none-proven')
      expect(dispatch.terminal).toEqual({
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic, upstreamStatus, ...marks },
      })
    },
  )

  it(
    'a refused connection proves that there was no content',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const dispatch = await firstDispatch('receive-refused', 'refused')
      expect(dispatch.firstContent).toBe('none-proven')
      expect(dispatch.terminal).toMatchObject({
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'connect-failed' },
      })
    },
  )

  it(
    'a 200 answer whose body gives no fact proves that there was no content',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const dispatch = await firstDispatch('receive-empty', 'empty-body')
      expect(dispatch.firstContent).toBe('none-proven')
      expect(dispatch.terminal).toMatchObject({ kind: 'failed' })
    },
  )

  it(
    'content before the connection closes is observed, not proven absent',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const dispatch = await firstDispatch('receive-content', 'content-then-closed')
      expect(dispatch.firstContent).toBe('observed')
      expect(dispatch.terminal).toMatchObject({ kind: 'failed', fault: { cause: 'stream-lost' } })
    },
  )

  it(
    'a whole answer is observed and completes',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const dispatch = await firstDispatch('receive-whole', 'whole-answer')
      expect(dispatch.firstContent).toBe('observed')
      expect(dispatch.terminal).toMatchObject({ kind: 'completed' })
    },
  )
})
