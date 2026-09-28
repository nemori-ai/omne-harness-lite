import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import {
  validate as contentShape,
  copyJsonValue,
  isJsonNumber,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  judgeModelProfileDocument,
  validate as profileShape,
  type ModelProfile,
  type ModelProfileSnapshot,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { winningRow, type ProfileRow } from '@omne-harness-lite/model-profile-directory'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import { resolveCallTools } from './call-tools.ts'
import { createCallContainer } from './service-container.ts'
import { appendControlRecord } from './service-control.ts'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import type { CallHistoryResult } from './call-history.ts'
import type {
  OpenCallInput,
  OpenCallResult,
  RuntimeConstruction,
  ServiceInvalidInput,
  SessionRuntimeBinding,
} from './service-types.ts'
import type { EffectiveModel } from './selection-types.ts'
import type { SettlementOwner, SettlementRegistration, SettlementTask } from './settlement-types.ts'
import type { PlannedSemantics } from './types.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function basis(value: unknown): value is EffectiveModel {
  if (!object(value) || Object.keys(value).length !== 4) return false
  return (
    typeof value.routeName === 'string' &&
    'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value.routeName,
      }) &&
    'ok' in judgeModelProfileDocument('ModelProfileRef', value.profile) &&
    object(value.profile) &&
    value.profile.routeName === value.routeName &&
    (value.selectedBy === 'session' || value.selectedBy === 'layer_lock') &&
    typeof value.selected === 'string' &&
    'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value.selected,
      })
  )
}

/** Capture request-owned JSON before any asynchronous directory, registry or lease read.
 * The host is a capability port and is checked against the authoritative bind separately. */
export function ownOpenCallInput(
  input: OpenCallInput,
): { readonly request: OpenCallInput } | ServiceInvalidInput {
  if (
    input === null ||
    typeof input !== 'object' ||
    !('ok' in parseOpaqueIdentifier(input.session, 'SessionRef')) ||
    (input.callId !== undefined && !('ok' in judgeAccountValue('ModelCallId', input.callId))) ||
    !(
      'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: input.target,
      })
    ) ||
    (input.targetChangedBy !== undefined &&
      !contentShape('CapabilityId', input.targetChangedBy).valid) ||
    input.host === null ||
    typeof input.host !== 'object' ||
    !Array.isArray(input.messages) ||
    !Array.isArray(input.tools)
  )
    return { invalidInput: { reason: 'malformed' } }
  if (input.targetChangedBy === undefined && input.target !== input.basis?.routeName)
    return { invalidInput: { reason: 'malformed' } }
  if (
    (input.run === undefined) !== (input.attempt === undefined) ||
    (input.run === undefined) !== (input.report === undefined) ||
    (input.run !== undefined && !('ok' in judgeAccountValue('RunId', input.run))) ||
    (input.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', input.attempt)))
  )
    return { invalidInput: { reason: 'malformed' } }
  const clonedBasis = copyJsonValue(input.basis)
  if (!('ok' in clonedBasis) || !basis(clonedBasis.ok))
    return { invalidInput: { reason: 'malformed' } }
  const clonedParameters =
    input.parameters === undefined ? undefined : copyJsonValue(input.parameters)
  if (
    clonedParameters !== undefined &&
    (!('ok' in clonedParameters) ||
      !('ok' in judgeModelProfileDocument('ModelRequestParameters', clonedParameters.ok)))
  )
    return { invalidInput: { reason: 'malformed' } }
  const parameters =
    clonedParameters === undefined
      ? undefined
      : // The owned copy was checked against ModelRequestParameters immediately above.
        (clonedParameters.ok as ModelRequestParameters)
  const clonedReport = input.report === undefined ? undefined : copyJsonValue(input.report)
  if (clonedReport !== undefined && !('ok' in clonedReport))
    return { invalidInput: { reason: 'malformed' } }
  if (input.run !== undefined) {
    const report = clonedReport?.ok
    if (
      !object(report) ||
      report.session !== input.session ||
      report.runId !== input.run ||
      !isJsonNumber(report.attempt) ||
      !('ok' in judgeAccountValue('AttemptId', report.attempt)) ||
      input.attempt === undefined ||
      ExactDecimal.from(report.attempt).compare(ExactDecimal.from(input.attempt)) !== 0
    )
      return { invalidInput: { reason: 'malformed' } }
  }
  const messages: OpenCallInput['messages'][number][] = []
  const calls = new Map<string, number>()
  const results = new Map<string, number>()
  for (const item of input.messages) {
    const judged = judgeMessage(item)
    if ('rejected' in judged || judged.ok.type === 'tool_internal')
      return { invalidInput: { reason: 'malformed' } }
    messages.push(judged.ok)
    if (judged.ok.type === 'assistant')
      for (const block of judged.ok.blocks)
        if (block.kind === 'tool_call' && block.complete)
          calls.set(block.callId, (calls.get(block.callId) ?? 0) + 1)
    if (judged.ok.type === 'tool')
      results.set(judged.ok.callId, (results.get(judged.ok.callId) ?? 0) + 1)
  }
  if (
    [...calls].some(([id, count]) => count !== 1 || results.get(id) !== 1) ||
    [...results].some(([id, count]) => count !== 1 || calls.get(id) !== 1)
  )
    return { invalidInput: { reason: 'malformed' } }
  const tools: OpenCallInput['tools'][number][] = []
  for (const item of input.tools) {
    if (!toolShape('ModelToolName', item).valid || tools.includes(item))
      return { invalidInput: { reason: 'malformed' } }
    tools.push(item)
  }
  const common = {
    session: input.session,
    ...(input.callId === undefined ? {} : { callId: input.callId }),
    target: input.target,
    ...(input.targetChangedBy === undefined ? {} : { targetChangedBy: input.targetChangedBy }),
    basis: clonedBasis.ok,
    ...(parameters === undefined ? {} : { parameters }),
    messages: Object.freeze(messages),
    tools: Object.freeze(tools),
    host: input.host,
  }
  const request: OpenCallInput =
    input.run === undefined
      ? Object.freeze(common)
      : Object.freeze({
          ...common,
          run: input.run,
          attempt: input.attempt,
          report: clonedReport?.ok,
        })
  return { request }
}

function snapshotOf(profile: ModelProfile): ModelProfileSnapshot | undefined {
  const candidate = {
    adaptation: profile.adaptation,
    providers: profile.providers,
    allowFallback: profile.allowFallback,
    inputModalities: profile.inputModalities,
    outputModalities: profile.outputModalities,
    maxInputTokens: profile.maxInputTokens,
    maxOutputTokens: profile.maxOutputTokens,
    inputConstraints: profile.inputConstraints,
    upstreamInputLimits: profile.upstreamInputLimits,
    ...(profile.parameters === undefined ? {} : { parameters: profile.parameters }),
    updatedAt: profile.updatedAt,
  }
  const copied = copyJsonValue(candidate)
  return 'ok' in copied && profileShape('ModelProfileSnapshot', copied.ok).valid
    ? (copied.ok as unknown as ModelProfileSnapshot)
    : undefined
}

function mergedParameters(
  profile: ModelProfile,
  override: ModelRequestParameters | undefined,
): { readonly parameters: ModelRequestParameters } | ServiceInvalidInput {
  const base = profile.parameters ?? {}
  const combined = {
    ...base,
    ...override,
    ...(base.extra === undefined && override?.extra === undefined
      ? {}
      : { extra: { ...base.extra, ...override?.extra } }),
  }
  const copied = copyJsonValue(combined)
  if (!('ok' in copied)) return { invalidInput: { reason: 'malformed' } }
  const judged = judgeModelProfileDocument('ModelRequestParameters', copied.ok)
  if ('rejected' in judged) return { invalidInput: { reason: judged.rejected } }
  const parameters = copied.ok as ModelRequestParameters
  if (
    parameters.maxOutputTokens !== undefined &&
    ExactDecimal.from(parameters.maxOutputTokens).compare(
      ExactDecimal.from(profile.maxOutputTokens),
    ) > 0
  )
    return { invalidInput: { reason: 'max_output_exceeds_profile' } }
  return { parameters }
}

function readRows(value: unknown): readonly ProfileRow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const copied = copyJsonValue(value)
  if (!('ok' in copied) || !Array.isArray(copied.ok)) return undefined
  return copied.ok.every(
    item =>
      object(item) &&
      'ok' in judgeModelProfileDocument('ModelProfileRef', item.ref) &&
      'ok' in judgeModelProfileDocument('ModelProfile', item.profile),
  )
    ? (copied.ok as unknown as readonly ProfileRow[])
    : undefined
}

/** A read-only operation's backend tasks remain owned until actual stop, even after a
 * completion rejection. The caller retains unsuccessful cleanup for lifecycle close. */
async function withOwnedReads<T>(
  owner: SettlementOwner,
  concurrent: import('@omne-harness-lite/content-blocks').JsonNumber,
  retained: Set<SettlementRegistration>,
  work: (registration: SettlementRegistration) => Promise<T>,
): Promise<{ readonly ok: T } | { readonly unavailable: true }> {
  if (owner.admission() !== 'open') return { unavailable: true }
  const grant = owner.acquire(concurrent)
  if ('unavailable' in grant) return { unavailable: true }
  const tasks: SettlementTask<unknown>[] = []
  const registration: SettlementRegistration = {
    start(kind, operation) {
      const task = grant.registration.start(kind, operation)
      tasks.push(task)
      return task
    },
    release: grant.registration.release,
  }
  let result: T
  try {
    result = await work(registration)
  } catch {
    retained.add(grant.registration)
    Promise.all(tasks.map(task => task.stopped)).then(
      () => {
        try {
          grant.registration.release()
          retained.delete(grant.registration)
        } catch {
          // Failed release keeps the actual owner reachable.
        }
      },
      () => {
        // Stop failure is not completion and cannot release the registration.
      },
    )
    return { unavailable: true }
  }
  try {
    await Promise.all(tasks.map(task => task.stopped))
    grant.registration.release()
    return { ok: result }
  } catch {
    retained.add(grant.registration)
    return { unavailable: true }
  }
}

function boundSession(session: SessionRuntimeBinding, request: OpenCallInput): boolean {
  return (
    session === request.host &&
    session.log.session === request.session &&
    session.selection.binding.session === request.session &&
    tenantIdEquals(session.log.tenant, session.selection.binding.tenant) &&
    session.log.generation === session.selection.binding.generation &&
    settlementGenerationCurrent(session.log)
  )
}

export interface ServiceCalls {
  readonly openCall: (input: OpenCallInput) => Promise<OpenCallResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

/** RT7 S-28: bind a new noRun call without a durable open record. An already-dispatched
 * call's resume binding must come from its original MS6 record, never the latest catalog. */
export function createServiceCalls<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): ServiceCalls {
  const retainedReads = new Set<SettlementRegistration>()
  const unknownWrites = new Set<SettlementRegistration>()
  async function historyFor(
    session: SessionRuntimeBinding,
    callId: NonNullable<OpenCallInput['callId']>,
  ): Promise<CallHistoryResult> {
    const read = await withOwnedReads(
      session.selection.owner,
      runtime.settlementContention.limits.concurrent,
      retainedReads,
      async registration => {
        const prefix = await readSettlementPrefix({ binding: session.log, registration })
        return 'unavailable' in prefix
          ? ({ unavailable: true, reason: 'prefix' } as const)
          : runtime.history.call(prefix.prefix, callId)
      },
    )
    return 'unavailable' in read ? { unavailable: true, reason: 'prefix' } : read.ok
  }
  const openCall = async (input: OpenCallInput): Promise<OpenCallResult> => {
    const owned = ownOpenCallInput(input)
    if ('invalidInput' in owned) return owned
    const request = owned.request
    if (request.run !== undefined) return { unavailable: true } // G-4: no real Run interpreter.
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(request.session)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in bound)
      return bound.failure === 'invalidInput'
        ? { invalidInput: { reason: 'malformed' } }
        : { unavailable: true }
    const session = bound.binding
    if (!boundSession(session, request)) return { unavailable: true }
    if (session.selection.owner.admission() !== 'open') return { runtimeStopped: true }
    let callId = request.callId
    if (callId === undefined) {
      try {
        callId = runtime.identities.call()
      } catch {
        return { unavailable: true }
      }
      if (!('ok' in judgeAccountValue('ModelCallId', callId))) return { unavailable: true }
    }
    const key = { session: request.session, callId }
    const gate = await runtime.calls.waitReserve(key, {
      policy: runtime.reservationWaitPolicy,
      scheduler: runtime.settlementScheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in gate) return { unavailable: true }
    const reservation = gate.reservation
    try {
      const local = reservation.view()
      if (request.callId !== undefined && local !== undefined) {
        if (local.session !== session || local.request.session !== request.session)
          return { unavailable: true }
        const history = await historyFor(session, callId)
        if ('unavailable' in history) return { unavailable: true }
        if ('absent' in history) return { wrongPhase: { phase: 'open' } }
        if (history.known.phase !== 'resumable')
          return { wrongPhase: { phase: history.known.phase ?? 'in_flight' } }
        if (local.operation.phase !== 'ready') return { unavailable: true }
        const resolved = await resolveCallTools(request, session.tools)
        if ('failure' in resolved)
          return resolved.failure === 'unavailable'
            ? { unavailable: true }
            : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
        reservation.updateRequest(request)
        return { callId, state: 'resumable' }
      }
      if (local !== undefined) return { unavailable: true }
      if (request.callId !== undefined) {
        const history = await historyFor(session, callId)
        if ('unavailable' in history) return { unavailable: true }
        if ('absent' in history) return { callNotFound: true }
        if (history.known.phase !== 'resumable')
          return { wrongPhase: { phase: history.known.phase ?? 'in_flight' } }
        const last = history.known.dispatches.at(-1)
        if (last === undefined) return { unavailable: true }
        const resolved = await resolveCallTools(request, session.tools)
        if ('failure' in resolved)
          return resolved.failure === 'unavailable'
            ? { unavailable: true }
            : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
        const anchor = last.record
        if (
          anchor.adaptation.definition.modelId !== anchor.profile.routeName ||
          anchor.profileSnapshot.adaptation.definition.modelId !== anchor.profile.routeName
        )
          return { unavailable: true }
        const acquired = runtime.transport.acquire(anchor.adaptation, anchor.profile.routeName)
        if ('unavailable' in acquired) return { unavailable: true }
        const lease = acquired.lease
        let transferred = false
        try {
          const coordinator = createSettlementCoordinator({
            binding: session.log,
            owner: session.selection.owner,
            settlementContention: runtime.settlementContention,
            settlementScheduler: runtime.settlementScheduler,
            diagnostic: event => runtime.policy.diagnostic({ kind: event.kind }),
          })
          const container = createCallContainer({
            key,
            session,
            request,
            binding: {
              profile: anchor.profile,
              snapshot: anchor.profileSnapshot,
              parameters: anchor.parameters,
              selectedBy: anchor.selectedBy,
              lease,
            },
            owner: session.selection.owner,
            coordinator,
          })
          if (!runtime.calls.insert(reservation, container)) return { unavailable: true }
          transferred = true
          return { callId, state: 'resumable' }
        } finally {
          if (!transferred) lease.release()
        }
      }
      const resolved = await resolveCallTools(request, session.tools)
      if ('failure' in resolved)
        return resolved.failure === 'unavailable'
          ? { unavailable: true }
          : { invalidInput: { reason: resolved.reason ?? 'malformed' } }
      const owner = session.selection.owner
      const facts = await withOwnedReads(
        owner,
        runtime.settlementContention.limits.concurrent,
        retainedReads,
        async registration => {
          const holding = await registration.start(
            'read',
            async () => await session.selection.sessionTenancy.holdingTenant(request.session),
          ).completion
          if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, session.log.tenant))
            return { unavailable: true } as const
          const rawRows = await registration.start(
            'read',
            async () => await session.catalog.listProfiles(holding.tenant),
          ).completion
          const rows = readRows(rawRows)
          if (rows === undefined) return { unavailable: true } as const
          const matching = rows.filter(row => row.ref.routeName === request.target)
          if (matching.length === 0) return { profileNotFound: true } as const
          const winner = winningRow(rows, request.target, [request.target])
          if (winner === undefined) return { undispatched: 'withdrawn' } as const
          const prefix = await readSettlementPrefix({ binding: session.log, registration })
          if ('unavailable' in prefix) return { unavailable: true } as const
          const projection = await registration.start(
            'read',
            async () => await session.selection.projection(prefix.prefix),
          ).completion
          if ('unknown' in projection) return { unavailable: true } as const
          const compatible = session.selection.compatible(winner.profile, projection.known)
          if ('invalidInput' in compatible || 'unavailable' in compatible)
            return { unavailable: true } as const
          if ('blocked' in compatible) return { undispatched: 'modality_mismatch' } as const
          const present = await registration.start(
            'read',
            async () =>
              await session.catalog.credentialPresent(session.log.tenant, winner.ref.origin),
          ).completion
          if ('failure' in present) return { unavailable: true } as const
          if (!present.present) return { undispatched: 'credential_unavailable' } as const
          return { winner } as const
        },
      )
      if ('unavailable' in facts || 'unavailable' in facts.ok) return { unavailable: true }
      const checked = facts.ok
      if ('profileNotFound' in checked) return { profileNotFound: true }
      if ('undispatched' in checked) {
        const written = await appendControlRecord({
          binding: session.log,
          owner,
          concurrent: runtime.settlementContention.limits.concurrent,
          record: {
            kind: 'model_call_ended',
            call: callId,
            ending: 'undispatched',
            cause: checked.undispatched,
          },
          retainUnknown(registration) {
            unknownWrites.add(registration)
          },
        })
        return 'appended' in written
          ? { callId, state: 'handed_up', undispatched: checked.undispatched }
          : { unavailable: true }
      }
      const { winner } = checked
      const snapshot = snapshotOf(winner.profile)
      if (snapshot === undefined) return { unavailable: true }
      const merged = mergedParameters(winner.profile, request.parameters)
      if ('invalidInput' in merged) return merged
      if (snapshot.adaptation.definition.modelId !== request.target)
        return { invalidInput: { reason: 'malformed' } }
      const acquired = runtime.transport.acquire(snapshot.adaptation, request.target)
      if ('unavailable' in acquired) return { unavailable: true }
      const lease = acquired.lease
      let transferred = false
      try {
        const planned = lease.transport.plan({
          target: { kind: 'model_call', callId, dispatch: 1 },
          routeName: request.target,
          provider: snapshot.providers[0] ?? '',
          snapshot,
          parameters: merged.parameters,
          messages: request.messages,
          tools: resolved.tools,
        })
        if ('rejected' in planned) {
          if (planned.rejected === 'unavailable') return { unavailable: true }
          if (planned.rejected === 'modality_not_carried') {
            const written = await appendControlRecord({
              binding: session.log,
              owner,
              concurrent: runtime.settlementContention.limits.concurrent,
              record: {
                kind: 'model_call_ended',
                call: callId,
                ending: 'undispatched',
                cause: 'modality_mismatch',
              },
              retainUnknown(registration) {
                unknownWrites.add(registration)
              },
            })
            return 'appended' in written
              ? { callId, state: 'handed_up', undispatched: 'modality_mismatch' }
              : { unavailable: true }
          }
          return {
            invalidInput: {
              reason: 'reason' in planned ? planned.reason : 'malformed',
            },
          }
        }
        const coordinator = createSettlementCoordinator({
          binding: session.log,
          owner,
          settlementContention: runtime.settlementContention,
          settlementScheduler: runtime.settlementScheduler,
          diagnostic: event => runtime.policy.diagnostic({ kind: event.kind }),
        })
        const container = createCallContainer({
          key,
          session,
          request: { ...request, callId },
          binding: {
            profile: winner.ref,
            snapshot,
            parameters: merged.parameters,
            selectedBy:
              request.targetChangedBy === undefined
                ? request.basis.selectedBy
                : { extension: capabilityCanonicalString(request.targetChangedBy) },
            lease,
          },
          owner,
          coordinator,
        })
        if (!runtime.calls.insert(reservation, container)) return { unavailable: true }
        transferred = true
        return { callId, state: 'open' }
      } finally {
        if (!transferred) lease.release()
      }
    } catch {
      return { unavailable: true }
    } finally {
      reservation.release()
    }
  }
  const close = async () =>
    retainedReads.size === 0 && unknownWrites.size === 0
      ? ({ released: true } as const)
      : ({ unavailable: true } as const)
  return Object.freeze({ openCall, close })
}
