import type {
  AgentJournalReading,
  Failure as AgentFailure,
  FinishIntent,
} from '@omne-harness/agent-contract'
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
  ToolLookup,
} from '@omne-harness/tool-contract'
import type { SessionDiagnosticUnknown } from '@omne-harness/public-contract'

export type AgentFinishReader<P> = Pick<AgentJournalReading<P>, 'readFinish'>
export type ModelCallInspector<P> = Pick<ModelCalls<P>, 'inspect' | 'dispatches'>
export type ModelAttemptReader<P> = ModelDiagnostics<P>
export type ToolCallReader<P> = Pick<
  ToolInvocationQueries<P, never>,
  'lookup' | 'account' | 'readDiagnostics'
>
export type CallAccount = Extract<
  Awaited<ReturnType<ToolCallReader<unknown>['account']>>,
  { ok: unknown }
>['ok']

export type DiagnosticPorts<P> = Readonly<{
  agentJournal?: AgentFinishReader<P>
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

function reasonOf(failure: OwnerFailure, referenceField: string): SourceGapReason {
  if (failure.kind === 'invalid')
    return failure.field === referenceField ? 'not-found' : 'unavailable'
  return GAP_OF[failure.kind] ?? 'unavailable'
}

async function answerOf<T>(
  call: () => Promise<Outcome<T, OwnerFailure>>,
  referenceField: string,
): Promise<SourceAnswer<T>> {
  let outcome: Outcome<T, OwnerFailure>
  try {
    outcome = await call()
  } catch {
    return UNAVAILABLE
  }
  if ('failure' in outcome)
    return { kind: 'gap', reason: reasonOf(outcome.failure, referenceField) }
  return { kind: 'value', value: outcome.ok }
}

export interface DiagnosticSources {
  readFinish(execution: string): Promise<SourceAnswer<FinishIntent | null>>
  inspectModelCall(reference: string): Promise<SourceAnswer<Lookup>>
  listModelAttempts(call: string): Promise<SourceAnswer<ModelDiagnosticsPage>>
  listModelDispatches(call: string): Promise<SourceAnswer<readonly DispatchRecord[]>>
  lookupToolCall(reference: string): Promise<SourceAnswer<ToolLookup>>
  readToolAccount(reference: string): Promise<SourceAnswer<CallAccount>>
  readToolDiagnostics(reference: string): Promise<SourceAnswer<DiagnosticPage>>
}

export function sourcesOf<P>(access: Access<P>, ports: DiagnosticPorts<P>): DiagnosticSources {
  const { agentJournal, modelCalls, modelDiagnostics, toolQueries } = ports
  const readFinish = agentJournal?.readFinish?.bind(agentJournal)
  return {
    readFinish: execution =>
      readFinish === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(() => readFinish({ ...access, execution: execution as never }), 'execution'),
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
    lookupToolCall: reference =>
      toolQueries === undefined
        ? Promise.resolve(UNSUPPORTED)
        : answerOf(
            () => toolQueries.lookup({ ...access, reference: reference as never }),
            'reference',
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
