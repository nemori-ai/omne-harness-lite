import type { Failure as AgentFailure } from '@omne-harness/agent-contract'
import type { Access } from '@omne-harness/legal-identity'
import type {
  DispatchRecord,
  Lookup,
  ModelCalls,
  ModelDiagnostics,
  ModelDiagnosticsPage,
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
export type ToolCallReader<P> = Pick<ToolStreamReferences<P>, 'current'> &
  Pick<ToolInvocationQueries<P, never>, 'account' | 'readDiagnostics'>
export type CallAccount = Extract<
  Awaited<ReturnType<ToolCallReader<unknown>['account']>>,
  { ok: unknown }
>['ok']

export type DiagnosticPorts<P> = Readonly<{
  modelCalls?: ModelCallInspector<P>
  modelDiagnostics?: ModelAttemptReader<P>
  toolQueries?: ToolCallReader<P>
}>

export type SourceGapReason = SessionDiagnosticUnknown['reason']
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
  readToolState(reference: string): Promise<SourceAnswer<ToolStreamSelection>>
  readToolAccount(reference: string): Promise<SourceAnswer<CallAccount>>
  readToolDiagnostics(reference: string): Promise<SourceAnswer<DiagnosticPage>>
}

export function sourcesOf<P>(access: Access<P>, ports: DiagnosticPorts<P>): DiagnosticSources {
  const { modelCalls, modelDiagnostics, toolQueries } = ports
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
