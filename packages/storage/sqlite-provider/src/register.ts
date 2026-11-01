// registerCombination (SPEC 6). Steps 1 to 8 of the rejection order run on the control side. The
// rest runs against the domain: path B creates an absent domain with this registration, an open
// domain takes a new version in one transaction (worker/domain.ts).
import {
  combinationManifest,
  manifestDigest,
  type CombinationRegistrationV2,
  type RegisterRejectReason,
  type RegisterResultV2,
  type SqlStorage,
  type StorageScope,
} from '@omne-harness/sql-contract'
import { type Core, sameScope } from './core.ts'
import { DOMAIN_BYTES, decodeScope, isDigest, isName } from './fields.ts'
import type { RegisterReply, RegistrationSpec } from './worker/protocol.ts'
import { WorkerExited } from './writer-client.ts'

type Judged =
  | Readonly<{ kind: 'rejected'; reason: RegisterRejectReason }>
  | Readonly<{ kind: 'accepted'; spec: RegistrationSpec; transactionDomain: string }>

function judge(core: Core, input: CombinationRegistrationV2): Judged {
  const rejected = (reason: RegisterRejectReason): Judged => ({ kind: 'rejected', reason })
  if (core.lifecycle.closing) return rejected('closing')
  const scope = decodeScope((input as Partial<CombinationRegistrationV2> | null)?.scope)
  const names: unknown = input?.participants
  const namesOk =
    Array.isArray(names) && names.every(name => typeof name === 'string' && (name === '' || isName(name)))
  if (
    scope === null ||
    !isName(input.transactionDomain, DOMAIN_BYTES) ||
    !isName(input.combinationVersion) ||
    !isDigest(input.manifestDigest) ||
    !namesOk
  )
    return rejected('field_missing')
  const participants = names as string[]
  if (participants.length === 0 || participants.includes('')) return rejected('participant_empty')
  if (new Set(participants).size !== participants.length) return rejected('participant_repeated')
  const judged = combinationManifest({ catalog: core.catalog, participants })
  if (judged.kind === 'material_unavailable') return rejected('material_unavailable')
  if (judged.kind === 'combination_invalid') return rejected('combination_invalid')
  if (manifestDigest(judged.manifest) !== input.manifestDigest) return rejected('manifest_mismatch')
  return {
    kind: 'accepted',
    transactionDomain: input.transactionDomain,
    spec: {
      scope,
      combinationVersion: input.combinationVersion,
      manifestDigest: input.manifestDigest,
      participants: [...participants].sort(),
    },
  }
}

export function createRegister(core: Core): SqlStorage['registerCombination'] {
  return async (input: CombinationRegistrationV2): Promise<RegisterResultV2> => {
    const rejection = (reason: RegisterRejectReason): RegisterResultV2 => ({
      kind: 'rejected_before_accept',
      reason,
      diagnostic: core.diagnostic(reason),
    })
    const judged = judge(core, input)
    if (judged.kind === 'rejected') return rejection(judged.reason)
    const { spec, transactionDomain } = judged
    const grant = core.admission.reserveControl(transactionDomain)
    if (grant === null) return rejection('queue_full')
    const registered = (scope: StorageScope): RegisterResultV2 => ({
      kind: 'registered',
      registration: {
        scope,
        transactionDomain,
        combinationVersion: spec.combinationVersion,
        manifestDigest: spec.manifestDigest,
        participants: spec.participants,
      },
    })
    const unknown = (text: string): RegisterResultV2 => ({
      kind: 'unknown',
      key: { scope: spec.scope, transactionDomain, combinationVersion: spec.combinationVersion },
      diagnostic: core.diagnostic(text),
    })
    try {
      const outcome = await core.domains.ensure(transactionDomain, spec)
      if (outcome.kind === 'closing') return unknown('withdrawn_before_start')
      if (outcome.kind === 'unknown') return unknown(outcome.diagnostic)
      if (outcome.kind !== 'ready') return rejection('domain_unavailable')
      if (outcome.created === spec) return registered(spec.scope)
      const { entry } = outcome
      if (!sameScope(entry.scope, spec.scope)) return rejection('domain_occupied')
      let reply: RegisterReply
      try {
        reply = await entry.client.request<RegisterReply>({ kind: 'register', registration: spec })
      } catch (error) {
        return unknown(error instanceof WorkerExited ? 'worker_exited' : 'provider_error')
      }
      switch (reply.kind) {
        case 'registered':
          return registered(spec.scope)
        case 'conflict':
          return rejection('registration_conflict')
        case 'unavailable':
          return rejection('domain_unavailable')
        default:
          return unknown(reply.diagnostic)
      }
    } catch {
      return unknown('provider_error')
    } finally {
      grant.release()
    }
  }
}
