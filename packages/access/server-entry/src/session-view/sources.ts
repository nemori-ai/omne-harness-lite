// The source adapters of the projection (SPEC「会话诊断投影」): the ports this member declares
// toward Agent, Model and Tool in its own words, and the mapping of each port's answer to a value
// or a gap reason. Every port may be absent; an absent port is `unsupported`. A port that throws
// is `unavailable`. Nothing here writes: the ports are the read role groups of their owners.
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

/** The finish read of Agent; `readFinish` stays optional, as the Agent contract declares it. */
export type AgentFinishReader<P> = Pick<AgentJournalReading<P>, 'readFinish'>
/** The reference resolution and the dispatch records of Model's calls: the records carry the account of each dispatch. */
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

/** The four read ports of the projection. Each may be absent in a deployment. */
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

/** The most dispatch records one call reads; more than this is a `truncated` gap of the call. */
export const DISPATCH_LIMIT = 64

/** A failure of one of the three owners the projection reads. */
type OwnerFailure = AgentFailure | ModelFailure | ToolFailure

/**
 * The gap reason of each failure kind of the three owners, except `invalid`, which depends on the
 * field. The table is total over the kinds the contracts declare: a kind one of them adds fails
 * here. The three that name a gap reason keep their name; `not-settled` means the owner has no
 * such record yet; every other kind says the owner could not answer this read now.
 */
const GAP_OF: Readonly<Record<Exclude<OwnerFailure['kind'], 'invalid'>, SourceGapReason>> = {
  denied: 'denied',
  unavailable: 'unavailable',
  unsupported: 'unsupported',
  'not-settled': 'not-recorded',
  'not-found': 'not-found',
  capacity: 'unavailable',
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

/**
 * `invalid` on the field that carried the reference is a reference the owner does not read: not
 * found (RFC-0013「组合规则」2). `invalid` on another field refuses this projection's own request,
 * which the view can only report as the owner not answering.
 */
function reasonOf(failure: OwnerFailure, referenceField: string): SourceGapReason {
  if (failure.kind === 'invalid')
    return failure.field === referenceField ? 'not-found' : 'unavailable'
  // A provider that answers outside its contract's kinds reads as not answering.
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
  /** The first page of Tool's diagnostics of the call. */
  readToolDiagnostics(reference: string): Promise<SourceAnswer<DiagnosticPage>>
}

/** Binds the ports to one caller's access. Each read carries the acting principal and the tenant. */
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
