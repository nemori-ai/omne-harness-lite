import type { LocalRecord } from '@omne-harness-lite/client-local-state'
import {
  GovernanceClientConfigurationError,
  type PublicHealthOptions,
  type PublicHealthOutcome,
} from '@omne-harness-lite/governance-center-entry-https-json'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { readPublicHealth } from '@omne-harness-lite/governance-center-client-https'

export interface CenterProfile {
  readonly name: string
  readonly center: LocalRecord['center']
}
export type CenterPreparationOutcome =
  | { readonly kind: 'observed'; readonly profile: CenterProfile }
  | Exclude<PublicHealthOutcome, { kind: 'health' }>
  | { readonly kind: 'invalid-input' }

export async function observeCenterProfile(
  name: unknown,
  endpoint: string,
  trust: LocalRecord['center']['trust'],
  options: Pick<PublicHealthOptions, 'timeoutMs' | 'signal'>,
  readHealth: (input: PublicHealthOptions) => Promise<PublicHealthOutcome> = readPublicHealth,
): Promise<CenterPreparationOutcome> {
  if (typeof name !== 'string' || name.trim().length === 0) return { kind: 'invalid-input' }
  const captured = structuredClone(trust)
  let health: PublicHealthOutcome
  try {
    health = await readHealth({ ...options, url: endpoint, trust: captured })
  } catch (error) {
    if (error instanceof GovernanceClientConfigurationError) return { kind: 'invalid-input' }
    throw error
  }
  if (health.kind !== 'health') return health
  if (!isGovernanceCenterId(health.reply.centerId))
    return { kind: 'unavailable', reason: 'response-invalid' }
  return {
    kind: 'observed',
    profile: { name, center: { centerId: health.reply.centerId, endpoint, trust: captured } },
  }
}
