import { captureCapabilities, handBackResult } from './capabilities.ts'
import { captureDriveInput } from './drive-input.ts'
import { captureDriveResult } from './drive-result.ts'
import { invalidInput } from './decision.ts'
import type {
  AttemptCapabilities,
  AttemptOwner,
  AttemptPorts,
  DriveInput,
  DriveResult,
  RunnableDecision,
} from './types.ts'
import type { AttemptPermit } from '@omne-harness-lite/session-runtime'
interface Held {
  readonly permit: AttemptPermit
  readonly capabilities: AttemptCapabilities
  readonly controller: AbortController
  readonly tasks: Set<Promise<DriveResult>>
  readonly calls: Set<string>
  running: boolean
  admitting: boolean
  released: boolean
  closing?: Promise<
    | { readonly kind: 'released' }
    | { readonly kind: 'pending'; readonly originalCalls: readonly string[] }
  >
}
const owners = new WeakMap<AttemptOwner, Held>(),
  ports = new WeakMap<AttemptPorts, Held>()
function blocked(
  decision: RunnableDecision,
  reason: Extract<DriveResult, { kind: 'blocked' }>['reason'],
): DriveResult {
  return { kind: 'blocked', obligation: decision.originalPosition, reason }
}
/** Construction trusts the actual capability owners. No default authorization or execution policy exists. */
export function createAttemptOwner(
  permit: AttemptPermit,
  capabilities: AttemptCapabilities,
): { readonly owner: AttemptOwner; readonly ports: AttemptPorts } {
  if (!permit || typeof permit !== 'object') throw new TypeError('invalid attempt construction')
  const owner = Object.freeze({}) as AttemptOwner,
    offered = Object.freeze({}) as AttemptPorts
  const held: Held = {
    permit,
    capabilities: captureCapabilities(capabilities),
    controller: new AbortController(),
    tasks: new Set(),
    calls: new Set(),
    running: false,
    admitting: true,
    released: false,
  }
  owners.set(owner, held)
  ports.set(offered, held)
  return { owner, ports: offered }
}
async function execute(
  held: Held,
  decision: RunnableDecision,
  signal: AbortSignal,
): Promise<DriveResult> {
  const authorized = await held.capabilities.authorize(held.permit, decision)
  if (!['authorized', 'denied', 'unavailable'].includes(authorized))
    throw new TypeError('invalid authorization result')
  if (authorized !== 'authorized')
    return blocked(decision, authorized === 'denied' ? 'denied' : 'unavailable')
  if (!held.admitting || signal.aborted)
    return blocked(decision, !held.admitting ? 'released' : 'awaitCancelled')
  return dispatch(held, decision, signal)
}
async function dispatch(
  held: Held,
  decision: RunnableDecision,
  signal: AbortSignal,
): Promise<DriveResult> {
  if (decision.kind === 'wait') {
    for (const call of decision.originalCalls) held.calls.add(call)
    return {
      kind: 'waiting',
      originalPosition: decision.originalPosition,
      originalCalls: decision.originalCalls,
    }
  }
  const capability = held.capabilities[decision.kind]
  if (capability === undefined) return blocked(decision, 'unsupported')
  // The discriminant selects the correspondingly typed capability, not an arbitrary effect port.
  if (
    decision.kind === 'invokeModel' ||
    decision.kind === 'executeActions' ||
    decision.kind === 'compact'
  )
    held.calls.add(decision.originalPosition)
  const received = await (
    capability as (
      decision: RunnableDecision,
      permit: AttemptPermit,
      signal: AbortSignal,
    ) => Promise<DriveResult>
  )(decision, held.permit, signal)
  return retainResult(held, decision, received)
}
function retainResult(held: Held, decision: RunnableDecision, received: unknown): DriveResult {
  const result = captureDriveResult(received, decision)
  if (result === undefined) throw new TypeError('capability returned an invalid drive result')
  if ('kind' in result && result.kind === 'committed') held.calls.delete(decision.originalPosition)
  if ('kind' in result && result.kind === 'waiting')
    for (const call of result.originalCalls) held.calls.add(call)
  if ('kind' in result && result.kind === 'handedBack')
    for (const call of result.originalCalls) held.calls.delete(call)
  return result
}
export async function driveStep(received: DriveInput): Promise<DriveResult> {
  const input = captureDriveInput(received)
  if (input === undefined) return invalidInput
  const held = ports.get(input.ports)
  if (held === undefined || !Object.is(held.permit, input.permit)) return invalidInput
  const decision = input.decision
  if (!held.admitting) return blocked(decision, 'released')
  if (held.running) return blocked(decision, 'unavailable')
  const signal =
    input.signal === undefined
      ? held.controller.signal
      : AbortSignal.any([held.controller.signal, input.signal])
  if (signal.aborted) return blocked(decision, 'awaitCancelled')
  held.running = true
  const task = execute(held, decision, signal)
  held.tasks.add(task)
  try {
    return await task
  } finally {
    held.tasks.delete(task)
    held.running = false
  }
}
export async function releaseAttempt(
  owner: AttemptOwner,
): Promise<
  | { readonly kind: 'released' }
  | { readonly kind: 'pending'; readonly originalCalls: readonly string[] }
  | typeof invalidInput
> {
  const held = owners.get(owner)
  if (held === undefined) return invalidInput
  if (held.released) return { kind: 'released' }
  if (held.closing !== undefined) return held.closing
  held.admitting = false
  held.controller.abort()
  const task = (async () => {
    const drained = await Promise.allSettled([...held.tasks])
    const failed = drained.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    const calls = Object.freeze([...held.calls])
    const result = handBackResult(await held.capabilities.handBack(calls))
    if (result === 'pending') return { kind: 'pending', originalCalls: calls } as const
    held.calls.clear()
    held.released = true
    return { kind: 'released' } as const
  })()
  held.closing = task
  try {
    return await task
  } finally {
    delete held.closing
  }
}
