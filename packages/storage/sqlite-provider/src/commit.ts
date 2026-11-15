import {
  inputDigestV2,
  type CommitOptions,
  type CommitRejectReason,
  type CommitRequestV2,
  type CommitResultV2,
  type SqlIdentity,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { type Core, identityKey, sameScope } from './core.ts'
import { decodeIdentity, isDigest, isName } from './fields.ts'
import { canonicalJson, isStrictJson, jsonShape, utf8Length } from './json.ts'
import type { CommitReply } from './worker/protocol.ts'
import type { Acquired, Granted } from './waiting.ts'
import { observeReply, WorkerExited } from './writer-client.ts'

const WITHDRAWN_DIAGNOSTIC = {
  aborted: 'withdrawn_before_start',
  expired: 'barrier_wait_expired',
} as const

type Judged =
  | Readonly<{ kind: 'rejected'; reason: CommitRejectReason }>
  | Readonly<{ kind: 'accepted'; identity: SqlIdentity; requestBytes: number; inputDigest: string }>

function commandsValid(commands: unknown): commands is CommitRequestV2['commands'] {
  return (
    Array.isArray(commands) &&
    commands.length > 0 &&
    commands.every(
      (command: unknown) =>
        typeof command === 'object' &&
        command !== null &&
        isName((command as { participant?: unknown }).participant) &&
        typeof (command as { facts?: unknown }).facts === 'object' &&
        (command as { facts?: unknown }).facts !== null &&
        !Array.isArray((command as { facts?: unknown }).facts),
    )
  )
}

function judge(core: Core, input: CommitRequestV2, signal: AbortSignal | undefined): Judged {
  const { config } = core
  const rejected = (reason: CommitRejectReason): Judged => ({ kind: 'rejected', reason })
  if (core.lifecycle.closing) return rejected('closing')
  if (signal?.aborted === true) return rejected('cancelled')
  const decoded = decodeIdentity((input as Partial<CommitRequestV2> | null)?.identity)
  const commands: unknown = input?.commands
  if (
    decoded.fields === null ||
    !isName(input.combinationVersion) ||
    !isDigest(input.manifestDigest) ||
    !commandsValid(commands)
  )
    return rejected('field_missing')
  if (decoded.protocol !== '2' || decoded.identity === null) return rejected('unsupported_protocol')
  if (new Set(commands.map(command => command.participant)).size !== commands.length)
    return rejected('participant_repeated')
  if (!commands.every(command => isStrictJson(command.facts))) return rejected('facts_not_json')
  let members = 0
  for (const command of commands) {
    const shape = jsonShape(command.facts)
    if (shape.depth > config.maxJsonDepth) return rejected('command_limit')
    members += shape.members
  }
  if (members > config.maxJsonMembers || commands.length > config.maxCommandsPerCommit)
    return rejected('command_limit')
  for (const command of commands)
    if (utf8Length(canonicalJson(command)) > config.maxCommandBytes)
      return rejected('command_limit')
  const requestBytes = utf8Length(canonicalJson(input))
  if (requestBytes > config.maxRequestBytes) return rejected('command_limit')
  return {
    kind: 'accepted',
    identity: decoded.identity,
    requestBytes,
    inputDigest: inputDigestV2(input),
  }
}

export function createCommit(core: Core): SqlStorage['commit'] {
  return (input: CommitRequestV2, options?: CommitOptions): Promise<CommitResultV2> => {
    const signal = options?.signal
    const decoded = decodeIdentity((input as Partial<CommitRequestV2> | null)?.identity)
    const rejection = (reason: CommitRejectReason, identity: SqlIdentity | null): CommitResultV2 =>
      ({
        kind: 'rejected_before_accept',
        identity,
        reason,
        diagnostic: core.diagnostic(reason),
      }) as CommitResultV2
    const judged = judge(core, input, signal)
    if (judged.kind === 'rejected')
      return Promise.resolve(rejection(judged.reason, decoded.identity))
    const { identity, requestBytes, inputDigest } = judged
    const key = identityKey(identity)
    core.pending.add(key)
    const answer = (acquired: Acquired): Promise<CommitResultV2> => {
      if (acquired.kind === 'granted')
        return admitted(acquired, { input, identity, inputDigest, key, signal, rejection })
      core.pending.remove(key)
      return Promise.resolve(rejection(WAIT_REFUSAL[acquired.kind], identity))
    }
    const acquired = core.admission.reserveWrite(identity.transactionDomain, requestBytes, signal)
    return acquired instanceof Promise ? acquired.then(answer) : answer(acquired)
  }

  function admitted(grant: Granted, sent: Sent): Promise<CommitResultV2> {
    const { input, identity, inputDigest, key, signal, rejection } = sent
    const unknown = (text: string): CommitResultV2 => ({
      kind: 'unknown',
      identity,
      diagnostic: core.diagnostic(text),
    })
    const reject = (reason: CommitRejectReason): CommitResultV2 => rejection(reason, identity)

    return new Promise<CommitResultV2>(resolve => {
      let settled = false
      let detached = false
      const withdraw = new AbortController()
      const settle = (result: CommitResultV2): void => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const onAbort = (): void => {
        detached = true
        withdraw.abort()
        settle(unknown('observer_detached'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      // Granted after a wait: the signal may have aborted between the grant and here (SPEC 7.1 item 3).
      if (signal?.aborted === true) onAbort()
      const unhold = core.domains.hold(identity.transactionDomain)
      const leave = core.inFlight.add({
        domain: identity.transactionDomain,
        identity,
        expire: () => settle(unknown('close_deadline')),
      })

      const dispatch = async (): Promise<CommitResultV2> => {
        let ready = core.domains.peekReady(identity.transactionDomain)
        if (ready === null) {
          const outcome = await core.domains.ensure(identity.transactionDomain, null)
          if (outcome.kind === 'closing' || core.lifecycle.closing || detached)
            return unknown('withdrawn_before_start')
          if (outcome.kind === 'absent') return reject('combination_unregistered')
          if (outcome.kind === 'quarantined' || outcome.kind === 'failed')
            return reject('domain_unavailable')
          if (outcome.kind === 'unknown') return unknown(outcome.diagnostic)
          ready = outcome.entry
        }
        if (!sameScope(ready.scope, identity.scope)) return reject('combination_unregistered')
        if (ready.wal.state === 'write-stopped') return reject('domain_unavailable')
        let reply: CommitReply
        const admission = await core.barrier.enterWrite(identity.transactionDomain, {
          signal: withdraw.signal,
          timeoutMs: core.config.lockWaitMs,
        })
        if (admission.kind === 'withdrawn') return unknown(WITHDRAWN_DIAGNOSTIC[admission.cause])
        if (core.lifecycle.closing) {
          admission.release()
          return unknown('withdrawn_before_start')
        }
        try {
          reply = await observeReply(
            () =>
              ready.client.request<CommitReply>({ kind: 'commit', request: input, inputDigest }),
            core.replyObservationMs,
            () => settle(unknown('reply_wait_expired')),
          )
        } catch (error) {
          return unknown(error instanceof WorkerExited ? 'worker_exited' : 'provider_error')
        } finally {
          admission.release()
        }
        switch (reply.kind) {
          case 'receipt':
            return { ...reply.receipt, recalled: reply.recalled }
          case 'conflict':
            return { kind: 'identity_conflict', identity, existing: reply.existing }
          case 'rejected':
            return reject(reply.reason)
          case 'unknown':
            return unknown(reply.diagnostic)
          case 'quarantine':
            core.domains.quarantine(ready, reply.diagnostic)
            return reject('domain_unavailable')
          case 'withdrawn':
            return unknown('withdrawn_before_start')
          default:
            return unknown('provider_error')
        }
      }

      const finish = (): void => {
        unhold()
        leave()
        grant.release()
        core.pending.remove(key)
      }
      dispatch().then(
        result => {
          finish()
          settle(result)
        },
        () => {
          finish()
          settle(unknown('provider_error'))
        },
      )
    })
  }
}

type Sent = Readonly<{
  input: CommitRequestV2
  identity: SqlIdentity
  inputDigest: string
  key: string
  signal: AbortSignal | undefined
  rejection: (reason: CommitRejectReason, identity: SqlIdentity | null) => CommitResultV2
}>

const WAIT_REFUSAL = {
  full: 'queue_full',
  expired: 'queue_full',
  aborted: 'cancelled',
  closing: 'closing',
} as const satisfies Record<Exclude<Acquired['kind'], 'granted'>, CommitRejectReason>
