import type {
  AgentAdoptions,
  Failure,
  InstructionSection,
  ModelRecipient,
  ProducedResult,
  RuntimeConditions,
  SelectedModel as AgentSelectedModel,
} from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { ModelRequestPreparation } from '@omne-harness/model-contract/provider'
import type {
  Access,
  Adoption,
  AssemblyFailure,
  AssemblyUnknown,
  PromptContributionSet,
  PromptSection,
  ScopeRef,
  SelectedModel,
  SourceRead,
  StepInput,
  ToolAdoption,
} from '@omne-harness/request-context-contract'
import { canonical, digest } from './records.ts'

export type { ModelRequestPreparation }
type ModelFailure = Extract<
  Awaited<ReturnType<ModelRequestPreparation<unknown>['prepare']>>,
  { failure: unknown }
>['failure']

export type NoValue = Exclude<SourceRead<never>, { kind: 'value' }>

export const OWNER = 'agent-context'

export const unavailable = (diagnostic: string, owner: string = OWNER): Failure => ({
  kind: 'unavailable',
  owner,
  diagnostic,
})

export function recipientModel(recipient: ModelRecipient): string {
  return canonical(recipient.profile)
}
export function recipientText(recipient: ModelRecipient): string {
  return `${recipient.route}/${recipientModel(recipient)}`
}

export function selectedModel(selection: AgentSelectedModel): SelectedModel {
  const profile = selection.resolution.profile
  const [first] = profile.definition.suppliers
  return {
    recipient: { route: selection.recipient.route, model: recipientModel(selection.recipient) },
    profile,
    parameters: selection.parameters.map(applied => ({
      supplier: first.adoption,
      applied,
      origin: { kind: 'explicit', requested: applied, source: selection.recipient.profile },
    })),
    replay: 'on',
    toolsEvidence: selection.tools,
    evidence: selection.evidence,
  }
}

export type ToolsSource<P> = (
  input: Readonly<{ access: Access<P>; conditions: RuntimeConditions | null }>,
) => Promise<SourceRead<readonly ToolAdoption[]>>

export type DefinitionSource<P> = (
  input: Readonly<{ access: Access<P>; definition: Adoption }>,
) => Promise<SourceRead<readonly InstructionSection[] | null>>

export const absentDefinitions: DefinitionSource<unknown> = async () => ({
  kind: 'unavailable',
  diagnostic: 'definition-source-absent',
})

export function definitionSourceOf<P>(
  adoptions: Pick<AgentAdoptions<P>, 'resolve'>,
): DefinitionSource<P> {
  return async ({ access, definition }) => {
    let resolved
    try {
      resolved = await adoptions.resolve({ ...access, adoption: definition })
    } catch {
      return { kind: 'unavailable', diagnostic: 'definition-resolution-failed' }
    }
    if ('ok' in resolved)
      return { kind: 'value', value: resolved.ok.definition.instructions ?? null }
    const { failure } = resolved
    switch (failure.kind) {
      case 'denied':
        return { kind: 'denied' }
      case 'invalid':
        return {
          kind: 'unavailable',
          diagnostic: `definition-invalid: ${failure.field}: ${failure.reason}`,
        }
      case 'unavailable':
        return { kind: 'unavailable', diagnostic: `definition-unavailable: ${failure.diagnostic}` }
      default:
        return { kind: 'unavailable', diagnostic: `definition-resolution: ${failure.kind}` }
    }
  }
}

const DEFINITION_ORDER = '0-definition-'
export const DEFINITION_SECTION_PREFIX = 'definition/'

export function definitionContributions(
  definition: Adoption,
  scope: ScopeRef,
  sections: readonly InstructionSection[],
): PromptContributionSet {
  const contributions: PromptSection[] = sections.map((section, index) => ({
    kind: 'section',
    name: `${DEFINITION_SECTION_PREFIX}${section.id}`,
    scope,
    source: definition,
    revision: digest(section.text),
    order: `${DEFINITION_ORDER}${String(index).padStart(3, '0')}`,
    template: section.text,
    uses: [],
  }))
  return { contributions, digest: digest(sections), generation: null }
}

export type StepSummary = Extract<StepInput, { kind: 'summary' }>['produced']

export type StepResultSource<P> = (
  input: Readonly<{ access: Access<P>; produced: ProducedResult }>,
) => Promise<SourceRead<StepSummary>>

export const absentStepResults: StepResultSource<unknown> = async () => ({
  kind: 'unavailable',
  diagnostic: 'step-result-source-absent',
})

export function failureOfAssembly(failure: AssemblyFailure | AssemblyUnknown): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    case 'unavailable':
      return unavailable(failure.diagnostic, failure.owner)
    case 'unknown':
      return unavailable(`${failure.source}-unknown: ${failure.diagnostic}`, 'request-context')
  }
}

export function failureOfRead(read: NoValue, owner: string, action: string): Failure {
  switch (read.kind) {
    case 'denied':
      return { kind: 'denied', action }
    case 'invalid':
      return { kind: 'invalid', field: read.field, reason: read.reason }
    case 'unknown':
      return unavailable('unknown', owner)
    case 'unavailable':
      return unavailable(read.diagnostic, owner)
  }
}

export function failureOfModel(failure: ModelFailure): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: 'request', reason: failure.reason }
    case 'unsupported':
      return { kind: 'invalid', field: 'request', reason: `unsupported: ${failure.field}` }
    case 'unavailable':
      return unavailable(failure.diagnostic, failure.dependency)
    case 'conflict':
    case 'commit-unknown':
    case 'stale-instance':
    case 'not-settled':
    case 'handoff-invalid':
      return unavailable(failure.kind, 'model-request-preparation')
  }
}

export function jsonOf(value: unknown): JsonValue {
  if (value === null || value === undefined) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (typeof value === 'bigint') return { kind: 'number', lexeme: value.toString() }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(jsonOf) }
  if (typeof value === 'object')
    return {
      kind: 'object',
      entries: Object.entries(value)
        .filter(([, member]) => member !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, member]) => ({ key, value: jsonOf(member) })),
    }
  return { kind: 'null' }
}
