import type { ToolResourceResponses } from '@omne-harness/tool-contract/provider'
import {
  memoryToolResourceResponsesFixture,
  resourceResponsesAnswers,
  type ToolResourceResponsesFixture,
} from '@omne-harness/tool-contract/testing'
import { externalGenerated, externalLegal, type Legal } from './external-association-legal.ts'
import type { ExternalPort, MakeVariant } from './external-association-variants.ts'

type Fixture = ToolResourceResponsesFixture<string>
type Responses = ToolResourceResponses<string>

export const MUTATORS = ['ensure', 'invalidate', 'expire'] as const

export const makeShared: MakeVariant<Fixture> = build => () => {
  const base = memoryToolResourceResponsesFixture()
  const laid = build(base.responses as unknown as ExternalPort, base)
  const responses = { ...base.responses, ...laid.port } as Responses
  return { ...base, ...laid.handles, responses }
}

export const generated = (kind: string, settle = true): (() => Fixture) =>
  externalGenerated(makeShared, resourceResponsesAnswers, kind, { settle, mutators: MUTATORS })

export const sharedLegal = (): readonly Legal<Fixture>[] =>
  externalLegal(makeShared, { mutators: MUTATORS })

export function oneTenant(): Fixture {
  const { otherAccess: _other, ...rest } = memoryToolResourceResponsesFixture()
  return rest
}
