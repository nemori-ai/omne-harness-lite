import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import {
  readSettlementPrefix,
  settlementGenerationCurrent,
  type SessionModelDispatchInput,
  type SessionModelDispatchResult,
  type SessionModelRequestPreparation,
  type SessionRuntimeBinding,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime'
import { resolveCallTools } from './model-call-tools.ts'
import { authorizedCalibration } from './model-request-calibration.ts'

export function positiveDurationMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !toolShape('Duration', value).valid) return undefined
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value)
  if (match === null) return undefined
  const milliseconds =
    Number(match[1] ?? '0') * 3_600_000 +
    Number(match[2] ?? '0') * 60_000 +
    Number(match[3] ?? '0') * 1_000
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined
}

/** RT8 S-21/S-66: only the current authenticated AE4 input can supply the two limits.
 * Fractional milliseconds remain fractional; neither rounding nor a host default is used. */
export async function currentDispatchTiming(
  input: SessionModelDispatchInput,
): Promise<
  | { readonly firstContentTimeoutMs: number; readonly idleContentTimeoutMs: number }
  | { readonly unavailable: true }
> {
  const { session } = input
  const received = await input.read(
    session.selection.owner,
    async registration =>
      await registration.start(
        'read',
        async () =>
          await session.currentEvaluationInputs.read(session.log.session, session.log.tenant),
      ).completion,
  )
  if ('unavailable' in received || !('input' in received.ok)) return { unavailable: true }
  const evaluationInput = received.ok.input
  if (
    !tenantIdEquals(evaluationInput.tenant, session.log.tenant) ||
    evaluationInput.standing.standing !== 'effective'
  )
    return { unavailable: true }
  const evaluated = evaluate(evaluationInput)
  if (!('ok' in evaluated)) return { unavailable: true }
  const assembly = evaluated.ok
  const root = capabilityCanonicalString(assembly.root)
  function one(item: string): number | undefined {
    const values = assembly.values.filter(
      value => capabilityCanonicalString(value.capability) === root && value.item === item,
    )
    return values.length === 1 ? positiveDurationMs(values[0]?.value) : undefined
  }
  const firstContentTimeoutMs = one('first_token_wait_limit')
  const idleContentTimeoutMs = one('post_first_token_stall_limit')
  return firstContentTimeoutMs === undefined || idleContentTimeoutMs === undefined
    ? { unavailable: true }
    : { firstContentTimeoutMs, idleContentTimeoutMs }
}

type CredentialValue = Exclude<
  Awaited<ReturnType<SessionRuntimeBinding['credentials']['value']>>,
  { readonly failure: unknown }
>
type CredentialPreparation =
  | { readonly credentialText: string; readonly value: CredentialValue }
  | Extract<
      SessionModelDispatchResult,
      { readonly unavailable: true } | { readonly credentialUnavailable: true }
    >

export async function prepareSessionModelDispatch(
  input: SessionModelDispatchInput,
): Promise<SessionModelDispatchResult> {
  const { session, key, dispatch, provider, attempt } = input
  const view = { request: input.request, binding: input.model, owner: input.owner }
  const calibrationTarget = currentCalibrationTarget()
  if (calibrationTarget === null) return { invalidInput: { reason: 'malformed' } }
  if (preparationUnavailable()) return { unavailable: true }
  const timing = await currentDispatchTiming(input)
  if ('unavailable' in timing) return timing
  const credential = await input.read(
    view.owner,
    async registration =>
      await registration.start(
        'read',
        async () =>
          await session.credentials.value(session.log.tenant, view.binding.profile.origin),
      ).completion,
  )
  const credentialPrepared = currentCredential(credential)
  if (!('credentialText' in credentialPrepared)) return credentialPrepared
  const value = credentialPrepared.value
  const credentialText = credentialPrepared.credentialText
  let tools: Awaited<ReturnType<typeof resolveCallTools>>
  try {
    tools = await resolveCallTools(view.request, session.tools)
  } catch {
    return { unavailable: true }
  }
  if ('failure' in tools) return toolPreparationFailure(tools)
  const calibration = await input.read(view.owner, async registration => {
    const prefix = await readSettlementPrefix({ binding: session.log, registration })
    return 'unavailable' in prefix
      ? ({ unavailable: true } as const)
      : authorizedCalibration(
          prefix.prefix,
          view.request.messages,
          calibrationTarget,
          input.calibration,
        )
  })
  if ('unavailable' in calibration || 'unavailable' in calibration.ok) return { unavailable: true }
  const planInput: PlanInput = Object.freeze({
    calibration: calibration.ok.calibration,
    outputHistory: calibration.ok.outputHistory,
    tokenMargin: input.tokenMargin,
    target: { kind: 'model_call' as const, callId: key.callId, dispatch },
    routeName: view.binding.profile.routeName,
    provider,
    snapshot: view.binding.snapshot,
    parameters: view.binding.parameters,
    messages: view.request.messages,
    tools: tools.tools,
  })
  return {
    prepared: {
      planInput,
      credential: credentialText,
      credentialScope: value.scope,
      policy: {
        ...input.policy,
        firstContentTimeoutMs: timing.firstContentTimeoutMs,
        idleContentTimeoutMs: timing.idleContentTimeoutMs,
      },
    },
  }

  function currentCalibrationTarget(): Parameters<typeof authorizedCalibration>[2] | null {
    if (view.request.run === undefined && attempt !== undefined) return null
    return view.request.run === undefined
      ? { callId: key.callId, dispatch }
      : attempt === undefined
        ? null
        : { callId: key.callId, dispatch, run: view.request.run, attempt }
  }

  function preparationUnavailable(): boolean {
    return (
      view.owner.admission() !== 'open' ||
      !settlementGenerationCurrent(session.log) ||
      'unknown' in view.owner.opened() ||
      view.owner.unresolvedWrites().length !== 0
    )
  }

  function currentCredential(
    credential:
      | { readonly ok: Awaited<ReturnType<SessionRuntimeBinding['credentials']['value']>> }
      | { readonly unavailable: true },
  ): CredentialPreparation {
    if ('unavailable' in credential) return credential
    if ('failure' in credential.ok)
      return credential.ok.failure === 'credentialUnavailable'
        ? { credentialUnavailable: true }
        : { unavailable: true }
    const value = credential.ok
    if (
      (value.scope.layer === 'tenant' && !tenantIdEquals(value.scope.tenant, session.log.tenant)) ||
      (view.binding.profile.origin === 'custom' && value.scope.layer === 'factory')
    )
      return { unavailable: true, diagnosticReason: 'scope_disallowed' }
    const text = decodeCredential()
    return typeof text === 'string' ? { credentialText: text, value } : text

    function decodeCredential():
      | string
      | Extract<
          SessionModelDispatchResult,
          { readonly unavailable: true } | { readonly credentialUnavailable: true }
        > {
      if (!(value.value instanceof Uint8Array)) return { unavailable: true }
      let credentialText: string
      try {
        credentialText = new TextDecoder('utf-8', { fatal: true }).decode(value.value)
      } catch {
        return { unavailable: true }
      }
      if (credentialText.length === 0) return { credentialUnavailable: true }
      return credentialText
    }
  }
}

function toolPreparationFailure(
  tools: Extract<Awaited<ReturnType<typeof resolveCallTools>>, { readonly failure: unknown }>,
): Extract<
  SessionModelDispatchResult,
  { readonly unavailable: true } | { readonly invalidInput: unknown }
> {
  return tools.failure === 'unavailable'
    ? { unavailable: true }
    : { invalidInput: { reason: tools.reason ?? 'malformed' } }
}

export const sessionModelRequestPreparation: SessionModelRequestPreparation = Object.freeze({
  prepare: prepareSessionModelDispatch,
  calibrate: authorizedCalibration,
  resolveTools: resolveCallTools,
})
