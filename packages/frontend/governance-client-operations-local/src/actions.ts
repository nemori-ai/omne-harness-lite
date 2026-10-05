import type {
  ClientLocalState,
  LocalRecord,
  LocalSnapshot,
} from '@omne-harness-lite/client-local-state'
import {
  GovernanceClientConfigurationError,
  type PublicHealthOptions,
  type PublicHealthOutcome,
  type GovernanceOutcome,
} from '@omne-harness-lite/governance-center-entry-https-json'
import type { Prepared } from './prepared.ts'
import { captureAction } from './validation.ts'
import type { ActionIntent } from '@omne-harness-lite/governance-client-operations'
import { block, defect, observeOutcome, type ReportFrame } from './report.ts'
import { AI15, AR8 } from './routes.ts'
import { settle } from './settlement.ts'
import { object } from './validation.ts'

/** Internal seam, never exported by the package. */
export interface Runtime {
  readonly state: ClientLocalState
  readonly timeoutMs: number
  readonly health: (options: PublicHealthOptions) => Promise<PublicHealthOutcome>
  readonly exchange: (options: PublicHealthOptions, envelope: unknown) => Promise<GovernanceOutcome>
  readonly observedAt: () => unknown
}
export async function readLocal(
  runtime: Runtime,
  frame: ReportFrame,
): Promise<LocalSnapshot | undefined> {
  try {
    const result = await runtime.state.read()
    if (result.kind === 'read') return result.snapshot
    block(frame, result.reason === 'unavailable' ? 'local-unavailable' : result.reason)
  } catch {
    defect(frame, 'local-read')
  }
  return undefined
}
export function options(
  runtime: Runtime,
  center: Pick<LocalRecord['center'], 'endpoint' | 'trust'>,
): PublicHealthOptions {
  return { url: center.endpoint, trust: center.trust, timeoutMs: runtime.timeoutMs }
}
/** No bearer is sent here. Only the version byte special case is a health answer. */
export async function checkHealth(
  runtime: Runtime,
  center: Pick<LocalRecord['center'], 'endpoint' | 'trust'>,
  expected: string | undefined,
  frame: ReportFrame,
): Promise<string | undefined> {
  try {
    const result = await runtime.health(options(runtime, center))
    if (result.kind === 'health') {
      if (expected !== undefined && result.reply.centerId !== expected) {
        frame.remote = {
          status: 'not-attempted',
          stage: 'health',
          sendAttempted: false,
          health: result.reply,
        }
        block(frame, 'center-mismatch')
        return undefined
      }
      frame.remote = {
        status: 'success',
        stage: 'health',
        sendAttempted: false,
        health: result.reply,
      }
      return result.reply.centerId
    }
    frame.remote =
      result.kind === 'entry-answer' && result.answer === 'version-mismatch'
        ? { status: 'rejected', stage: 'health', sendAttempted: false, answer: result.answer }
        : {
            status: 'unavailable',
            stage: 'health',
            sendAttempted: false,
            transportFailure: result.kind === 'unavailable' ? result.reason : 'response-invalid',
          }
  } catch (error) {
    if (error instanceof GovernanceClientConfigurationError) block(frame, 'invalid-input')
    else defect(frame, 'health')
  }
  return undefined
}
export async function preUseAction(
  runtime: Runtime,
  action:
    | Exclude<ActionIntent, { action: 'invoke' } | { action: 'health' | 'logout' }>
    | { action: 'health' },
  frame: ReportFrame,
  prepared?: Prepared,
): Promise<void> {
  const before = await readLocal(runtime, frame)
  if (before === undefined) return
  const record = before.value
  // Entering actions do not act as the old selected account or login.
  frame.origin = {
    centerId: record?.center.centerId ?? null,
    accountId: null,
    loginStateHandle: null,
  }
  if (
    prepared !== undefined &&
    (action.action === 'configure' || (action.action === 'health' && record !== null))
  ) {
    if (
      (await prepared.complete(
        frame,
        action.action === 'configure' ? action.endpoint : record!.center.endpoint,
        'local-selection',
      )) === undefined
    )
      return
  }
  if (action.action === 'configure') {
    if (prepared !== undefined && !prepared.continueAllowed(frame)) return
    const centerId = await checkHealth(runtime, action, record?.center.centerId, frame)
    if (centerId === undefined) return
    frame.origin = { ...frame.origin, centerId }
    await settle(
      runtime.state,
      before,
      {
        ...record,
        center: { centerId, endpoint: action.endpoint, trust: action.trust },
        cache: record?.cache ?? [],
      },
      frame,
    )
    return
  }
  if (record === null) {
    block(frame, 'not-configured')
    return
  }
  if (prepared !== undefined && !prepared.continueAllowed(frame)) return
  if ((await checkHealth(runtime, record.center, record.center.centerId, frame)) === undefined)
    return
  if (action.action === 'health') return
  const complete =
    prepared === undefined
      ? captureAction(action)
      : await prepared.complete(frame, record.center.endpoint, 'verified-center')
  if (complete === undefined || (complete.action !== 'register' && complete.action !== 'login'))
    return
  if (prepared !== undefined && !prepared.continueAllowed(frame)) return
  const operation = action.action === 'register' ? AR8 : AI15
  let result: GovernanceOutcome
  try {
    result = await runtime.exchange(options(runtime, record.center), {
      protocolVersion: '2',
      operation,
      payload: complete.payload,
    })
    observeOutcome(frame, operation, result, 'operation')
  } catch {
    defect(frame, 'operation')
    return
  }
  if (result.kind !== 'reply' || !('result' in result.reply)) return
  frame.view = { source: 'online', data: frame.remote.reply! }
  if (action.action === 'login') {
    const login = result.reply.result
    if (
      !object(login) ||
      typeof login['loginState'] !== 'string' ||
      typeof login['loginStateHandle'] !== 'string'
    ) {
      defect(frame, 'operation')
      return
    }
    await settle(
      runtime.state,
      before,
      {
        center: record.center,
        login: { presentation: login['loginState'], handle: login['loginStateHandle'] },
        cache: [],
      },
      frame,
    )
  }
}
