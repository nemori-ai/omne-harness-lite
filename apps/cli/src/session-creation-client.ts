import type { OperationRef, Receipt } from '@omne-harness-lite/session-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { TenantBinding } from './state-layout-values.ts'
import { sendSessionHostRequest, type SessionHostWaitPolicy } from './session-host-client.ts'
import { parseSessionHostRequest, type SessionHostRequest } from './session-host-protocol.ts'
import { checkedTenantBinding } from './state-layout-values.ts'
import { readCreatedReply, readCreationDefaultsReply } from './session-creation-replies.ts'

export type SessionCreateRequest = Extract<SessionHostRequest, { command: 'createSession' }>
export interface SessionCreationOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly policy: SessionHostWaitPolicy
  readonly signal: AbortSignal
  readonly originalId: () => string
}
export interface SessionCreationBlocked {
  readonly kind: 'session-creation'
  readonly status: 'blocked' | 'rejected' | 'unconfirmed'
  readonly reason: string
  readonly binding: TenantBinding
  readonly request: SessionCreateRequest | null
  readonly operation: OperationRef | null
}
export type SessionCreationOutcome =
  | { readonly kind: 'created-session'; readonly session: SessionRef; readonly receipt: Receipt }
  | SessionCreationBlocked

/** Read the actual host preferences, then submit one fully captured creation. */
export async function createSessionForMessage(
  options: SessionCreationOptions,
): Promise<SessionCreationOutcome> {
  const binding = Object.freeze(checkedTenantBinding(options.binding))
  const unavailable = (reason: string): SessionCreationBlocked => ({
    kind: 'session-creation',
    binding,
    status: 'blocked',
    reason,
    request: null,
    operation: null,
  })
  if (options.signal.aborted) return unavailable('detached')
  const read = await sendSessionHostRequest({
    home: options.home,
    policy: options.policy,
    signal: options.signal,
    request: { format: 'omne-session-host/1', binding, command: 'readCreationDefaults' },
  })
  if (read.kind !== 'reply') return unavailable(read.reason)
  const defaults = readCreationDefaultsReply(read.result)
  if (!defaults) return unavailable('creationConfigurationUnavailable')
  if (options.signal.aborted) return unavailable('detached')
  const packet = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding,
    command: 'createSession',
    input: { ...defaults, operationKey: options.originalId() },
  })
  if (!packet || packet.command !== 'createSession')
    throw new TypeError('original creation identity required')
  return submitCreation(options, packet)
}
async function submitCreation(
  options: SessionCreationOptions,
  packet: SessionCreateRequest,
): Promise<SessionCreationOutcome> {
  const binding = packet.binding
  const operation: OperationRef = {
    tenant: binding.tenant,
    principal: binding.tenant.account,
    operation: 'createSession',
    operationKey: packet.input.operationKey,
    session: null,
  }
  const base = { kind: 'session-creation' as const, binding, request: packet, operation }
  const reply = await sendSessionHostRequest({
    home: options.home,
    policy: options.policy,
    signal: options.signal,
    request: packet,
  })
  if (reply.kind !== 'reply') return { ...base, status: 'unconfirmed', reason: reply.reason }
  const created = readCreatedReply(reply.result, packet)
  if (!created) return { ...base, status: 'unconfirmed', reason: 'invalidCreationReply' }
  if ('failure' in created) return { ...base, status: 'rejected', reason: created.failure }
  if (created.kind === 'unknownCommit')
    return { ...base, status: 'unconfirmed', reason: 'unknownCommit' }
  return { kind: 'created-session', session: created.session, receipt: created.receipt }
}
