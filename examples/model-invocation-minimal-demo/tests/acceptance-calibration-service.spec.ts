import {
  anthropicDefinitions,
  createAnthropicInputMeter,
  type InputMeter,
} from '@omne-harness-lite/pi-ai-transport'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { ModelResponse } from '@omne-harness-lite/model-response'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateHandoffKeyPair } from '@omne-harness-lite/identity-values'
import {
  createAcceptanceApplication,
  type AcceptanceConfig,
  type ModelRequestDeployment,
} from '../src/index.ts'
import {
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
      tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
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
async function ready(label: string, definition = anthropicDefinitions[0]!) {
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
  const tls = await createLocalTls(
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
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
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
})
