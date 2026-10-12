import { copyJsonValue, validate as validateContent } from '@omne-harness-lite/content-blocks'
import type { BeforeActionSubject } from '@omne-harness-lite/loop-extension'
import {
  encodeRunnerAdmissionToken,
  passKeys,
  type OfficialAdmissionLease,
  type RunnerActionRequest,
  type RunnerActionSource,
  type RunnerFailure,
  type RunnerInvocationResult,
  type RunnerPassResult,
} from '@omne-harness-lite/loop-extension-runner'
import {
  OFFICIAL_ADMISSION_NAME,
  type AdmissionInput,
  type AdmissionResult,
} from '@omne-harness-lite/tool-admission'
import type { createAdmissionPassSource } from './admission-pass-source.ts'

const unavailable = { failure: 'unavailable' } as const
const stopped = { kind: 'controlUnavailable' } as const
const missing = { kind: 'notStartedUnavailable' } as const
const observed = { kind: 'output', value: { kind: 'observed' } } as const

/** Assemble from the exact adopted EffectiveValue, without filling missing policy data. */
function admissionInput(
  subject: BeforeActionSubject,
  request: RunnerActionRequest,
): AdmissionInput | { readonly noEntry: true } | { readonly unavailable: true } | RunnerFailure {
  const call = subject.call
  if (call.complete !== true || call.unparseable === true) return { failure: 'invalidInput' }
  const permissions = request.admission.report.effectivePermissions
  if (!Object.hasOwn(permissions, call.tool)) return { noEntry: true }
  const effective = permissions[call.tool]
  const common = {
    call,
    definition: subject.definition,
    grants: request.admission.grants,
    runMode: request.admission.runMode,
    ...(request.admission.parent === undefined ? {} : { parent: request.admission.parent }),
  }
  if (effective === 'not_in_composition') return { ...common, effectivePermission: effective }
  if (
    effective === 'unavailable' ||
    effective === undefined ||
    effective.tenantAutoWritable === undefined
  )
    return { unavailable: true }
  const value = effective.value
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('allowed' in value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.allowed) ||
    value.allowed.length > 1 ||
    value.allowed.some(tier => tier !== 'forbid' && tier !== 'auto' && tier !== 'ask') ||
    typeof effective.tenantAutoWritable !== 'boolean'
  )
    return unavailable
  const permission = value.allowed[0] ?? 'forbid'
  const from = effective.from
  if (from !== 'factory' && from !== 'organization' && from !== 'tenant' && from !== 'workspace')
    return unavailable
  if (from === 'workspace' && permission !== 'ask') return unavailable
  return {
    ...common,
    effectivePermission:
      from === 'workspace' ? { value: 'ask', from } : { value: permission, from },
    tenantAutoWritable: effective.tenantAutoWritable,
  }
}

type Slot =
  | { readonly settled: true }
  | {
      readonly input: ReturnType<typeof admissionInput>
      readonly resolve: (result: RunnerInvocationResult) => void
    }

/** One round waits for every action to arrive or finish; it never waits for a terminal action twice. */
export function createActionRound(input: {
  readonly request: RunnerActionRequest
  readonly source: RunnerActionSource
  readonly contribution: OfficialAdmissionLease
  readonly passes: ReturnType<typeof createAdmissionPassSource>
  readonly active: () => boolean
  readonly signal: AbortSignal
}) {
  const { request, source, contribution, passes, active, signal } = input
  const slots: (Slot | undefined)[] = Array.from({ length: request.actions.length })
  let started = false
  let failure: RunnerFailure | undefined
  function fail(reason: RunnerFailure) {
    failure ??= reason
    for (const slot of slots) if (slot && 'resolve' in slot) slot.resolve(stopped)
  }
  const abort = () => fail({ failure: 'cancelled' })
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  function project(
    result: AdmissionResult,
    candidate: AdmissionInput,
    finalKey: string,
  ): RunnerInvocationResult | undefined {
    if (result.kind === 'allow') {
      const token = encodeRunnerAdmissionToken(candidate.call, finalKey)
      return typeof token === 'string' && result.token === token ? observed : undefined
    }
    if (result.kind === 'deny')
      return validateContent('AdmissionDenialCode', result.reason).valid
        ? { kind: 'output', value: { kind: 'veto', reason: result.reason } }
        : undefined
    if (result.kind === 'ask') return { kind: 'output', value: { kind: 'ask', card: result.card } }
    return undefined
  }
  async function judge() {
    if (started || failure || slots.some(slot => slot === undefined)) return
    started = true
    const reached = slots.flatMap((slot, index) =>
      slot && 'resolve' in slot ? [{ slot, index }] : [],
    )
    const candidates = reached.filter(item => !('noEntry' in item.slot.input))
    if (!active() || signal.aborted) {
      fail(signal.aborted ? { failure: 'cancelled' } : unavailable)
      return
    }
    if (candidates.some(item => 'failure' in item.slot.input)) {
      fail(unavailable)
      return
    }
    if (candidates.some(item => 'unavailable' in item.slot.input)) {
      for (const item of reached)
        item.slot.resolve('noEntry' in item.slot.input ? observed : missing)
      return
    }
    if (candidates.length === 0) {
      for (const item of reached) item.slot.resolve(observed)
      return
    }
    const batch = candidates.map(item => item.slot.input) as [AdmissionInput, ...AdmissionInput[]]
    const finalKeys = candidates.map(item => {
      const keys = passKeys({
        position: 'before_action',
        anchor: request.anchors[item.index]!,
        extension: OFFICIAL_ADMISSION_NAME,
        occurrence: { kind: 'final' },
      })
      if ('invalidInput' in keys || !keys.final) throw new Error('Invalid captured final key')
      return keys.final
    }) as [string, ...string[]]
    const round = passes.open({
      access: source.access,
      scope: source.scope,
      inputs: batch,
      finalKeys,
      hostIsActive: () => active() && !signal.aborted,
      contribution,
    })
    let result: Awaited<ReturnType<OfficialAdmissionLease['invoke']>>
    try {
      result = await contribution.invoke(source.access, source.scope, round.pass, batch)
    } finally {
      round.close()
    }
    if (failure) return
    if (!active() || signal.aborted) {
      fail(signal.aborted ? { failure: 'cancelled' } : unavailable)
      return
    }
    const copied = copyJsonValue(result)
    if ('failed' in copied) {
      fail(unavailable)
      return
    }
    result = copied.ok as unknown as typeof result
    let outputs: RunnerInvocationResult[]
    if (
      result.kind === 'failed' &&
      ['invalidInput', 'modeUnknown', 'parentNarrower', 'unavailable'].includes(result.reason)
    ) {
      outputs = batch.map(() => ({
        kind: 'errored',
        error: `Admission judgment produced no conclusion: ${result.reason}`,
      }))
    } else if (
      result.kind === 'decisions' &&
      Array.isArray(result.results) &&
      result.results.length === batch.length
    ) {
      const values = result.results.map((item, index) =>
        project(item, batch[index]!, finalKeys[index]!),
      )
      if (values.some(item => item === undefined)) {
        fail(unavailable)
        return
      }
      outputs = values as RunnerInvocationResult[]
    } else {
      fail(unavailable)
      return
    }
    for (const item of reached) {
      const index = candidates.indexOf(item)
      item.slot.resolve(index < 0 ? observed : outputs[index]!)
    }
  }
  function advance() {
    void judge().catch(() => fail(unavailable))
  }
  return {
    arrive(index: number, subject: BeforeActionSubject) {
      if (failure || !active() || signal.aborted) return Promise.resolve(stopped)
      if (slots[index] !== undefined) {
        fail({ failure: 'replayInconsistent' })
        return Promise.resolve(stopped)
      }
      const wait = Promise.withResolvers<RunnerInvocationResult>()
      slots[index] = { input: admissionInput(subject, request), resolve: wait.resolve }
      advance()
      return wait.promise
    },
    finish(index: number, result: RunnerPassResult) {
      if ('failure' in result) fail(result)
      slots[index] ??= { settled: true }
      advance()
    },
    failure: () => failure,
    close() {
      signal.removeEventListener('abort', abort)
      fail(unavailable)
    },
  }
}
