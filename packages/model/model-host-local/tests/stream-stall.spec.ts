// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import type { PiCredentialSlot, PiTransportConfig } from '@omne-harness/pi-ai-transport'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import {
  assembleLocalHost,
  decoded,
  PLACEHOLDER,
  ROUTE_PATH,
  TRANSPORT_LIMITS,
} from './support/local-host.ts'
import { readRecordFixture } from './support/records.ts'

const built = vi.hoisted(
  (): { readonly slots: PiCredentialSlot[]; readonly stalls: (number | undefined)[] } => ({
    slots: [],
    stalls: [],
  }),
)
vi.mock('@omne-harness/pi-ai-transport', async importOriginal => {
  const actual = await importOriginal<typeof import('@omne-harness/pi-ai-transport')>()
  return {
    ...actual,
    createPiTransport: (config: PiTransportConfig) => {
      built.slots.push(config.credential)
      built.stalls.push(config.limits.streamStallTimeoutMs)
      return actual.createPiTransport(config)
    },
  }
})

const STALL_MS = 400
const CASE_TIMEOUT_MS = 30_000

const [record] = OPENAI_RECORDS.filter(item => item.name === 'openai/gpt-5.6-sol')
if (record === undefined) throw new Error('no record openai/gpt-5.6-sol')
const recorded = readRecordFixture('pi-ai-openai', record)
const FIRST_EVENT = recorded.stream.slice(0, recorded.stream.indexOf('\n\n') + 2)

type Gateway = 'silent' | 'stops-after-first-event'
let gateway: Gateway = 'silent'

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-stall-')))
  server = await startHttpsServer(certificate, (res, request) => {
    if (request.path !== ROUTE_PATH) {
      res.writeHead(404).end()
      return
    }
    if (gateway === 'silent') return
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(FIRST_EVENT)
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(directory, { recursive: true, force: true })
})

async function stalledCall(label: string, mode: Gateway) {
  gateway = mode
  Object.assign(TRANSPORT_LIMITS, { streamStallTimeoutMs: STALL_MS })
  const local = assembleLocalHost({
    request: recorded.request,
    label,
    directory,
    gateway: { url: server.url, ca: certificate.cert },
  })
  try {
    const before = server.requests.length
    const begun = Date.now()
    const { driven } = await local.drive()
    const waited = Date.now() - begun
    const recovery = decoded(
      await local.commands.loadRecovery({ ...local.access, call: local.call }),
    )
    const dispatches = decoded(
      await local.commands.dispatches({ ...local.access, call: local.call }),
    )
    return { local, driven, recovery, dispatches, waited, requests: server.requests.slice(before) }
  } finally {
    await local.close()
  }
}

function endedOf(facts: readonly TransportFact[]) {
  return facts.filter(
    (fact): fact is Extract<TransportFact, { kind: 'ended' }> => fact.kind === 'ended',
  )
}

describe('a gateway that stops sending, through the assembled local send path', () => {
  it(
    'a gateway that never answers fails the call as upstream-unavailable, stream-stall',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const { local, driven, recovery, dispatches, waited, requests } = await stalledCall(
        'stall-silent',
        'silent',
      )

      expect(built.stalls).toContain(STALL_MS)
      expect(waited).toBeGreaterThanOrEqual(STALL_MS - 50)

      expect(requests).toHaveLength(1)
      expect(requests[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

      const ended = endedOf(local.facts)
      expect(ended).toHaveLength(1)
      expect(local.facts.at(-1)).toBe(ended[0])
      expect(ended[0]?.termination).toEqual({
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'stream-stall', upstreamStatus: null },
      })
      expect(local.facts.some(fact => fact.kind === 'block-delta')).toBe(false)

      expect(driven).toEqual({
        failure: { kind: 'invalid', field: 'termination', reason: 'retry-not-decided' },
      })
      expect(recovery.state).toMatchObject({ phase: 'running', firstContent: 'none-proven' })
      expect(dispatches).toHaveLength(1)
      expect(dispatches[0]?.terminal).toEqual(ended[0]?.termination)
    },
  )

  it(
    'a gateway that stops after content fails the call as stream-lost, stream-stall and keeps the content',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const { local, driven, recovery, dispatches } = await stalledCall(
        'stall-midstream',
        'stops-after-first-event',
      )
      expect(driven).toEqual({ ok: undefined })

      const ended = endedOf(local.facts)
      expect(ended).toHaveLength(1)
      expect(local.facts.at(-1)).toBe(ended[0])
      expect(ended[0]?.termination).toEqual({
        kind: 'failed',
        fault: { cause: 'stream-lost', diagnostic: 'stream-stall', upstreamStatus: null },
      })
      const text = local.facts.flatMap(fact => (fact.kind === 'block-delta' ? [fact.delta] : []))
      expect(text.join('')).toContain('visible answer')

      expect(recovery.state.phase).toBe('settled')
      if (recovery.state.phase !== 'settled') throw new Error('the call did not settle')
      expect(recovery.state.settlement.termination).toEqual(ended[0]?.termination)
      expect(dispatches[0]?.terminal).toEqual(ended[0]?.termination)
    },
  )

  it(
    'the credential slot of every transport is empty after the stalled send, and no secret was kept',
    { tags: ['slow'], timeout: CASE_TIMEOUT_MS },
    async () => {
      const { local, dispatches } = await stalledCall('stall-slot', 'stops-after-first-event')

      expect(built.slots.length).toBeGreaterThanOrEqual(2)
      for (const slot of built.slots) expect(slot.read()).toBeUndefined()

      expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
      expect(JSON.stringify(dispatches)).not.toContain(PLACEHOLDER)
    },
  )
})
