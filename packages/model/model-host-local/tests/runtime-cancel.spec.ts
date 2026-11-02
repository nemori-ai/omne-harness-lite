// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
// file, and holds streamed responses open until the client stops them.
//
// `calls.cancel` on a call whose supplier stream is running. The send path is the assembled local
// one: the local custodian, the Model send boundary and the pi transport with the OpenAI family.
// The commands are the in-memory ModelCommands of model (a store without durability); the gateway
// is a local HTTPS server that streams an answer and then holds the response open. The physical
// stop of an exchange is read from the transport's own `exchange-stopped` diagnostic, which the
// transport emits when the connection is closed and before the stop resolves.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
import { accountCodec, organizationCodec, tenant, tenantEquals } from '@omne-harness/legal-identity'
import { createModelRuntime, type ModelConfiguration } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type ModelCallId,
  type ModelFailure,
  type ModelInvocationRef,
  type ResultPart,
} from '@omne-harness/model-contract'
import { decodeCredentialId, type ModelCommands } from '@omne-harness/model-contract/provider'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import { assembleLocalModel, createLocalCustodian } from '@omne-harness/model-host-local'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { FAMILIES, PLACEHOLDER, ROUTE_PATH, TRANSPORT_LIMITS } from './support/local-host.ts'
import { factorySupplier } from './support/profiles.ts'
import { readRecordFixture } from './support/records.ts'

const CONSUMER = 'runtime-cancel-consumer'
const ADOPTION: Adoption = {
  owner: 'model-host-local-tests',
  name: 'runtime-cancel',
  revision: '1',
  digest: '0'.repeat(64),
}
// Every fact is saved before the next one is read, so the content before the cancel is confirmed.
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 1,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 4096,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
/** The capacity of one call; the store holds a few such calls at once. */
const CAPACITY = { bytes: '200000', blocks: '20', attachmentBytes: '0' }
const STORE_CAPACITY = { bytes: '1000000', blocks: '100', attachmentBytes: '0' }

function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`refused: ${JSON.stringify(outcome.failure)}`)
}

const record = OPENAI_RECORDS.find(item => item.name === 'openai/gpt-6-sol')
if (record === undefined) throw new Error('no record openai/gpt-6-sol')
const { request } = readRecordFixture('pi-ai-openai', record)

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
/** The answer that is on its way when the cancel comes: content, no finish yet. */
const HEAD = sse({
  model: 'openai/gpt-6-sol',
  provider: 'OpenAI',
  choices: [{ delta: { content: 'partial answer' } }],
})
/** The rest of a natural completion: the finish, the usage with its cost, and the end marker. */
const TAIL =
  sse({
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 3,
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      cost: 0.000042,
    },
  }) + 'data: [DONE]\n\n'

/** One streamed response that the server holds open until the test finishes it. */
type Held = Readonly<{
  /** Resolves when the server sees the response closed, by the client or by `finish`. */
  closed: Promise<void>
  /** Writes the rest of the answer and ends the response. */
  finish(): void
}>

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
const held: Held[] = []
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-cancel-')))
  server = await startHttpsServer(certificate, (res: ServerResponse, received) => {
    if (received.path !== ROUTE_PATH) {
      res.writeHead(404).end()
      return
    }
    const closed = new Promise<void>(resolve => res.once('close', () => resolve()))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(HEAD)
    held.push({
      closed,
      finish: () => {
        if (!res.writableEnded && !res.destroyed) res.end(TAIL)
      },
    })
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(directory, { recursive: true, force: true })
})

async function eventually(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
  for (let tries = 0; tries < 1000; tries += 1) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** Resolves with the value, or rejects after `ms` with `label`: a stream that never stops is red. */
function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not happen within ${ms} ms`)), ms),
    ),
  ])
}

function tenantOf(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
}

/**
 * One local host for several calls of one tenant: the vault, the assembled send path over the
 * local server, the in-memory ModelCommands and the Model runtime over them. `log` gets
 * `exchange-stopped` from the transport and `settle:<call>` when the runtime settles a call.
 */
function assembleHost(label: string) {
  const scope = tenantOf('5')
  const principal = Object.freeze({ subject: 'runtime-cancel-test' })
  const log: string[] = []
  const unavailable = (): { failure: ModelFailure } => ({
    failure: { kind: 'unavailable', dependency: 'runtime-cancel-test', diagnostic: 'not-supplied' },
  })
  const memory = createTestModelDependencies<typeof principal>({
    start: '2026-11-01T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 8,
    sends: [],
    owners: [{ consumerOwner: CONSUMER, work: { kind: 'exempt' }, evidence: ADOPTION }],
    limits: {
      scanPageCalls: 8,
      resultPageParts: 16,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      capacity: STORE_CAPACITY,
    },
    authority: {
      authorize: ({ access, action }) =>
        access.principal === principal && tenantEquals(access.tenant, scope)
          ? { ok: { owner: 'runtime-cancel-identity', subject: principal.subject, revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: given =>
        tenantEquals(given.tenant, scope)
          ? { ok: { owner: 'runtime-cancel-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    evidence: [
      {
        adoption: ADOPTION,
        continuity: given =>
          given.source.owner === 'runtime-cancel-host' && given.source.record === given.call
            ? { ok: given.source }
            : unavailable(),
        materialization: given => ({
          ok: {
            owner: 'runtime-cancel-host',
            record: `${given.call}/${given.dispatch}`,
            revision: '1',
            digest: '1'.repeat(64),
          },
        }),
        receive: given => ({
          ok: {
            window: given.window,
            batchDigest: given.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: unavailable,
        retry: unavailable,
        handoff: unavailable,
      },
    ],
    sending: {
      maxRetainedAttempts: 4,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'unavailable' }),
      },
      sources: request.suppliers.map(supplier => ({
        profile: request.profile,
        supplier: supplier.adoption,
        recipient: supplier.recipient,
        model: supplier.model,
        credential: {
          kind: 'factory',
          official: true,
          queryId: decoded(decodeCredentialId('runtime-cancel-query')),
        },
        current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
      })),
    },
  })
  const inner = memory.dependencies.commands
  const commands: ModelCommands<typeof principal> = {
    ...inner,
    settle: async input => {
      log.push(`settle:${input.call}`)
      return inner.settle(input)
    },
  }
  const custodian = createLocalCustodian({
    path: join(directory, `${label}.vault.json`),
    factorySecret: PLACEHOLDER,
  })
  const host = assembleLocalModel({
    credentials: custodian,
    commands,
    coordinator: memory.controls.send.coordinator,
    families: FAMILIES,
    network: {
      maxConnections: 4,
      idleConnectionTimeoutMs: 60_000,
      tls: { ca: certificate.cert },
      diagnostics: {
        maxPending: 64,
        observer: event => {
          if (event.kind === 'exchange-stopped') log.push('exchange-stopped')
        },
      },
    },
    routes: {
      openrouter: { url: new URL(ROUTE_PATH, server.url).href, endMarker: GATEWAY_END_MARKER },
    },
    transportLimits: TRANSPORT_LIMITS,
    maxRetainedAttempts: 4,
    preparation: { maxCitedCalls: 8, supplierOf: factorySupplier() },
  })
  const provider = createModelRuntime(
    { ...memory.dependencies, commands, send: host.send },
    CONFIGURATION,
  )
  const access = { principal, tenant: scope }
  const op = (name: string) => decoded(decodeModelOperationId(`mop_${name}-${label}`))

  /** Admits the call and starts its drive; the drive resolves when the call is settled. */
  async function start(name: string) {
    const call = decoded(decodeModelCallId(`mcall_${name}-${label}`))
    const admitted = decoded(
      await provider.runtime.calls.admit({
        ...access,
        call,
        operation: op(`admit-${name}`),
        request,
        consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'cancel-test' },
        capacity: CAPACITY,
      }),
    )
    const driven = provider.driver.drive(
      {
        ...access,
        call,
        instance: decoded(decodeModelInstanceId(`minst_${name}-${label}`)),
        operation: op(`claim-${name}`),
        continuity: {
          owner: 'runtime-cancel-host',
          record: call,
          revision: '1',
          digest: '1'.repeat(64),
        },
      },
      new AbortController().signal,
    )
    return { call, reference: admitted.reference, driven }
  }

  async function stateOf(reference: ModelInvocationRef) {
    const lookup = decoded(await provider.runtime.calls.inspect({ ...access, reference }))
    if (lookup.kind !== 'found') throw new Error('the call is not found')
    return lookup.state
  }

  /** Waits until the first content of the call is saved: the stream is running. */
  async function running(reference: ModelInvocationRef): Promise<void> {
    await eventually(async () => {
      const state = await stateOf(reference)
      return state.phase === 'running' && state.firstContent === 'observed'
    }, 'the first content to be saved')
  }

  async function partsOf(call: ModelCallId, reference: ModelInvocationRef) {
    const state = await stateOf(reference)
    if (state.phase !== 'settled') throw new Error('the call is not settled')
    const begun = decoded(
      await provider.runtime.consumption.beginRead({
        ...access,
        reference,
        operation: op(`read-${call}`),
        result: state.settlement.version,
      }),
    )
    if (begun.kind !== 'started' || begun.value.kind !== 'reading')
      throw new Error('the result is not readable')
    const parts: ResultPart[] = [...begun.value.page.parts]
    decoded(await provider.runtime.consumption.closeRead({ ...access, call, read: begun.read }))
    return parts
  }

  return {
    access,
    log,
    op,
    provider,
    start,
    stateOf,
    running,
    partsOf,
    dispatchesOf: async (call: ModelCallId) => decoded(await inner.dispatches({ ...access, call })),
    async close() {
      try {
        await host.close()
      } finally {
        custodian.close()
      }
    },
  }
}

function textOf(parts: readonly ResultPart[]): string {
  return parts
    .map(part =>
      part.kind === 'partial' ? part.value : part.block.kind === 'text' ? part.block.text : '',
    )
    .join('')
}

describe('calls.cancel on a running supplier stream', () => {
  it('stops the stream; the termination comes after the physical stop and keeps the content', async () => {
    const local = assembleHost('stop')
    try {
      const first = held.length
      const a = await local.start('a')
      await local.running(a.reference)
      const response = held[first]
      if (response === undefined) throw new Error('the request did not reach the server')

      const cancelled = decoded(
        await local.provider.runtime.calls.cancel({
          ...local.access,
          call: a.call,
          operation: local.op('cancel-a'),
        }),
      )
      expect(cancelled).toMatchObject({ kind: 'requested', operation: local.op('cancel-a') })

      // The drive ends only because the stream stopped: the server never finishes this answer.
      expect(await within(a.driven, 5_000, 'the settlement of the cancelled call')).toEqual({
        ok: undefined,
      })
      await within(response.closed, 5_000, 'the close of the response at the server')

      // The termination is the interruption of this cancel, given after the physical stop.
      const state = await local.stateOf(a.reference)
      expect(state.phase).toBe('settled')
      if (state.phase !== 'settled') return
      expect(state.settlement.termination).toEqual({
        kind: 'interrupted',
        control: local.op('cancel-a'),
      })
      const stopped = local.log.indexOf('exchange-stopped')
      const settled = local.log.indexOf(`settle:${a.call}`)
      expect(stopped).toBeGreaterThanOrEqual(0)
      expect(settled).toBeGreaterThan(stopped)

      // The content delivered before the cancel stays in the result; the cost stays unknown, not zero.
      expect(textOf(await local.partsOf(a.call, a.reference))).toBe('partial answer')
      const [dispatch] = await local.dispatchesOf(a.call)
      expect(dispatch?.terminal).toEqual({ kind: 'interrupted', control: local.op('cancel-a') })
      expect(dispatch?.account).toBeNull()
    } finally {
      for (const response of held) response.finish()
      await local.close()
    }
  })

  it('leaves another running call of the same tenant to finish on its own', async () => {
    const local = assembleHost('other')
    try {
      const first = held.length
      const a = await local.start('a')
      await local.running(a.reference)
      const b = await local.start('b')
      await local.running(b.reference)
      const [responseA, responseB] = held.slice(first)
      if (responseA === undefined || responseB === undefined)
        throw new Error('the requests did not reach the server')

      decoded(
        await local.provider.runtime.calls.cancel({
          ...local.access,
          call: a.call,
          operation: local.op('cancel-a'),
        }),
      )
      await within(a.driven, 5_000, 'the settlement of the cancelled call')
      await within(responseA.closed, 5_000, 'the close of the cancelled response')

      // B is still streaming: its response is open and its call is not settled.
      expect((await local.stateOf(b.reference)).phase).toBe('running')
      const raced = await Promise.race([
        responseB.closed.then(() => 'closed'),
        new Promise(resolve => setTimeout(() => resolve('open'), 100)),
      ])
      expect(raced).toBe('open')

      responseB.finish()
      expect(await within(b.driven, 5_000, 'the completion of the other call')).toEqual({
        ok: undefined,
      })
      const state = await local.stateOf(b.reference)
      if (state.phase !== 'settled') throw new Error('the other call is not settled')
      expect(state.settlement.termination).toEqual({ kind: 'completed', reason: 'stop' })
      expect(state.control).toEqual({ kind: 'none' })
      const [dispatch] = await local.dispatchesOf(b.call)
      expect(payableAmount(dispatch?.account)).toMatchObject({ ok: { state: 'known' } })
    } finally {
      for (const response of held) response.finish()
      await local.close()
    }
  })

  it('gives one termination when the cancel and the natural completion arrive together', async () => {
    const local = assembleHost('race')
    try {
      const first = held.length
      const a = await local.start('a')
      await local.running(a.reference)
      const response = held[first]
      if (response === undefined) throw new Error('the request did not reach the server')

      response.finish()
      const cancelled = await local.provider.runtime.calls.cancel({
        ...local.access,
        call: a.call,
        operation: local.op('cancel-a'),
      })
      expect('ok' in cancelled).toBe(true)
      expect(await within(a.driven, 5_000, 'the settlement of the raced call')).toEqual({
        ok: undefined,
      })

      // One settle, and the one termination is what the stream really did.
      expect(local.log.filter(entry => entry === `settle:${a.call}`)).toHaveLength(1)
      const state = await local.stateOf(a.reference)
      if (state.phase !== 'settled') throw new Error('the raced call is not settled')
      const [dispatch] = await local.dispatchesOf(a.call)
      expect(dispatch?.terminal).toEqual(state.settlement.termination)
      const termination = state.settlement.termination
      if (termination.kind === 'completed') {
        expect(termination).toEqual({ kind: 'completed', reason: 'stop' })
        expect(payableAmount(dispatch?.account)).toMatchObject({ ok: { state: 'known' } })
      } else {
        expect(termination).toEqual({ kind: 'interrupted', control: local.op('cancel-a') })
        expect(dispatch?.account).toBeNull()
      }
    } finally {
      for (const response of held) response.finish()
      await local.close()
    }
  })
})
