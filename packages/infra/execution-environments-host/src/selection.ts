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

interface Candidate {
  readonly entry: ProviderEntry
  readonly description: EnvironmentDescription
}

/** Provider data is captured before it can participate in a matching set. */
async function readDescriptions(
  entry: ProviderEntry,
  input: Input,
  ticket: PlacementTicket,
  placement: ReturnType<typeof createPlacementAuthority>,
): Promise<{ readonly descriptions: readonly EnvironmentDescription[] } | EnvironmentRejection> {
  if (!entry.active) return reject('providerUnavailable')
  const result = await observeProvider(entry, () =>
    entry.provider.describe(input.scope, input.authorization),
  )
  if (result.kind === 'rejected') return result
  if (!entry.active || !placement.current(ticket)) return reject('providerUnavailable')
  const descriptions: EnvironmentDescription[] = []
  for (const raw of result.values) {
    const description = captureEnvironmentDescription(raw)
    if (
      !description ||
      description.reference.provider !== entry.provider.name ||
      descriptions.some(value => sameReference(value.reference, description.reference))
    )
      return reject('providerUnavailable')
    descriptions.push(description)
  }
  return { descriptions }
}

/** Matching retains the original entry and requires all facilities in that same instance. */
async function collectCandidates(
  entries: readonly ProviderEntry[],
  input: Input,
  ticket: PlacementTicket,
  placement: ReturnType<typeof createPlacementAuthority>,
): Promise<{ readonly candidates: readonly Candidate[] } | EnvironmentRejection> {
  const candidates: Candidate[] = []
  let hasEligible = false
  for (const entry of entries) {
    const result = await readDescriptions(entry, input, ticket, placement)
    if ('kind' in result) return result
    const owned = result.descriptions.filter(
      description =>
        environmentBelongsTo(description, input.scope, input.call) &&
        description.bindingLayer === input.requirement.bindingLayer,
    )
    hasEligible ||= owned.length > 0
    candidates.push(
      ...owned
        .filter(description => matchesEnvironmentRequirement(description, input.requirement))
        .map(description => ({ entry, description })),
    )
  }
  if (input.reference && !candidates.length) return reject('referenceExpired')
  if (!candidates.length) return reject(hasEligible ? 'missingFacility' : 'noMatchingEnvironment')
  return { candidates }
}

/** An explicit reference is a constraint; a strategy must not replace it. */
async function chooseReference(
  candidates: readonly Candidate[],
  input: Input,
  ticket: PlacementTicket,
  placement: ReturnType<typeof createPlacementAuthority>,
): Promise<EnvironmentReference | EnvironmentRejection> {
  const requested = input.reference
  if (requested && !candidates.some(value => sameReference(value.description.reference, requested)))
    return reject('referenceExpired')
  const reference =
    requested ?? (candidates.length === 1 ? candidates[0]?.description.reference : undefined)
  if (ticket.placement.permission === 'auto_place' || !reference) {
    const choice = await placement.select(
      ticket,
      Object.freeze(candidates.map(value => value.description)),
    )
    if ('kind' in choice) return choice
    if (requested && !sameReference(requested, choice.reference)) return reject('placementChanged')
    return choice.reference
  }
  return reference
}

/** Selection sees the full matching snapshot, never a first provider's private subset. */
export async function selectEnvironment(
  entries: readonly ProviderEntry[],
  input: Input,
  ticket: PlacementTicket,
  placement: ReturnType<typeof createPlacementAuthority>,
): Promise<
  | { readonly entry: ProviderEntry; readonly selected: EnvironmentDescription }
  | EnvironmentRejection
> {
  const collected = await collectCandidates(entries, input, ticket, placement)
  if ('kind' in collected) return collected
  const reference = await chooseReference(collected.candidates, input, ticket, placement)
  if ('kind' in reference) return reference
  const selected = collected.candidates.find(value =>
    sameReference(value.description.reference, reference),
  )
  if (!selected) return reject('noMatchingEnvironment')
  return selected.entry.active
    ? { entry: selected.entry, selected: selected.description }
    : reject('providerUnavailable')
}
