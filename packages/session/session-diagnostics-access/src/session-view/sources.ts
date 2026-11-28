import type { Failure as AgentFailure } from '@omne-harness/agent-contract'
import type { Access } from '@omne-harness/legal-identity'
import type {
  DispatchRecord,
  Lookup,
  ModelCalls,
  ModelDiagnostics,
  ModelDiagnosticsPage,
  ModelDispatchFact,
  ModelDispatchFacts,
  ModelFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  DiagnosticPage,
  ToolFailure,
  ToolInvocationQueries,
  ToolStreamReferences,
  ToolStreamSelection,
} from '@omne-harness/tool-contract'
import type { SessionDiagnosticUnknown } from '../view-types.ts'

export type ModelCallInspector<P> = Pick<ModelCalls<P>, 'inspect' | 'dispatches'>
export type ModelAttemptReader<P> = ModelDiagnostics<P>
export type ModelFactReader<P> = Required<Pick<ModelDispatchFacts<P>, 'ofCall'>>
export type ToolCallReader<P> = Pick<ToolStreamReferences<P>, 'current'> &
  Pick<ToolInvocationQueries<P, never>, 'account' | 'readDiagnostics'>
export type CallAccount = Extract<
  Awaited<ReturnType<ToolCallReader<unknown>['account']>>,
  { ok: unknown }
>['ok']

export type SourceGapReason = SessionDiagnosticUnknown['reason']

/** One block of a fixed request: the form Request Context chose, and the media type of the block. */
export type RequestBlockChoice = Readonly<{
  message: string
  block: string
  choice: 'original' | 'derived' | 'transcript'
  mediaType: string | null
}>
export interface ModelRequestReader<P> {
  readChoices(
    input: Access<P> & Readonly<{ session: string; reference: string }>,
  ): Promise<Outcome<readonly RequestBlockChoice[], Readonly<{ reason: SourceGapReason }>>>
}

export type DiagnosticPorts<P> = Readonly<{
  modelCalls?: ModelCallInspector<P>
  modelDiagnostics?: ModelAttemptReader<P>
  modelFacts?: ModelFactReader<P>
  modelRequests?: ModelRequestReader<P>
  toolQueries?: ToolCallReader<P>
}>
export type SourceAnswer<T> =
  | Readonly<{ kind: 'value'; value: T }>
  | Readonly<{ kind: 'gap'; reason: SourceGapReason }>

export const UNSUPPORTED: SourceAnswer<never> = Object.freeze({
  kind: 'gap',
  reason: 'unsupported',
})
export const UNAVAILABLE: SourceAnswer<never> = Object.freeze({
  kind: 'gap',
  reason: 'unavailable',
})

export const DISPATCH_LIMIT = 64

type OwnerFailure = AgentFailure | ModelFailure | ToolFailure

const GAP_OF: Readonly<Record<Exclude<OwnerFailure['kind'], 'invalid'>, SourceGapReason>> = {
  denied: 'denied',
  unavailable: 'unavailable',
  unsupported: 'unsupported',
  'not-settled': 'not-recorded',
  reclaimed: 'not-recorded',
  'not-found': 'not-found',
  conflict: 'unavailable',
  'commit-unknown': 'unavailable',
  'stale-instance': 'unavailable',
  'stale-revision': 'unavailable',
  'stale-advance': 'unavailable',
  'invalid-cursor': 'unavailable',
  'handoff-invalid': 'unavailable',
  'not-ready': 'unavailable',
  terminal: 'unavailable',
  busy: 'unavailable',
  changed: 'unavailable',
}

function reasonOf(
  failure: OwnerFailure,
  referenceField: string,
  unknownReference: SourceGapReason,
): SourceGapReason {
  if (failure.kind === 'invalid')
    return failure.field === referenceField ? unknownReference : 'unavailable'
  return GAP_OF[failure.kind] ?? 'unavailable'
}

async function answerOf<T>(
  call: () => Promise<Outcome<T, OwnerFailure>>,
  referenceField: string,
  unknownReference: SourceGapReason = 'not-found',
): Promise<SourceAnswer<T>> {
  let outcome: Outcome<T, OwnerFailure>
  try {
    outcome = await call()
  } catch {
    return UNAVAILABLE
  }
  if ('failure' in outcome)
    return { kind: 'gap', reason: reasonOf(outcome.failure, referenceField, unknownReference) }
  return { kind: 'value', value: outcome.ok }
}

export interface DiagnosticSources {
  inspectModelCall(reference: string): Promise<SourceAnswer<Lookup>>
  listModelAttempts(call: string): Promise<SourceAnswer<ModelDiagnosticsPage>>
  listModelDispatches(call: string): Promise<SourceAnswer<readonly DispatchRecord[]>>
  listModelFacts(call: string): Promise<SourceAnswer<readonly ModelDispatchFact[]>>
  readRequestChoices(reference: string): Promise<SourceAnswer<readonly RequestBlockChoice[]>>
  readToolState(reference: string): Promise<SourceAnswer<ToolStreamSelection>>
  readToolAccount(reference: string): Promise<SourceAnswer<CallAccount>>
  readToolDiagnostics(reference: string): Promise<SourceAnswer<DiagnosticPage>>
}

async function choicesOf<P>(
  reader: ModelRequestReader<P>,
  input: Parameters<ModelRequestReader<P>['readChoices']>[0],
): Promise<SourceAnswer<readonly RequestBlockChoice[]>> {
  try {
    const outcome = await reader.readChoices(input)
    return 'failure' in outcome
      ? { kind: 'gap', reason: outcome.failure.reason }
      : { kind: 'value', value: outcome.ok }
  } catch {
    return UNAVAILABLE
  }
}

export function sourcesOf<P>(
  access: Access<P>,
  ports: DiagnosticPorts<P>,
  session: string,
): DiagnosticSources {
  const { modelCalls, modelDiagnostics, modelFacts, modelRequests, toolQueries } = ports
  return {
    inspectModelCall: reference =>
      modelCalls === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(
            () => modelCalls.inspect({ ...access, reference: reference as never }),
            'reference',
          ),
    listModelAttempts: call =>
      modelDiagnostics === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(
            () =>
              modelDiagnostics.list({
                ...access,
                call: call as never,
                after: null,
                limit: DISPATCH_LIMIT,
              }),
            'call',
          ),
    listModelDispatches: call =>
      modelCalls === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(() => modelCalls.dispatches({ ...access, call: call as never }), 'call'),
    listModelFacts: call =>
      modelFacts === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(() => modelFacts.ofCall({ ...access, call: call as never }), 'call'),
    readRequestChoices: reference =>
      modelRequests === undefined
        ? Promise.resolve(UNSUPPORTED)
        : choicesOf(modelRequests, { ...access, session, reference }),
    readToolState: reference =>
      toolQueries === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(
            () => toolQueries.current({ access, reference: reference as never }),
            'reference',
            'not-recorded',
          ),
    readToolAccount: reference =>
      toolQueries === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(
            () => toolQueries.account({ ...access, reference: reference as never }),
            'reference',
          ),
    readToolDiagnostics: reference =>
      toolQueries === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(
            () =>
              toolQueries.readDiagnostics({
                ...access,
                reference: reference as never,
                after: null,
              }),
            'reference',
          ),
  }
}
