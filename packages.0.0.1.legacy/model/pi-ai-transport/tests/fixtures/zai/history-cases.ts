import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { readJsonStrict, type JsonObject } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../../../src/configuration.ts'
import { object } from '../../../src/json.ts'
import { zaiDefinitions } from '../../../src/official-models/zai.ts'
import { projectZaiCommercialBody } from '../../../src/input-meters/zai-commercial.ts'
import { input } from '../../support.ts'

export const histories = z
  .array(
    z.object({
      id: z.string(),
      source: z.string(),
      sourceSha256: z.string(),
      sseSha256: z.string(),
      sse: z.string(),
      model: z.string(),
      provider: z.string(),
      thought: z.string(),
      content: z.string(),
      detail: z.record(z.string(), z.unknown()),
      request: z.record(z.string(), z.unknown()),
    }),
  )
  .parse(
    JSON.parse(readFileSync(new URL('./history-complete-streams.json', import.meta.url), 'utf8')),
  )

export function jsonBody(raw: unknown): JsonObject {
  const parsed = readJsonStrict(JSON.stringify(raw))
  if (!('ok' in parsed) || !object(parsed.ok)) throw new Error('invalid fixture object')
  return parsed.ok
}

export function definition(modelId: string) {
  const selected = zaiDefinitions.find(item => item.modelId === modelId)
  if (!selected) throw new Error('missing ZAI definition')
  return selected
}

export function followupBody(row: (typeof histories)[number]): JsonObject {
  if (row.model !== 'z-ai/glm-5.3-prime' && row.model !== 'z-ai/glm-5.3-flashx')
    throw new Error('unexpected fixture model')
  const original = projectZaiCommercialBody(jsonBody(row.request), row.model)
  if (!original || !Array.isArray(original.messages)) throw new Error('invalid seed wire')
  // Reapply the exact profile's last_message marker to the new final message.
  return {
    ...original,
    messages: [
      ...original.messages,
      { role: 'assistant', content: row.content, reasoning: row.thought },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What arithmetic result did we verify?',
            ...(row.model === 'z-ai/glm-5.3-prime'
              ? { cache_control: { type: 'ephemeral', ttl: '5m' } }
              : {}),
          },
        ],
      },
    ],
  }
}

export function historyInput(modelId: string) {
  const model = definition(modelId)
  const prime = modelId === 'z-ai/glm-5.3-prime'
  const provider = prime ? 'alibaba' : 'z-ai/fp8'
  const profile = createOfficialProfileContent(model, {
    providers: [provider],
    allowFallback: false,
    configuration: {
      revision: '1',
      values: {
        cache: prime
          ? { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] }
          : { mode: 'automatic' },
      },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: modelId,
    provider,
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: base.snapshot.updatedAt,
    },
  }
}
