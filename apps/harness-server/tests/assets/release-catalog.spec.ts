import { readFileSync } from 'node:fs'
import { officialProfiles } from '@omne-harness/model-host-local'
import { describe, expect, it } from 'vitest'
import {
  assertSuppliersHeld,
  releaseProvider,
  releaseProviders,
} from '../../src/assets/model-providers.ts'

// The release default from the card of this run (#1560): written out here, not derived.
const ENABLED = [
  'anthropic/claude-fable-5.2',
  'anthropic/claude-fable-5.1',
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-5.5',
  'openai/gpt-6.2-astra',
  'openai/gpt-6.2-sol',
  'openai/gpt-6.1-sol',
  'openai/gpt-6.1-terra',
  'openai/gpt-6-astra',
  'openai/gpt-6-sol',
  'openai/gpt-6-luna',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'moonshotai/kimi-k3.1-pro',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4.1-flash-1017',
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'z-ai/glm-5.3-flashx',
  'z-ai/glm-5.3-flashx-legal',
  'z-ai/glm-5.3-prime',
]

const INPUT = {
  retryPolicy: { owner: 'test', name: 'retry', revision: '1', digest: '0'.repeat(64) },
  compactionTriggerPercent: '80',
}

describe('the release provider carries its model catalog (C1, C4)', () => {
  it('lists every official profile of OpenRouter once, with its facts', () => {
    const provider = releaseProvider('openrouter')
    const routes = officialProfiles(INPUT).map(definition => definition.suppliers[0].model)
    expect(provider?.body.models.map(entry => entry.model).sort()).toEqual([...routes].sort())
    expect(provider?.body.models).toHaveLength(43)
  })

  it('enables by default exactly the 25 models of the release', () => {
    const enabled = releaseProvider('openrouter')
      ?.body.models.filter(entry => entry.enabled)
      .map(entry => entry.model)
    expect([...(enabled ?? [])].sort()).toEqual([...ENABLED].sort())
  })

  it('enables the initial model of every agent definition the release configures (I-7)', () => {
    const config = readFileSync(
      new URL('../../config/serve.distribution.json', import.meta.url),
      'utf8',
    )
    const initial = [
      ...config.matchAll(/"initialModelSelection":\s*\{\s*"name":\s*"([^"]+)"/gu),
    ].map(match => match[1])
    expect(initial.length).toBeGreaterThan(0)
    for (const route of initial) expect(ENABLED).toContain(route)
  })

  it('does not start when an official profile goes through a provider the release does not hold', () => {
    const names = releaseProviders().map(provider => provider.body.name)
    expect(() => assertSuppliersHeld(names, ['openrouter'])).not.toThrow()
    expect(() => assertSuppliersHeld(names, ['openrouter', 'elsewhere'])).toThrow(/elsewhere/u)
  })
})
