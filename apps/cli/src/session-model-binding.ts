import type {
  SessionRuntimeBinding,
  SessionModelSelectionInput,
  ModelRuntimeHostInputs,
  ModelRuntimeOperations,
} from '@omne-harness-lite/model-request-runtime'
import type {
  createModelRuntime,
  CallFactsView,
} from '@omne-harness-lite/model-request-runtime-local'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  LocalSessionIngress,
  SessionLifecycleStep,
} from '@omne-harness-lite/session-runtime-local'
import type { SessionOriginalModelOwner, ModelIssueUnknown } from './session-model-owner.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
/** Actual scoped providers and original preparation supplied by the trusted running host. */
export interface SessionRunModelBindingOptions {
  readonly ingress: LocalSessionIngress
  readonly issueOwner: SessionOriginalModelOwner
  readonly scope: SessionScope
  readonly preparation: Preparation
  readonly selection: Omit<SessionModelSelectionInput, 'binding'>
  readonly providers: Omit<SessionRuntimeBinding, 'log' | 'selection'>
  readonly retainUnknown: (result: ModelIssueUnknown) => Promise<void>
  readonly model: Pick<ReturnType<typeof createModelRuntime>, 'project'>
  readonly facts: CallFactsView
  readonly host: Omit<ModelRuntimeHostInputs, 'sessions'>
}
export interface SessionRunModelBinding {
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
  try {
    const log = Object.freeze({
      session: journal.scope.session,
      tenant: journal.scope.tenant,
      log: journal.log,
      readPrefix: journal.readPrefix,
      generation: journal.generation,
      currentGeneration: journal.currentGeneration,
      originalIssue: options.issueOwner.bind(
        options.ingress,
        journal.scope,
        options.preparation,
        options.retainUnknown,
      ),
    })
    const binding = Object.freeze<SessionRuntimeBinding>({
      ...options.providers,
      sourceVersions: Object.freeze({ ...options.providers.sourceVersions }),
      log,
      selection: Object.freeze({ ...options.selection, binding: log }),
    })
    const operations = options.model.project(
      {
        ...options.host,
        sessions: {
          bind: async session =>
            session === journal.scope.session ? { binding } : { failure: 'invalidInput' },
        },
      },
      options.facts,
    )
    return Object.freeze({ binding, operations, returnJournal: journal.close })
  } catch (error) {
    try {
      await journal.close()
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'model binding and journal return failed')
    }
    throw error
  }
}
