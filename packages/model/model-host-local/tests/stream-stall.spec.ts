// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
// file, drives Model calls through the assembled send path, and waits in real time: the Model
// runtime keeps its own timers, so no fake clock is used here. The stall limit is 400 ms and each
// call waits for it once; the cases state the longer bound that they allow.
//
// The stream stall timeout through the local assembly: `transportLimits.streamStallTimeoutMs` of
// `assembleLocalModel` reaches the pi transport, a gateway that stops sending ends the call with
// the existing failure causes, the Model settles it, and the credential slot is empty afterwards.
// The gateway is a local HTTPS server that answers with the first event of a recorded stream and
// then goes silent, or never answers at all.
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

/** What the transports of this file were built with: the observation point for the slot and the limit. */
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
/** The longest a case may wait: the limit, the Model's own work and a loaded machine. */
const CASE_TIMEOUT_MS = 30_000

const [record] = OPENAI_RECORDS.filter(item => item.name === 'openai/gpt-5.6-sol')
if (record === undefined) throw new Error('no record openai/gpt-5.6-sol')
const recorded = readRecordFixture('pi-ai-openai', record)
/** The first SSE event of the recorded reply: it carries the visible content. */
const FIRST_EVENT = recorded.stream.slice(0, recorded.stream.indexOf('\n\n') + 2)

type Gateway = 'silent' | 'stops-after-first-event'
let gateway: Gateway = 'silent'

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-stall-')))
  // The server stands in for a gateway that stops: it never ends the response.
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
  // The helper builds its limits from this shared object; the file runs in its own module scope.
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

      // The limit given to the assembly reached the transport, and the call waited for it.
      expect(built.stalls).toContain(STALL_MS)
      expect(waited).toBeGreaterThanOrEqual(STALL_MS - 50)

      // One request, with the credential of the custodian inside the send fence.
      expect(requests).toHaveLength(1)
      expect(requests[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

      // The facts end once, with an existing failure cause and the new diagnostic.
      const ended = endedOf(local.facts)
      expect(ended).toHaveLength(1)
      expect(local.facts.at(-1)).toBe(ended[0])
      expect(ended[0]?.termination).toEqual({
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'stream-stall', upstreamStatus: null },
      })
      expect(local.facts.some(fact => fact.kind === 'block-delta')).toBe(false)

      // No content arrived, so this failure is one that a retry policy decides (model SPEC,
      // "已实现的调用收场": the policy loop is not implemented, and the runtime keeps the real
      // refusal `retry-not-decided` instead of making a default stop). The call therefore does not
      // settle: it stays `running`, proven without content, with the failed termination kept on
      // its dispatch. This is a known limit of M2 (no retry), not of the stall timeout.
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
      // The content that arrived before the stall was delivered, not dropped.
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

      // The slot held the value only inside `start`: afterwards no slot gives it.
      expect(built.slots.length).toBeGreaterThanOrEqual(2) // a probe and at least one send resource
      for (const slot of built.slots) expect(slot.read()).toBeUndefined()

      expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
      expect(JSON.stringify(dispatches)).not.toContain(PLACEHOLDER)
    },
  )
})
