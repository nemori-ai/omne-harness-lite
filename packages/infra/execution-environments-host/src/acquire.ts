import {
  captureEnvironmentFacilities,
  captureEnvironmentAdoption,
  type EnvironmentAcquisition,
  type EnvironmentDescription,
  type EnvironmentLease,
  type EnvironmentReference,
  type EnvironmentRejection,
  type ExecutionEnvironmentOperations,
  type FacilityFailure,
} from '@omne-harness-lite/execution-environments'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { captureAcquisition } from './acquisition.ts'
import type { createPlacementAuthority, PlacementTicket } from './placement.ts'
import { createLeaseView } from './lease.ts'
import {
  observeProvider,
  rejectEnvironment as reject,
  type ProviderEntry,
} from './provider-work.ts'
import { selectEnvironment } from './selection.ts'

type Input = NonNullable<ReturnType<typeof captureAcquisition>>
interface Dependencies {
  readonly active: () => boolean
  readonly placement: ReturnType<typeof createPlacementAuthority>
  readonly providers: (reference?: EnvironmentReference) => readonly ProviderEntry[]
  readonly authorize: (
    authorization: SessionAccess,
    scope: SessionScope,
  ) => Promise<{ readonly kind: 'authorized' } | EnvironmentRejection>
}
const facilityFailure = (rejection: EnvironmentRejection): FacilityFailure => ({
  kind: 'rejected',
  reason:
    rejection.reason === 'notAuthorized'
      ? 'notAuthorized'
      : rejection.reason === 'unavailable'
        ? 'unavailable'
        : 'closed',
})

/** Checks each new effect against current authority while retaining the adopted instance. */
function operationAuthority(
  deps: Dependencies,
  input: Input,
  ticket: PlacementTicket,
  description: EnvironmentDescription,
) {
  return async (facility: 'command' | 'files') => {
    if (!input.requirement.facilities.includes(facility))
      return facilityFailure(reject('notAuthorized'))
    const granted = await deps.authorize(input.authorization, input.scope)
    if (granted.kind === 'rejected') return facilityFailure(granted)
    const policy = await deps.placement.authorize(ticket, input, description, facility)
    if (policy.kind === 'rejected') return policy
    const latest = await deps.authorize(input.authorization, input.scope)
    return latest.kind === 'authorized' ? { kind: 'authorized' as const } : facilityFailure(latest)
  }
}

/** Rechecks the original authority and the actual returned facilities before adoption. */
async function validateProvisionalLease(
  deps: Dependencies,
  entry: ProviderEntry,
  input: Input,
  ticket: PlacementTicket,
  selected: EnvironmentDescription,
  raw: EnvironmentLease,
) {
  const changed = await deps.placement.recheck(ticket, input)
  const latest = await deps.authorize(input.authorization, input.scope)
  if (latest.kind === 'rejected') return latest
  if (changed) return changed
  if (
    !entry.active ||
    !deps.active() ||
    !deps.placement.current(ticket) ||
    input.resources.closed.aborted
  )
    return reject(deps.active() ? 'providerUnavailable' : 'ownerStopped')
  const facilities = captureEnvironmentFacilities(raw.facilities)
  if (!facilities || writeJsonLossless(facilities.description) !== writeJsonLossless(selected))
    return reject('providerUnavailable')
  return facilities
}

/** Owns provisional release until the registry has constructed a validated adoption. */
async function adoptLease(
  deps: Dependencies,
  entry: ProviderEntry,
  input: Input,
  ticket: PlacementTicket,
  selected: EnvironmentDescription,
  raw: EnvironmentLease,
  providerEvidence: JsonValue,
) {
  let delivered = false
  entry.provisional.add(raw)
  try {
    const facilities = await validateProvisionalLease(deps, entry, input, ticket, selected, raw)
    if ('kind' in facilities) return facilities
    const adoption = captureEnvironmentAdoption({
      placement: ticket.placement,
      source: { name: ticket.entry.source.name, generation: ticket.entry.source.generation },
      description: selected,
      providerEvidence,
    })
    if (!adoption) return reject('providerUnavailable')
    const lease = createLeaseView({
      lease: raw,
      available: () =>
        deps.active() &&
        entry.active &&
        deps.placement.current(ticket) &&
        !input.resources.closed.aborted,
      observe: work => observeProvider(entry, work),
      authorize: operationAuthority(deps, input, ticket, facilities.description),
    })
    if (lease) {
      delivered = true
      return { lease, adoption }
    }
    return reject('providerUnavailable')
  } finally {
    // A provisional lease stays owned by this attempt until delivery or original release.
    if (delivered) entry.provisional.delete(raw)
    else {
      const result = await raw.release()
      if (result.kind === 'released') entry.provisional.delete(raw)
    }
  }
}

/** Capture and authorize one request before any provider callback can create a resource. */
async function prepareAcquisition(
  deps: Dependencies,
  request: Parameters<ExecutionEnvironmentOperations['acquire']>[0],
) {
  const input = captureAcquisition(request)
  if (!input) return reject('invalidInput')
  const access = await deps.authorize(input.authorization, input.scope)
  if (access.kind === 'rejected') return access
  if (input.resources.closed.aborted) return reject('ownerStopped')
  const ticket = await deps.placement.read(input)
  if ('kind' in ticket) return ticket
  if (input.requirement.facilities.some(name => name !== 'command' && name !== 'files'))
    return reject('unsupportedFacility')
  if (
    ticket.placement.permission === 'never-allow' &&
    input.requirement.bindingLayer === 'host_machine'
  )
    return reject('notAuthorized')
  return { input, ticket }
}

/** Once selected, one original entry retains the permission, acquisition and adoption work. */
async function acquireSelected(
  deps: Dependencies,
  input: Input,
  ticket: PlacementTicket,
  selection: { readonly entry: ProviderEntry; readonly selected: EnvironmentDescription },
): Promise<EnvironmentAcquisition> {
  const { entry } = selection
  return observeProvider(entry, async () => {
    const before = await deps.placement.recheck(ticket, input)
    if (before) return before
    const checked = await deps.authorize(input.authorization, input.scope)
    if (checked.kind === 'rejected') return checked
    if (
      !entry.active ||
      !deps.active() ||
      !deps.placement.current(ticket) ||
      input.resources.closed.aborted
    )
      return reject('ownerStopped')
    const result = await observeProvider(entry, () =>
      entry.provider.acquire(
        Object.freeze({
          ...input,
          reference: selection.selected.reference,
          placement: ticket.placement,
        }),
      ),
    )
    if (result.kind !== 'acquired') return result
    const adopted = await adoptLease(
      deps,
      entry,
      input,
      ticket,
      selection.selected,
      result.lease,
      result.evidence,
    )
    return 'kind' in adopted
      ? adopted
      : {
          kind: 'acquired',
          lease: adopted.lease,
          evidence: adopted.adoption.providerEvidence,
          adoption: adopted.adoption,
        }
  })
}

/** Discovery precedes side effects; selection cannot transfer an acquisition to a replacement. */
export function createEnvironmentAcquirer(
  deps: Dependencies,
): ExecutionEnvironmentOperations['acquire'] {
  return async (request): Promise<EnvironmentAcquisition> => {
    const prepared = await prepareAcquisition(deps, request)
    if ('kind' in prepared) return prepared
    const { input, ticket } = prepared
    const entries = deps.providers(input.reference)
    if (!entries.length) return reject('noMatchingEnvironment')
    try {
      const selection = await selectEnvironment(entries, input, ticket, deps.placement)
      if ('kind' in selection) return selection
      return await acquireSelected(deps, input, ticket, selection)
    } catch {
      return reject('providerUnavailable')
    }
  }
}
