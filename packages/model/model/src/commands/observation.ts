import type { Outcome } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  resolveModelInvocationRef,
  encodeModelInvocationRef,
  type ModelFailure,
  type Reply,
} from '@omne-harness/model-contract'
import { createModelObservationSource } from '../stream-source.ts'
import type {
  ModelObservationLimits,
  ModelObservationSource,
  ModelObservationTiming,
  ObservationFacts,
  ObservationRead,
} from '../stream-types.ts'
import { initialRunPort, type ModelInitialRun } from './initial.ts'
import type { InitialTarget } from './initial.ts'
import type { ModelCommandStorage, RunScope } from './storage.ts'
import type {
  CallDocument,
  ModelCommandsAuthority,
  ModelConfirmationDiagnostic,
  ModelConfirmationPass,
  ModelRunCompletion,
} from './types.ts'
import { checkedActor, tenantKey } from './value.ts'

type MutablePass = { -readonly [K in keyof ModelConfirmationPass]: ModelConfirmationPass[K] }
function factsTarget(tenant: string, call: InitialTarget['call']): InitialTarget | null {
  const parsed = tenantCodec.parse(tenant)
  return parsed.ok ? { tenant: parsed.value, call } : null
}

function facts(tenant: string, call: CallDocument): ObservationFacts | null {
  const target = factsTarget(tenant, call.state.call)
  if (!target) return null
  const reference = encodeModelInvocationRef({ ...target, admission: call.admission })
  if ('failure' in reference) return null
  const dispatchId =
    call.state.phase === 'running' || call.state.phase === 'retry-decision'
      ? call.state.dispatch
      : call.dispatches.at(-1)?.record.dispatch
  const dispatch = call.dispatches.find(d => d.record.dispatch === dispatchId)
  return {
    tenant: target.tenant,
    reference: reference.ok,
    admission: call.admission,
    state: call.state,
    execution: call.execution,
    material:
      dispatch === undefined
        ? { kind: 'before-dispatch' }
        : call.request === null
          ? { kind: 'released', dispatch: dispatch.record.dispatch, cursor: call.cursor }
          : {
              kind: 'retained',
              dispatch: dispatch.record.dispatch,
              snapshot: {
                call: call.state.call,
                cursor: call.cursor,
                blocks: dispatch.blocks,
                state: call.state,
              },
            },
  }
}

/** The call document that the pass staged, or else the one it saw. */
function passCall(pass: ModelConfirmationPass): CallDocument | undefined {
  if (pass.staged?.kind === 'write') return pass.staged.write.call
  return pass.staged?.kind === 'publish' ? pass.staged.call : pass.seen?.call
}
/** A run that threw, or a staged write whose commit is unknown, leaves the call unconfirmed. */
function unconfirmedWrite(
  pass: ModelConfirmationPass,
  completion: Exclude<ModelRunCompletion, { kind: 'confirmed' }>,
): boolean {
  return (
    completion.kind === 'threw' ||
    (pass.staged?.kind === 'write' && completion.failure.kind === 'commit-unknown')
  )
}

export function createModelObservationStorage<P>(
  input: Readonly<{
    storage: ModelCommandStorage
    authority: ModelCommandsAuthority<P>
    initialRun?: ModelInitialRun<P>
    report(event: ModelConfirmationDiagnostic): void
    observation?: Readonly<{ timing: ModelObservationTiming; limits: ModelObservationLimits }>
  }>,
): Readonly<{ storage: ModelCommandStorage; observations: ModelObservationSource<P> | null }> {
  const beforePublish =
    input.initialRun === undefined
      ? null
      : initialRunPort(input.initialRun).finishConfirmation.bind(initialRunPort(input.initialRun))
  let active: MutablePass | null = null
  const { storage: inner } = input
  const report = (kind: ModelConfirmationDiagnostic['kind']) => {
    try {
      input.report({ kind })
    } catch {}
  }
  const observe = (pass: ModelConfirmationPass | null, completion: ModelRunCompletion) => {
    if (!source || !pass?.scope?.call) return
    const call = passCall(pass)
    const tenant = call?.execution?.tenant
    if (completion.kind !== 'confirmed') {
      if (unconfirmedWrite(pass, completion)) {
        const identity = factsTarget(pass.scope.tenant, pass.scope.call)
        if (identity) source.unavailable(identity)
      }
      return
    }
    if (call) {
      const projected = facts(pass.scope.tenant, call)
      if (projected) source.confirm(projected)
      else if (tenant) source.unavailable({ tenant, call: call.state.call })
    }
  }
  const storage: ModelCommandStorage = {
    async run<T>(
      work: () => Outcome<T, ModelFailure>,
      scope?: RunScope,
    ): Promise<Outcome<T, ModelFailure>> {
      const latest: { pass: MutablePass | null } = { pass: null }
      let outcome: Outcome<T, ModelFailure>
      try {
        outcome = await inner.run(() => {
          const pass: MutablePass = { scope: scope ?? null, seen: null, staged: null }
          latest.pass = pass
          const previous = active
          active = pass
          try {
            return work()
          } finally {
            active = previous
          }
        }, scope)
      } catch (error) {
        complete(latest.pass, { kind: 'threw' })
        throw error
      }
      complete(
        latest.pass,
        'ok' in outcome ? { kind: 'confirmed' } : { kind: 'failed', failure: outcome.failure },
      )
      return outcome
    },
    documents(tenant) {
      const documents = inner.documents(tenant)
      if (active?.scope?.tenant === tenant && active.scope.call !== undefined)
        active.seen = {
          call: documents.calls.get(active.scope.call),
          operation:
            active.scope.operation === undefined
              ? undefined
              : documents.operations.get(active.scope.operation),
        }
      return documents
    },
    reserved: field => inner.reserved(field),
    commit(tenant, write) {
      const result = inner.commit(tenant, write)
      if (active) active.staged = { kind: 'write', tenant, write }
      return result
    },
    publish(tenant, call) {
      inner.publish(tenant, call)
      if (active) active.staged = { kind: 'publish', tenant, call }
    },
    ...(inner.pending === undefined ? {} : { pending: inner.pending.bind(inner) }),
  }
  function complete(pass: ModelConfirmationPass | null, completion: ModelRunCompletion): void {
    try {
      beforePublish?.(pass, completion)
    } catch {
      if (input.initialRun !== undefined) initialRunPort(input.initialRun).failConfirmation(pass)
      report('initial-confirmation-failed')
    }
    try {
      observe(pass, completion)
    } catch {
      const target =
        pass?.scope?.call === undefined ? null : factsTarget(pass.scope.tenant, pass.scope.call)
      try {
        if (target) source?.unavailable(target)
      } catch {}
      report('observation-confirmation-failed')
    }
  }
  function refresh(read: ObservationRead<P>): Reply<void> {
    const decoded = resolveModelInvocationRef(read.reference, read.access.tenant)
    if ('failure' in decoded)
      return Promise.resolve({
        failure: { kind: 'invalid', field: 'reference', reason: 'identity' },
      })
    const tenant = tenantKey(read.access.tenant)
    if (typeof tenant !== 'string') return Promise.resolve({ failure: tenant })
    return storage.run(
      () => {
        const documents = storage.documents(tenant)
        const call = documents.calls.get(decoded.ok.call)
        const authorized = checkedActor(
          input.authority.authorize({
            action: read.purpose === 'current' ? 'facts' : 'observe',
            access: read.access,
            resource: {
              kind: 'call',
              call: decoded.ok.call,
              consumer: call?.state.consumer ?? null,
            },
          }),
        )
        if ('failure' in authorized) return authorized
        if (
          tenantKey(decoded.ok.tenant) !== tenant ||
          (call && call.admission !== decoded.ok.admission)
        )
          return { failure: { kind: 'invalid', field: 'reference', reason: 'binding' } }
        if (
          [...documents.operations.values()].some(
            operation => operation.call === decoded.ok.call && operation.status === 'unknown',
          )
        )
          return {
            failure: {
              kind: 'unavailable',
              dependency: 'stream-references',
              diagnostic: 'confirmation-unavailable',
            },
          }
        if (!call) return { failure: { kind: 'invalid', field: 'call', reason: 'not-found' } }
        return { ok: undefined }
      },
      { tenant, call: decoded.ok.call },
    )
  }
  const source =
    input.observation === undefined
      ? null
      : createModelObservationSource({ authority: input.authority, ...input.observation, refresh })
  return { storage, observations: source?.source ?? null }
}
