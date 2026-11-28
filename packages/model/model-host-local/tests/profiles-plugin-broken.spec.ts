import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { ModelProfilesLocalPlugin } from '../src/cordis.ts'

vi.mock('@omne-harness/pi-ai-openai', async original => {
  const real = await original<typeof import('@omne-harness/pi-ai-openai')>()
  return {
    ...real,
    officialOpenAiProfiles: (input: Parameters<typeof real.officialOpenAiProfiles>[0]) =>
      real.officialOpenAiProfiles(input).map(profile => ({ ...profile, limits: [] })),
  }
})

const CONFIG = {
  retryPolicy: {
    owner: 'model-host-local-tests',
    name: 'retry',
    revision: '1',
    digest: '0'.repeat(64),
  },
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-02T00:00:00Z',
}

it('does not come up when an official profile breaks the profile rules, and names the fields', () => {
  expect(() => new ModelProfilesLocalPlugin(new Context(), CONFIG)).toThrow(
    /the official profile openai\/[^ ]+ breaks the profile rules: limits\.image-bytes/,
  )
})
