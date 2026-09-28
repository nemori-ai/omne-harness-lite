import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import {
  createPiAiTransport,
  createModelTransportService,
  planRequest,
  readModelDefinition,
  configurationSchema,
  interpretConfiguration,
  createOfficialProfileContent,
  officialModelIds,
  type ModelDefinition,
  type ParameterRules,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import * as publicApi from '@omne-harness-lite/pi-ai-transport'
import { createModelPlugin } from '@omne-harness-lite/pi-ai-transport/plugin'
import { testDefinitions, fixtureRules } from './definitions.ts'
import { input, message, certificate, fixture, finish, networkPolicy } from './support.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

function definition(explicit = false): ModelDefinition {
  const value = testDefinitions[explicit ? 1 : 0]
  if (!value) throw new Error('missing synthetic fixture')
  return value
}
function configured(
  rules: ParameterRules = fixtureRules,
  extra: ModelDefinition['routes'][string]['extra'] = {},
): ModelDefinition {
  return {
    ...definition(),
    routes: {
      openai: { reminderRole: 'developer', parameters: rules, extra, cache: { mode: 'automatic' } },
    },
  }
}
const retirement: RetirementPolicy = {
  waitMilliseconds: 20,
  force: false,
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
async function onWire(value: ModelDefinition, parameters: ModelRequestParameters) {
  const host = await fixture(cert.tls, res => res.end(finish()), {}, undefined, [value])
  try {
    const request = { ...input(), parameters }
    const result = host.transport.plan(request)
    if ('rejected' in result) throw new Error(result.rejected)
    const signal = new AbortController().signal
    const sent = await host.transport.send(
      result.planned,
      'synthetic-definition-credential',
      signal,
    )
    if (!('response' in sent)) throw new Error(writeJsonLossless(sent))
    for await (const _event of host.transport.read(sent.response, result.planned, signal)) {
      /* drain */
    }
    expect(host.requests).toHaveLength(1)
    expect(host.requests[0]?.body).toBe(result.planned.serialized)
    return result.planned
  } finally {
    await host.close()
  }
}

describe('D082 complete declarations and migration gates', () => {
  it('exports target IDs and pure surfaces without legacy contribution sets', () => {
    expect(officialModelIds).toHaveLength(37)
    expect(publicApi).not.toHaveProperty('pilotDefinitions')
    expect(publicApi).not.toHaveProperty('officialDefinitions')
    for (const name of [
      'readModelDefinition',
      'configurationSchema',
      'interpretConfiguration',
      'createOfficialProfileContent',
    ])
      expect(Object.hasOwn(publicApi, name)).toBe(true)
  })
  it('rejects missing, old and invalid definitions before resource creation; [] has no models', async () => {
    expect(() =>
      Reflect.apply(createPiAiTransport, undefined, [{ policy: networkPolicy }]),
    ).toThrow(TypeError)
    expect(Reflect.apply(planRequest, undefined, [input()])).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
    const old = {
      modelId: 'fixture/old',
      revision: '1',
      implementation: { name: 'fixture:old', revision: '6' },
      reminderRole: 'developer',
      routes: { openai: 'automatic' },
    }
    expect(() =>
      Reflect.apply(createPiAiTransport, undefined, [
        { policy: networkPolicy, definitions: [old] },
      ]),
    ).toThrow(TypeError)
    expect(() => Reflect.apply(createModelPlugin, undefined, [old, retirement])).toThrow(TypeError)
    expect(Reflect.apply(planRequest, undefined, [input(), officialModelIds])).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
    const service = createModelTransportService({ policy: networkPolicy })
    expect(Reflect.apply(service.registerAdaptation, undefined, [old, {}, () => {}])).toEqual({
      rejected: 'invalidInput',
    })
    await service.close(retirement)
    const empty = createPiAiTransport({ policy: networkPolicy, definitions: [], inputMeters: [] })
    expect(empty.plan(input())).toEqual({ rejected: 'unavailable' })
    await empty.close()
  })
  it('rejects non-JSON definition collections without invoking accessors', () => {
    let accessorReads = 0
    const accessor = [definition()]
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      get() {
        accessorReads++
        return definition()
      },
    })
    const extra = [definition()]
    Object.defineProperty(extra, 'metadata', { enumerable: true, value: 'not-array-data' })
    const symbol = [definition()]
    Object.defineProperty(symbol, Symbol('unexpected'), { value: 'not-json' })
    for (const values of [new Array(1), accessor, extra, symbol]) {
      expect(() =>
        Reflect.apply(createPiAiTransport, undefined, [
          { policy: networkPolicy, definitions: values },
        ]),
      ).toThrow(TypeError)
      expect(Reflect.apply(planRequest, undefined, [input(), values])).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
    }
    expect(accessorReads).toBe(0)
  })
  it.each([
    { label: 'missing capabilities', value: { ...definition(), capabilities: undefined } },
    {
      label: 'missing input constraints',
      value: {
        ...definition(),
        capabilities: { ...definition().capabilities, inputConstraints: undefined },
      },
    },
    {
      label: 'G22 drop rule',
      value: configured({ ...fixtureRules, maxOutputTokens: { kind: 'drop' } }),
    },
    {
      label: 'G22 select rule',
      value: configured({
        ...fixtureRules,
        maxOutputTokens: { kind: 'select', accepted: { values: [1] }, otherwise: { adjustTo: 1 } },
      }),
    },
    {
      label: 'fractional seed interval',
      value: configured({
        ...fixtureRules,
        seed: {
          kind: 'select',
          accepted: { minimum: new LosslessNumber('1.0000000000000000001'), maximum: 2 },
          otherwise: { drop: true },
        },
      }),
    },
    {
      label: 'duplicate exact numeric values',
      value: configured({
        ...fixtureRules,
        temperature: {
          kind: 'select',
          accepted: { values: [1, new LosslessNumber('1.0')] },
          otherwise: { drop: true },
        },
      }),
    },
    {
      label: 'adjustment outside the accepted interval',
      value: configured({
        ...fixtureRules,
        temperature: {
          kind: 'select',
          accepted: { minimum: 1, maximum: 2 },
          otherwise: { adjustTo: 0 },
        },
      }),
    },
    {
      label: 'protected private key',
      value: configured(fixtureRules, { top_p: { kind: 'pass' } }),
    },
    { label: 'empty private key', value: configured(fixtureRules, { '': { kind: 'pass' } }) },
    {
      label: 'private numeric interval',
      value: configured(fixtureRules, {
        private: {
          kind: 'select',
          accepted: { minimum: 0, maximum: 1 },
          otherwise: { drop: true },
        },
      }),
    },
  ])('rejects $label without filling facts', ({ value }) => {
    expect(Reflect.apply(planRequest, undefined, [input(), [value]])).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
    expect(() =>
      Reflect.apply(createPiAiTransport, undefined, [
        { policy: networkPolicy, definitions: [value] },
      ]),
    ).toThrow(TypeError)
  })
  it('constructs complete core content, preserves every source field and never invents timestamps', () => {
    const result = createOfficialProfileContent(definition(), {
      providers: ['openai'],
      allowFallback: false,
      configuration: input().snapshot.adaptation.configuration,
      parameters: { temperature: 0 },
    })
    if ('rejected' in result) throw new Error(result.rejected)
    expect(judgeModelProfileDocument('ModelProfileContent', result.ok)).toEqual({ ok: true })
    expect(result.ok).toEqual({
      ...definition().capabilities,
      routeName: definition().modelId,
      origin: 'official',
      providers: ['openai'],
      allowFallback: false,
      adaptation: input().snapshot.adaptation,
      parameters: { temperature: 0 },
    })
    expect(result.ok).not.toHaveProperty('registration')
    expect(result.ok).not.toHaveProperty('updatedAt')
    expect(
      createOfficialProfileContent(definition(), {
        providers: ['unknown'],
        allowFallback: false,
        configuration: input().snapshot.adaptation.configuration,
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      createOfficialProfileContent(definition(), {
        providers: ['openai'],
        allowFallback: false,
        configuration: input().snapshot.adaptation.configuration,
        parameters: { maxOutputTokens: 4097 },
      }),
    ).toEqual({ rejected: 'max_output_exceeds_profile' })
  })
  it.each([
    { parameters: { temperature: 3 } },
    { parameters: { maxOutputTokens: 4097 } },
    { providers: [] },
    { parameters: {} },
  ])('preserves the independent core representation rejection for %j', extra => {
    const options = {
      providers: ['openai'],
      allowFallback: false,
      configuration: input().snapshot.adaptation.configuration,
    }
    const valid = createOfficialProfileContent(definition(), options)
    if ('rejected' in valid) throw new Error(valid.rejected)
    const expected = judgeModelProfileDocument('ModelProfileContent', { ...valid.ok, ...extra })
    expect(expected).toHaveProperty('rejected')
    expect(createOfficialProfileContent(definition(), { ...options, ...extra })).toEqual(expected)
  })
  it('returns an immutable observation but does not acquire execution permission', async () => {
    const binding = input().snapshot.adaptation
    const result = readModelDefinition(testDefinitions, {
      implementation: binding.implementation,
      definition: binding.definition,
    })
    if ('rejected' in result) throw new Error(result.rejected)
    expect(Reflect.set(result.ok.capabilities, 'maxInputTokens', 1)).toBe(false)
    const route = result.ok.routes.openai
    if (!route) throw new Error('missing observed route')
    expect(Reflect.set(route.parameters, 'temperature', { kind: 'drop' })).toBe(false)
    const service = createModelTransportService({ policy: networkPolicy })
    expect(service.acquire(binding, definition().modelId)).toEqual({ rejected: 'unavailable' })
    expect(
      readModelDefinition(testDefinitions, {
        implementation: { ...binding.implementation, revision: 'unknown' },
        definition: binding.definition,
      }),
    ).toEqual({ rejected: 'unavailable' })
    await service.close(retirement)
  })
  it('uses captured coordinates even if the declaration source changes the caller object during copying', () => {
    const binding = input().snapshot.adaptation
    const coordinates = {
      implementation: { ...binding.implementation },
      definition: { ...binding.definition },
    }
    const source = new Proxy(definition(), {
      ownKeys(value) {
        coordinates.definition.modelId = definition(true).modelId
        return Reflect.ownKeys(value)
      },
    })
    const result = readModelDefinition([source, definition(true)], coordinates)
    if ('rejected' in result) throw new Error(result.rejected)
    expect(coordinates.definition.modelId).toBe(definition(true).modelId)
    expect(result.ok.modelId).toBe(definition().modelId)
  })
  it('does not let an earlier readable declaration acquire after retirement closes admission', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    const value = definition(),
      binding = input().snapshot.adaptation
    let cleaned = 0
    try {
      const registered = service.registerAdaptation(
        value,
        syntheticInputMeter(value, 'openai'),
        {},
        () => {
          cleaned++
        },
      )
      if ('rejected' in registered) throw new Error(registered.rejected)
      const observed = readModelDefinition([registered.registered.definition], {
        implementation: binding.implementation,
        definition: binding.definition,
      })
      if ('rejected' in observed) throw new Error(observed.rejected)
      const retiring = service.retire(registered.registered, retirement)
      expect(service.acquire(binding, observed.ok.modelId)).toEqual({ rejected: 'unavailable' })
      expect(observed.ok).toEqual(value)
      expect(await retiring).toEqual({ retired: true })
      expect(cleaned).toBe(1)
    } finally {
      await service.close(retirement)
    }
  })
})

describe('D082 explicit parameter rules through controlled HTTPS', () => {
  const choices = [
    { name: 'reasoningEffort', supplied: 'high', selected: 'low' },
    { name: 'temperature', supplied: 1, selected: 0 },
    { name: 'topP', supplied: 1, selected: 0.5 },
    {
      name: 'seed',
      supplied: new LosslessNumber('9007199254740993'),
      selected: new LosslessNumber('9007199254740994'),
    },
    { name: 'stopSequences', supplied: ['END'], selected: ['STOP'] },
    { name: 'frequencyPenalty', supplied: 1, selected: 0 },
    { name: 'presencePenalty', supplied: 1, selected: 0 },
  ] as const
  it.each(choices)(
    'records explicit drop and select/adjust for $name',
    async ({ name, supplied, selected }) => {
      const dropped = await onWire(configured({ ...fixtureRules, [name]: { kind: 'drop' } }), {
        [name]: supplied,
      })
      expect(dropped.parameters).toEqual({})
      expect(dropped.droppedParameters).toEqual([name])
      const adjusted = await onWire(
        configured({
          ...fixtureRules,
          [name]: {
            kind: 'select',
            accepted: { values: [selected] },
            otherwise: { adjustTo: selected },
          },
        }),
        { [name]: supplied },
      )
      expect(writeJsonLossless(adjusted.parameters)).toBe(writeJsonLossless({ [name]: selected }))
      expect(writeJsonLossless(adjusted.parameterAdjustments)).toBe(
        writeJsonLossless([{ name, requested: supplied, sent: selected }]),
      )
    },
  )
  it('sends all eight supplied values and keeps all absent values absent', async () => {
    const full = configured({ ...fixtureRules, reasoningEffort: { kind: 'pass' } })
    const parameters = {
      reasoningEffort: 'max',
      temperature: new LosslessNumber('0.123456789012345678901'),
      topP: new LosslessNumber('0.99999999999999999999'),
      seed: new LosslessNumber('9007199254740993'),
      maxOutputTokens: 128,
      stopSequences: ['END'],
      frequencyPenalty: -2,
      presencePenalty: 2,
    } satisfies ModelRequestParameters
    const sent = await onWire(full, parameters)
    expect(sent.parameters).toEqual(parameters)
    expect(sent).not.toHaveProperty('parameterAdjustments')
    expect(sent.serialized).toContain('9007199254740993')
    expect(sent.serialized).toContain('0.123456789012345678901')
    expect(sent.body.reasoning).toEqual({ effort: 'max' })
    const absent = await onWire(full, {})
    expect(absent.parameters).toEqual({})
    expect(absent.body).not.toHaveProperty('reasoning')
    const none = await onWire(full, { reasoningEffort: 'none' })
    expect(none.body.reasoning).toEqual({ effort: 'none' })
  })
  it('compares decimal and huge integer boundaries exactly, adjusts with both original and actual values', async () => {
    const a = new LosslessNumber('0.10000000000000000001'),
      b = new LosslessNumber('0.10000000000000000002')
    const value = configured(
      {
        ...fixtureRules,
        temperature: {
          kind: 'select',
          accepted: { minimum: a, maximum: b },
          otherwise: { adjustTo: a },
        },
        seed: {
          kind: 'select',
          accepted: {
            minimum: new LosslessNumber('-1e400'),
            maximum: new LosslessNumber('9007199254740993'),
          },
          otherwise: { drop: true },
        },
        topP: { kind: 'drop' },
      },
      {
        known: {
          kind: 'select',
          accepted: { values: [{ n: new LosslessNumber('9007199254740993') }] },
          otherwise: { adjustTo: { n: new LosslessNumber('9007199254740993') } },
        },
        'extra.literal': { kind: 'pass' },
      },
    )
    const requested = new LosslessNumber('0.10000000000000000003')
    const sent = await onWire(value, {
      temperature: requested,
      seed: new LosslessNumber('9007199254740994'),
      topP: 1,
      extra: { unknown: true, known: { n: 0 }, 'extra.literal': 'kept', model: 'override' },
    })
    expect(writeJsonLossless(sent.parameters.temperature)).toBe(a.source)
    expect(sent.droppedParameters).toEqual(['topP', 'seed', 'model', 'unknown'])
    expect(writeJsonLossless(sent.parameterAdjustments)).toBe(
      writeJsonLossless([
        { name: 'temperature', requested, sent: a },
        { name: 'known', requested: { n: 0 }, sent: { n: new LosslessNumber('9007199254740993') } },
      ]),
    )
    expect(sent.parameters.extra).toEqual({
      'extra.literal': 'kept',
      known: { n: new LosslessNumber('9007199254740993') },
    })
    expect(sent.body).toHaveProperty('extra.literal', 'kept')
    expect(sent.body).not.toHaveProperty('unknown')
    const boundary = await onWire(value, {
      temperature: b,
      seed: new LosslessNumber('9007199254740993'),
    })
    expect(boundary).not.toHaveProperty('parameterAdjustments')
    expect(boundary).not.toHaveProperty('droppedParameters')
  })
  it('passes output limits unchanged under G22 even when definition capabilities differ', async () => {
    const value = {
      ...definition(),
      capabilities: { ...definition().capabilities, maxOutputTokens: 8 },
    }
    const sent = await onWire(value, { maxOutputTokens: 128 })
    expect(sent.body.max_tokens).toBe(128)
    expect(sent).not.toHaveProperty('parameterAdjustments')
  })
  it('orders private keys by Unicode codepoints and retains literal extra. names', async () => {
    const sent = await onWire(configured(), { extra: { '😀': 1, '\uE000': 2, 'extra.literal': 3 } })
    expect(sent.droppedParameters).toEqual(['extra.literal', '\uE000', '😀'])
    expect(sent.parameters).toEqual({})
    expect(sent.body).not.toHaveProperty('extra')
  })
})

interface SchemaValidator {
  compile: (schema: unknown) => (input: unknown) => boolean
}
function isValidator(value: unknown): value is SchemaValidator {
  return (
    !!value &&
    typeof value === 'object' &&
    'compile' in value &&
    typeof value.compile === 'function'
  )
}
function independentValidator(): SchemaValidator {
  // Resolve the locked validator from the public core package's declared dependency.
  const module: unknown = createRequire(import.meta.resolve('@omne-harness-lite/model-profile'))(
    'ajv/dist/2020.js',
  )
  if (
    !module ||
    (typeof module !== 'object' && typeof module !== 'function') ||
    !('Ajv2020' in module) ||
    typeof module.Ajv2020 !== 'function'
  )
    throw new Error('Ajv2020 missing')
  const value: unknown = Reflect.construct(module.Ajv2020, [{ strict: true, ownProperties: true }])
  if (!isValidator(value)) throw new Error('invalid validator')
  return value
}
describe('D082 route Schema, interpreter and admission have the same domain', () => {
  it('compares raw JSON against independent Draft 2020-12 validation, including custom TTL/layouts', async () => {
    const explicit = definition(true),
      original = explicit.routes.anthropic
    if (!original) throw new Error('missing route')
    const value = {
      ...explicit,
      routes: {
        anthropic: {
          ...original,
          cache: {
            mode: 'explicit',
            ttlValues: ['fixture-ttl-A', 'fixture-ttl-B'],
            breakpointLayouts: [['last_message'], ['system', 'last_tool']],
          } as const,
        },
      },
    } satisfies ModelDefinition
    const schema = configurationSchema(value, 'anthropic')
    if ('rejected' in schema) throw new Error(schema.rejected)
    const validate = independentValidator().compile(JSON.parse(writeJsonLossless(schema.ok)))
    const cases: JsonObject[] = [
      {},
      { cache: { mode: 'automatic' } },
      { cache: { mode: 'explicit' } },
      { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } },
      { cache: { mode: 'explicit', ttl: 'fixture-ttl-A', breakpoints: ['last_message'] } },
      { cache: { mode: 'explicit', ttl: 'fixture-ttl-B', breakpoints: ['system', 'last_tool'] } },
      { cache: { mode: 'explicit', ttl: 'fixture-ttl-A', breakpoints: ['last_tool', 'system'] } },
      { cache: { mode: 'explicit', ttl: 'fixture-ttl-A', breakpoints: ['system', 'system'] } },
      {
        cache: {
          mode: 'explicit',
          ttl: 'fixture-ttl-A',
          breakpoints: ['last_message'],
          unexpected: 'secret',
        },
      },
      { cache: { mode: 'explicit', ttl: 'fixture-ttl-A', breakpoints: ['unknown'] } },
      {
        cache: { mode: 'explicit', ttl: 'fixture-ttl-A', breakpoints: ['last_message'] },
        unknown: 'secret',
      },
    ]
    const host = await fixture(cert.tls, res => res.end(finish()), {}, undefined, [value])
    try {
      for (const config of cases) {
        const actual = 'ok' in interpretConfiguration(value, config, 'anthropic')
        expect(actual).toBe(validate(JSON.parse(writeJsonLossless(config))))
        const request = input(true)
        const planned = host.transport.plan({
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...request.snapshot.adaptation,
              configuration: { revision: 'configuration-fixture', values: config },
            },
          },
        })
        expect('planned' in planned).toBe(actual)
        expect(host.requests).toHaveLength(0)
      }
      const chosen = {
        cache: { mode: 'explicit', ttl: 'fixture-ttl-A', breakpoints: ['last_message'] },
      }
      const request = input(true)
      const plan = host.transport.plan({
        ...request,
        snapshot: {
          ...request.snapshot,
          adaptation: {
            ...request.snapshot.adaptation,
            configuration: { revision: 'configuration-fixture', values: chosen },
          },
        },
      })
      if ('rejected' in plan) throw new Error(plan.rejected)
      const signal = new AbortController().signal
      const sent = await host.transport.send(plan.planned, 'synthetic-config-credential', signal)
      if (!('response' in sent)) throw new Error('send failed')
      for await (const _event of host.transport.read(sent.response, plan.planned, signal)) {
        /* drain */
      }
      expect(host.requests[0]?.body).toContain('fixture-ttl-A')
      expect(host.requests[0]?.body).not.toContain('5m')
      // This proves Schema drift would be detected by the independent acceptance oracle.
      const changed = independentValidator().compile({ type: 'object', additionalProperties: true })
      expect(
        cases.some(
          config => changed(config) !== 'ok' in interpretConfiguration(value, config, 'anthropic'),
        ),
      ).toBe(true)
    } finally {
      await host.close()
    }
  })
  it('requires the selected route, not just another matching route; official content checks every provider', async () => {
    const a = definition().routes.openai,
      b = definition(true).routes.anthropic
    if (!a || !b) throw new Error('missing routes')
    const value = { ...definition(), routes: { openai: a, anthropic: b } }
    const service = createModelTransportService({ policy: networkPolicy })
    const registered = service.registerAdaptation(
      value,
      syntheticInputMeter(value, 'openai'),
      {},
      () => {},
    )
    if ('rejected' in registered) throw new Error(registered.rejected)
    const request = input(),
      acquired = service.acquire(request.snapshot.adaptation, request.routeName)
    if ('rejected' in acquired) throw new Error(acquired.rejected)
    expect(
      acquired.lease.transport.plan({
        ...request,
        provider: 'anthropic',
        snapshot: { ...request.snapshot, providers: ['openai', 'anthropic'], allowFallback: true },
      }),
    ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(configurationSchema(value, 'missing')).toEqual({ rejected: 'unavailable' })
    expect(
      createOfficialProfileContent(value, {
        providers: ['openai', 'anthropic'],
        allowFallback: true,
        configuration: request.snapshot.adaptation.configuration,
      }),
    ).toEqual({ rejected: 'invalidInput' })
    acquired.lease.release()
    await service.close(retirement)
  })
  it('rejects plans signed by another static host and another dynamic lease', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const other = createPiAiTransport({ ...host.options, definitions: testDefinitions })
    try {
      const original = host.transport.plan(input())
      if ('rejected' in original) throw new Error(original.rejected)
      expect(
        await other.send(
          original.planned,
          'synthetic-host-credential',
          new AbortController().signal,
        ),
      ).toEqual({ rejected: 'invalidInput' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await other.close()
      await host.close()
    }
  })
  it('allows independently planned bytes only with the identical full declaration and refuses clones', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const route = definition().routes.openai
    if (!route) throw new Error('missing route')
    const changed = configured({ ...fixtureRules, temperature: { kind: 'drop' } }, route.extra)
    const incompatible = createPiAiTransport({
      ...host.options,
      definitions: [changed],
      inputMeters: [syntheticInputMeter(changed, 'openai')],
    })
    const empty = createPiAiTransport({ ...host.options, definitions: [], inputMeters: [] })
    try {
      const first = definition()
      const pure = planRequest(
        { ...input(), parameters: { temperature: 1 } },
        testDefinitions,
        syntheticInputMeter(first, 'openai'),
      )
      if ('rejected' in pure) throw new Error(pure.rejected)
      const signal = new AbortController().signal
      const foreignMeter = { ...syntheticInputMeter(first, 'openai') }
      const foreign = planRequest(
        { ...input(), parameters: { temperature: 1 } },
        testDefinitions,
        foreignMeter,
      )
      if ('rejected' in foreign) throw new Error(foreign.rejected)
      expect(
        await host.transport.send(foreign.planned, 'synthetic-pure-credential', signal),
      ).toEqual({
        rejected: 'invalidInput',
      })
      for (const consumer of [incompatible, empty])
        expect(await consumer.send(pure.planned, 'synthetic-pure-credential', signal)).toEqual({
          rejected: 'invalidInput',
        })
      expect(
        await host.transport.send({ ...pure.planned }, 'synthetic-pure-credential', signal),
      ).toEqual({ rejected: 'invalidInput' })
      expect(host.requests).toHaveLength(0)
      const sent = await host.transport.send(pure.planned, 'synthetic-pure-credential', signal)
      if (!('response' in sent)) throw new Error('pure public plan refused')
      for await (const _event of host.transport.read(sent.response, pure.planned, signal)) {
        /* drain */
      }
      expect(host.requests[0]?.body).toBe(pure.planned.serialized)
    } finally {
      await incompatible.close()
      await empty.close()
      await host.close()
    }
  })
  it('keeps invalid configuration failures finite and free from original strings', () => {
    const sentinel = 'configuration-secret-sentinel'
    const values = {
      cache: { mode: 'automatic', unknown: sentinel },
      [sentinel.repeat(5000)]: sentinel,
    }
    const result = interpretConfiguration(definition(), values, 'openai')
    expect(result).toEqual({ rejected: 'invalidInput' })
    expect(writeJsonLossless(result)).not.toContain(sentinel)
    const request = input()
    const plan = planRequest(
      {
        ...request,
        snapshot: {
          ...request.snapshot,
          adaptation: {
            ...request.snapshot.adaptation,
            configuration: { revision: 'secret-test', values },
          },
        },
      },
      testDefinitions,
    )
    expect(plan).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    expect(writeJsonLossless(plan)).not.toContain(sentinel)
  })
  it('owns full declaration/configuration values and rejects all same-key content changes', async () => {
    const host = await fixture(cert.tls, res => res.end(finish()))
    const service = createModelTransportService(host.options)
    const source = { ...definition(), capabilities: { ...definition().capabilities } },
      request = input()
    const owner = {},
      cleanup = () => {}
    const meter = syntheticInputMeter(source, 'openai')
    const registered = service.registerAdaptation(source, meter, owner, cleanup)
    if ('rejected' in registered) throw new Error(registered.rejected)
    const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
    if ('rejected' in acquired) throw new Error(acquired.rejected)
    const lease = acquired.lease
    try {
      const route = source.routes.openai
      if (!route) throw new Error('missing route')
      for (const changed of [
        { ...source, capabilities: { ...source.capabilities, maxInputTokens: 2 } },
        { ...source, routes: { openai: { ...route, reminderRole: 'user' as const } } },
        {
          ...source,
          routes: {
            openai: {
              ...route,
              parameters: { ...route.parameters, temperature: { kind: 'drop' as const } },
            },
          },
        },
        {
          ...source,
          routes: {
            openai: {
              ...route,
              cache: {
                mode: 'explicit' as const,
                ttlValues: ['new'],
                breakpointLayouts: [['last_message' as const]],
              },
            },
          },
        },
      ])
        expect(service.registerAdaptation(changed, meter, owner, cleanup)).toEqual({
          rejected: 'invalidInput',
        })
      const result = lease.transport.plan({ ...request, parameters: { temperature: 1 } })
      if ('rejected' in result) throw new Error(result.rejected)
      const before = result.planned.serialized
      expect(Reflect.set(source.capabilities, 'maxInputTokens', 4)).toBe(true)
      expect(
        Reflect.set(request.snapshot.adaptation.configuration.values, 'cache', {
          mode: 'automatic',
          injected: 'sentinel',
        }),
      ).toBe(true)
      expect(writeJsonLossless(result.planned.body)).toBe(before)
      expect(lease.transport.plan(request)).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      const signal = new AbortController().signal
      const sent = await lease.transport.send(result.planned, 'synthetic-owned-credential', signal)
      if (!('response' in sent)) throw new Error('send failed')
      for await (const _event of lease.transport.read(sent.response, result.planned, signal)) {
        /* drain */
      }
      expect(host.requests[0]?.body).toBe(before)
      const secondService = createModelTransportService(host.options)
      try {
        expect(secondService.acquire(lease.binding, request.routeName)).toEqual({
          rejected: 'unavailable',
        })
        const another = secondService.registerAdaptation(
          registered.registered.definition,
          syntheticInputMeter(registered.registered.definition, 'openai'),
          {},
          () => {},
        )
        if ('rejected' in another) throw new Error(another.rejected)
        const next = secondService.acquire(lease.binding, request.routeName)
        if ('rejected' in next) throw new Error(next.rejected)
        expect(
          await next.lease.transport.send(result.planned, 'synthetic-owned-credential', signal),
        ).toEqual({ rejected: 'invalidInput' })
        next.lease.release()
      } finally {
        await secondService.close(retirement)
      }
    } finally {
      lease.release()
      await service.close(retirement)
      await host.close()
    }
  })
})
