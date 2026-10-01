import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import {
  createDeepSeekSupplemental,
  deepSeekPythonJson,
} from '../src/input-meters/deepseek-boundary.ts'
import { deepSeekBoundaryRoute } from '../src/projection.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import {
  deepseekV4Pro0813Definition,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { input } from './support.ts'

describe.each([deepseekV4Pro0813Definition, deepseekV41FlashDefinition])(
  '$modelId current reference boundary binding',
  definition => {
    it('admits only its exact current definition, implementation and route', () => {
      const profile = createOfficialProfileContent(definition, {
        providers: ['deepinfra/fp8'],
        allowFallback: false,
        configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const base = input()
      const request = {
        ...base,
        routeName: definition.modelId,
        provider: 'deepinfra/fp8',
        snapshot: { ...base.snapshot, adaptation: profile.ok.adaptation },
      }
      expect(deepSeekBoundaryRoute(request)).toBe(true)
      expect(deepSeekBoundaryRoute({ ...request, routeName: 'deepseek/unknown' })).toBe(false)
      expect(deepSeekBoundaryRoute({ ...request, provider: 'other/fp8' })).toBe(false)
      expect(
        deepSeekBoundaryRoute({
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...request.snapshot.adaptation,
              definition: { ...request.snapshot.adaptation.definition, revision: 'old' },
            },
          },
        }),
      ).toBe(false)
      expect(
        deepSeekBoundaryRoute({
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...request.snapshot.adaptation,
              implementation: { name: 'other', revision: 'mp4-18' },
            },
          },
        }),
      ).toBe(false)
      expect(
        deepSeekBoundaryRoute({
          ...request,
          snapshot: {
            ...request.snapshot,
            adaptation: {
              ...request.snapshot.adaptation,
              implementation: { name: definition.implementation.name, revision: 'mp4-17' },
            },
          },
        }),
      ).toBe(false)
    })
  },
)

describe('DeepSeek common reference accounting', () => {
  it('retains nested exact numbers and official Python JSON separators', () => {
    expect(
      deepSeekPythonJson({
        count: new LosslessNumber('9007199254740993'),
        values: [1, { fraction: new LosslessNumber('0.1000000000000000001') }],
      }),
    ).toBe('{"count": 9007199254740993, "values": [1, {"fraction": 0.1000000000000000001}]}')
  })
  it.each([
    ['type', 'text'],
    ['type', 'text', 'image_url'],
  ])('accounts all unrendered metadata with content fields %j', (...fields) => {
    const extra = createDeepSeekSupplemental(fields)
    expect(
      extra({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'rendered', marker: 'content-metadata' }],
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}', strict: true },
              },
            ],
            reasoning: 'rendered reasoning',
          },
        ],
        tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
        stream: true,
      }),
    ).toEqual({
      request: { stream: true },
      messages: [
        {
          contentParts: [{ marker: 'content-metadata' }],
          toolCallMetadata: [{ id: 'call-1', type: 'function', function: { strict: true } }],
        },
      ],
      tools: [{ type: 'function' }],
    })
    expect(
      extra({
        messages: [
          { role: 'assistant', content: 'visible', reasoning_details: [{ data: 'ciphertext' }] },
        ],
      }),
    ).toBeUndefined()
  })
  it('excludes image bytes only for the leaf that measures them separately', () => {
    const body = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }],
        },
      ],
    }
    expect(createDeepSeekSupplemental(['type', 'text', 'image_url'])(body)).toEqual({ request: {} })
    expect(createDeepSeekSupplemental(['type', 'text'])(body)).toEqual({
      request: {},
      messages: [{ contentParts: [{ image_url: { url: 'data:image/png;base64,AA==' } }] }],
    })
  })
})
