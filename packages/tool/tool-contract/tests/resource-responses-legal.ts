// The providers of the resource response suite that the contract allows, beyond the shared ones of
// external-association-legal.ts, and how a provider of the shared calls becomes a fixture of this
// port. Each is built at the port boundary and never calls a control of a double.
import type { ToolResourceResponses } from '@omne-harness/tool-contract'
import {
  memoryToolResourceResponsesFixture,
  resourceResponsesAnswers,
  type ToolResourceResponsesFixture,
} from '@omne-harness/tool-contract/testing'
import { externalGenerated, externalLegal, type Legal } from './external-association-legal.ts'
import type { ExternalPort, MakeVariant } from './external-association-variants.ts'

type Fixture = ToolResourceResponsesFixture<string>
type Responses = ToolResourceResponses<string>

/** The methods of this port that take a mutation and answer evidence: `expire` besides the shared two. */
export const MUTATORS = ['ensure', 'invalidate', 'expire'] as const

/** The fixture of a provider laid over the calls that the resource responses share (P06). */
export const makeShared: MakeVariant<Fixture> = build => () => {
  const base = memoryToolResourceResponsesFixture()
  const laid = build(base.responses as unknown as ExternalPort, base)
  const responses = { ...base.responses, ...laid.port } as Responses
  return { ...base, ...laid.handles, responses }
}

/** The generated provider of the table, with or without its `settle`. */
export const generated = (kind: string, settle = true): (() => Fixture) =>
  externalGenerated(makeShared, resourceResponsesAnswers, kind, { settle, mutators: MUTATORS })

/** The shared legal providers, with `expire` deferred as the other mutators are. */
export const sharedLegal = (): readonly Legal<Fixture>[] =>
  externalLegal(makeShared, { mutators: MUTATORS })

/** The double with one tenant only: the cross-tenant cases have no second access. */
export function oneTenant(): Fixture {
  const { otherAccess: _other, ...rest } = memoryToolResourceResponsesFixture()
  return rest
}
