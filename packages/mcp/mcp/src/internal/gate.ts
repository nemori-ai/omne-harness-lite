// The gate (SPEC S1): adoption first, eligibility second, in that order, in one place. The body
// is parsed here once. Two capability tokens come out: `AdoptedOnly` (adopted, body read,
// eligibility not decided) and `AdmittedEndpoint` (eligible as well). Only this module grants
// them; a function that needs a connection takes `AdmittedEndpoint`, so passing the gate is
// checked by the compiler and, for a forged object, by `assertAdmitted` at run time.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  parseEndpointBody,
  type BlockedReason,
  type EndpointDefinition,
  type EndpointRef,
  type Refusal,
} from '@omne-harness/mcp-contract'
import type {
  AdoptedEndpoint,
  AdoptionView,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'

declare const adoptedBrand: unique symbol
declare const admittedBrand: unique symbol

/** An adopted endpoint with its parsed body. Eligibility is not decided. A frozen copy. */
export type AdoptedOnly = AdoptedEndpoint &
  Readonly<{ definition: EndpointDefinition }> & { readonly [adoptedBrand]: true }

/** An adopted endpoint the principal is eligible for. Only `judge` grants it. */
export type AdmittedEndpoint = AdoptedOnly & { readonly [admittedBrand]: true }

/** The refusals of the gate: the three that need no setting value. */
export type GateRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'blocked' | 'unknown' }>

/** The refusals of adoption alone. */
export type AdoptionRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>

export type GatePorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
}>

/** Why adoption did not hand out an endpoint. */
export type AdoptionOutcome = 'not-adopted' | 'adoption-unknown' | 'body-unreadable'

/** The one decision of S1. Every service composes on it. */
export type GateDecision =
  | Readonly<{ kind: 'admitted'; endpoint: AdmittedEndpoint }>
  | Readonly<{ kind: AdoptionOutcome }>
  | Readonly<{ kind: 'not-eligible'; endpoint: AdoptedOnly }>
  | Readonly<{ kind: 'blocked'; reason: BlockedReason; endpoint: AdoptedOnly }>
  | Readonly<{ kind: 'eligibility-unknown'; endpoint: AdoptedOnly }>

export type GateRefused = Exclude<GateDecision, { kind: 'admitted' }>

// The tokens this module granted. An in-process proof: a copy or a forged object is not in it.
const adoptedTokens = new WeakSet<object>()
const admittedTokens = new WeakSet<object>()

function registerAdopted(
  token: AdoptedEndpoint & Readonly<{ definition: EndpointDefinition }>,
): asserts token is AdoptedOnly {
  adoptedTokens.add(token)
}

function registerAdmitted(token: AdoptedOnly): asserts token is AdmittedEndpoint {
  adoptedTokens.add(token)
  admittedTokens.add(token)
}

/** Throws `TypeError` for an endpoint that did not pass eligibility at this gate. */
export function assertAdmitted(endpoint: AdoptedEndpoint): asserts endpoint is AdmittedEndpoint {
  if (!admittedTokens.has(endpoint)) throw new TypeError('the endpoint did not pass the MCP gate')
}

/** The adopted-only token of an endpoint the adoption port handed out, with its body parsed. */
export function adoptedOnlyOf(endpoint: AdoptedEndpoint): Outcome<AdoptedOnly, 'body-unreadable'> {
  const parsed = parseEndpointBody(endpoint.body, endpoint.ref.name)
  if ('failure' in parsed) return fail('body-unreadable')
  const token = Object.freeze({ ...endpoint, definition: parsed.ok })
  registerAdopted(token)
  return succeed(token)
}

/** Adoption only: the endpoint by reference, as a token without eligibility. */
export async function adopted<P, S>(
  ports: Readonly<{ adoption: AdoptionView<P, S> }>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdoptedOnly, AdoptionOutcome>> {
  const answer = await ports.adoption.endpoint(access, ref)
  if ('failure' in answer) return fail('adoption-unknown')
  if (answer.ok === 'not-adopted') return fail('not-adopted')
  return adoptedOnlyOf(answer.ok)
}

/** Eligibility on an adopted endpoint: the second half of S1, and the only grant of admission. */
export async function judge<P, S>(
  ports: GatePorts<P, S>,
  access: Access<P>,
  endpoint: AdoptedOnly,
): Promise<GateDecision> {
  const verdict = await ports.eligibility.check(access, endpoint.ref)
  switch (verdict.kind) {
    case 'granted': {
      const token = Object.freeze({ ...endpoint })
      registerAdmitted(token)
      return { kind: 'admitted', endpoint: token }
    }
    case 'unknown':
      return { kind: 'eligibility-unknown', endpoint }
    case 'refused':
      return verdict.reason === 'not-eligible'
        ? { kind: 'not-eligible', endpoint }
        : { kind: 'blocked', reason: verdict.reason, endpoint }
    default: {
      const exhaustive: never = verdict
      return exhaustive
    }
  }
}

/**
 * Adoption, then eligibility. Eligibility is not asked for an endpoint that is not adopted, so
 * "not adopted", "not eligible" and "does not exist" are one answer for every principal.
 */
export async function admit<P, S>(
  ports: GatePorts<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<GateDecision> {
  const endpoint = await adopted(ports, access, ref)
  if ('failure' in endpoint) return { kind: endpoint.failure }
  return judge(ports, access, endpoint.ok)
}

/** The refusal a decision other than `admitted` is reported as (SPEC R1, S1). */
export function refusalOf(decision: GateRefused): GateRefusal {
  switch (decision.kind) {
    case 'not-adopted':
    case 'not-eligible':
      return { kind: 'not-available-to-you' }
    case 'blocked':
      return { kind: 'blocked', reason: decision.reason }
    case 'adoption-unknown':
    case 'body-unreadable':
    case 'eligibility-unknown':
      return { kind: 'unknown' }
    default: {
      const exhaustive: never = decision
      return exhaustive
    }
  }
}

/** The refusal of adoption alone, for the task operations that reuse a connection (SPEC S2). */
export async function admitWithoutEligibility<P, S>(
  ports: Readonly<{ adoption: AdoptionView<P, S> }>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdoptedOnly, AdoptionRefusal>> {
  const endpoint = await adopted(ports, access, ref)
  if ('failure' in endpoint)
    return fail(
      endpoint.failure === 'not-adopted' ? { kind: 'not-available-to-you' } : { kind: 'unknown' },
    )
  return endpoint
}
