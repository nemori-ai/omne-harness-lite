// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
// file, and drives one Model call of each pi family through the assembled send path.
//
// The real request path of the local host: the local custodian resolves the credential inside the
// send fence, the Model send boundary starts the pi transport, the composed families encode the
// request and decode the recorded gateway stream, and the Model runtime preserves every fact in the
// injected in-memory ModelCommands. The server stands in for the gateway only; it answers with the
// recorded SSE body of the model that the request names.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
import type { TransportFact } from '@omne-harness/model-contract'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { assembleLocalHost, decoded, PLACEHOLDER, ROUTE_PATH } from './support/local-host.ts'
import { readRecordFixture, type FamilyName } from './support/records.ts'

type Case = Readonly<{
  family: FamilyName
  name: string
  /** The gateway cost of the recorded stream, in OpenRouter credit. */
  payable: string
  /** Whether the recorded reply holds a reasoning state part. */
  reasoning: boolean
  /** The replay format that the record of the family produces. */
  format: string
}>

const CASES: readonly Case[] = [
  {
    family: 'pi-ai-openai',
    name: 'openai/gpt-6-sol',
    payable: '0.000123456789123456789',
    reasoning: false,
    format: 'openai-responses-v1',
  },
  {
    family: 'pi-ai-openai',
    name: 'openai/gpt-5.6-sol',
    payable: '0.000123',
    reasoning: true,
    format: 'openai-responses-v1',
  },
  {
    family: 'pi-ai-anthropic',
    name: 'anthropic/claude-sonnet-5',
    payable: '0.000858',
    reasoning: true,
    format: 'anthropic-claude-v1',
  },
]

function recordOf(item: Case) {
  const records =
    item.family === 'pi-ai-openai'
      ? OPENAI_RECORDS.filter(record => record.name === item.name)
      : ANTHROPIC_RECORDS.filter(record => record.name === item.name)
  const [record] = records
  if (record === undefined) throw new Error(`no record ${item.name}`)
  return readRecordFixture(item.family, record)
}

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-assembly-')))
  const streams = new Map(
    CASES.map(item => [item.name, recordOf(item).stream] satisfies [string, string]),
  )
  server = await startHttpsServer(certificate, (res, request) => {
    const model: unknown = Reflect.get(Object(JSON.parse(request.body)), 'model')
    const stream = typeof model === 'string' ? streams.get(model) : undefined
    if (request.path !== ROUTE_PATH || stream === undefined) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(stream)
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(directory, { recursive: true, force: true })
})

describe('one call of each family through the assembled local send path', () => {
  it.each(CASES.map((item): [string, Case] => [item.name, item]))(
    '%s: the custodian credential reaches the gateway, the call settles and the account reaches ModelCommands',
    async (name, item) => {
      const { request } = recordOf(item)
      const label = name.replace(/[^a-z0-9]/gu, '-')
      const local = assembleLocalHost({
        request,
        label,
        directory,
        gateway: { url: server.url, ca: certificate.cert },
      })
      try {
        const before = server.requests.length
        // The call settles, also when its reply holds a reasoning state part: the finish takes
        // the replay format from the receipt that the transport gave and the Model kept.
        expect((await local.drive()).driven).toEqual({ ok: undefined })

        // The request carried the value the custodian resolved, inside the send fence.
        const received = server.requests.slice(before)
        expect(received).toHaveLength(1)
        expect(received[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

        // The facts the boundary handed out end with exactly one termination.
        expect(local.facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
        expect(local.facts.at(-1)?.kind).toBe('ended')
        const reported = local.facts.filter(fact => fact.kind === 'account')
        expect(reported).toHaveLength(1)

        // ModelCommands completed the account with this call and the receipt.
        const dispatches = decoded(
          await local.commands.dispatches({ ...local.access, call: local.call }),
        )
        expect(dispatches).toHaveLength(1)
        const ended = local.facts.find(
          (fact): fact is Extract<TransportFact, { kind: 'ended' }> => fact.kind === 'ended',
        )
        expect(dispatches[0]?.terminal).toEqual(ended?.termination)
        expect(dispatches[0]?.materialization?.receipt.replayFormat).toBe(item.format)
        const sealed = local.facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block] : []))
        expect(sealed.some(block => block.kind === 'reasoning_state')).toBe(item.reasoning)
        const account = dispatches[0]?.account
        expect(account).toEqual({
          ...reported[0]?.value,
          subject: { kind: 'model_call', id: local.call },
          receipt: 'received',
        })
        expect(payableAmount(account)).toEqual({
          ok: { state: 'known', lexeme: item.payable, unit: 'openrouter-credit' },
        })

        // The secret entered neither the facts nor the kept records.
        expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
        expect(JSON.stringify(dispatches)).not.toContain(PLACEHOLDER)
      } finally {
        await local.close()
      }
    },
  )
})
