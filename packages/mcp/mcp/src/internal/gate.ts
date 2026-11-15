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
import { ask } from './port.ts'

declare const adoptedBrand: unique symbol
declare const admittedBrand: unique symbol

export type AdoptedOnly = AdoptedEndpoint &
  Readonly<{ definition: EndpointDefinition }> & { readonly [adoptedBrand]: true }

export type AdmittedEndpoint = AdoptedOnly & { readonly [admittedBrand]: true }

export type GateRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'blocked' | 'unknown' }>

export type AdoptionRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>

export type GatePorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
}>

export type AdoptionOutcome = 'not-adopted' | 'adoption-unknown' | 'body-unreadable'

export type GateDecision =
  | Readonly<{ kind: 'admitted'; endpoint: AdmittedEndpoint }>
  | Readonly<{ kind: AdoptionOutcome }>
  | Readonly<{ kind: 'not-eligible'; endpoint: AdoptedOnly }>
  | Readonly<{ kind: 'blocked'; reason: BlockedReason; endpoint: AdoptedOnly }>
  | Readonly<{ kind: 'eligibility-unknown'; endpoint: AdoptedOnly }>

export type GateRefused = Exclude<GateDecision, { kind: 'admitted' }>

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

export function assertAdmitted(endpoint: AdoptedEndpoint): asserts endpoint is AdmittedEndpoint {
  if (!admittedTokens.has(endpoint)) throw new TypeError('the endpoint did not pass the MCP gate')
}

function tokenOf(endpoint: AdoptedEndpoint): Outcome<AdoptedOnly, 'body-unreadable'> {
  const parsed = parseEndpointBody(endpoint.body, endpoint.ref.name)
  if ('failure' in parsed) return fail('body-unreadable')
  const token = Object.freeze({ ...endpoint, definition: parsed.ok })
  registerAdopted(token)
  return succeed(token)
}

export async function adopted<P, S>(
  ports: Readonly<{ adoption: AdoptionView<P, S> }>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdoptedOnly, AdoptionOutcome>> {
  const answer = await ask(() => ports.adoption.endpoint(access, ref), fail('unknown'))
  if ('failure' in answer) return fail('adoption-unknown')
  if (answer.ok === 'not-adopted') return fail('not-adopted')
  return tokenOf(answer.ok)
}

export async function judge<P, S>(
  ports: GatePorts<P, S>,
  access: Access<P>,
  endpoint: AdoptedOnly,
): Promise<GateDecision> {
  if (!adoptedTokens.has(endpoint))
    throw new TypeError('the endpoint did not come from the MCP gate')
  const verdict = await ask(() => ports.eligibility.check(access, endpoint.ref), {
    kind: 'unknown',
  })
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

export async function admit<P, S>(
  ports: GatePorts<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<GateDecision> {
  const endpoint = await adopted(ports, access, ref)
  if ('failure' in endpoint) return { kind: endpoint.failure }
  return judge(ports, access, endpoint.ok)
}

export async function admitScope<P, S>(
  ports: GatePorts<P, S>,
  access: Access<P>,
  scope: S,
): Promise<Outcome<readonly GateDecision[], 'adoption-unknown'>> {
  const listed = await ask(() => ports.adoption.endpoints(access, scope), fail('unknown'))
  if ('failure' in listed) return fail('adoption-unknown')
  const decisions: GateDecision[] = []
  for (const endpoint of listed.ok) {
    const token = tokenOf(endpoint)
    decisions.push(
      'failure' in token ? { kind: token.failure } : await judge(ports, access, token.ok),
    )
  }
  return succeed(decisions)
}

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
