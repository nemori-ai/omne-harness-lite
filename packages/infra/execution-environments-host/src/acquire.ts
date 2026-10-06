import {
  captureEnvironmentFacilities,
  type EnvironmentAcquisition,
  type EnvironmentDescription,
  type EnvironmentLease,
  type EnvironmentReference,
  type EnvironmentRejection,
  type ExecutionEnvironmentOperations,
  type FacilityFailure,
} from '@omne-harness-lite/execution-environments'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
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
  readonly provider: (reference?: EnvironmentReference) => ProviderEntry | undefined
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
    const granted = await deps.authorize(input.authorization, input.scope)
    if (granted.kind === 'rejected') return facilityFailure(granted)
    const policy = await deps.placement.authorize(ticket, input, description, facility)
    if (policy.kind === 'rejected') return policy
    const latest = await deps.authorize(input.authorization, input.scope)
    return latest.kind === 'authorized' ? { kind: 'authorized' as const } : facilityFailure(latest)
  }
}

/** Provider success is not delivery until authority and the original description still agree. */
async function adoptLease(
  deps: Dependencies,
  entry: ProviderEntry,
  input: Input,
  ticket: PlacementTicket,
  selected: EnvironmentDescription,
  raw: EnvironmentLease,
) {
  let delivered = false
  try {
    const changed = await deps.placement.recheck(ticket, input)
    const latest = await deps.authorize(input.authorization, input.scope)
    const facilities = captureEnvironmentFacilities(raw.facilities)
    const invalid =
      latest.kind === 'rejected'
        ? latest
        : (changed ??
          (!entry.active ||
          !deps.active() ||
          !deps.placement.current(ticket) ||
          input.resources.closed.aborted
            ? reject(deps.active() ? 'providerUnavailable' : 'ownerStopped')
            : undefined))
    if (
      invalid ||
      !facilities ||
      writeJsonLossless(facilities.description) !== writeJsonLossless(selected)
    ) {
      return invalid ?? reject('providerUnavailable')
    }
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
      return { lease }
    }
    return reject('providerUnavailable')
  } finally {
    // A provisional lease stays owned by this attempt until delivery or original release.
    if (!delivered) await raw.release()
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

/** PR1 uses the unique provider or explicit reference owner; discovery across providers is PR2. */
export function createEnvironmentAcquirer(
  deps: Dependencies,
): ExecutionEnvironmentOperations['acquire'] {
  return async (request): Promise<EnvironmentAcquisition> => {
    const prepared = await prepareAcquisition(deps, request)
    if ('kind' in prepared) return prepared
    const { input, ticket } = prepared
    const entry = deps.provider(input.reference)
    if (!entry) return reject('noMatchingEnvironment')
    if (!entry.active) return reject('providerUnavailable')
    try {
      return await observeProvider(entry, async () => {
        const selection = await selectEnvironment(entry, input, ticket, deps.placement)
        if ('kind' in selection) return selection
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
        )
        return 'kind' in adopted ? adopted : { ...result, lease: adopted.lease }
      })
    } catch {
      return reject('providerUnavailable')
    }
  }
}
