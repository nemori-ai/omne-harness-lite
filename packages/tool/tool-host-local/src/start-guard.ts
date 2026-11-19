import type { AccessVerdict, StartVerdict, ToolStartGuard } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from './start-coordinator.ts'
import type {
  ToolPermitConsumption,
  ToolPermitRef,
  ToolStartRelease,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'
import type { RequestAccessVerdict, StartCondition, ToolRequestAccess } from './ledger-guards.ts'

export const PROGRAMMATIC_NOT_IN_M2 = 'programmatic-not-in-m2'

export type LocalStartGuardInput<P> = Readonly<{
  access: StartCoordinatorAccess<P>
  requestAccess?: ToolRequestAccess<P>
}>

const MALFORMED = 'request-access answered a malformed authorization'
const text = z.string().min(1)
const held = <T>() => z.custom<T>(value => typeof value === 'object' && value !== null)
const consumptions: z.ZodType<readonly ToolPermitConsumption[]> = z
  .array(
    z
      .object({
        permit: z.object({ tenant: held<ToolPermitRef['tenant']>(), permit: text }).readonly(),
        consumer: z.object({ owner: text, work: text, position: text }).readonly(),
        evidence: z.object({ owner: text, record: text, revision: text, digest: text }).readonly(),
      })
      .readonly(),
  )
  .readonly()
const releases: z.ZodType<ToolStartRelease> = z.union([
  z.object({ by: z.enum(['verdict', 'once', 'session', 'skip-ask']), grant: text }).readonly(),
  z.object({ by: z.enum(['carrier', 'ungated']), grant: z.null() }).readonly(),
])
// What the provider answered is read as data: a shape it does not have answers unavailable.
const answered = z.union([
  z.object({
    kind: z.literal('allowed'),
    condition: z.custom<StartCondition | null>(value => typeof value === 'object'),
    authorizations: z.unknown().optional(),
    release: z.unknown().optional(),
  }),
  z.object({ kind: z.literal('denied'), reason: z.string() }),
  z.object({ kind: z.literal('unavailable'), diagnostic: z.string() }),
])

// Absent is none; anything present must be a whole list of consumptions and a whole release.
function allowed(
  condition: StartCondition | null,
  authorizations: unknown,
  release: unknown,
): RequestAccessVerdict {
  const consumed = consumptions.safeParse(authorizations === undefined ? [] : authorizations)
  const released = release === undefined ? null : releases.safeParse(release)
  if (!consumed.success || released?.success === false)
    return { kind: 'unavailable', diagnostic: MALFORMED }
  return {
    kind: 'allowed',
    condition,
    ...(consumed.data.length === 0 ? {} : { authorizations: consumed.data }),
    ...(released === null ? {} : { release: released.data }),
  }
}

/** What an allowed start records with its acceptance besides the permit. */
export type AcceptedFacts = Readonly<{
  authorizations?: readonly ToolPermitConsumption[]
  release?: ToolStartRelease
}>

export function acceptedFacts(
  verdict: Extract<RequestAccessVerdict, { kind: 'allowed' }>,
): AcceptedFacts {
  return {
    ...(verdict.authorizations === undefined ? {} : { authorizations: verdict.authorizations }),
    ...(verdict.release === undefined ? {} : { release: verdict.release }),
  }
}

export async function qualifyRequestAccess<P>(
  provider: ToolRequestAccess<P> | undefined,
  input: Parameters<ToolRequestAccess<P>['qualify']>[0],
): Promise<RequestAccessVerdict> {
  if (provider === undefined) return { kind: 'allowed', condition: null }
  const result = await Promise.resolve(input)
    .then(asked => provider.qualify(asked))
    .then(
      value => answered.safeParse(value),
      () => undefined,
    )
  if (result?.success !== true)
    return { kind: 'unavailable', diagnostic: 'request-access unavailable' }
  const verdict = result.data
  return verdict.kind === 'allowed'
    ? allowed(verdict.condition, verdict.authorizations, verdict.release)
    : verdict
}

export function createLocalStartGuard<P>(input: LocalStartGuardInput<P>): ToolStartGuard<P> {
  if (typeof input !== 'object' || input === null) throw new TypeError('input: missing')
  const { access } = input
  if (typeof access?.qualify !== 'function') throw new TypeError('access.qualify: missing')
  const guard: ToolStartGuard<P> = {
    qualifyStart: async ({ principal, tenant, call, request }): Promise<StartVerdict> => {
      if (request.invocation.kind !== 'direct')
        return { kind: 'refused', reason: PROGRAMMATIC_NOT_IN_M2 }
      let verdict: AccessVerdict
      try {
        verdict = await access.qualify({ principal, tenant, call, action: 'start' })
      } catch {
        return {
          kind: 'unavailable',
          diagnostic: 'the start access threw an exception; its message is not reported',
        }
      }
      if (verdict.kind === 'allowed') {
        const policy = await qualifyRequestAccess(input.requestAccess, {
          principal,
          tenant,
          call,
          request,
        })
        if (policy.kind === 'denied') return { kind: 'refused', reason: policy.reason }
        return policy.kind === 'allowed' ? { kind: 'allowed' } : policy
      }
      if (verdict.kind === 'denied') return { kind: 'refused', reason: 'qualification-denied' }
      return { kind: 'unavailable', diagnostic: verdict.diagnostic }
    },
  }
  return Object.freeze(guard)
}
