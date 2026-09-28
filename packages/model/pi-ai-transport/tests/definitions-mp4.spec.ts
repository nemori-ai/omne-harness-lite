import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  createOfficialProfileContent,
  configurationSchema,
  interpretConfiguration,
} from '../src/configuration.ts'
import { ownDefinitions, readModelDefinition, type ModelDefinition } from '../src/definitions.ts'
import { deepseekDefinitions } from '../src/official-models/deepseek.ts'

const pro = deepseekDefinitions[1]
const flash = deepseekDefinitions[0]
if (!pro || !flash) throw new Error('missing DeepSeek declarations')

function read(definition: ModelDefinition) {
  return readModelDefinition([definition], {
    implementation: definition.implementation,
    definition: { modelId: definition.modelId, revision: definition.revision },
  })
}

describe('MP4 complete definition boundary', () => {
  it('preserves explicit unknown upstream facts and finite project caps through reading and profile construction', () => {
    const result = read(flash)
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.ok.capabilities).toEqual(flash.capabilities)
    expect(result.ok.capabilities.upstreamInputLimits.maxImageBytes).toEqual({ status: 'unknown' })
    const content = createOfficialProfileContent(flash, {
      providers: ['deepinfra/fp8'],
      allowFallback: false,
      configuration: { revision: 'test-1', values: { cache: { mode: 'automatic' } } },
    })
    if ('rejected' in content) throw new Error(content.rejected)
    expect(content.ok.upstreamInputLimits).toEqual(flash.capabilities.upstreamInputLimits)
    expect(content.ok.inputConstraints).toEqual(flash.capabilities.inputConstraints)
    expect(judgeModelProfileDocument('ModelProfileContent', content.ok)).toEqual({ ok: true })
  })

  it('rejects incomplete facts, missing image cap, and a project cap above a known upstream limit', () => {
    const missingFacts = {
      ...pro,
      capabilities: { ...pro.capabilities, upstreamInputLimits: undefined },
    }
    const missingImageCap = {
      ...flash,
      capabilities: { ...flash.capabilities, inputConstraints: {} },
    }
    const overKnownLimit = {
      ...pro,
      capabilities: {
        ...pro.capabilities,
        upstreamInputLimits: {
          ...pro.capabilities.upstreamInputLimits,
          maxInputTokens: { status: 'limited', value: 1 },
        },
      },
    }
    for (const value of [missingFacts, missingImageCap, overKnownLimit]) {
      expect(Reflect.apply(read, undefined, [value])).toEqual({ rejected: 'invalidInput' })
      expect(() => Reflect.apply(ownDefinitions, undefined, [[value]])).toThrow(TypeError)
    }
  })

  it('owns each nested input fact and requires an explicit route-compatible cache choice', () => {
    const source = structuredClone(pro)
    const [owned] = ownDefinitions([source])
    if (!owned) throw new Error('missing copied definition')
    expect(
      Reflect.set(source.capabilities.upstreamInputLimits.maxInputTokens, 'status', 'unbounded'),
    ).toBe(true)
    expect(owned.capabilities.upstreamInputLimits.maxInputTokens).toEqual({ status: 'unknown' })
    const schema = configurationSchema(pro, 'deepinfra/fp8')
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    expect(interpretConfiguration(pro, { cache: { mode: 'automatic' } }, 'deepinfra/fp8')).toEqual({
      ok: { mode: 'automatic' },
    })
    expect(
      interpretConfiguration(
        pro,
        { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['system'] } },
        'deepinfra/fp8',
      ),
    ).toEqual({ rejected: 'invalidInput' })
  })
})
