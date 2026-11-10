// Test support: the official profile of a family record as a stored factory profile, and the
// supplier port of the tests. Every value here is a test parameter, not a package default.
import {
  decodeRevision,
  type Adoption,
  type ModelProfile,
  type ModelProfileDefinition,
} from '@omne-harness/model-contract'
import type { SupplierPort } from '@omne-harness/model'
import { officialAnthropicProfiles } from '@omne-harness/pi-ai-anthropic'
import { officialOpenAiProfiles } from '@omne-harness/pi-ai-openai'
import type { FamilyName } from './records.ts'

const PROFILE: Adoption = {
  owner: 'model-host-local-tests',
  name: 'profile',
  revision: '1',
  digest: '0'.repeat(64),
}

/** The official profile of the record on this route, stored as a factory profile. */
export function officialProfile(
  input: Readonly<{ family: FamilyName; model: string; retryPolicy: Adoption }>,
): ModelProfile {
  const official = { retryPolicy: input.retryPolicy, compactionTriggerPercent: '80' }
  const definitions: readonly ModelProfileDefinition[] =
    input.family === 'pi-ai-openai'
      ? officialOpenAiProfiles(official)
      : officialAnthropicProfiles(official)
  const definition = definitions.find(item => item.suppliers[0].model === input.model)
  if (definition === undefined) throw new Error(`no official profile of ${input.model}`)
  const revision = decodeRevision('1')
  if (!('ok' in revision)) throw new Error('revision')
  return {
    identity: { scope: { kind: 'factory' }, route: input.model },
    adoption: PROFILE,
    revision: revision.ok,
    updatedAt: '2026-10-23T00:00:00Z',
    availability: 'active',
    definition,
  }
}

/** The supplier port of the tests: the official layer, the provider of the profile kept. */
export function factorySupplier<P>(): SupplierPort<P> {
  return ({ supplier }) => ({
    ok: {
      adoption: supplier.adoption,
      provider: supplier.provider,
      model: supplier.model,
      credential: { layer: 'official' },
    },
  })
}
