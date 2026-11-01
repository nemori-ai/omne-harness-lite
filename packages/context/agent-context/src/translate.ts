// The translation between the Agent ports and the Request Context call, by the field and failure
// tables of request-context-contract docs/context.md. Pure functions: no reads, no state.
import type {
  Failure,
  ModelRecipient,
  ProducedResult,
  RuntimeConditions,
  SelectedModel as AgentSelectedModel,
} from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { ModelRequestPreparationService } from '@omne-harness/model-cordis-contract/cordis'
import type {
  Access,
  AssemblyFailure,
  AssemblyUnknown,
  SelectedModel,
  SourceRead,
  StepInput,
  ToolAdoption,
} from '@omne-harness/request-context-contract'
import { canonical } from './records.ts'

/** The request preparation port of Model, as its Cordis service projects it. */
export type ModelRequestPreparation<P> = Pick<ModelRequestPreparationService<P>, 'prepare'>
type ModelFailure = Extract<
  Awaited<ReturnType<ModelRequestPreparation<unknown>['prepare']>>,
  { failure: unknown }
>['failure']

/** A read that did not give a value. */
export type NoValue = Exclude<SourceRead<never>, { kind: 'value' }>

/** The owner that agent-context names in the failures it makes itself. */
export const OWNER = 'agent-context'

export const unavailable = (diagnostic: string, owner: string = OWNER): Failure => ({
  kind: 'unavailable',
  owner,
  diagnostic,
})

/** The recipient as Request Context compares it: the route and the adopted profile. */
export function recipientModel(recipient: ModelRecipient): string {
  return canonical(recipient.profile)
}
export function recipientText(recipient: ModelRecipient): string {
  return `${recipient.route}/${recipientModel(recipient)}`
}

/**
 * The fifth group. The Agent selection names the parameters it chose; each one enters as an
 * explicit adoption of the first supplier of the resolved profile, named by the selected profile.
 * Replay stays on: the Agent selection has no switch for it.
 */
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

/** Reads the tools that one call may use; the sixth group has no source contract yet. */
export type ToolsSource<P> = (
  input: Readonly<{ access: Access<P>; conditions: RuntimeConditions | null }>,
) => Promise<SourceRead<readonly ToolAdoption[]>>

/**
 * The first-wave rule of the sixth group: no tool when the conditions name no binding, and
 * `tools-source-absent` otherwise. Without conditions (`derive`, `resume`) the source is absent.
 */
export const firstWaveTools: ToolsSource<unknown> = async ({ conditions }) =>
  conditions !== null && conditions.bindings.length === 0
    ? { kind: 'value', value: [] }
    : { kind: 'unavailable', diagnostic: 'tools-source-absent' }

/** The summary blocks of one produced step result. */
export type StepSummary = Extract<StepInput, { kind: 'summary' }>['produced']

/** Reads the summary that one compaction step produced. */
export type StepResultSource<P> = (
  input: Readonly<{ access: Access<P>; produced: ProducedResult }>,
) => Promise<SourceRead<StepSummary>>

/** The first-wave reader: no step result is readable (COMPACTION-PATH). */
export const absentStepResults: StepResultSource<unknown> = async () => ({
  kind: 'unavailable',
  diagnostic: 'step-result-source-absent',
})

/** The three failure classes of Request Context, by name; an unknown outcome is unavailable. */
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

/** A source read that gave no value, as the failure of the port that asked it. */
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

/**
 * The answer of the Model request preparation. A deterministic refusal is `invalid` on `request`
 * with the reason of Model; a temporary one keeps its class.
 */
export function failureOfModel(failure: ModelFailure): Failure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: failure.action }
    case 'invalid':
      return { kind: 'invalid', field: 'request', reason: failure.reason }
    case 'unsupported':
      return { kind: 'invalid', field: 'request', reason: `unsupported: ${failure.field}` }
    case 'capacity':
      return { kind: 'invalid', field: 'request', reason: 'capacity' }
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

/** Plain data as a JSON value; `undefined` members are left out, as in the canonical text. */
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
