import { describe, expect, it } from 'vitest'
import {
  officialModelIds,
  openaiDefinitions,
  anthropicDefinitions,
  deepseekDefinitions,
  googleDefinitions,
  xaiDefinitions,
  qwenDefinitions,
  moonshotDefinitions,
  zaiDefinitions,
} from '@omne-harness-lite/pi-ai-transport'

// Independent identity-only expectations from D076's confirmed model table.
const expected = {
  openai: [
    'gpt-6-astra',
    'gpt-6-astra-pro',
    'gpt-6-sol',
    'gpt-6-sol-pro',
    'gpt-6-luna',
    'gpt-6-luna-pro',
    'gpt-5.6-sol',
    'gpt-5.6-sol-pro',
    'gpt-5.6-terra',
    'gpt-5.6-terra-pro',
    'gpt-5.6-luna',
    'gpt-5.6-luna-pro',
  ],
  anthropic: ['claude-opus-5.5', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5.1'],
  deepseek: ['deepseek-v4.1-flash', 'deepseek-v4-pro-0813'],
  google: ['gemini-3.8-flash', 'gemini-3.7-flash'],
  'x-ai': ['grok-4.7', 'grok-4.6'],
  qwen: [
    'qwen3.8-max-0902',
    'qwen3.8-max-prime',
    'qwen3.8-flash',
    'qwen3.8-2.4t-a95b',
    'qwen3.8-27b',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.7-flash',
  ],
  moonshotai: ['kimi-k3', 'kimi-k2.7-code'],
  'z-ai': ['glm-5.3', 'glm-5.3-prime', 'glm-5.3-flash', 'glm-5.3-flashx', 'glm-5.2'],
}

describe('complete official declaration identity inventory', () => {
  it('retains precisely the 37 user-confirmed identities and family counts', () => {
    expect(officialModelIds).toHaveLength(37)
    expect(new Set(officialModelIds).size).toBe(37)
    expect([...officialModelIds].sort()).toEqual(
      Object.entries(expected)
        .flatMap(([family, names]) => names.map(name => `${family}/${name}`))
        .sort(),
    )
    const counts = Object.fromEntries(
      Object.keys(expected).map(family => [
        family,
        officialModelIds.filter(model => model.startsWith(`${family}/`)).length,
      ]),
    )
    expect(counts).toEqual({
      openai: 12,
      anthropic: 4,
      deepseek: 2,
      google: 2,
      'x-ai': 2,
      qwen: 8,
      moonshotai: 2,
      'z-ai': 5,
    })
    expect(Object.isFrozen(officialModelIds)).toBe(true)
    expect(Reflect.set(officialModelIds, '0', 'invented/model')).toBe(false)
  })

  it('derives every target identity from a complete public family list', () => {
    const definitions = [
      openaiDefinitions,
      anthropicDefinitions,
      deepseekDefinitions,
      googleDefinitions,
      xaiDefinitions,
      qwenDefinitions,
      moonshotDefinitions,
      zaiDefinitions,
    ].flat()
    expect(definitions).toHaveLength(37)
    expect(definitions.map(definition => definition.modelId)).toEqual(officialModelIds)
    expect(
      definitions.every(definition =>
        Object.hasOwn(definition.capabilities, 'upstreamInputLimits'),
      ),
    ).toBe(true)
  })
})
