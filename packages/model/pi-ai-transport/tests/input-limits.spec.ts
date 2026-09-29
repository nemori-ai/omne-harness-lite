import { describe, expect, it } from 'vitest'
import { LosslessNumber, jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { admissionTokens, tokenMarginValid } from '../src/input-meter.ts'
import { planRequest } from '../src/plan.ts'
import { input, judgedMessage } from './support.ts'
import { testDefinitions } from './definitions.ts'
import { measureFinalInput } from '../src/input-limits.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

describe('explicit token estimate margin', () => {
  it('uses exact decimal ceil at equality and fractional boundaries', () => {
    expect(admissionTokens(100, { multiplier: 1.1, reserveTokens: 0 })).toBe(110)
    expect(admissionTokens(100, { multiplier: 1.01, reserveTokens: 0 })).toBe(101)
    expect(
      admissionTokens(100, {
        multiplier: new LosslessNumber('1.00000000000000000001'),
        reserveTokens: 7,
      }),
    ).toBe(108)
    expect(
      jsonNumberSource(
        admissionTokens(new LosslessNumber('9007199254740992'), {
          multiplier: 1,
          reserveTokens: 1,
        }),
      ),
    ).toBe('9007199254740993')
  })

  it('requires both explicit finite policy members with no defaults or extra fields', () => {
    for (const invalid of [
      undefined,
      {},
      { multiplier: 1 },
      { reserveTokens: 0 },
      { multiplier: 0.99, reserveTokens: 0 },
      { multiplier: 1, reserveTokens: -1 },
      { multiplier: 1, reserveTokens: 0.5 },
      { multiplier: Infinity, reserveTokens: 0 },
      { multiplier: 1, reserveTokens: 0, hidden: true },
    ]) {
      expect(tokenMarginValid(invalid)).toBe(false)
    }
    expect(tokenMarginValid({ multiplier: 1, reserveTokens: 0 })).toBe(true)
  })
})

describe('S-74 missing-cap precedence', () => {
  it('reports an earlier orphan tool-call refusal before a missing cap', () => {
    const request = input()
    const snapshot = { ...request.snapshot }
    Reflect.deleteProperty(snapshot, 'maxInputTokens')
    const assistant = judgedMessage({
      id: 'assistant-orphan',
      type: 'assistant',
      response: 'response-orphan',
      ending: 'complete',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [
        {
          id: 'orphan-block',
          kind: 'tool_call',
          callId: 'orphan-call',
          tool: 'lookup',
          complete: true,
          unparseable: true,
          rawArguments: '{}',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    expect(planRequest({ ...request, snapshot, messages: [assistant] }, testDefinitions)).toEqual({
      rejected: 'orphan_tool_call',
    })
    expect(planRequest({ ...request, snapshot }, testDefinitions)).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: ['maxInputTokens'],
    })
    expect(
      planRequest(
        { ...request, tokenMargin: { multiplier: 0, reserveTokens: -1 }, snapshot },
        testDefinitions,
      ),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_missing',
      metrics: ['maxInputTokens'],
    })
  })
})

describe('S-74 final serialized admission', () => {
  const definition = testDefinitions[0]
  if (!definition) throw new Error('fixture definition missing')
  const meter = syntheticInputMeter(definition, 'openai')
  const base = input()
  const body = { model: definition.modelId, messages: [{ role: 'user', content: 'hello' }] }
  const serialized = JSON.stringify(body)

  it('checks exact UTF-8 bytes and reports actual, never an estimate', () => {
    const length = Buffer.byteLength(serialized, 'utf8')
    const snapshot = {
      ...base.snapshot,
      inputConstraints: { ...base.snapshot.inputConstraints, maxRequestBytes: length - 1 },
    }
    expect(
      measureFinalInput({
        definition,
        provider: 'openai',
        snapshot,
        body,
        serialized,
        meter,
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
      }),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxRequestBytes',
      actual: length,
      limit: length - 1,
    })
  })

  it('uses explicit margin for an estimate and gives exact excess precedence', () => {
    const estimate = { ...meter, measureFull: () => ({ kind: 'estimated' as const, tokens: 100 }) }
    const snapshot = { ...base.snapshot, maxInputTokens: 109 }
    const args = {
      definition,
      provider: 'openai',
      snapshot,
      body,
      serialized,
      meter: estimate,
      tokenMargin: { multiplier: 1.1, reserveTokens: 0 },
    }
    expect(measureFinalInput(args)).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
      estimatedTokens: 100,
      admissionTokens: 110,
      limit: 109,
    })
    expect(
      measureFinalInput({
        ...args,
        snapshot: {
          ...snapshot,
          inputConstraints: {
            ...snapshot.inputConstraints,
            maxRequestBytes: 1,
          },
        },
      }),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxRequestBytes',
      actual: Buffer.byteLength(serialized, 'utf8'),
      limit: 1,
    })
  })

  it('does not call an upper bound excess an actual excess', () => {
    const upper = { ...meter, measureFull: () => ({ kind: 'upperBound' as const, tokens: 200 }) }
    expect(
      measureFinalInput({
        definition,
        provider: 'openai',
        snapshot: { ...base.snapshot, maxInputTokens: 100 },
        body,
        serialized,
        meter: upper,
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
      }),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxInputTokens'],
    })
  })

  it('fails closed when a bound meter throws or returns an invalid measurement', () => {
    const cases = [
      {
        ...meter,
        measureFull: () => {
          throw new Error('meter failure')
        },
      },
      { ...meter, measureFull: () => ({ kind: 'estimated' as const, tokens: -1 }) },
    ]
    for (const failed of cases)
      expect(
        measureFinalInput({
          definition,
          provider: 'openai',
          snapshot: base.snapshot,
          body,
          serialized,
          meter: failed,
          tokenMargin: { multiplier: 1, reserveTokens: 0 },
        }),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      })
  })

  it('counts repeated inline images and their exact decoded bytes', () => {
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJjZA==' } }
    const imageBody = { messages: [{ content: [image, image] }] }
    const bytes = JSON.stringify(imageBody)
    const snapshot = {
      ...base.snapshot,
      inputConstraints: { ...base.snapshot.inputConstraints, maxImageBytes: 3 },
    }
    expect(
      measureFinalInput({
        definition,
        provider: 'openai',
        snapshot,
        body: imageBody,
        serialized: bytes,
        meter,
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
      }),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxImageBytes',
      actual: 4,
      limit: 3,
    })
    expect(
      measureFinalInput({
        definition,
        provider: 'openai',
        snapshot: {
          ...base.snapshot,
          upstreamInputLimits: {
            ...base.snapshot.upstreamInputLimits,
            maxImages: { status: 'limited', value: 1 },
          },
        },
        body: imageBody,
        serialized: bytes,
        meter,
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
      }),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'exact',
      metric: 'maxImages',
      actual: 2,
      limit: 1,
    })
  })
})
