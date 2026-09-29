import sharp from 'sharp'
import { createServer } from 'node:https'
import { MODEL_TRANSPORT_SERVICE } from '@omne-harness-lite/pi-ai-transport/plugin'
import type { ModelTransportService } from '@omne-harness-lite/pi-ai-transport'
import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  type InputMeter,
} from '@omne-harness-lite/pi-ai-transport'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { ModelResponse } from '@omne-harness-lite/model-response'
import { randomBytes } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  open,
  type FileHandle,
} from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import {
  createAcceptanceApplication,
  createDemoDefaultRetryConfiguration,
  type AcceptanceConfig,
  type ModelRequestDeployment,
} from '../src/index.ts'
import {
  createSharpImageCodec,
  modelImageBalancedV1,
  createOfficialProfileContent,
  createDeepSeekV4ProInputMeter,
  deepseekV4Pro0813Definition,
  deepseekV4Pro0813Configuration,
} from '@omne-harness-lite/pi-ai-transport'
import { openRouterCredentialRedactionConfig } from '@omne-harness-lite/model-request-runtime'
import { judgeMessage } from '@omne-harness-lite/messages'
import { actor, ref, duration, activateModelFixture } from './support.ts'
import { ROOT, publication, demoRetirement } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'

const model = deepseekV4Pro0813Definition
const evidence = resolve(import.meta.dirname, '../../../tmp/calibration-acceptance')
function official() {
  const result = createOfficialProfileContent(model, {
    providers: ['deepinfra/fp8'],
    allowFallback: false,
    configuration: deepseekV4Pro0813Configuration,
  })
  if ('rejected' in result) throw Error('official profile invalid')
  return result.ok
}
function realService<T>(value: unknown, functions: readonly string[]): T {
  if (
    !value ||
    typeof value !== 'object' ||
    functions.some(name => !(name in value) || typeof Reflect.get(value, name) !== 'function')
  )
    throw Error('actual service interface absent')
  return value as T
}
async function deployment(label: string): Promise<AcceptanceConfig> {
  await mkdir(evidence, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(evidence, `${label}-`)),
    activation = generateHandoffKeyPair(),
    purge = generateHandoffKeyPair()
  const keys = {
    activationSigning: join(dir, 'activation.pem'),
    activationVerification: join(dir, 'activation-public.pem'),
    purgeSigning: join(dir, 'purge.pem'),
    purgeVerification: join(dir, 'purge-public.pem'),
    modelReplica: join(dir, 'model-key'),
  }
  for (const [file, bytes] of [
    [keys.activationSigning, activation.privateKeyPem],
    [keys.activationVerification, activation.publicKeyPem],
    [keys.purgeSigning, purge.privateKeyPem],
    [keys.purgeVerification, purge.publicKeyPem],
    [keys.modelReplica, randomBytes(32)],
  ] as const)
    await writeFile(file, bytes, { mode: 0o600, flag: 'wx' })
  return {
    runId: label,
    databaseFile: join(dir, 'db.sqlite'),
    keys,
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: duration(60000) },
    governance: {
      invitationTtlDefault: duration(60000),
      affiliationRequestTtlDefault: duration(60000),
      teamCreationKeyRetention: duration(60000),
    },
    officialManifest: { ordinal: 1, entries: [official()] },
    wait: {
      clockTimeoutMs: 15000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint()) / 1000000,
      sleep: async ms => {
        await new Promise<void>(r => setTimeout(r, ms))
      },
    },
  }
}
async function callConfig(
  label: string,
): Promise<AcceptanceConfig & { modelRequest: ModelRequestDeployment }> {
  const base = await deployment(label),
    dir = resolve(base.databaseFile, '../logs')
  await mkdir(dir, { mode: 0o700 })
  const credentialRedaction = openRouterCredentialRedactionConfig
  let publicationOrdinal = 0
  return {
    ...base,
    sessionLog: {
      dir,
      processOwnership: {
        current: label,
        async observeExit() {
          return 'unknown'
        },
      },
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
    },
    modelRequest: {
      maxScopes: 64,
      tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
      defaultRetry: createDemoDefaultRetryConfiguration(),
      registryPolicy: { maxRetries: 2, maxInFlight: 8 },
      evaluationInputs: {
        storeKey: label,
        deployedOfficial: [{ capability: ROOT, meta: false }],
        monotonicNow: () => process.hrtime.bigint(),
        async prepare(who) {
          const expectedRevision = publicationOrdinal === 0 ? null : String(publicationOrdinal)
          publicationOrdinal++
          return {
            publication: publication(who, expectedRevision),
            recipe: { rootDefinition: ROOT },
          }
        },
      },
      transport: {
        imagePreparation: { policy: modelImageBalancedV1, codec: createSharpImageCodec(sharp) },
        definitions: [model],
        inputMeters: [createDeepSeekV4ProInputMeter(model)],
        policy: {
          maxConnections: 2,
          idleConnectionTimeoutMs: 5000,
          connectTimeoutMs: 5000,
          maxErrorBodyBytes: 8192,
          maxSseEventBytes: 65536,
          credentialRedaction,
        },
        retirement: demoRetirement(),
      },
      invocation: {
        now: () => '2026-09-29T00:00:00Z',
        firstContentTimeoutMs: 15000,
        idleContentTimeoutMs: 120000,
        schedule(ms, callback) {
          const timer = setTimeout(callback, ms)
          return () => clearTimeout(timer)
        },
        statusCauseTable: { '503': 'upstream_unavailable' },
        credentialRedaction,
      },
      reservationWaitPolicy: { maxWaitersPerCall: 2, timeoutMs: 5000 },
      settlement: {
        contention: {
          name: 'd4-explicit-contention',
          limits: { submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 },
          decide() {
            return { proceed: { waitMs: 0 } }
          },
        },
        scheduler: {
          nowMonotonicMs: () => Number(process.hrtime.bigint() / 1000000n),
          wait(_ms, signal) {
            return {
              completion: Promise.resolve(signal.aborted ? 'cancelled' : 'elapsed'),
              stopped: Promise.resolve(),
              requestStop() {},
            }
          },
        },
      },
    },
  }
}

function user(label: string) {
  const result = judgeMessage({
    type: 'user',
    id: `calibration-user-${label}`,
    createdAt: '2026-09-29T00:00:00Z',
    blocks: [
      {
        id: `calibration-text-${label}`,
        kind: 'text',
        text: label,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw Error('invalid user')
  return result.ok
}

type Measure = { full: string[]; replay: string[]; fresh: string[] }
async function beforeContentTls(directory: string, model: string) {
  const seed = await createLocalTls(directory)
  await seed.close()
  const key = await readFile(join(directory, 'local-key.pem')),
    cert = await readFile(join(directory, 'local-cert.pem'))
  const requests: { body: unknown; authorization: string | undefined }[] = []
  let mode = 'error'
  const server = createServer({ key, cert }, (req, res) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        if (!Buffer.isBuffer(chunk)) throw Error('body chunk')
        chunks.push(chunk)
      }
      requests.push({
        body: JSON.parse(Buffer.concat(chunks).toString()),
        authorization: req.headers.authorization,
      })
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const usage = {
        prompt_tokens: 123,
        completion_tokens: 0,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      }
      if (mode === 'error')
        res.end(
          'data: ' +
            JSON.stringify({
              choices: [],
              model,
              provider: 'Anthropic',
              usage,
              error: {
                code: 503,
                message: 'controlled failure with input observation before any content',
              },
            }) +
            '\n\n',
        )
      else
        res.end(
          'data: ' +
            JSON.stringify({
              model,
              provider: 'Anthropic',
              choices: [
                { delta: { role: 'assistant', content: 'successful retry' }, finish_reason: null },
              ],
            }) +
            '\n\ndata: ' +
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage }) +
            '\n\ndata: [DONE]\n\n',
        )
    })().catch(() => res.destroy())
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('TLS address')
  return {
    requests,
    developmentTransport: {
      baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
      tls: { ca: cert },
    },
    setMode(next: string) {
      mode = next
    },
    setUsageJson(_value: string | null | undefined) {},
    async close() {
      server.closeAllConnections()
      await new Promise<void>((r, reject) => server.close(e => (e ? reject(e) : r())))
    },
  }
}
async function ready(
  label: string,
  definition = anthropicDefinitions[0]!,
  failBeforeContent = false,
) {
  const base = await callConfig(label)
  const profile = createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: {
      revision: 'independent-calibration',
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  const calls: Measure = { full: [], replay: [], fresh: [] }
  const original = createAnthropicInputMeter(definition)
  const meter: InputMeter = {
    ...original,
    measureFull(input) {
      calls.full.push(input.serialized)
      return original.measureFull(input)
    },
    measureReplay(input) {
      calls.replay.push(JSON.stringify(input.units))
      return original.measureReplay(input)
    },
    measureNew(input) {
      calls.fresh.push(JSON.stringify(input.units))
      return original.measureNew(input)
    },
  }
  const config = {
    ...base,
    officialManifest: { ordinal: 1, entries: [profile.ok] },
    modelRequest: {
      ...base.modelRequest,
      transport: {
        ...base.modelRequest.transport,
        definitions: [definition],
        inputMeters: [meter],
      },
    },
  }
  const tls = failBeforeContent
    ? await beforeContentTls(resolve(config.databaseFile, '../tls'), definition.modelId)
    : await createLocalTls(
        resolve(config.databaseFile, '../tls'),
        async () => {},
        0,
        definition.modelId,
        JSON.stringify({
          prompt_tokens: 10000,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 2000, cache_write_tokens: 1000 },
          cost: 0.00001,
        }),
        'Anthropic',
      )
  let registry: ModelTransportService | undefined
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
    hooks: {
      async fiberCreated(name, fiber) {
        if (name !== 'modelTransport') return
        await fiber
        registry = realService(fiber.ctx.get(MODEL_TRANSPORT_SERVICE), ['inspect', 'acquire'])
      },
    },
  })
  await app.ready
  const who = await actor(app)
  const diagnostics = await activateModelFixture(app, who, config)
  const hosts: ReturnType<typeof createDemoCallHost>[] = []
  async function session(id: string) {
    const host = createDemoCallHost()
    hosts.push(host)
    const prepared = await app.prepareSession(who, id)
    if (!('session' in prepared)) throw Error('session unavailable')
    expect(await app.prepareModelInputs(who, prepared.session)).toEqual({ prepared: true })
    expect(await app.selectModel(who, prepared.session, definition.modelId)).toEqual({
      selected: definition.modelId,
    })
    expect(await app.attachModelCallHost(who, prepared.session, host)).toEqual({ attached: true })
    return { session: prepared.session, host }
  }
  expect(
    await app.publishCredential(who, async checked => ({
      account: checked.account,
      tenant: checked.tenant,
      sourceRef: ref(`${label}-key`),
      body: Buffer.from('controlled-calibration-key'),
    })),
  ).toEqual({ stored: true })
  async function turn(target: Awaited<ReturnType<typeof session>>, text: string) {
    const sent = await app.startServiceCall(who, target.session, {
      user: user(text),
      parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
      host: target.host.host,
    })
    if (!('result' in sent) || !('replyPending' in sent.result)) throw Error(JSON.stringify(sent))
    const pending = sent.result.replyPending
    const saved = await app.persistModelReply(who, target.session, pending)
    expect(saved).toHaveProperty('settled')
    return pending
  }
  return {
    app,
    registry: () => {
      if (!registry) throw Error('actual transport registry absent')
      return registry
    },
    config,
    who,
    calls,
    tls,
    session,
    turn,
    async close() {
      for (const host of hosts) await host.stop()
      await diagnostics.closeAfterBusiness(() => app.close())
      await tls.close()
    },
  }
}
async function physicalBatches(dir: string) {
  const names = (await readdir(dir, { recursive: true })).filter(name =>
    name.endsWith('entries.jsonl'),
  )
  return (
    await Promise.all(
      names.map(async name =>
        (await readFile(join(dir, name), 'utf8'))
          .split('\n')
          .filter(Boolean)
          .map(
            line =>
              JSON.parse(line) as {
                entries: {
                  payload: {
                    category: string
                    value: ModelResponse | { type?: string; response?: string }
                  }
                }[]
              },
          ),
      ),
    )
  ).flat()
}

describe('independent U4 actual service and physical SL3 batches', () => {
  for (const [index, definition] of anthropicDefinitions.entries())
    it(`${definition.modelId}: three actual TLS turns retain original calibration in physical M/R batches`, async () => {
      const f = await ready(`four-model-${index}`, definition)
      try {
        const session = await f.session(`four-model-session-${index}`)
        const calibrations = []
        for (let turn = 0; turn < 3; turn++) {
          const before = { full: f.calls.full.length, fresh: f.calls.fresh.length }
          const pending = await f.turn(session, `stable-${index}-${turn}`)
          calibrations.push(pending.inputCalibration)
          expect(pending.inputCalibration.observedInput).toMatchObject({ kind: 'from_usage' })
          expect(pending.usage).toMatchObject({ cache_read_tokens: 2000, cache_write_tokens: 1000 })
          if (pending.usage.input_tokens === 'unknown') throw Error('known exclusive input absent')
          expect(
            ExactDecimal.from(pending.usage.input_tokens).compare(ExactDecimal.from(7000)),
          ).toBe(0)
          expect(f.calls.full.length - before.full).toBe(turn === 0 ? 2 : 0)
          expect(f.calls.fresh.length - before.fresh).toBe(turn === 0 ? 0 : 2)
          if (turn > 0) expect(f.calls.fresh.at(-1)).not.toContain(`stable-${index}-0`)
        }
        const batches = await physicalBatches(f.config.sessionLog!.dir)
        const responseBatches = batches.filter(batch =>
          batch.entries.some(entry => entry.payload.category === 'response'),
        )
        expect(responseBatches).toHaveLength(3)
        for (const [index, batch] of responseBatches.entries()) {
          // One physical JSONL line is one production append batch; adjacency of decoded entries
          // alone is deliberately insufficient for this oracle.
          expect(batch.entries.map(entry => entry.payload.category)).toEqual([
            'message',
            'response',
          ])
          const response = batch.entries[1]!.payload.value as ModelResponse
          expect(response.replyDisposition).toBe('persisted')
          expect(batch.entries[0]!.payload.value).toEqual(response.reply)
          expect(response.inputCalibration).toEqual(calibrations[index])
          const bound = await f.app.bindModelRuntime(f.who, session.session)
          if (!('service' in bound)) throw Error('runtime absent')
          const read = await bound.service.readAttempts({
            session: session.session,
            callId: response.call.callId,
          })
          if (!('dispatches' in read)) throw Error('history unavailable')
          expect(read.dispatches[0]!.response!.value).toMatchObject({
            inputCalibration: response.inputCalibration,
          })
        }
        expect(f.tls.requests).toHaveLength(3)
        for (const request of f.tls.requests)
          expect(JSON.stringify(request.body)).toContain(
            '"cache_control":{"type":"ephemeral","ttl":"1h"}',
          )
      } finally {
        await f.close()
      }
    })

  it('selects the earlier accurate source across two missing-usage turns and isolates concurrent sessions', async () => {
    const f = await ready('missing-and-sessions')
    try {
      const a = await f.session('calibration-session-a'),
        b = await f.session('calibration-session-b')
      await f.turn(a, 'A-source-unique')
      f.tls.setUsageJson(null)
      const fullBefore = f.calls.full.length
      for (const label of ['A-missing-one', 'A-missing-two']) {
        const result = await f.turn(a, label)
        expect(result.inputCalibration.observedInput).toEqual({
          kind: 'unavailable',
          reason: 'missing_usage',
        })
      }
      expect(f.calls.full).toHaveLength(fullBefore)
      f.tls.setUsageJson(undefined)
      const freshStart = f.calls.fresh.length
      const [lastA, firstB] = await Promise.all([
        f.turn(a, 'A-after-missing'),
        f.turn(b, 'B-first-unique'),
      ])
      expect(lastA.inputCalibration.observedInput.kind).toBe('from_usage')
      expect(firstB.inputCalibration.observedInput.kind).toBe('from_usage')
      expect(f.calls.full.length - fullBefore).toBe(2)
      const newUnits = f.calls.fresh.slice(freshStart)
      expect(newUnits).toHaveLength(2)
      for (const units of newUnits) {
        expect(units).toContain('A-missing-one')
        expect(units).toContain('A-missing-two')
        expect(units).toContain('A-after-missing')
        expect(units).not.toContain('A-source-unique')
        expect(units).not.toContain('B-first-unique')
      }
      const afterFirst = f.calls.full.length
      await Promise.all([f.turn(a, 'A-second-concurrent'), f.turn(b, 'B-second-concurrent')])
      expect(f.calls.full).toHaveLength(afterFirst)
      const wires = f.tls.requests.map(request => JSON.stringify(request.body))
      for (const wire of wires.filter(wire => wire.includes('B-first-unique')))
        expect(wire).not.toContain('A-source-unique')
      expect(f.tls.requests).toHaveLength(7)
    } finally {
      await f.close()
    }
  })
  it('a real failed R batch does not advance observation and dispatchAgain retains the earlier legal M/R source', async () => {
    const f = await ready('retry-calibration')
    try {
      const target = await f.session('retry-calibration-session')
      await f.turn(target, 'prior-observation')
      const full = f.calls.full.length
      f.tls.setMode('http503')
      const sent = await f.app.startServiceCall(f.who, target.session, {
        user: user('failed-user'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: target.host.host,
      })
      if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
        throw Error(JSON.stringify(sent))
      expect(sent.result.settled.outcome).toBe('failed')
      expect(sent.result.settled.inputCalibration.observedInput.kind).toBe('unavailable')
      const bound = await f.app.bindModelRuntime(f.who, target.session)
      if (!('service' in bound)) throw Error('runtime absent')
      expect(
        await bound.service.readAttempts({ session: target.session, callId: sent.callId }),
      ).toMatchObject({ state: 'awaiting_decision' })
      f.tls.setMode('complete')
      const retried = await bound.service.dispatchAgain({
        session: target.session,
        callId: sent.callId,
        plan: { provider: 'anthropic' },
      })
      if (!('replyPending' in retried)) throw Error(JSON.stringify(retried))
      expect(
        await f.app.persistModelReply(f.who, target.session, retried.replyPending),
      ).toHaveProperty('settled')
      expect(f.calls.full).toHaveLength(full)
      expect(f.tls.requests).toHaveLength(3)
      expect(f.tls.requests[1]!.body).toEqual(f.tls.requests[2]!.body)
      const batches = await physicalBatches(f.config.sessionLog!.dir)
      const failureBatch = batches.find(batch =>
        batch.entries.some(
          entry =>
            entry.payload.category === 'response' &&
            'outcome' in entry.payload.value &&
            entry.payload.value.outcome === 'failed',
        ),
      )!
      expect(failureBatch.entries.map(entry => entry.payload.category)).toEqual(['response'])
      expect(failureBatch.entries[0]!.payload.value).toMatchObject({
        inputCalibration: sent.result.settled.inputCalibration,
      })
    } finally {
      await f.close()
    }
  })

  it('unknown physical response commit cannot become a new source or release the live call lease', async () => {
    const f = await ready('unknown-calibration')
    const probe = await open(resolve(f.config.databaseFile, '../probe'), 'w')
    const methods = Object.getPrototypeOf(probe) as Pick<
      FileHandle,
      'write' | 'datasync' | 'truncate'
    >
    await probe.close()
    const originalWrite = methods.write,
      originalSync = methods.datasync,
      originalTruncate = methods.truncate
    const affected = new WeakSet<object>()
    const write = vi.spyOn(methods, 'write').mockImplementation(async function (
      this: FileHandle,
      ...args: Parameters<FileHandle['write']>
    ) {
      const value: unknown = args[0]
      if (
        ArrayBuffer.isView(value) &&
        Buffer.from(value.buffer, value.byteOffset, value.byteLength).includes(
          Buffer.from('"category":"response"'),
        )
      )
        affected.add(this)
      return await Reflect.apply(originalWrite, this, args)
    })
    const sync = vi.spyOn(methods, 'datasync').mockImplementation(async function (
      this: FileHandle,
    ) {
      if (affected.has(this))
        throw Object.assign(Error('independent response datasync EIO'), { code: 'EIO' })
      return await originalSync.call(this)
    })
    const truncate = vi.spyOn(methods, 'truncate').mockImplementation(async function (
      this: FileHandle,
      ...args: Parameters<FileHandle['truncate']>
    ) {
      if (affected.has(this))
        throw Object.assign(Error('independent response repair EIO'), { code: 'EIO' })
      return await originalTruncate.apply(this, args)
    })
    try {
      const target = await f.session('unknown-calibration-session')
      const sent = await f.app.startServiceCall(f.who, target.session, {
        user: user('unknown-source'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: target.host.host,
      })
      if (!('result' in sent) || !('replyPending' in sent.result)) throw Error(JSON.stringify(sent))
      const pending = sent.result.replyPending
      const committed = await f.app.persistModelReply(f.who, target.session, pending)
      expect(committed).not.toHaveProperty('settled')
      expect(f.registry().inspect()).toMatchObject({ references: 1, executions: 0 })
      const counts = {
        full: f.calls.full.length,
        replay: f.calls.replay.length,
        fresh: f.calls.fresh.length,
      }
      const attempted = await f.app.startServiceCall(f.who, target.session, {
        user: user('must-not-use-unknown'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: target.host.host,
      })
      expect(attempted).not.toHaveProperty('result.replyPending')
      expect(f.tls.requests).toHaveLength(1)
      expect({
        full: f.calls.full.length,
        replay: f.calls.replay.length,
        fresh: f.calls.fresh.length,
      }).toEqual(counts)
      expect(f.registry().inspect()).toMatchObject({ references: 1 })
      write.mockRestore()
      sync.mockRestore()
      truncate.mockRestore()
      // SLJ-9: failed truncation leaves this resident write-untrusted until restart.
      expect(await f.app.reconcileModelRuntime(f.who, target.session)).toEqual({
        unavailable: true,
      })
      const batches = await physicalBatches(f.config.sessionLog!.dir)
      const responses = batches.flatMap(batch =>
        batch.entries.filter(entry => entry.payload.category === 'response'),
      )
      expect(responses).toHaveLength(1)
      expect(responses[0]!.payload.value).toMatchObject({
        inputCalibration: pending.inputCalibration,
      })
      expect(f.registry().inspect()).toMatchObject({ references: 1, executions: 0 })
      expect(f.tls.requests).toHaveLength(1)
    } finally {
      write.mockRestore()
      sync.mockRestore()
      truncate.mockRestore()
      await f.close()
    }
  })
  it('same-call retry uses a genuinely parsed accurate observation from an in-band failed response without replaying unselected output', async () => {
    const f = await ready('accurate-failed-retry', anthropicDefinitions[0]!, true)
    try {
      const target = await f.session('accurate-failed-retry-session')
      const sent = await f.app.startServiceCall(f.who, target.session, {
        user: user('failed-but-accurate'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: target.host.host,
      })
      if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
        throw Error(JSON.stringify(sent))
      expect(sent.result.settled).toMatchObject({
        outcome: 'failed',
        inputCalibration: {
          observedInput: { kind: 'from_usage' },
          outputGroup: { kind: 'known', source: 'none' },
        },
      })
      const full = f.calls.full.length,
        replay = f.calls.replay.length
      expect(full).toBe(2)
      f.tls.setMode('complete')
      const bound = await f.app.bindModelRuntime(f.who, target.session)
      if (!('service' in bound)) throw Error('runtime absent')
      const retry = await bound.service.dispatchAgain({
        session: target.session,
        callId: sent.callId,
        plan: { provider: 'anthropic' },
      })
      if (!('replyPending' in retry)) throw Error(JSON.stringify(retry))
      expect(f.calls.full).toHaveLength(full)
      expect(f.calls.replay).toHaveLength(replay)
      expect(f.tls.requests).toHaveLength(2)
      expect(f.tls.requests[0]!.body).toEqual(f.tls.requests[1]!.body)
      expect(
        await f.app.persistModelReply(f.who, target.session, retry.replyPending),
      ).toHaveProperty('settled')
      const attempts = await bound.service.readAttempts({
        session: target.session,
        callId: sent.callId,
      })
      if (!('dispatches' in attempts)) throw Error('attempts unavailable')
      expect(attempts.dispatches).toHaveLength(2)
      expect(attempts.dispatches[0]!.response!.value).toMatchObject({
        inputCalibration: sent.result.settled.inputCalibration,
      })
    } finally {
      await f.close()
    }
  })
})
