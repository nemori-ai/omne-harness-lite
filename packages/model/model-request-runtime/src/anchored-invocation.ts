import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import type { ModelCallDispatchedRecord } from '@omne-harness-lite/messages'
import type { AppendResult, OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'
import type { ReplyDisposition } from '@omne-harness-lite/model-response/v5'
import { ownPlanInput } from './input.ts'
import { invokeModel } from './invoke.ts'
import {
  createCredentialRedactionPolicy,
  CredentialRedactionConfigurationError,
} from './credential-redaction.ts'
import { captureModelLogValue, prepareModelLogEntry, modelLogJsonEqual } from './log-codec-v2.ts'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import { settlementGenerationCurrent } from './settlement-prefix.ts'
import {
  constructAssistantReply,
  constructModelResponse,
  type ResponseConstructionInput,
} from './response-construction.ts'
import type {
  PlannedSemantics,
  ModelInvocationHandle,
  ModelInvocationResult,
  InvocationPolicy,
} from './types.ts'
import type {
  SettlementTask,
  SettlementRegistration,
  SettlementResult,
  SettlementOwner,
} from './settlement-types.ts'
import type {
  AnchoredInvocationHandle,
  AnchoredInvocationInput,
  AnchoredInvocationOutcome,
  ResponseConstructionResult,
} from './anchored-invocation-types.ts'

const unavailable = Object.freeze({ unavailable: true } as const)
function validPolicy(policy: InvocationPolicy): boolean {
  return (
    typeof policy.now === 'function' &&
    typeof policy.schedule === 'function' &&
    typeof policy.diagnostic === 'function' &&
    policy.statusCauseTable !== null &&
    typeof policy.statusCauseTable === 'object' &&
    Object.entries(policy.statusCauseTable).every(
      ([k, v]) =>
        /^[1-5][0-9]{2}$/.test(k) &&
        ['credential_unavailable', 'request_rejected', 'upstream_unavailable'].includes(v),
    ) &&
    [policy.firstContentTimeoutMs, policy.idleContentTimeoutMs].every(
      v => Number.isSafeInteger(v) && v > 0,
    )
  )
}
function terminalHandle(
  value: AnchoredInvocationOutcome,
  releaseBorrowed?: () => Promise<void>,
  keepReferences = false,
): AnchoredInvocationHandle {
  let closing: ReturnType<AnchoredInvocationHandle['close']> | undefined
  return {
    outcome: Promise.resolve(value),
    snapshot: () => ({ blocks: [], position: 0 }),
    abort() {},
    async settleReply() {
      return { unavailable: true, reason: 'closed' }
    },
    close() {
      if (keepReferences) return Promise.resolve(unavailable)
      closing ??= (async () => {
        await releaseBorrowed?.()
        return { released: true } as const
      })()
      return closing
    },
  }
}
/** R3-P3/P4/P5, RT5 S-15/17: one noRun dispatch with the original invokeModel and shared settlement. */
export function createAnchoredModelInvocation<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
): AnchoredInvocationHandle {
  input = Object.freeze({ ...input })
  const terminal = (value: AnchoredInvocationOutcome) =>
    terminalHandle(value, input.releaseBorrowed)
  const requested = ownPlanInput(input.planInput)
  if (
    !requested ||
    requested.tools.length !== 0 ||
    !(input.signal instanceof AbortSignal) ||
    !input.policy ||
    !validPolicy(input.policy) ||
    !('ok' in parseOpaqueIdentifier(input.messageId, 'MessageId')) ||
    !('ok' in parseOpaqueIdentifier(input.responseId, 'ResponseId')) ||
    input.profile.routeName !== requested.routeName ||
    !requested.snapshot.providers.includes(requested.provider) ||
    ((!requested.snapshot.allowFallback || modelLogJsonEqual(requested.target.dispatch, 1)) &&
      requested.provider !== requested.snapshot.providers[0]) ||
    (input.profile.origin === 'custom' && input.credentialScope.layer === 'factory') ||
    (input.credentialScope.layer === 'tenant' &&
      !tenantIdEquals(input.credentialScope.tenant, input.settlement.binding.tenant))
  )
    return terminal({ rejected: 'invalidInput' })
  try {
    const bound = createCredentialRedactionPolicy(input.policy.credentialRedaction).bind(
      input.credential,
    )
    if ('rejected' in bound) return terminal({ rejected: 'invalidInput' })
    const config = input.policy.credentialRedaction
    const sourceOwner = input.settlement.owner
    const sourceLog = input.settlement.binding.log
    const contention = input.settlement.settlementContention
    input = Object.freeze({
      ...input,
      policy: Object.freeze({
        ...input.policy,
        statusCauseTable: Object.freeze({ ...input.policy.statusCauseTable }),
        credentialRedaction: Object.freeze({
          credential_fragment_min_length: config.credential_fragment_min_length,
          credential_header_names: Object.freeze([...config.credential_header_names]),
          credential_patterns: Object.freeze(
            config.credential_patterns.map(pattern => Object.freeze({ ...pattern })),
          ),
        }),
      }),
      settlement: Object.freeze({
        ...input.settlement,
        ...(contention === undefined
          ? {}
          : {
              settlementContention: Object.freeze({
                ...contention,
                limits: Object.freeze({ ...contention.limits }),
              }),
            }),
        ...(input.settlement.settlementScheduler === undefined
          ? {}
          : { settlementScheduler: Object.freeze({ ...input.settlement.settlementScheduler }) }),
        binding: Object.freeze({
          ...input.settlement.binding,
          log: Object.freeze({
            append: sourceLog.append.bind(sourceLog),
            readSince: sourceLog.readSince.bind(sourceLog),
            readByKey: sourceLog.readByKey.bind(sourceLog),
          }),
        }),
        owner: Object.freeze({
          name: sourceOwner.name,
          admission: sourceOwner.admission.bind(sourceOwner),
          acquire: sourceOwner.acquire.bind(sourceOwner),
          opened: sourceOwner.opened.bind(sourceOwner),
          unresolvedWrites: sourceOwner.unresolvedWrites.bind(sourceOwner),
        }),
      }),
    })
  } catch (error) {
    if (error instanceof CredentialRedactionConfigurationError)
      return terminal({ rejected: 'invalidInput' })
    throw error
  }
  const binding = Object.freeze({ ...input.settlement.binding })
  const originalOwner = input.settlement.owner
  if ('unknown' in originalOwner.opened() || originalOwner.unresolvedWrites().length > 0)
    return terminalHandle(unavailable, undefined, true)
  const contention = input.settlement.settlementContention
  if (contention === undefined || input.settlement.settlementScheduler === undefined)
    return terminal(unavailable)
  if (!settlementGenerationCurrent(binding) || originalOwner.admission() !== 'open')
    return terminal(unavailable)
  const transport = Object.freeze({
    plan: input.transport.plan.bind(input.transport),
    send: input.transport.send.bind(input.transport),
    read: input.transport.read.bind(input.transport),
  })
  const policy = Object.freeze({
    ...input.policy,
    statusCauseTable: Object.freeze({ ...input.policy.statusCauseTable }),
  })
  if (input.signal.aborted) return terminal({ cancelledBeforeDispatch: true })
  const plan = transport.plan(requested)
  if ('rejected' in plan) return terminal(plan)
  const planned = plan.planned
  if (!modelLogJsonEqual(planned.input, requested)) return terminal({ rejected: 'invalidInput' })
  const captured = captureModelLogValue({
    category: 'record',
    input: {
      kind: 'value',
      value: {
        kind: 'model_call_dispatched',
        call: requested.target.callId,
        dispatch: requested.target.dispatch,
        response: input.responseId,
        provider: requested.provider,
        profile: input.profile,
        profileSnapshot: requested.snapshot,
        adaptation: requested.snapshot.adaptation,
        parameters: requested.parameters,
        selectedBy: input.selectedBy,
        credentialScope: input.credentialScope,
        ...(planned.parameterAdjustments === undefined
          ? {}
          : { parameterAdjustments: planned.parameterAdjustments }),
        ...(planned.droppedParameters === undefined
          ? {}
          : { droppedParameters: planned.droppedParameters }),
      },
    },
  })
  if ('invalidValue' in captured || captured.ok.record?.kind !== 'model_call_dispatched')
    return terminal({ rejected: 'invalidInput' })
  const dispatched: ModelCallDispatchedRecord = captured.ok.record
  const prepared = prepareModelLogEntry({
    session: binding.session,
    shell: { tenant: binding.tenant },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in prepared) return terminal({ rejected: 'invalidInput' })
  const acquired = originalOwner.acquire(contention.limits.concurrent)
  if ('unavailable' in acquired) return terminal(unavailable)
  const registration: SettlementRegistration = acquired.registration
  const controller = new AbortController()
  const tasks: SettlementTask<unknown>[] = []
  const unresolved = new Set<SettlementTask<AppendResult>>()
  let openedTask: SettlementTask<AppendResult> | undefined
  let openedConfirmed = false,
    openedKnownAbsent = false,
    quarantined = false,
    closed = false,
    registrationReleased = false,
    borrowedReleased = false
  let firstTokenAt: string | null = null
  let invocation: ModelInvocationHandle | undefined
  let construction: ResponseConstructionInput | undefined
  let settled = false
  let dispatchConfirmed = false
  let closePromise: ReturnType<AnchoredInvocationHandle['close']> | undefined
  const owner: SettlementOwner = {
    name: originalOwner.name,
    admission: () => originalOwner.admission(),
    acquire: originalOwner.acquire,
    opened: () =>
      openedTask !== undefined && ((!openedConfirmed && !openedKnownAbsent) || quarantined)
        ? { unknown: openedTask }
        : originalOwner.opened(),
    unresolvedWrites: () => [...originalOwner.unresolvedWrites(), ...unresolved],
  }
  const coordinator = (() => {
    try {
      return createSettlementCoordinator({ ...input.settlement, binding, owner })
    } catch (error) {
      registration.release()
      throw error
    }
  })()
  const diagnose = (kind: string) => {
    try {
      policy.diagnostic({ kind })
    } catch {
      /* isolated observer */
    }
  }
  const stop = () => {
    controller.abort()
    invocation?.abort()
    for (const task of tasks) {
      try {
        task.requestStop()
      } catch {
        diagnose('model_anchor.stop_port_failed')
      }
    }
  }
  input.signal.addEventListener('abort', stop, { once: true })
  if (input.signal.aborted) stop()
  const usable = () =>
    !controller.signal.aborted &&
    originalOwner.admission() === 'open' &&
    settlementGenerationCurrent(binding)
  function start<T>(
    kind: 'append' | 'wait',
    operation: (signal: AbortSignal) => Promise<T>,
  ): SettlementTask<T> {
    const task = registration.start(kind, operation)
    tasks.push(task)
    if (controller.signal.aborted) task.requestStop()
    return task
  }
  async function drain() {
    await Promise.all(tasks.map(task => task.stopped))
    if (!registrationReleased) {
      registration.release()
      registrationReleased = true
    }
  }
  function append(entry: OwnedLogEntry): SettlementTask<AppendResult> {
    const task = start('append', async (): Promise<AppendResult> => {
      if (!usable()) return { failure: 'invalidInput' }
      return binding.log.append(
        binding.session,
        [entry],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
    })
    unresolved.add(task)
    return task
  }
  async function receipt(task: SettlementTask<AppendResult>): Promise<boolean> {
    let raw: unknown
    try {
      raw = await task.completion
    } catch {
      quarantined = true
      return false
    }
    const result = settlementAppendReceipt(raw, 1)
    if (result === null) {
      quarantined = true
      return false
    }
    if ('failure' in result) {
      if (result.failure === 'unavailable' || result.failure === 'alreadyRecorded')
        quarantined = true
      else {
        await task.stopped
        unresolved.delete(task)
        if (task === openedTask) openedKnownAbsent = true
      }
      return false
    }
    unresolved.delete(task)
    return true
  }
  async function settleCandidate(
    disposition: ReplyDisposition | null,
    withoutReply = false,
  ): Promise<SettlementResult> {
    if (!construction || quarantined || unresolved.size > 0)
      return { unavailable: true, reason: 'opened_unknown' }
    const candidate = constructModelResponse(construction, disposition, withoutReply)
    if ('rejected' in candidate) return { unavailable: true, reason: 'candidate' }
    await drain()
    const handle = coordinator.settle({
      target: {
        call: dispatched.call,
        dispatch: dispatched.dispatch,
        response: dispatched.response,
      },
      current: {
        messageId: withoutReply || !('reply' in candidate.response) ? null : input.messageId,
        disposition: withoutReply ? null : disposition,
      },
      response: candidate.response,
    })
    const result = await handle.completion
    await handle.stopped
    if ('settled' in result) settled = true
    return result
  }
  const run = async (): Promise<AnchoredInvocationOutcome> => {
    try {
      if (!usable()) return { cancelledBeforeDispatch: true }
      const dispatchTask = append(prepared.ok)
      if (!(await receipt(dispatchTask))) return unavailable
      dispatchConfirmed = true
      if (!usable()) {
        const at = policy.now()
        construction = {
          dispatched,
          messageId: input.messageId,
          firstTokenAt: null,
          result: {
            outcome: 'interrupted',
            blocks: [],
            timing: { sentAt: at, endedAt: at },
            usage: {
              input_tokens: 'unknown',
              output_tokens: 'unknown',
              cache_read_tokens: 'unknown',
              cache_write_tokens: 'unknown',
              source: 'none',
            },
            cost: { cost_usd: 'unknown', source: 'none' },
            routeName: requested.routeName,
            provider: requested.provider,
            adaptation: requested.snapshot.adaptation,
            parameters: planned.parameters,
            ...(planned.parameterAdjustments === undefined
              ? {}
              : { parameterAdjustments: planned.parameterAdjustments }),
            ...(planned.droppedParameters === undefined
              ? {}
              : { droppedParameters: planned.droppedParameters }),
          },
        }
        const stoppedSettlement = await settleCandidate(null)
        return 'settled' in stoppedSettlement ? { settled: stoppedSettlement } : unavailable
      }
      const work = start('wait', async signal => {
        const cancel = () => controller.abort()
        signal.addEventListener('abort', cancel, { once: true })
        if (signal.aborted) cancel()
        try {
          if (!usable()) return { cancelledBeforeSend: true } as const
          invocation = invokeModel({
            ...requested,
            transport: {
              plan: () => ({ planned }),
              send: async (...args) => {
                if (!usable()) return { aborted: true, queued: true }
                return transport.send(...args)
              },
              read: transport.read,
            },
            credential: input.credential,
            policy,
            signal: controller.signal,
            ...(input.onAccepted === undefined ? {} : { onAccepted: input.onAccepted }),
            beforeFirstContent: () =>
              start('wait', async () => {
                if (!usable()) throw new Error('model_anchor.stopped')
                const at = policy.now()
                if (!('ok' in compareRfc3339Instants(at, at))) throw new Error('model_anchor.clock')
                const value = captureModelLogValue({
                  category: 'record',
                  input: {
                    kind: 'value',
                    value: {
                      kind: 'model_call_opened',
                      call: dispatched.call,
                      dispatch: dispatched.dispatch,
                      firstTokenAt: at,
                    },
                  },
                })
                if ('invalidValue' in value) throw new Error('model_anchor.opened')
                const entry = prepareModelLogEntry({
                  session: binding.session,
                  shell: { tenant: binding.tenant },
                  captured: value.ok,
                  purpose: { kind: 'record' },
                  messagePrefix: null,
                })
                if ('invalidValue' in entry) throw new Error('model_anchor.opened')
                openedTask = append(entry.ok)
                if (!(await receipt(openedTask))) throw new Error('model_anchor.unconfirmed')
                openedConfirmed = true
                firstTokenAt = at
                if (!usable()) {
                  quarantined = true
                  throw new Error('model_anchor.stopped')
                }
              }).completion,
          })
          return await invocation.outcome
        } finally {
          signal.removeEventListener('abort', cancel)
        }
      })
      const result = await work.completion
      if (openedTask !== undefined && !openedConfirmed && !openedKnownAbsent) quarantined = true
      if (quarantined) {
        diagnose('model_anchor.quarantined')
        return unavailable
      }
      if (!('outcome' in result)) {
        if (!('cancelledBeforeSend' in result)) return unavailable
        const at = policy.now()
        const stoppedResult: ModelInvocationResult = {
          outcome: 'interrupted',
          blocks: [],
          timing: { sentAt: at, endedAt: at },
          usage: {
            input_tokens: 'unknown',
            output_tokens: 'unknown',
            cache_read_tokens: 'unknown',
            cache_write_tokens: 'unknown',
            source: 'none',
          },
          cost: { cost_usd: 'unknown', source: 'none' },
          routeName: requested.routeName,
          provider: requested.provider,
          adaptation: requested.snapshot.adaptation,
          parameters: planned.parameters,
          ...(planned.parameterAdjustments === undefined
            ? {}
            : { parameterAdjustments: planned.parameterAdjustments }),
          ...(planned.droppedParameters === undefined
            ? {}
            : { droppedParameters: planned.droppedParameters }),
        }
        construction = {
          dispatched,
          result: stoppedResult,
          messageId: input.messageId,
          firstTokenAt: null,
        }
        const stoppedSettlement = await settleCandidate(null)
        return 'settled' in stoppedSettlement ? { settled: stoppedSettlement } : unavailable
      }
      if (!settlementGenerationCurrent(binding)) return unavailable
      construction = Object.freeze({ dispatched, result, messageId: input.messageId, firstTokenAt })
      await drain()
      const reply = constructAssistantReply(construction)
      if (reply !== null) {
        const current = construction
        return {
          replyPending: Object.freeze({
            reply,
            responseFor: (disposition: ReplyDisposition): ResponseConstructionResult =>
              quarantined
                ? { rejected: 'invalidInput' }
                : constructModelResponse(current, disposition),
          }),
        }
      }
      const resultSettlement = await settleCandidate(null)
      return 'settled' in resultSettlement ? { settled: resultSettlement } : unavailable
    } finally {
      // Unknown append may outlive invoke; close retains and awaits its actual stopped fact.
      if (!quarantined) await drain()
    }
  }
  const outcome = run()
  return Object.freeze<AnchoredInvocationHandle>({
    outcome,
    snapshot: () => invocation?.snapshot() ?? { blocks: [], position: 0 },
    abort: stop,
    async settleReply(disposition) {
      if (closed) return { unavailable: true, reason: 'closed' }
      const finished = await outcome
      if (!('replyPending' in finished)) return { unavailable: true, reason: 'candidate' }
      return settleCandidate(disposition)
    },
    close() {
      if (closePromise) return closePromise
      closed = true
      stop()
      closePromise = (async () => {
        await outcome
        await drain()
        if (!settled && construction && !quarantined) await settleCandidate(null, true)
        await coordinator.close()
        input.signal.removeEventListener('abort', stop)
        if (quarantined || unresolved.size > 0 || (dispatchConfirmed && !settled))
          return unavailable
        if (!borrowedReleased) {
          await input.releaseBorrowed?.()
          borrowedReleased = true
        }
        return { released: true }
      })()
      return closePromise
    },
  })
}
