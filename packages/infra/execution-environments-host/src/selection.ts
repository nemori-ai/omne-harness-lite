import {
  captureEnvironmentDescription,
  environmentBelongsTo,
  matchesEnvironmentRequirement,
  type EnvironmentDescription,
  type EnvironmentReference,
  type EnvironmentRejection,
} from '@omne-harness-lite/execution-environments'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  observeProvider,
  rejectEnvironment as reject,
  type ProviderEntry,
} from './provider-work.ts'
import type { captureAcquisition } from './acquisition.ts'
import type { createPlacementAuthority, PlacementTicket } from './placement.ts'

type Input = NonNullable<ReturnType<typeof captureAcquisition>>
export const sameReference = (a: EnvironmentReference, b: EnvironmentReference) =>
  a.provider === b.provider && writeJsonLossless(a.reference) === writeJsonLossless(b.reference)

/** Discovery validates descriptions; selection adopts only a candidate from that result. */
export async function selectEnvironment(
  entry: ProviderEntry,
  input: Input,
  ticket: PlacementTicket,
  placement: ReturnType<typeof createPlacementAuthority>,
): Promise<{ readonly selected: EnvironmentDescription } | EnvironmentRejection> {
  const result = await observeProvider(entry, () =>
    entry.provider.describe(input.scope, input.authorization),
  )
  if (result.kind === 'rejected') return result
  if (!entry.active || !placement.current(ticket)) return reject('providerUnavailable')
  const descriptions: EnvironmentDescription[] = []
  for (const raw of result.values) {
    const value = captureEnvironmentDescription(raw)
    if (!value || value.reference.provider !== entry.provider.name)
      return reject('providerUnavailable')
    descriptions.push(value)
  }
  const owned = descriptions.filter(value => environmentBelongsTo(value, input.scope, input.call))
  const eligible = owned.filter(value => value.bindingLayer === input.requirement.bindingLayer)
  const candidates = eligible.filter(value =>
    matchesEnvironmentRequirement(value, input.requirement),
  )
  const requested = input.reference
  if (requested && !candidates.some(value => sameReference(value.reference, requested)))
    return reject('referenceExpired')
  if (!candidates.length)
    return reject(eligible.length ? 'missingFacility' : 'noMatchingEnvironment')
  let reference = input.reference
  if (ticket.placement.permission === 'auto_place' || (!reference && candidates.length !== 1)) {
    const choice = await placement.select(ticket, candidates)
    if ('kind' in choice) return choice
    if (reference && !sameReference(reference, choice.reference)) return reject('placementChanged')
    reference = choice.reference
  }
  const adopted = reference
  const selected = adopted
    ? candidates.find(value => sameReference(value.reference, adopted))
    : candidates[0]
  return selected ? { selected } : reject('noMatchingEnvironment')
}
