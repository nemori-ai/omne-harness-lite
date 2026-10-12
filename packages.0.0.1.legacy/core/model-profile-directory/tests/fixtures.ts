import { parseTenantId, type TenantId } from '@omne-harness-lite/identity-values'
import type { ModelProfileContent, ModelProfileRef } from '@omne-harness-lite/model-profile'
import type { ProfileRow } from '../src/index.ts'

export function tenant(account = 'alice', organization = 'org'): TenantId {
  const parsed = parseTenantId({ account, organization })
  if ('invalidInput' in parsed) throw new Error(parsed.invalidInput)
  return parsed.ok
}

export const content: ModelProfileContent = {
  routeName: 'vendor/chat',
  origin: 'official',
  providers: ['provider'],
  allowFallback: false,
  adaptation: {
    implementation: { name: 'test-family', revision: '1' },
    definition: { modelId: 'vendor/chat', revision: '1' },
    configuration: { revision: '1', values: {} },
  },
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 32000,
  maxOutputTokens: 8192,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
}

export function row(
  profile: ModelProfileContent = content,
  ref: ModelProfileRef = { origin: 'official', routeName: profile.routeName },
  registration: 'listed' | 'withdrawn' = 'listed',
): ProfileRow {
  return {
    ref,
    profile: { ...profile, registration, updatedAt: '2026-10-08T01:00:00Z' },
  }
}
