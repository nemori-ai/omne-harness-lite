import type { ChildProcess } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import { object } from '@omne-harness-lite/session-log'
import type { TenantBinding } from './state-layout.ts'
import { checkedTenantBinding } from './state-layout-values.ts'
import { ioCode } from './state-layout-files.ts'
import { positivePolicy, sessionHostAddress } from './session-host-io.ts'
import { sendSessionHostRequest } from './session-host-client.ts'
import {
  parseSessionCreationDefaults,
  type SessionCreationDefaults,
} from './session-host-protocol.ts'

export interface SessionHostConnectionPolicy {
  readonly timeoutMs: number
  readonly maxResponseBytes: number
  readonly startupTimeoutMs: number
  readonly pollIntervalMs: number
}
export type SessionHostConnection =
  | { readonly kind: 'connected'; readonly defaults: SessionCreationDefaults | null }
  | {
      readonly kind: 'unconfirmed'
      readonly reason:
        'cancelled' | 'existingChannelUnavailable' | 'invalidReply' | 'startupTimeout'
    }
export interface SessionHostConnectionOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly signal: AbortSignal
  readonly policy: SessionHostConnectionPolicy
  /** The application supplies an independently owned process with its startup input installed. */
  readonly launch: () => ChildProcess
}

/** Attach by protocol. A missing channel permits one launch; an existing channel is never removed. */
export async function connectSessionHost(
  requested: SessionHostConnectionOptions,
): Promise<SessionHostConnection> {
  const options = Object.freeze({
    ...requested,
    binding: Object.freeze(checkedTenantBinding(requested.binding)),
    policy: Object.freeze({ ...requested.policy }),
  })
  positivePolicy(options.policy, [
    'timeoutMs',
    'maxResponseBytes',
    'startupTimeoutMs',
    'pollIntervalMs',
  ])
  const address = sessionHostAddress(options.home, options.binding)
  if (options.signal.aborted) return { kind: 'unconfirmed', reason: 'cancelled' }
  const existing = await probe(options, options.signal)
  if (existing || options.signal.aborted)
    return existing ?? { kind: 'unconfirmed', reason: 'cancelled' }
  if (await channelExists(address.socketPath))
    return { kind: 'unconfirmed', reason: 'existingChannelUnavailable' }
  if (options.signal.aborted) return { kind: 'unconfirmed', reason: 'cancelled' }
  return launchAndConnect(options)
}

async function channelExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (ioCode(error) === 'ENOENT') return false
    throw error
  }
}
async function probe(
  options: SessionHostConnectionOptions,
  signal: AbortSignal,
): Promise<SessionHostConnection | undefined> {
  const response = await sendSessionHostRequest({
    home: options.home,
    request: {
      format: 'omne-session-host/1',
      binding: options.binding,
      command: 'readCreationDefaults',
    },
    signal,
    policy: {
      timeoutMs: options.policy.timeoutMs,
      maxResponseBytes: options.policy.maxResponseBytes,
    },
  })
  if (response.kind === 'unconfirmed') return undefined
  if (signal.aborted) return undefined
  const result = response.result
  if (object(result) && result.kind === 'creationNotReady' && Object.keys(result).length === 1)
    return { kind: 'connected', defaults: null }
  if (object(result) && result.kind === 'creationDefaults' && Object.keys(result).length === 2) {
    const defaults = parseSessionCreationDefaults(result.defaults)
    if (defaults) return { kind: 'connected', defaults }
  }
  return { kind: 'unconfirmed', reason: 'invalidReply' }
}
async function launchAndConnect(
  options: SessionHostConnectionOptions,
): Promise<SessionHostConnection> {
  const child = options.launch()
  let spawnFailure: Error | undefined
  const rememberFailure = (error: Error) => {
    spawnFailure = error
  }
  child.once('error', rememberFailure)
  child.once('exit', () => child.off('error', rememberFailure))
  child.unref()
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(options.policy.startupTimeoutMs),
  ])
  while (!signal.aborted) {
    const connected = await probe(options, signal)
    if (connected) return connected
    if (spawnFailure) throw spawnFailure
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Session host exited before readiness: ${child.exitCode ?? child.signalCode}`)
    try {
      await wait(options.policy.pollIntervalMs, undefined, { signal })
    } catch (error) {
      if (!signal.aborted) throw error
    }
  }
  return { kind: 'unconfirmed', reason: options.signal.aborted ? 'cancelled' : 'startupTimeout' }
}
