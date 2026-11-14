// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { assembleLocalHost, decoded, PLACEHOLDER, ROUTE_PATH } from './support/local-host.ts'
import { readRecordFixture, type FamilyName } from './support/records.ts'

type Case = Readonly<{
  family: FamilyName
  name: string
  payable: string
  reasoning: boolean
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
      ? OPENAI_RECORDS.filter(record => record.name === item.name && record.status === 'current')
      : ANTHROPIC_RECORDS.filter(record => record.name === item.name && record.status === 'current')
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
  it('settles a disclosure refusal as not sent without reaching the HTTPS gateway', async () => {
    const { request } = recordOf(CASES[0]!)
    const beforeRequest = structuredClone(request)
    const checked: unknown[] = []
    const local = assembleLocalHost({
      request,
      label: 'disclosure-refused',
      directory,
      gateway: { url: server.url, ca: certificate.cert },
      requestDisclosure: value => {
        checked.push(value)
        return { kind: 'denied', action: 'tool-result-disclosure' }
      },
    })
    try {
      const before = server.requests.length
      const result = await local.drive()
      expect(result.driven).toEqual({ ok: undefined })
      expect(checked).toEqual([beforeRequest])
      expect(request).toEqual(beforeRequest)
      expect(server.requests.length).toBe(before)
      const dispatches = decoded(
        await local.commands.dispatches({ ...local.access, call: local.call }),
      )
      expect(dispatches).toHaveLength(1)
      expect(dispatches[0]).toMatchObject({
        send: 'not-sent',
        terminal: { kind: 'failed', fault: { cause: 'excluded' } },
      })
      const recovered = decoded(
        await local.commands.loadRecovery({ ...local.access, call: local.call }),
      )
      expect(
        decoded(await local.commands.loadRequest({ ...local.access, call: local.call })),
      ).toEqual(beforeRequest)
      expect(recovered.state).toMatchObject({ phase: 'settled' })
    } finally {
      await local.close()
    }
  })

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
        expect((await local.drive()).driven).toEqual({ ok: undefined })

        const received = server.requests.slice(before)
        expect(received).toHaveLength(1)
        expect(received[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

        expect(local.facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
        expect(local.facts.at(-1)?.kind).toBe('ended')
        const reported = local.facts.filter(fact => fact.kind === 'account')
        expect(reported).toHaveLength(1)

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

        expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
        expect(JSON.stringify(dispatches)).not.toContain(PLACEHOLDER)
      } finally {
        await local.close()
      }
    },
  )
})
