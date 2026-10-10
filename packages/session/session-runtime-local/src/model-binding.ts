import { createSessionCallAccess } from './call-access.ts'
import type {
  SessionRuntimeBinding,
  SessionModelSelectionInput,
  ModelRuntimeHostInputs,
  ModelRuntimeOperations,
  OriginalIssueAdmission,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { LocalSessionIngress, SessionLifecycleStep } from './runtime-types.ts'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { SessionDriverModelFactory, SessionDriverModelBorrow } from './driver-model-types.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
/** Actual scoped providers and original preparation supplied by the trusted running host. */
export interface SessionRunModelBindingOptions {
  readonly ingress: LocalSessionIngress
  readonly originalIssue: (journal: BorrowedRunJournal) => OriginalIssueAdmission
  readonly scope: SessionScope
  readonly preparation: Preparation
  readonly selection: Omit<SessionModelSelectionInput, 'binding' | 'currentEvaluationInputs'>
  readonly providers: Omit<SessionRuntimeBinding, 'log' | 'selection' | 'currentEvaluationInputs'>
  readonly inputs: (
    journal: BorrowedRunJournal,
  ) =>
    | (SessionRuntimeBinding['currentEvaluationInputs'] & { readonly close: () => Promise<void> })
    | undefined
  readonly model: SessionDriverModelFactory
  readonly host: Omit<ModelRuntimeHostInputs, 'sessions' | 'callAccess'>
  /** Explicit application admission bound for this original Run's read/ACK callbacks. */
  readonly maxCallReads: number
}
export interface SessionRunModelBinding {
  readonly journal: Pick<BorrowedRunJournal, 'scope' | 'readProjection'>
  readonly binding: SessionRuntimeBinding
  readonly operations: ModelRuntimeOperations
  /** Return only after the original model owner has stopped using this binding. */
  readonly returnJournal: () => Promise<void>
}

/** Assemble native selection and execution over one actual original-Run journal borrow. */
export async function createSessionRunModelBinding(
  options: SessionRunModelBindingOptions,
): Promise<
  SessionRunModelBinding | { readonly failure: 'denied' | 'invalidInput' | 'unavailable' }
> {
  const borrowed = await options.ingress.runJournal.borrow(
    options.ingress.coordinationAuthority,
    options.scope,
    options.preparation.run,
  )
  if ('failure' in borrowed) return borrowed
  const journal = borrowed.journal
  const originalCall = options.preparation.call
  let callAccess: ReturnType<typeof createSessionCallAccess> | undefined
  let inputs: ReturnType<SessionRunModelBindingOptions['inputs']>
  let model: SessionDriverModelBorrow | undefined
  let returned: Promise<void> | undefined
  let returnStage = 0
  const returns = [
    () => model?.release(),
    () => callAccess?.close(),
    () => inputs?.close(),
    () => journal.close(),
  ]
  const returnJournal = () =>
    (returned ??= returnOriginal().catch(error => {
      returned = undefined
      throw error
    }))
  async function returnOriginal() {
    while (returnStage < returns.length) {
      await returns[returnStage]!()
      returnStage++
    }
  }
  try {
    inputs = options.inputs(journal)
    if (!inputs) {
      await returnJournal()
      return { failure: 'unavailable' }
    }
    const log = Object.freeze({
      session: journal.scope.session,
      tenant: journal.scope.tenant,
      log: journal.log,
      readPrefix: journal.readPrefix,
      generation: journal.generation,
      currentGeneration: journal.currentGeneration,
      originalIssue: options.originalIssue(journal),
    })
    const binding = Object.freeze<SessionRuntimeBinding>({
      ...options.providers,
      sourceVersions: Object.freeze({ ...options.providers.sourceVersions }),
      currentEvaluationInputs: inputs,
      log,
      selection: Object.freeze({
        ...options.selection,
        binding: log,
        currentEvaluationInputs: inputs,
      }),
    })
    callAccess = createSessionCallAccess({
      journal,
      binding: log,
      ingress: options.ingress,
      preparation: options.preparation,
      maxInFlight: options.maxCallReads,
    })
    const acquired = await options.model.acquire({
      ...options.host,
      callAccess: callAccess.access,
      identities: Object.freeze({
        ...options.host.identities,
        call: () => originalCall,
      }),
      sessions: {
        bind: async session =>
          session === journal.scope.session ? { binding } : { failure: 'invalidInput' },
      },
    })
    if ('unavailable' in acquired) {
      await returnJournal()
      return { failure: 'unavailable' }
    }
    model = acquired
    return Object.freeze({ binding, journal, operations: model.operations, returnJournal })
  } catch (error) {
    try {
      await returnJournal()
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'model binding and journal return failed')
    }
    throw error
  }
}
