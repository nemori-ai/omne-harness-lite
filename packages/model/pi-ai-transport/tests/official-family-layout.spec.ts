import { describe, expect, it } from 'vitest'
import { readModelDefinition, type ModelDefinition, type ModelRoute } from '../src/definitions.ts'
import { officialModelIds } from '../src/official.ts'
import { anthropicModelRoutes } from '../src/official-models/anthropic.ts'
import {
  deepseekModelRoutes,
  deepseekV4Pro0813Definition,
} from '../src/official-models/deepseek.ts'
import { googleModelRoutes } from '../src/official-models/google.ts'
import { moonshotModelRoutes } from '../src/official-models/moonshot.ts'
import { openaiModelRoutes } from '../src/official-models/openai.ts'
import { qwenModelRoutes } from '../src/official-models/qwen.ts'
import { xaiModelRoutes } from '../src/official-models/xai.ts'
import { zaiModelRoutes } from '../src/official-models/zai.ts'

const families: Readonly<Record<string, Readonly<Record<string, ModelDefinition['routes']>>>> = {
  anthropic: anthropicModelRoutes,
  deepseek: deepseekModelRoutes,
  google: googleModelRoutes,
  moonshot: moonshotModelRoutes,
  openai: openaiModelRoutes,
  qwen: qwenModelRoutes,
  xai: xaiModelRoutes,
  zai: zaiModelRoutes,
}

// Exact binding inventory independently of family policy composition. These
// fixed providers must not turn into model-prefix inference or route fallback.
const providers: Readonly<Record<string, readonly string[]>> = {
  anthropic: ['anthropic'],
  deepseek: ['deepinfra/fp8'],
  google: ['google-ai-studio', 'google-vertex'],
  openai: ['openai'],
  qwen: ['alibaba'],
  xai: ['xai'],
}

function expectedProviders(family: string, modelId: string): readonly string[] {
  if (family === 'moonshot') {
    return modelId === 'moonshotai/kimi-k3' ? ['moonshotai/mxfp4'] : ['moonshotai/int4']
  }
  if (family === 'zai') return modelId === 'z-ai/glm-5.3-prime' ? ['alibaba'] : ['z-ai/fp8']
  const result = providers[family]
  if (!result) throw new Error(`missing provider expectation for ${family}`)
  return result
}

// Synthetic capacities exercise the common definition reader only; they are
// not published as real model capabilities or used for upstream requests.
function fixture(modelId: string, routes: Readonly<Record<string, ModelRoute>>): ModelDefinition {
  return {
    modelId,
    revision: '1',
    implementation: { name: 'test:family-layout', revision: '1' },
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1024,
      maxOutputTokens: 128,
      inputConstraints: {},
    },
    routes,
  }
}

describe('uniform family model/provider route maps', () => {
  it('covers every confirmed model exactly once, with explicit provider bindings', () => {
    const ids = Object.values(families).flatMap(models => Object.keys(models))
    expect(ids).toHaveLength(37)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.toSorted()).toEqual([...officialModelIds].sort())
    let routeCount = 0
    for (const [family, models] of Object.entries(families)) {
      for (const [modelId, routes] of Object.entries(models)) {
        expect(Object.keys(routes).sort()).toEqual([...expectedProviders(family, modelId)].sort())
        routeCount += Object.keys(routes).length
        for (const route of Object.values(routes)) {
          expect(route.reminderRole).toBe(family === 'openai' ? 'developer' : 'user')
        }
      }
    }
    expect(routeCount).toBe(39)
  })

  it.each(Object.entries(families))(
    '%s composes through the same complete-definition reader',
    (_family, models) => {
      for (const [modelId, routes] of Object.entries(models)) {
        const declaration = fixture(modelId, routes)
        expect(
          readModelDefinition([declaration], {
            implementation: declaration.implementation,
            definition: { modelId, revision: declaration.revision },
          }),
        ).toEqual({ ok: declaration })
      }
    },
  )

  it('keeps the complete DeepSeek Pro definition bound to the family map', () => {
    expect(deepseekV4Pro0813Definition.routes).toEqual(
      deepseekModelRoutes['deepseek/deepseek-v4-pro-0813'],
    )
  })
})
