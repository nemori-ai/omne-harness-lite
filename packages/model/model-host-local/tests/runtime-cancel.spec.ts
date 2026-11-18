// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
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
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { assembleLocalModel } from '@omne-harness/model-host-local'
import { createTestCredentials } from './support/credentials.ts'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import {
  FAMILIES,
  PLACEHOLDER,
  TRANSPORT_LIMITS,
  isGatewayPath,
  gatewayEndpoints,
} from './support/local-host.ts'
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
  cleanupRetryMs: 0,
}

function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`refused: ${JSON.stringify(outcome.failure)}`)
}

const record = OPENAI_RECORDS.find(item => item.name === 'openai/gpt-6-sol')
if (record === undefined) throw new Error('no record openai/gpt-6-sol')
const { request } = readRecordFixture('pi-ai-openai', record)

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
// The record speaks the Responses interface: a text item opens, then the stream is held.
const ITEM = { id: 'msg_1', type: 'message', role: 'assistant', phase: 'final_answer' }
const PART = { type: 'output_text', text: '', annotations: [] }
const HEAD = [
  { type: 'response.created', response: { id: 'resp_1', model: 'openai/gpt-6-sol', output: [] } },
  { type: 'response.output_item.added', output_index: 0, item: { ...ITEM, content: [] } },
  { type: 'response.content_part.added', output_index: 0, content_index: 0, part: PART },
  {
    type: 'response.output_text.delta',
    output_index: 0,
    content_index: 0,
    delta: 'partial answer',
  },
]
  .map(sse)
  .join('')
const DONE_PART = { ...PART, text: 'partial answer' }
const TAIL =
  [
    {
      type: 'response.output_text.done',
      output_index: 0,
      content_index: 0,
      text: 'partial answer',
    },
    { type: 'response.content_part.done', output_index: 0, content_index: 0, part: DONE_PART },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: { ...ITEM, status: 'completed', content: [DONE_PART] },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_1',
        model: 'openai/gpt-6-sol',
        status: 'completed',
        output: [{ ...ITEM, status: 'completed', content: [DONE_PART] }],
        usage: {
          input_tokens: 12,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 3,
          output_tokens_details: { reasoning_tokens: 0 },
          cost: 0.000042,
        },
      },
    },
  ]
    .map(sse)
    .join('') + 'data: [DONE]\n\n'

type Held = Readonly<{
  closed: Promise<void>
  finish(): void
}>

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
const held: Held[] = []
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-cancel-')))
  server = await startHttpsServer(certificate, (res: ServerResponse, received) => {
    if (!isGatewayPath(received.path)) {
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
      unacknowledgedResults: 10,
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
        layerOf: () => ({ failure: { kind: 'unavailable' } }),
        resolve: () => ({ failure: { kind: 'unavailable' } }),
      },
      sources: request.suppliers.map(supplier => ({
        profile: request.profile,
        supplier: supplier.adoption,
        provider: supplier.provider,
        model: supplier.model,
        official: true,
        current: () => ({ ok: { authorized: true } }),
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
  const credentials = createTestCredentials<typeof principal>({
    path: join(directory, `${label}.vault.json`),
    secret: PLACEHOLDER,
    providers: ['openrouter'],
  })
  const host = assembleLocalModel({
    credentials: credentials.port,
    materialization: {
      maxRecords: 4,
      execution: reference =>
        tenantEquals(reference.tenant, scope)
          ? { ok: { owner: 'runtime-cancel-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
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
      openrouter: {
        endpoints: gatewayEndpoints(server.url),
        accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
        auth: { kind: 'bearer', item: 'apiKey' },
      },
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

  async function start(name: string) {
    const call = decoded(decodeModelCallId(`mcall_${name}-${label}`))
    const admitted = decoded(
      await provider.runtime.calls.admit({
        ...access,
        call,
        operation: op(`admit-${name}`),
        request,
        consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'cancel-test' },
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
        credentials.close()
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

      expect(await within(a.driven, 5_000, 'the settlement of the cancelled call')).toEqual({
        ok: undefined,
      })
      await within(response.closed, 5_000, 'the close of the response at the server')

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
