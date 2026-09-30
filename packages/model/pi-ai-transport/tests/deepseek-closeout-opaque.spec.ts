import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { createDeepSeekV4ProInputMeter } from '../src/input-meters/deepseek-v4-pro.ts'
import { createDeepSeekV41FlashInputMeter } from '../src/input-meters/deepseek-v41-flash.ts'
import {
  deepseekV4Pro0813Definition,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { directFull, directNew } from './direct-full-input.ts'

const models = [
  { definition: deepseekV4Pro0813Definition, createMeter: createDeepSeekV4ProInputMeter },
  { definition: deepseekV41FlashDefinition, createMeter: createDeepSeekV41FlashInputMeter },
]

describe.each(models)('$definition.modelId unsupported private reasoning', model => {
  it('refuses opaque reasoning in full and new inputs instead of tokenizing its JSON', () => {
    const meter = model.createMeter(model.definition)
    const assistant = {
      role: 'assistant',
      content: 'visible answer',
      reasoning_details: [{ type: 'reasoning.encrypted', data: 'CIPHERTEXT_IS_NOT_A_TOKEN_COUNT' }],
    }
    const body: JsonObject = {
      messages: [{ role: 'user', content: 'question' }, assistant],
      reasoning: { effort: 'low' },
    }
    expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'unavailable',
    })
    expect(
      directNew(meter, {
        units: [assistant],
        envelope: {},
        precedingUnitCount: 1,
        boundary: {
          revision: 'deepseek-reference-boundary/2',
          removed: '',
          added: 'visible answer',
        },
      }),
    ).toEqual({ kind: 'unavailable' })
  })

  it('continues measuring supported visible reasoning without fabricating output usage', () => {
    const meter = model.createMeter(model.definition)
    const body: JsonObject = {
      messages: [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'visible answer', reasoning: 'visible reasoning' },
      ],
      reasoning: { effort: 'low' },
    }
    expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toMatchObject({
      kind: 'estimated',
    })
  })
})
