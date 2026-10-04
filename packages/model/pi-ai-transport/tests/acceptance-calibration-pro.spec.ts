import { imagePreparation } from './image-transport-support.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type {PlanInput, ReadFacts} from '@omne-harness-lite/model-request-runtime'
import { openaiDefinitions, createOpenAiInputMeter, createOfficialProfileContent, createPiAiTransport } from '../src/index.ts'
import { type ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { certificate, fixture, input, message, content, sse, finish } from './support.ts'

const models = [
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna-pro',
  'openai/gpt-6-astra-pro',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna-pro',
] as const
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
function request(definition: ModelDefinition): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: { revision: 'independent-pro-scope', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw Error(profile.rejected)
  return {
    ...input(),
    routeName: definition.modelId,
    provider: 'openai',
    snapshot: {
      ...input().snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: ['openai'],
    },
  }
}
function accounts(facts: ReadFacts) {
  expect(facts.usage.source).toBe('upstream')
  for (const [field, value] of [
    ['input_tokens', 50],
    ['output_tokens', 7],
    ['cache_read_tokens', 50],
    ['cache_write_tokens', 20],
  ] as const) {
    const actual = facts.usage[field]
    if (actual === 'unknown') throw Error(`lost actual ${field}`)
    expect(ExactDecimal.from(actual).compare(ExactDecimal.from(value))).toBe(0)
  }
  if (facts.cost.cost_usd === 'unknown') throw Error('lost actual cost')
  expect(ExactDecimal.from(facts.cost.cost_usd).compare(ExactDecimal.from(0.125))).toBe(0)
}

describe('independent six fixed Pro usage-scope bindings', () => {
  for (const model of models)
    for (const cancelled of [false, true]) {
      it(`${model} preserves actual accounts and withholds anchors after ${cancelled ? 'cancel' : 'complete'}`, async () => {
        const definition = openaiDefinitions.find(d => d.modelId === model)!
        const is56 = model.startsWith('openai/gpt-5.6-')
        expect(definition.revision).toBe(is56 ? '8' : '6')
        expect(definition.implementation.revision).toBe('mp4-18')
        // Current official visible-input estimates are supplied for all six.
        // These controlled reader observations do not certify upstream token scope.
        const meter = createOpenAiInputMeter(definition)
        const host = await fixture(
          cert.tls,
          response => {
            response.writeHead(200, { 'content-type': 'text/event-stream' })
            response.write(
              sse({
                choices: [],
                provider: 'OpenAI',
                model,
                usage: {
                  prompt_tokens: 120,
                  completion_tokens: 7,
                  cost: 0.125,
                  prompt_tokens_details: { cached_tokens: 50, cache_write_tokens: 20 },
                },
              }) + content('observed Pro reply'),
            )
            if (!cancelled) response.end(finish())
          },
          {},
          undefined,
          [definition],
        )
        const transport = createPiAiTransport({
          ...host.options,
          definitions: [definition],
          inputMeters: [meter],
        })
        try {
          const first = await request(definition)
          const plan = await transport.plan(first, { signal: new AbortController().signal })
          if (!('planned' in plan)) throw Error(JSON.stringify(plan))
          expect(plan.planned.measurement.mode).toBe('full')
          const abort = new AbortController()
          const sent = await transport.send(plan.planned, 'independent-local-only', abort.signal)
          if (!('response' in sent)) throw Error('local send failed')
          const reader = transport.read(sent.response, plan.planned, abort.signal)
          let next = await reader.next()
          expect(next.done).toBe(false)
          if (cancelled) abort.abort()
          while (!next.done) next = await reader.next()
          await sent.response.stopped
          const facts = next.value.readFacts
          accounts(facts)
          expect(facts.observedInput).toEqual({ kind: 'unavailable', reason: 'scope_unknown' })
          if (cancelled) expect(next.value).toHaveProperty('aborted', true)
          const captured = plan.planned.requestInput
          if (captured.kind !== 'known') throw Error('current request not captured')
          for (const revision of [
            'openrouter-usage-reader/2',
            'openrouter-usage-reader/3-openai-pro-scope',
          ]) {
            const forged = await transport.plan(
              {
                ...first,
                messages: [...first.messages, message('user', 'fresh Pro input', 'fresh-pro')],
                calibration: {
                  kind: 'observation',
                  usage: facts.usage,
                  outputBlocks: [],
                  replaySelection: [],
                  inputCalibration: {
                    requestInput: captured,
                    observedInput: {
                      kind: 'from_usage',
                      provenance: {
                        adapterRevision: revision,
                        fieldPaths: ['usage.prompt_tokens'],
                        upstreamModel: model,
                        servingProvider: 'OpenAI',
                      },
                    },
                    outputGroup: { kind: 'unavailable', reason: 'not_retained' },
                  },
                },
              },
              { signal: new AbortController().signal },
            )
            if (!('planned' in forged)) throw Error(JSON.stringify(forged))
            expect(forged.planned.measurement).toMatchObject({
              mode: 'full',
              fallbackReason: 'source_unavailable',
            })
          }
          if (!cancelled) {
            // Deliberately stale coordinates are a negative fixture, not an old
            // reader implementation. They cannot promote ambiguous Pro usage.
            const old: ModelDefinition = {
              ...definition,
              revision: is56 ? '4' : '1',
              implementation: { name: 'pi-ai:openai', revision: is56 ? 'mp4-5' : 'mp4-1' },
            }
            const historical = createPiAiTransport({
              ...host.options,
              definitions: [old],
              inputMeters: [syntheticInputMeter(old, 'openai')],
            })
            try {
              const oldPlan = await historical.plan(await request(old), {
                signal: new AbortController().signal,
              })
              if (!('planned' in oldPlan)) throw Error(JSON.stringify(oldPlan))
              const oldSent = await historical.send(
                oldPlan.planned,
                'independent-local-only',
                abort.signal,
              )
              if (!('response' in oldSent)) throw Error('historical local send failed')
              const oldReader = historical.read(oldSent.response, oldPlan.planned, abort.signal)
              let oldNext = await oldReader.next()
              while (!oldNext.done) oldNext = await oldReader.next()
              await oldSent.response.stopped
              expect(oldNext.value.readFacts.observedInput).toEqual({
                kind: 'unavailable',
                reason: 'scope_unknown',
              })
              accounts(oldNext.value.readFacts)
              const rejectedOld = await transport.plan(
                {
                  ...first,
                  calibration: {
                    kind: 'observation',
                    usage: oldNext.value.readFacts.usage,
                    outputBlocks: [],
                    replaySelection: [],
                    inputCalibration: {
                      requestInput: oldPlan.planned.requestInput,
                      observedInput: oldNext.value.readFacts.observedInput,
                      outputGroup: { kind: 'unavailable', reason: 'not_retained' },
                    },
                  },
                },
                { signal: new AbortController().signal },
              )
              if (!('planned' in rejectedOld)) throw Error(JSON.stringify(rejectedOld))
              expect(rejectedOld.planned.measurement).toMatchObject({
                mode: 'full',
                fallbackReason: 'source_unavailable',
              })
            } finally {
              await historical.close()
            }
          }
          expect(host.requests).toHaveLength(cancelled ? 1 : 2)
        } finally {
          await transport.close()
          await host.close()
        }
      })
    }
})
