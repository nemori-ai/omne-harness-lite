import type { Context } from '@deepseek-ai/cordis'
import type {
  ActingForTenantPrincipal,
  PrincipalIssuer,
  SystemPrincipal,
  TenantStandingSource,
} from '@omne-harness/identity'
import { principalIssuerKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId, ModelFailure } from '@omne-harness/model-contract'
import type {
  ActorRef,
  ModelDriveInput,
  ModelHostAuthority,
} from '@omne-harness/model-contract/provider'
import {
  ModelConverterAuthorityService,
  ModelHostAuthorityService,
  ModelPublicationAuthorityService,
  modelConverterAuthorityKey,
  modelHostAuthorityKey,
  modelPublicationAuthorityKey,
  type ModelConverterAuthority,
  type ModelPublicationAuthority,
  type ModelRegistrationFailure,
} from '@omne-harness/model-cordis-contract/cordis'
import type {
  InitialTarget,
  ModelAcceptedOrigin,
  ModelInitialExecution,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createModelRunComposition,
  type ModelRecordsAttachment,
  type ModelRunComposition,
} from '../model/composition.ts'
import { registerModelRowPorts } from '../model/ports.ts'
import { MODEL_HOST_COMPONENT, MODEL_WORK_OWNER } from '../model/principals.ts'
import { ACTOR_OWNER, readSubject } from '../model/qualification.ts'
import { sameTenant } from '../model/tenant-call.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'

const DENIED: ModelRegistrationFailure = Object.freeze({ kind: 'denied' })

export function createModelPublicationAuthority(): ModelPublicationAuthority<unknown> {
  return Object.freeze({ check: () => fail(DENIED) })
}

export function createModelConverterAuthority(): ModelConverterAuthority<unknown> {
  return Object.freeze({ check: () => fail(DENIED) })
}

export type ModelWorkIssue = (
  input: Readonly<{ tenant: TenantId; call: ModelCallId }>,
) => Outcome<ActingForTenantPrincipal, unknown>

export type ModelHostAuthorityInput = Readonly<{
  composition: ModelRunComposition
  issue: ModelWorkIssue | undefined
  standing(): Pick<TenantStandingSource, 'read'> | undefined
}>

const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: modelHostAuthorityKey,
  diagnostic,
})
const denied = (action: string): ModelFailure => ({ kind: 'denied', action })

type Ready = Readonly<{
  attached: ModelRecordsAttachment
  current: () => boolean
  issue: ModelWorkIssue
  standing: Pick<TenantStandingSource, 'read'>
}>

function readiness(input: ModelHostAuthorityInput): Outcome<Ready, ModelFailure> {
  const attached = input.composition.attached()
  if (attached === undefined) return fail(unavailable('records-not-attached'))
  const current = input.composition.hostCurrent()
  if (current === undefined) return fail(unavailable('host-not-bound'))
  if (input.issue === undefined) return fail(unavailable('principal-issuer-unavailable'))
  const standing = input.standing()
  if (standing === undefined) return fail(unavailable('tenant-standing-unavailable'))
  return succeed({ attached, current, issue: input.issue, standing })
}

async function readOrigin(
  composition: ModelRunComposition,
  initial: ModelInitialExecution<unknown>,
  target: InitialTarget,
): Promise<Outcome<ModelAcceptedOrigin, ModelFailure>> {
  const revoke = composition.grantOriginRead(target)
  let accepted: Awaited<ReturnType<typeof initial.readAcceptance>>
  try {
    accepted = await initial.readAcceptance(target)
  } catch {
    return fail(unavailable('acceptance-read-threw'))
  } finally {
    revoke()
  }
  if ('failure' in accepted && accepted.failure.kind === 'commit-unknown')
    return fail(unavailable('acceptance-commit-unknown'))
  return accepted
}

async function checkRelation(
  standing: Pick<TenantStandingSource, 'read'>,
  accepted: ModelAcceptedOrigin,
  target: InitialTarget,
): Promise<Outcome<ActorRef, ModelFailure>> {
  if (!sameTenant(accepted.tenant, target.tenant) || accepted.call !== target.call)
    return fail(denied('model-host-resolve'))
  const subject = await readSubject(standing, accepted.tenant)
  if (subject.kind === 'unavailable') return fail(unavailable(subject.diagnostic))
  if (subject.kind === 'not-member') return fail(denied('model-host-resolve'))
  const { initiator } = accepted
  if (initiator.owner !== ACTOR_OWNER || initiator.subject !== subject.actor.subject)
    return fail(denied('model-host-resolve'))
  return succeed(subject.actor)
}

async function prepareOnChannel(
  composition: ModelRunComposition,
  ready: Ready,
  access: Readonly<{ principal: object; tenant: TenantId; call: ModelCallId; actor: ActorRef }>,
): Promise<Outcome<ModelDriveInput<unknown>, ModelFailure>> {
  const withdraw = ready.attached.qualification.captureHost({ ...access, current: ready.current })
  const channel = composition.executionChannel()
  if ('failure' in channel) {
    withdraw()
    return channel
  }
  let prepared: Awaited<ReturnType<typeof channel.ok.prepare>>
  try {
    prepared = await channel.ok.prepare({
      tenant: access.tenant,
      call: access.call,
      principal: access.principal,
    })
  } catch {
    withdraw()
    return fail(unavailable('channel-prepare-threw'))
  }
  if ('failure' in prepared) {
    withdraw()
    return prepared
  }
  ready.attached.qualification.recordHostBinding({
    tenant: access.tenant,
    call: access.call,
    instance: prepared.ok.instance,
    operation: prepared.ok.operation,
    current: ready.current,
  })
  return prepared
}

export function createModelHostAuthority(
  input: ModelHostAuthorityInput,
): ModelHostAuthority<unknown> {
  const resolve: ModelHostAuthority<unknown>['resolve'] = async target => {
    const ready = readiness(input)
    if ('failure' in ready) return ready
    const accepted = await readOrigin(input.composition, ready.ok.attached.initial, target)
    if ('failure' in accepted) return accepted
    // 2. 核关系。核对失败时没有签发过任何主体（ID-16：核对失败、依据不可得不得签发）。
    const actor = await checkRelation(ready.ok.standing, accepted.ok, target)
    if ('failure' in actor) return actor
    const issued = ready.ok.issue({ tenant: accepted.ok.tenant, call: accepted.ok.call })
    if ('failure' in issued) return fail(unavailable('principal-issue-refused'))
    return prepareOnChannel(input.composition, ready.ok, {
      principal: issued.ok,
      tenant: accepted.ok.tenant,
      call: accepted.ok.call,
      actor: actor.ok,
    })
  }
  return Object.freeze({ resolve })
}

class EntryModelPublicationAuthority extends ModelPublicationAuthorityService<unknown> {
  readonly check: ModelPublicationAuthority<unknown>['check']
  constructor(ctx: Context, authority: ModelPublicationAuthority<unknown>) {
    super(ctx)
    this.check = input => authority.check(input)
  }
}

class EntryModelConverterAuthority extends ModelConverterAuthorityService<unknown> {
  readonly check: ModelConverterAuthority<unknown>['check']
  constructor(ctx: Context, authority: ModelConverterAuthority<unknown>) {
    super(ctx)
    this.check = input => authority.check(input)
  }
}

class EntryModelHostAuthority extends ModelHostAuthorityService<unknown> {
  readonly resolve: ModelHostAuthority<unknown>['resolve']
  constructor(ctx: Context, authority: ModelHostAuthority<unknown>) {
    super(ctx)
    this.resolve = input => authority.resolve(input)
  }
}

function modelWorkIssuerOf(env: EntryEnv): ModelWorkIssue | undefined {
  const issuer: PrincipalIssuer | undefined = env
    .readTrusted(principalIssuerKey)
    .get(principalIssuerKey)
  if (issuer === undefined) return undefined
  const actor = issuer.issueSystem({ component: MODEL_HOST_COMPONENT })
  if ('failure' in actor) return undefined
  const system: SystemPrincipal = actor.ok
  return ({ tenant, call }) =>
    issuer.issueActingForTenant({
      actor: system,
      tenant,
      work: { owner: MODEL_WORK_OWNER, work: call },
    })
}

const COMPOSITION = Symbol('harness-server/model-run-composition')

export const modelPublicationAuthority: EntryObjectModule = {
  name: modelPublicationAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelPublicationAuthority(scope, createModelPublicationAuthority())
  },
}

export const modelConverterAuthority: EntryObjectModule = {
  name: modelConverterAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelConverterAuthority(scope, createModelConverterAuthority())
  },
}

export const modelHostAuthority: EntryObjectModule = {
  name: modelHostAuthorityKey,
  implementation: 'real',
  install(scope, env) {
    const composition = env.once(COMPOSITION, createModelRunComposition)
    registerModelRowPorts(scope, { records: composition.records, host: composition.host })
    const issue = modelWorkIssuerOf(env)
    if (issue === undefined)
      scope
        .logger('model-host-authority')
        .warn('the trusted principal issuer is not installed; no model call can be resolved')
    const authority = createModelHostAuthority({
      composition,
      issue,
      standing: () => env.readTrusted(tenantStandingKey).get(tenantStandingKey),
    })
    new EntryModelHostAuthority(scope, authority)
  },
}
