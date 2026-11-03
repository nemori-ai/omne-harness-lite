// The gate (SPEC S1): adoption first, eligibility second, in that order. It hands out a
// capability token, `AdmittedEndpoint`, that only this module grants. The functions that need a
// connection take the token, so passing the gate is checked by the compiler and, for a forged
// object, by `assertAdmitted` at run time.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EndpointRef, Refusal } from '@omne-harness/mcp-contract'
import type {
  AdoptedEndpoint,
  AdoptionView,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'

declare const admitted: unique symbol

/** An adopted endpoint that passed the gate. It is a frozen copy; the port's object is not it. */
export type AdmittedEndpoint = AdoptedEndpoint & { readonly [admitted]: true }

/** The refusals of the gate: the three that need no setting value. */
export type GateRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'blocked' | 'unknown' }>

/** The refusals of the gate without eligibility. */
export type AdoptionRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>

export type GatePorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
}>

// The tokens this module granted. An in-process proof: a copy or a forged object is not in it.
const granted = new WeakSet<object>()

/** Registers a frozen copy and narrows it. The only grant of the brand. */
function grant(endpoint: AdoptedEndpoint): AdmittedEndpoint {
  const token = Object.freeze({ ...endpoint })
  register(token)
  return token
}

function register(token: AdoptedEndpoint): asserts token is AdmittedEndpoint {
  granted.add(token)
}

/** Throws `TypeError` for an endpoint that did not come out of `admit` in this module. */
export function assertAdmitted(endpoint: AdoptedEndpoint): asserts endpoint is AdmittedEndpoint {
  if (!granted.has(endpoint)) throw new TypeError('the endpoint did not pass the MCP gate')
}

const NOT_AVAILABLE: AdoptionRefusal = { kind: 'not-available-to-you' }
const UNKNOWN: AdoptionRefusal = { kind: 'unknown' }

/**
 * Adoption only. Not adopted is `not-available-to-you`; an unreadable adoption is `unknown`.
 * This is the path of the task operations that reuse a connection (SPEC S2).
 */
export async function admitWithoutEligibility<P, S>(
  ports: Readonly<{ adoption: AdoptionView<P, S> }>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, AdoptionRefusal>> {
  const adopted = await ports.adoption.endpoint(access, ref)
  if ('failure' in adopted) return fail(UNKNOWN)
  if (adopted.ok === 'not-adopted') return fail(NOT_AVAILABLE)
  return succeed(grant(adopted.ok))
}

/**
 * Adoption, then eligibility. Eligibility is not asked for an endpoint that is not adopted, so
 * "not adopted", "not eligible" and "does not exist" are one answer for every principal.
 */
export async function admit<P, S>(
  ports: GatePorts<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, GateRefusal>> {
  const adopted = await admitWithoutEligibility(ports, access, ref)
  if ('failure' in adopted) return adopted
  const verdict = await ports.eligibility.check(access, ref)
  switch (verdict.kind) {
    case 'granted':
      return adopted
    case 'unknown':
      return fail(UNKNOWN)
    case 'refused':
      return verdict.reason === 'not-eligible'
        ? fail(NOT_AVAILABLE)
        : fail({ kind: 'blocked', reason: verdict.reason })
    default: {
      const exhaustive: never = verdict
      return exhaustive
    }
  }
}
