import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantStandingKey } from '@omne-harness/identity/cordis'
import type { Access, TenantId } from '@omne-harness/legal-identity'
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
  CommandResource,
  ModelCommandsAuthority,
  ModelSendSource,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { MODEL_HOST_COMPONENT, classOf, type PrincipalClass } from './principals.ts'
import { callKey, sameTenant } from './tenant-call.ts'

export const ACTOR_OWNER = tenantStandingKey

const QUALIFICATION = 'model-access-qualification'

const ACTIONS: Readonly<Record<CommandAction, readonly PrincipalClass[]>> = Object.freeze({
  admit: ['work'],
  facts: ['login', 'work', 'host'],
  inspect: ['login', 'work', 'host'],
  'read-account': ['login', 'work', 'host'],
  content: ['work', 'host'],
  control: ['work'],
  handoff: ['work', 'host'],
  account: ['work', 'host'],
  recovery: ['host'],
  observe: ['login', 'work', 'host'],
  send: ['host'],
})

type Refusal =
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{ kind: 'not-member' }>
  | Readonly<{ kind: 'tenant-mismatch' }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>

type Capture =
  | Readonly<{
      kind: 'login' | 'work'
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

export type ModelReadLease = Readonly<{
  check(action: 'inspect' | 'read-account', resource: CommandResource): Reply<void>
  release(): void
}>

export type ModelQualification = Readonly<{
  qualifyRead(access: Access<unknown>, current: () => boolean): Promise<ModelReadLease>

  qualify(access: Access<unknown>, current: () => boolean): Promise<() => void>
  captureHost(
    input: Readonly<{
      principal: object
      tenant: TenantId
      call: ModelCallId
      actor: ActorRef
      current: () => boolean
    }>,
  ): () => void
  recordHostBinding(binding: HostBinding): void
  dropHostBindings(): void
  authority: ModelCommandsAuthority<unknown>
  sourceCurrent: ModelSendSource<unknown>['current']
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
    // Host work is captured only by the entry after its binding is verified.
    if (who === null || who.kind === 'host') return refused({ kind: 'rejected' })
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
    return { kind: who.kind, tenant: who.principal.tenant, actor: subject.actor, current }
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
    for (const [key, bound] of bindings) if (!bound.current()) bindings.delete(key)
    const key = callKey(binding.tenant, binding.call)
    if (key !== undefined) bindings.set(key, binding)
  }

  const dropHostBindings: ModelQualification['dropHostBindings'] = () => {
    bindings.clear()
  }

  function authorizeCapture(
    capture: Capture | undefined,
    { action, access, resource }: Parameters<ModelCommandsAuthority<unknown>['authorize']>[0],
  ): Outcome<ActorRef, ModelFailure> {
    if (capture === undefined) return fail(unavailable(QUALIFICATION, 'principal-not-qualified'))
    if (capture.kind === 'refused') return fail(failureOf(capture.refusal, action))
    if (!sameTenant(capture.tenant, access.tenant) || !capture.current())
      return fail(denied(action))
    if (!ACTIONS[action].includes(capture.kind)) return fail(denied(action))
    if (capture.kind === 'host') {
      if (resource.kind !== 'call' || resource.call !== capture.call) return fail(denied(action))
    }
    return succeed(capture.actor)
  }

  const authorize: ModelCommandsAuthority<unknown>['authorize'] = input =>
    authorizeCapture(captured(input.access.principal), input)

  const qualifyRead: ModelQualification['qualifyRead'] = async (access, current) => {
    const host = captured(access.principal)
    const release = await qualify(access, current)
    let released = false
    return {
      async check(action, resource) {
        if (released || !current()) return fail(denied(action))
        const capture = host?.kind === 'host' ? host : await judge(access, current)
        if (capture.kind === 'host') {
          const subject = await readSubject(input.standing, capture.tenant)
          if (subject.kind === 'not-member') return fail(denied(action))
          if (subject.kind === 'unavailable')
            return fail(unavailable(ACTOR_OWNER, subject.diagnostic))
        }
        if (released || !current()) return fail(denied(action))
        if (capture.kind === 'host' && captured(access.principal) !== capture)
          return fail(denied(action))
        const result = authorizeCapture(capture, { action, access, resource })
        return 'failure' in result ? result : succeed(undefined)
      },
      release() {
        if (released) return
        released = true
        release()
      },
    }
  }

  const execution: ModelCommandsAuthority<unknown>['execution'] = (
    given: ExecutionRef,
  ): Outcome<ActorRef, ModelFailure> => {
    const key = callKey(given.tenant, given.call)
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
    return succeed({ authorized })
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
    qualifyRead,
    captureHost,
    recordHostBinding,
    dropHostBindings,
    authority: Object.freeze({ authorize, execution }),
    sourceCurrent,
    qualifyObservation,
  })
}
