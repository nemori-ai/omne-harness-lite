import type {
  CallKey,
  LocalCallResponsibility,
  PlannedSemantics,
  SessionModelReadInput,
  SessionModelReads,
} from '@omne-harness-lite/model-request-runtime'
import { runtimeCustody, type AcknowledgementCustody } from './acknowledgement-custody.ts'
import { retainRuntimeProjection, type ProjectedComponent } from './runtime-projection.ts'
import type { RuntimeConstruction } from './service-types.ts'

function localFacts<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
  key: CallKey,
) {
  const view = construction.calls.find(key)?.view()
  const responsibility: LocalCallResponsibility | undefined =
    view?.operation.phase === 'ready'
      ? { session: key.session, callId: key.callId, phase: 'open' }
      : view?.operation.phase === 'reply_pending'
        ? {
            session: key.session,
            callId: key.callId,
            phase: 'reply_pending',
            responseId: view.operation.pending.id,
          }
        : undefined
  return {
    responsibility,
    usable: () => !view?.request.host.stopping() && !view?.request.host.signal.aborted,
  }
}

function readInput<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
  custody: SessionModelReadInput['custody'],
): SessionModelReadInput {
  return {
    sessions: construction.sessions,
    callAccess: construction.callAccess,
    history: construction.history,
    selectionFactory: construction.selectionFactory,
    local: key => localFacts(construction, key),
    content: construction.callFacts.content,
    ...(custody === undefined ? {} : { custody }),
  }
}

export function createRuntimeReads<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
  sharedCustody?: AcknowledgementCustody,
): ProjectedComponent<Pick<SessionModelReads, 'methods' | 'close'>, RuntimeConstruction<P, R>> {
  const original = sharedCustody ?? runtimeCustody(construction)
  const custody: SessionModelReadInput['custody'] =
    original === undefined
      ? undefined
      : {
          view: (binding, facts) => original.view(binding, facts),
          ...(sharedCustody === undefined ? { close: () => original.close() } : {}),
        }
  const reads = construction.readFactory(readInput(construction, custody))
  function project(
    owner: SessionModelReads,
  ): ProjectedComponent<Pick<SessionModelReads, 'methods' | 'close'>, RuntimeConstruction<P, R>> {
    return retainRuntimeProjection({ methods: owner.methods, close: owner.close }, next =>
      project(owner.project(readInput(next, custody))),
    )
  }
  return project(reads)
}
