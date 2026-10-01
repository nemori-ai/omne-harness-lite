import { imagePreparation } from './image-transport-support.ts'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import type { ServerResponse } from 'node:http'
import { resolve, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  createOfficialProfileContent,
  createModelTransportService,
  createPiAiTransport,
  type ModelDefinition,
  type ModelTransportService,
  type AdaptationLease,
  type InputMeter,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { input, message, networkPolicy, policy, content, finish, sse } from './support.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

const root = resolve(import.meta.dirname, '../../../..')
const evidence = join(root, 'tmp/d4-acceptance')
let certificate: { key: Buffer; cert: Buffer }
beforeAll(() => {
  mkdirSync(evidence, { recursive: true })
  const dir = mkdtempSync(join(evidence, 'tls-'))
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  certificate = {
    key: readFileSync(join(dir, 'key.pem')),
    cert: readFileSync(join(dir, 'cert.pem')),
  }
})
const waiting: RetirementPolicy = {
  waitMilliseconds: 20,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
function definition(): ModelDefinition {
  const value = anthropicDefinitions.find(x => x.modelId === 'anthropic/claude-sonnet-5')
  if (!value) throw Error('official declaration missing')
  return value
}
function nextDefinition(): ModelDefinition {
  const previous = definition()
  // Trusted custom contribution, explicitly new executable and declaration identities.
  return {
    ...previous,
    revision: 'd4-custom-B',
    implementation: { ...previous.implementation, revision: 'd4-implementation-B' },
  }
}
function request(def: ModelDefinition, revision = 'd4-configuration'): PlanInput {
  const profile = createOfficialProfileContent(def, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: {
      revision,
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  return {
    ...input(),
    routeName: def.modelId,
    provider: 'anthropic',
    messages: [message('user', 'a retained prefix', 'd4-input')],
    parameters: { maxOutputTokens: 64 },
    snapshot: {
      ...input().snapshot,
      ...def.capabilities,
      adaptation: profile.ok.adaptation,
      providers: ['anthropic'],
      allowFallback: false,
    },
  }
}
function observedMeter(def: ModelDefinition) {
  // The family meter measures against its own closed-over identity, so it cannot be relabelled for
  // a custom definition: the official declaration keeps the real meter, a custom one gets its own.
  const real = anthropicDefinitions.includes(def)
    ? createAnthropicInputMeter(def)
    : syntheticInputMeter(def, 'anthropic')
  const full = vi.fn(real.measureFull),
    phi = vi.fn(real.measureReplay),
    delta = vi.fn(real.measureNew)
  const meter: InputMeter = {
    ...real,
    measureFull: full,
    measureReplay: phi,
    measureNew: delta,
  }
  return { meter, full, phi, delta }
}
function acquire(service: ModelTransportService, value: PlanInput): AdaptationLease {
  const acquired = service.acquire(value.snapshot.adaptation, value.routeName)
  if ('rejected' in acquired) throw Error(`acquire ${acquired.rejected}`)
  return acquired.lease
}
function latch() {
  let resolve = () => {}
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}
async function host(handler: (res: ServerResponse, index: number) => void) {
  const requests: string[] = []
  let closed = 0
  const server = createServer(certificate, (req, res) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      requests.push(Buffer.concat(chunks).toString())
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      handler(res, requests.length)
    })().catch(() => res.destroy())
  })
  server.on('secureConnection', socket =>
    socket.once('close', () => {
      closed++
    }),
  )
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('TLS address missing')
  return {
    requests,
    closed: () => closed,
    options: {
      policy: networkPolicy,
      baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
      tls: { ca: certificate.cert },
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>((r, j) => server.close(e => (e ? j(e) : r())))
    },
  }
}
function response() {
  return (
    content('retained answer') +
    sse({
      choices: [],
      model: definition().modelId,
      provider: 'Anthropic',
      usage: {
        prompt_tokens: 71,
        completion_tokens: 4,
        prompt_tokens_details: { cached_tokens: 13, cache_write_tokens: 2 },
      },
    }) +
    finish()
  )
}
async function invoke(lease: AdaptationLease, value: PlanInput) {
  const handle = invokeModel({
    ...value,
    transport: lease.transport,
    credential: 'd4-local-only',
    signal: new AbortController().signal,
    policy: policy(),
  })
  const result = await handle.outcome
  if (!('outcome' in result) || result.outcome !== 'complete') throw Error(JSON.stringify(result))
  return result
}
function nextRequest(value: PlanInput, result: Awaited<ReturnType<typeof invoke>>): PlanInput {
  const reply = judgeMessage({
    type: 'assistant',
    id: 'd4-reply',
    response: 'd4-response',
    ending: 'complete',
    createdAt: '2026-09-29T00:00:00Z',
    blocks: result.blocks,
  })
  if (!('ok' in reply)) throw Error('reply fixture invalid')
  return {
    ...value,
    calibration: {
      kind: 'observation',
      inputCalibration: result.inputCalibration,
      usage: result.usage,
      outputBlocks: result.blocks,
      replaySelection: result.blocks.map((_, sourceBlockIndex) => ({
        sourceBlockIndex,
        messageIndex: value.messages.length,
        blockIndex: sourceBlockIndex,
      })),
    },
    messages: [...value.messages, reply.ok, message('user', 'a distinct next question', 'd4-next')],
  }
}
async function plan(lease: AdaptationLease, value: PlanInput) {
  const result = await lease.transport.plan(value, { signal: new AbortController().signal })
  if ('rejected' in result) throw Error(JSON.stringify(result))
  return result.planned
}
function provider(service: ModelTransportService): Plugin.Object {
  return {
    name: 'd4-real-registry-host',
    apply(ctx) {
      ctx.provide(MODEL_TRANSPORT_SERVICE, service)
    },
  }
}

describe('D4 independent production contributions', () => {
  it('D4-A pure root and plugin imports perform zero network operations', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import net from 'node:net'; import tls from 'node:tls'; import http from 'node:http'; import https from 'node:https';
      let calls=0; const forbidden=()=>{calls++;throw Error('network during import')};
      net.connect=forbidden; net.createConnection=forbidden; net.Socket.prototype.connect=forbidden;
      tls.connect=forbidden; http.request=forbidden; http.get=forbidden; https.request=forbidden; https.get=forbidden; globalThis.fetch=forbidden;
      await import('@omne-harness-lite/pi-ai-transport'); await import('@omne-harness-lite/pi-ai-transport/plugin');
      if(calls!==0) throw Error('swallowed network attempt'); console.log('imports: network=0');
    `,
      ],
      { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
    )
    expect(output.trim()).toBe('imports: network=0')
  })

  it('D4-C old A phi and reader stay on A after B publication; B rejects the A calibration basis', async () => {
    const endpoint = await host(res => res.end(response()))
    const service = createModelTransportService(endpoint.options),
      ctx = new Context()
    const a = definition(),
      b = nextDefinition(),
      meterA = observedMeter(a),
      meterB = observedMeter(b)
    const leases: AdaptationLease[] = []
    try {
      await ctx.plugin(provider(service))
      const contributionA = ctx.plugin(createModelPlugin(a, meterA.meter, waiting), {})
      await contributionA
      const original = await request(a),
        leaseA = acquire(service, original)
      leases.push(leaseA)
      const first = await invoke(leaseA, original)
      expect(first.inputCalibration.requestInput).toMatchObject({
        kind: 'known',
        countingBasis: { binding: original.snapshot.adaptation },
      })
      expect(first.inputCalibration.observedInput).toMatchObject({
        kind: 'from_usage',
        provenance: { adapterRevision: 'openrouter-usage-reader/2' },
      })
      const contributionB = ctx.plugin(createModelPlugin(b, meterB.meter, waiting), {})
      await contributionB
      const retiringA = contributionA.dispose()
      await expect.poll(() => service.inspect().retiring).toBe(1)
      expect(service.acquire(original.snapshot.adaptation, original.routeName)).toEqual({
        rejected: 'unavailable',
      })
      const continuation = nextRequest(original, first),
        leaseB = acquire(service, await request(b))
      leases.push(leaseB)
      const oldPlan = await plan(leaseA, continuation)
      expect(oldPlan.measurement.mode).toBe('marginal')
      expect(meterA.phi).toHaveBeenCalledTimes(1)
      expect(meterA.delta).toHaveBeenCalledTimes(1)
      expect(meterB.phi).not.toHaveBeenCalled()
      expect(meterB.delta).not.toHaveBeenCalled()
      expect(JSON.stringify(meterA.phi.mock.calls[0])).toContain('retained answer')
      expect(JSON.stringify(meterA.phi.mock.calls[0])).not.toContain('a retained prefix')
      const bRequest = { ...continuation, snapshot: (await request(b)).snapshot }
      const newPlan = await plan(leaseB, bRequest)
      expect(newPlan.measurement).toMatchObject({ mode: 'full', fallbackReason: 'basis_changed' })
      expect(meterB.full).toHaveBeenCalledTimes(1)
      expect(meterB.phi).not.toHaveBeenCalled()
      expect(
        await leaseA.transport.plan(bRequest, { signal: new AbortController().signal }),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      const after = await invoke(leaseA, continuation)
      expect(after.inputCalibration.requestInput).toMatchObject({
        kind: 'known',
        countingBasis: { binding: original.snapshot.adaptation },
      })
      expect(after.inputCalibration.observedInput).toEqual(first.inputCalibration.observedInput)
      expect(endpoint.requests).toHaveLength(2)
      expect(meterA.phi).toHaveBeenCalledTimes(2)
      expect(meterB.phi).not.toHaveBeenCalled()
      const afterB = await invoke(leaseB, bRequest)
      expect(afterB.inputCalibration.requestInput).toMatchObject({
        kind: 'known',
        countingBasis: { binding: bRequest.snapshot.adaptation },
      })
      expect(afterB.inputCalibration.observedInput).toEqual(first.inputCalibration.observedInput)
      expect(meterB.phi).not.toHaveBeenCalled()
      expect(endpoint.requests).toHaveLength(3)
      // A public factory uses the exact same fixed contribution as the service.
      const direct = createPiAiTransport({
        ...endpoint.options,
        definitions: [a],
        inputMeters: [meterA.meter],
      })
      try {
        const planned = await direct.plan(continuation, { signal: new AbortController().signal })
        if ('rejected' in planned) throw Error(JSON.stringify(planned))
        expect(planned.planned.serialized).toBe(oldPlan.serialized)
        expect(planned.planned.measurement).toEqual(oldPlan.measurement)
        const result = await invokeModel({
          ...continuation,
          transport: direct,
          credential: 'd4-local-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({
          outcome: 'complete',
          inputCalibration: after.inputCalibration,
          usage: after.usage,
        })
      } finally {
        await direct.close()
      }
      leaseA.release()
      await retiringA
      expect(service.inspect()).toMatchObject({ registrations: 1, retiring: 0 })
    } finally {
      for (const lease of leases) lease.release()
      await ctx.fiber.dispose()
      await service.close({ ...waiting, force: true })
      await service.closed
      await endpoint.close()
    }
  })

  it('D4-D same binding with different phi is rejected even after retirement', async () => {
    const service = createModelTransportService({ imagePreparation, policy: networkPolicy }),
      def = definition(),
      meter = observedMeter(def)
    const owner = {},
      cleanup = vi.fn()
    const first = service.registerAdaptation(def, meter.meter, owner, cleanup)
    if ('rejected' in first) throw Error('first registration failed')
    try {
      expect(service.registerAdaptation(def, meter.meter, owner, cleanup)).toEqual(first)
      const changed = { ...meter.meter, measureReplay: vi.fn(meter.meter.measureReplay) }
      expect(service.registerAdaptation(def, changed, owner, cleanup)).toEqual({
        rejected: 'invalidInput',
      })
      expect(service.inspect().registrations).toBe(1)
      expect(await service.retire(first.registered, waiting)).toEqual({ retired: true })
      expect(service.registerAdaptation(def, changed, owner, cleanup)).toEqual({
        rejected: 'invalidInput',
      })
      expect(cleanup).toHaveBeenCalledTimes(1)
    } finally {
      await service.close({ ...waiting, force: true })
      await service.closed
    }
  })

  it('D4-E same configuration label never permits different values on an existing lease', async () => {
    const service = createModelTransportService({ imagePreparation, policy: networkPolicy })
    const originalDefinition = nextDefinition(),
      route = originalDefinition.routes.anthropic!
    const def: ModelDefinition = {
      ...originalDefinition,
      routes: {
        anthropic: {
          ...route,
          cache: {
            mode: 'explicit',
            ttlValues: ['1h'],
            breakpointLayouts: [['last_message'], ['system']],
          },
        },
      },
    }
    const registered = service.registerAdaptation(def, observedMeter(def).meter, {}, () => {})
    if ('rejected' in registered) throw Error('registration failed')
    const original = await request(def),
      lease = acquire(service, original)
    try {
      // This custom declaration approves two layouts. No upstream capability claim is made.
      const changed: PlanInput = {
        ...original,
        snapshot: {
          ...original.snapshot,
          adaptation: {
            ...original.snapshot.adaptation,
            configuration: {
              revision: original.snapshot.adaptation.configuration.revision,
              values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['system'] } },
            },
          },
        },
      }
      const other = service.acquire(changed.snapshot.adaptation, changed.routeName)
      expect('lease' in other).toBe(true)
      if ('lease' in other) {
        expect(other.lease.binding.configuration.values).not.toEqual(
          lease.binding.configuration.values,
        )
        other.lease.release()
      }
      expect(await lease.transport.plan(changed, { signal: new AbortController().signal })).toEqual(
        {
          rejected: 'invalidInput',
          reason: 'malformed',
        },
      )
      expect((await plan(lease, original)).requestInput).toMatchObject({
        kind: 'known',
        countingBasis: { binding: original.snapshot.adaptation },
      })
      const malformed = {
        ...original.snapshot.adaptation,
        configuration: {
          revision: 'bad',
          values: { cache: { mode: 'explicit', ttl: '9h', breakpoints: ['last_message'] } },
        },
      }
      expect(service.acquire(malformed, original.routeName)).toEqual({ rejected: 'invalidInput' })
      const absent = {
        ...original.snapshot.adaptation,
        definition: { modelId: def.modelId, revision: 'absent' },
      }
      expect(service.acquire(absent, original.routeName)).toEqual({ rejected: 'unavailable' })
    } finally {
      lease.release()
      await service.close({ ...waiting, force: true })
      await service.closed
    }
  })

  it('D4-F/G a failing new instance and failed contribution cannot erase a held old HTTPS reader; retirement waits then cleans once', async () => {
    const entered = latch()
    let finishHeld = () => {}
    const endpoint = await host(res => {
      res.write(content('held old reader'))
      finishHeld = () => {
        if (!res.writableEnded) res.end(response())
      }
      entered.resolve()
    })
    const oldService = createModelTransportService(endpoint.options),
      newService = createModelTransportService(endpoint.options)
    const ctx = new Context(),
      def = definition(),
      cleanup = vi.fn()
    const registered = oldService.registerAdaptation(
      def,
      createAnthropicInputMeter(def),
      {},
      cleanup,
    )
    if ('rejected' in registered) throw Error('old registration failed')
    const old = acquire(oldService, await request(def))
    let outcome: ReturnType<typeof invoke> | undefined
    try {
      outcome = invoke(old, await request(def))
      void outcome.catch(() => {})
      await entered.promise
      await ctx.plugin(provider(newService))
      const invalidMeter = { ...createAnthropicInputMeter(def), provider: 'not-a-declared-route' }
      const failed = ctx.plugin(createModelPlugin(def, invalidMeter, waiting), {})
      await expect(Promise.resolve(failed)).rejects.toThrow('model contribution rejected')
      expect(newService.inspect()).toMatchObject({ registrations: 0, references: 0, executions: 0 })
      expect(oldService.inspect().executions).toBeGreaterThan(0)
      const alsoFailed = oldService.registerAdaptation(
        def,
        { ...createAnthropicInputMeter(def), algorithmRevision: 'wrong-same-binding' },
        {},
        () => {},
      )
      expect(alsoFailed).toEqual({ rejected: 'invalidInput' })
      const waitResult = await oldService.retire(registered.registered, waiting)
      expect(waitResult).toMatchObject({ remaining_active: true, references: 1 })
      expect(oldService.acquire((await request(def)).snapshot.adaptation, def.modelId)).toEqual({
        rejected: 'unavailable',
      })
      expect(cleanup).not.toHaveBeenCalled()
      finishHeld()
      const result = await outcome
      expect(result.outcome).toBe('complete')
      old.release()
      old.release()
      expect(await oldService.retire(registered.registered, waiting)).toEqual({ retired: true })
      expect(oldService.inspect()).toMatchObject({ registrations: 0, references: 0, executions: 0 })
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(await oldService.retire(registered.registered, waiting)).toEqual({ retired: true })
      expect(cleanup).toHaveBeenCalledTimes(1)
    } finally {
      finishHeld()
      if (outcome) await Promise.allSettled([outcome])
      old.release()
      await ctx.fiber.dispose()
      await newService.close({ ...waiting, force: true })
      await oldService.close({ ...waiting, force: true })
      await Promise.all([oldService.closed, newService.closed])
      await endpoint.close()
    }
  })

  it('D4-F forced retirement cancels a real active TLS reader and cleans only after its outcome and release', async () => {
    const endpoint = await host(res => {
      res.write(content('before force'))
    })
    const service = createModelTransportService(endpoint.options),
      def = definition(),
      cleanup = vi.fn()
    const registered = service.registerAdaptation(def, createAnthropicInputMeter(def), {}, cleanup)
    if ('rejected' in registered) throw Error('registration failed')
    const lease = acquire(service, await request(def))
    const handle = invokeModel({
      ...(await request(def)),
      transport: lease.transport,
      credential: 'd4-local-only',
      signal: new AbortController().signal,
      policy: policy(),
    })
    try {
      // response.stopped and read-generator completion are distinct retained work.
      await expect.poll(() => service.inspect().executions).toBeGreaterThanOrEqual(2)
      const retirement = await service.retire(registered.registered, { ...waiting, force: true })
      expect(retirement).toHaveProperty('remaining_active', true)
      expect(lease.signal.aborted).toBe(true)
      expect(cleanup).not.toHaveBeenCalled()
      expect(await handle.outcome).toMatchObject({ outcome: 'interrupted' })
      expect(service.inspect().executions).toBe(0)
      lease.release()
      lease.release()
      expect(await service.retire(registered.registered, waiting)).toEqual({ retired: true })
      expect(cleanup).toHaveBeenCalledTimes(1)
      await expect.poll(endpoint.closed).toBeGreaterThanOrEqual(1)
    } finally {
      handle.abort()
      await handle.outcome
      lease.release()
      await service.close({ ...waiting, force: true })
      await service.closed
      await endpoint.close()
    }
  })

  it('D4-F force is not a completion acknowledgement for retained callback work', async () => {
    const service = createModelTransportService({ imagePreparation, policy: networkPolicy }),
      def = definition(),
      cleanup = vi.fn(),
      callback = latch()
    const registered = service.registerAdaptation(def, createAnthropicInputMeter(def), {}, cleanup)
    if ('rejected' in registered) throw Error('registration failed')
    const lease = acquire(service, await request(def))
    lease.track(callback.promise)
    lease.release()
    try {
      expect(await service.retire(registered.registered, { ...waiting, force: true })).toEqual({
        remaining_active: true,
        references: 1,
        executions: 1,
      })
      expect(lease.signal.aborted).toBe(true)
      expect(cleanup).not.toHaveBeenCalled()
      callback.resolve()
      expect(await service.retire(registered.registered, waiting)).toEqual({ retired: true })
      expect(cleanup).toHaveBeenCalledTimes(1)
    } finally {
      callback.resolve()
      lease.release()
      await service.close({ ...waiting, force: true })
      await service.closed
    }
  })
})
