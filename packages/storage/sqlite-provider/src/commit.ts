// commit, control side (SPEC 7.1, 7.2 steps 1 to 8, result mapping). The Worker side is
// worker/execute.ts. Steps 1 to 7 run before anything is reserved. Step 8 reserves, and from
// then on the reservation and the pending index entry are returned once, when the result owner
// has the Worker reply, never when the caller stops observing.
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
import { WorkerExited } from './writer-client.ts'

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

/** Steps 1 to 7 of SPEC 7.2, in this order. Each step is one early return. */
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
  // Bounded walks first, then the canonical text (SPEC 7.2 step 7).
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
    const grant = core.admission.reserveWrite(identity.transactionDomain, requestBytes)
    if (grant === null) return Promise.resolve(rejection('queue_full', identity))

    const key = identityKey(identity)
    core.pending.add(key)
    const unknown = (text: string): CommitResultV2 => ({
      kind: 'unknown',
      identity,
      diagnostic: core.diagnostic(text),
    })
    const reject = (reason: CommitRejectReason): CommitResultV2 => rejection(reason, identity)

    return new Promise<CommitResultV2>(resolve => {
      let settled = false
      let detached = false
      const settle = (result: CommitResultV2): void => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      // Abort releases the observer only. The reservation stays until the owner has the result.
      const onAbort = (): void => {
        detached = true
        settle(unknown('observer_detached'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      // At the close deadline the caller gets `unknown`. The reservation stays until the Worker ends.
      const leave = core.inFlight.add({
        domain: identity.transactionDomain,
        identity,
        expire: () => settle(unknown('close_deadline')),
      })

      const dispatch = async (): Promise<CommitResultV2> => {
        let ready = core.domains.peekReady(identity.transactionDomain)
        if (ready === null) {
          const outcome = await core.domains.ensure(identity.transactionDomain, null)
          // Not sent yet, so the operation can be withdrawn without a trace (SPEC 7.1 item 3).
          if (outcome.kind === 'closing' || core.lifecycle.closing || detached)
            return unknown('withdrawn_before_start')
          if (outcome.kind === 'absent') return reject('combination_unregistered')
          if (outcome.kind === 'quarantined' || outcome.kind === 'failed')
            return reject('domain_unavailable')
          if (outcome.kind === 'unknown') return unknown(outcome.diagnostic)
          ready = outcome.entry
        }
        // A domain of another scope looks like an absent one (SPEC 5.5).
        if (!sameScope(ready.scope, identity.scope)) return reject('combination_unregistered')
        let reply: CommitReply
        try {
          reply = await ready.client.request<CommitReply>({
            kind: 'commit',
            request: input,
            inputDigest,
          })
        } catch (error) {
          return unknown(error instanceof WorkerExited ? 'worker_exited' : 'provider_error')
        }
        switch (reply.kind) {
          case 'receipt':
            return reply.receipt
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
