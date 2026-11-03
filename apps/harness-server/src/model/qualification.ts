// The qualification registry of the Model application module (`tmp/wire-model/design.md` §2, §4).
//
// Model asks three synchronous questions: `ModelCommandsAuthority.authorize`, `authority.execution`
// and `ModelSendSource.current`. The facts they need come from two asynchronous ports, the identity
// verifier and the tenant standing source. This module does not put the asynchronous ports behind
// the synchronous answers. It verifies and reads at an asynchronous admission point and captures
// the outcome; the synchronous answers only read what was captured:
// - W (Session work principal): `qualify` runs before one call of the commands the host wraps and
//   the capture is released after it. There is no cache that outlives the call.
// - M (Model host work principal): the entry captures it in `modelHostAuthority.resolve`; the
//   capture ends when the host fiber retires (`current`). Revocation between the two is #677.
//
// The ActorRef of both is the subject reference: the standing record of the tenant's own account
// and its revision, as the identity standing source reads them. The execution reference names the
// host binding the channel already verified: the instance and its generation.
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantStandingKey } from '@omne-harness/identity/cordis'
import { tenantCodec, tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import type {
  CallAccess,
  ModelCallId,
  ModelFailure,
  ModelInstanceId,
  ModelOperationId,
  Reply,
} from '@omne-harness/model-contract'
import type { ActorRef, ExecutionRef, SendDemand } from '@omne-harness/model-contract/provider'
import type {
  CommandAction,
  ModelCommandsAuthority,
  ModelSendSource,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { MODEL_HOST_COMPONENT, classOf, type PrincipalClass } from './principals.ts'

/** The owner of every subject reference: the standing source that can read the record again. */
export const ACTOR_OWNER = tenantStandingKey

const QUALIFICATION = 'model-access-qualification'

/** The actions each class may take (R2-D33 plan A, the nine-action table). */
const ACTIONS: Readonly<Record<CommandAction, readonly PrincipalClass[]>> = Object.freeze({
  admit: ['work'],
  facts: ['work', 'host'],
  content: ['work', 'host'],
  control: ['work'],
  handoff: ['work', 'host'],
  account: ['work', 'host'],
  recovery: ['host'],
  observe: ['work', 'host'],
  send: ['host'],
})

type Refusal =
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{ kind: 'not-member' }>
  | Readonly<{ kind: 'tenant-mismatch' }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>

type Capture =
  | Readonly<{
      kind: 'work'
      tenant: TenantId
      actor: ActorRef
      current: () => boolean
    }>
  | Readonly<{
      kind: 'host'
      tenant: TenantId
      call: ModelCallId
      actor: ActorRef
      current: () => boolean
    }>
  | Readonly<{ kind: 'refused'; refusal: Refusal }>

type Held = { capture: Capture; holds: number }

/** A host binding the entry recorded after `channel.prepare` succeeded. */
export type HostBinding = Readonly<{
  tenant: TenantId
  call: ModelCallId
  instance: ModelInstanceId
  operation: ModelOperationId
  current: () => boolean
}>

export type SubjectReading =
  | Readonly<{ kind: 'subject'; actor: ActorRef }>
  | Readonly<{ kind: 'not-member' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const unavailable = (dependency: string, diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency,
  diagnostic,
})
const denied = (action: string): ModelFailure => ({ kind: 'denied', action })

function keyOf(tenant: TenantId, call: ModelCallId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? JSON.stringify([text.value, call]) : undefined
}

function sameTenant(left: TenantId, right: TenantId): boolean {
  return tenantCodec.encode(left).ok && tenantCodec.encode(right).ok && tenantEquals(left, right)
}

/**
 * The subject reference of a tenant: the standing record of its account, read now. `unavailable`
 * when the source cannot answer; the diagnostic of the source is not copied (it may name rows).
 */
export async function readSubject(
  standing: Pick<TenantStandingSource, 'read'>,
  tenant: TenantId,
): Promise<SubjectReading> {
  let reading: Awaited<ReturnType<TenantStandingSource['read']>>
  try {
    reading = await standing.read({ tenant })
  } catch {
    return { kind: 'unavailable', diagnostic: 'standing-read-threw' }
  }
  switch (reading.kind) {
    case 'member':
      return {
        kind: 'subject',
        actor: Object.freeze({
          owner: ACTOR_OWNER,
          subject: reading.evidence.record,
          revision: reading.evidence.revision,
        }),
      }
    case 'not-member':
      return { kind: 'not-member' }
    case 'unavailable':
      return { kind: 'unavailable', diagnostic: 'standing-unavailable' }
  }
}

function failureOf(refusal: Refusal, action: string): ModelFailure {
  switch (refusal.kind) {
    case 'rejected':
    case 'not-member':
    case 'tenant-mismatch':
      return denied(action)
    case 'unavailable':
      return unavailable(refusal.dependency, refusal.diagnostic)
  }
}

export type ModelQualification = Readonly<{
  /**
   * Verifies `access.principal`, reads the standing of its tenant and captures the outcome for the
   * duration of one call. Returns the release. A principal the entry captured as M is left as it is.
   */
  qualify(access: Access<unknown>, current: () => boolean): Promise<() => void>
  /** The entry captures M after it verified the acceptance record. Returns the withdrawal. */
  captureHost(
    input: Readonly<{
      principal: object
      tenant: TenantId
      call: ModelCallId
      actor: ActorRef
      current: () => boolean
    }>,
  ): () => void
  /** The entry records the binding `channel.prepare` returned, for `execution` and `current`. */
  recordHostBinding(binding: HostBinding): void
  /** The synchronous authority the records core and the host channel ask. */
  authority: ModelCommandsAuthority<unknown>
  /** The synchronous send qualification of every registered send source. */
  sourceCurrent: ModelSendSource<unknown>['current']
  /** `qualifyObservation` of the host: qualify, then ask `authorize` for `observe`. */
  qualifyObservation(access: CallAccess<unknown>, current: () => boolean): Reply<void>
}>

export function createModelQualification(
  input: Readonly<{ verifier: PrincipalVerifier; standing: Pick<TenantStandingSource, 'read'> }>,
): ModelQualification {
  const held = new WeakMap<object, Held>()
  const bindings = new Map<string, HostBinding>()

  const captured = (principal: unknown): Capture | undefined =>
    typeof principal === 'object' && principal !== null ? held.get(principal)?.capture : undefined

  async function judge(access: Access<unknown>, current: () => boolean): Promise<Capture> {
    const refused = (refusal: Refusal): Capture => ({ kind: 'refused', refusal })
    let verification: Awaited<ReturnType<PrincipalVerifier['verify']>>
    try {
      verification = await input.verifier.verify(access.principal)
    } catch {
      return refused({ kind: 'unavailable', dependency: 'principalVerifier', diagnostic: 'threw' })
    }
    if (verification.kind === 'unavailable')
      return refused({
        kind: 'unavailable',
        dependency: 'principalVerifier',
        diagnostic: 'verification-unavailable',
      })
    if (verification.kind === 'rejected') return refused({ kind: 'rejected' })
    const who = classOf(verification.principal)
    // Only W is admitted here. M is captured by the entry, never by a caller's own object.
    if (who === null || who.kind !== 'work') return refused({ kind: 'rejected' })
    if (!sameTenant(who.principal.tenant, access.tenant))
      return refused({ kind: 'tenant-mismatch' })
    const subject = await readSubject(input.standing, who.principal.tenant)
    if (subject.kind === 'unavailable')
      return refused({
        kind: 'unavailable',
        dependency: ACTOR_OWNER,
        diagnostic: subject.diagnostic,
      })
    if (subject.kind === 'not-member') return refused({ kind: 'not-member' })
    return { kind: 'work', tenant: who.principal.tenant, actor: subject.actor, current }
  }

  const qualify: ModelQualification['qualify'] = async (access, current) => {
    const principal: unknown = access.principal
    if (typeof principal !== 'object' || principal === null) return () => {}
    if (held.get(principal)?.capture.kind === 'host') return () => {}
    const capture = await judge(access, current)
    const entry = held.get(principal)
    if (entry === undefined || entry.capture.kind === 'host') {
      held.set(principal, { capture, holds: 1 })
    } else {
      entry.capture = capture
      entry.holds += 1
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const current = held.get(principal)
      if (current === undefined || current.capture.kind === 'host') return
      current.holds -= 1
      if (current.holds <= 0) held.delete(principal)
    }
  }

  const captureHost: ModelQualification['captureHost'] = given => {
    const capture: Capture = {
      kind: 'host',
      tenant: given.tenant,
      call: given.call,
      actor: given.actor,
      current: given.current,
    }
    held.set(given.principal, { capture, holds: 1 })
    return () => {
      if (held.get(given.principal)?.capture === capture) held.delete(given.principal)
    }
  }

  const recordHostBinding: ModelQualification['recordHostBinding'] = binding => {
    const key = keyOf(binding.tenant, binding.call)
    if (key !== undefined) bindings.set(key, binding)
  }

  const authorize: ModelCommandsAuthority<unknown>['authorize'] = ({
    action,
    access,
    resource,
  }) => {
    const capture = captured(access.principal)
    if (capture === undefined) return fail(unavailable(QUALIFICATION, 'principal-not-qualified'))
    if (capture.kind === 'refused') return fail(failureOf(capture.refusal, action))
    if (!sameTenant(capture.tenant, access.tenant) || !capture.current())
      return fail(denied(action))
    if (!ACTIONS[action].includes(capture.kind)) return fail(denied(action))
    if (capture.kind === 'host') {
      if (resource.kind !== 'call')
        return action === 'recovery'
          ? fail(unavailable('model-recovery-scan', 'tenant-scan-not-provided'))
          : fail(denied(action))
      if (resource.call !== capture.call) return fail(denied(action))
    }
    return succeed(capture.actor)
  }

  const execution: ModelCommandsAuthority<unknown>['execution'] = (
    given: ExecutionRef,
  ): Outcome<ActorRef, ModelFailure> => {
    const key = keyOf(given.tenant, given.call)
    const bound = key === undefined ? undefined : bindings.get(key)
    if (bound === undefined || bound.instance !== given.instance || !bound.current())
      return fail(denied('execution-channel'))
    return succeed(
      Object.freeze({
        owner: MODEL_HOST_COMPONENT,
        subject: given.instance,
        revision: given.generation,
      }),
    )
  }

  const sourceCurrent: ModelQualification['sourceCurrent'] = (demand: SendDemand<unknown>) => {
    const capture = captured(demand.principal)
    const authorized =
      capture !== undefined &&
      capture.kind === 'host' &&
      sameTenant(capture.tenant, demand.tenant) &&
      capture.call === demand.call &&
      capture.current()
    // M2 has no tenant credential settings source: the application's own supplier completion gives
    // every supplier the factory reference. The vault's `resolveFor` is the judge of real holdings.
    return succeed({ authorized, noTenantBinding: demand.supplier.credential.kind === 'factory' })
  }

  const qualifyObservation: ModelQualification['qualifyObservation'] = async (access, current) => {
    const release = await qualify(access, current)
    try {
      const judged = authorize({
        action: 'observe',
        access,
        resource: { kind: 'call', call: access.call, consumer: null },
      })
      return 'failure' in judged ? judged : succeed(undefined)
    } finally {
      release()
    }
  }

  return Object.freeze({
    qualify,
    captureHost,
    recordHostBinding,
    authority: Object.freeze({ authorize, execution }),
    sourceCurrent,
    qualifyObservation,
  })
}
