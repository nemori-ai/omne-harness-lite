import type { Context } from '@deepseek-ai/cordis'
import { calendarCalculatorKey } from '@omne-harness/calendar-cordis-contract/cordis'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import {
  notificationInboxKey,
  notificationSendingKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import type { ModalityRequirement } from '@omne-harness/model-contract'
import {
  modelProfilesKey,
  type ModelProfilesService,
} from '@omne-harness/model-cordis-contract/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { sessionKey, sessionSearchKey } from '@omne-harness/session-cordis-contract/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolConsumerProfile, ToolDefinition } from '@omne-harness/tool-contract'
import { commandAddedModalities } from '@omne-harness/tool-contract/provider'
import { toolEnvironmentsKey, toolMediaStoreKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { SessionWork } from '@omne-harness/session-contract'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import type { LocalToolAvailabilitySource } from '@omne-harness/tool-host-local'
import { releaseOf } from '../../entry/tool-release.ts'
import type { ToolReleaseManifest } from '../../entry/tool-release-manifest.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-availability', diagnostic })

const denied = succeed({
  qualification: 'denied' as const,
  dependencies: [],
  inputCompatible: false,
  outputCompatible: false,
  attachmentsReadable: false,
  productsStorable: false,
})

function declaredFacilities(definition: ToolDefinition): readonly string[] | undefined {
  const environment = definition.declarations.environment
  if (environment === null) return []
  const value = environment.value
  if (value.kind !== 'object') return undefined
  const facilities = value.entries.find(entry => entry.key === 'facilities')?.value
  if (facilities?.kind !== 'array') return undefined
  const names: string[] = []
  for (const item of facilities.items) {
    if (item.kind !== 'string') return undefined
    names.push(item.value)
  }
  return names
}

function confirmedTextConsumer(
  consumer: ToolConsumerProfile,
  confirmed: ToolReleaseManifest['consumer'],
): boolean {
  return (
    canonicalDigest({
      capabilities: consumer.capabilities,
      conversion: consumer.conversion,
      attachmentAccess: consumer.attachmentAccess,
    }) ===
    canonicalDigest({
      capabilities: confirmed.capabilities,
      conversion: confirmed.conversion,
      attachmentAccess: confirmed.attachmentAccess,
    })
  )
}

type Judge = LocalToolAvailabilitySource<unknown>['judge']
type JudgeInput = Parameters<Judge>[0]
type Trusted = Extract<ReturnType<typeof releaseOf>, { kind: 'trusted' }>

/** The session this work principal acts in, or why it is not one of this tenant. */
async function workSession(
  ctx: Context,
  principal: unknown,
  tenant: JudgeInput['tenant'],
): Promise<Readonly<{ session: string }> | Readonly<{ problem: string }>> {
  const verifier: PrincipalVerifier | undefined = ctx.get(principalVerifierKey)
  if (verifier === undefined) return { problem: 'principal verifier absent' }
  const verified = await verifier.verify(principal)
  if (verified.kind !== 'verified') return { problem: 'principal is not verified' }
  const work = sessionWorkOf(verified.principal, tenant)
  return work === undefined
    ? { problem: 'not a session work principal of this tenant' }
    : { session: work.session }
}

type Modality = ModalityRequirement['modalities'][number]
type Resolve = ModelProfilesService<unknown>['resolve']
type SessionAccessOf = Readonly<{ principal: unknown; tenant: TenantId; session: string }>
type Unreadable = Readonly<{ unreadable: string }>
/** Whether the model a session now uses takes these modalities natively. */
export type ModelReads = (
  access: SessionAccessOf,
  modalities: readonly Modality[],
) => Promise<'taken' | 'not-taken' | Unreadable>

export type ModelReadPorts = Readonly<{
  readSelection(
    access: SessionAccessOf,
  ): ReturnType<SessionWork<unknown>['readModelSelection']> | undefined
  resolveProfile(input: Parameters<Resolve>[0]): ReturnType<Resolve> | undefined
}>

const RESULT_REQUIREMENT_SOURCE = Object.freeze({
  owner: 'harness-server',
  record: 'tool-bindings/result-modalities',
  revision: '1',
  digest: '0'.repeat(64),
})

/** Reads the saved selection of the session, then asks the profile of that route; Model judges. */
export function modelReadsOver(ports: ModelReadPorts): ModelReads {
  return async (access, modalities) => {
    try {
      const saved = await ports.readSelection(access)
      if (saved === undefined) return { unreadable: 'the session service is not available' }
      if ('failure' in saved)
        return { unreadable: `the saved model selection cannot be read (${saved.failure.kind})` }
      const route = saved.ok.selection.name
      const resolved = await ports.resolveProfile({
        principal: access.principal,
        tenant: access.tenant,
        route,
        required: { modalities: ['text', ...modalities], source: RESULT_REQUIREMENT_SOURCE },
      })
      if (resolved === undefined)
        return { unreadable: 'the model profiles service is not available' }
      if ('failure' in resolved)
        return { unreadable: `the profile cannot be read (${resolved.failure.kind})` }
      if (resolved.ok.kind !== 'resolved')
        return { unreadable: `route "${route}" has no profile (${resolved.ok.reason})` }
      return resolved.ok.reasons.includes('modality') ? 'not-taken' : 'taken'
    } catch {
      return { unreadable: 'reading what the model takes threw' }
    }
  }
}

function sessionModelReads(ctx: Context): ModelReads {
  return modelReadsOver({
    readSelection: access =>
      ctx
        .intercept(sessionKey, { caller: 'maintainer' })
        .get(sessionKey, false)
        ?.work.readModelSelection(access as never),
    resolveProfile: input => ctx.get(modelProfilesKey, false)?.resolve(input),
  })
}

function inRelease(release: Trusted, definition: ToolDefinition, layer: JudgeInput['layer']) {
  if (layer.kind !== 'official') return false
  const digest = canonicalDigest(definition)
  return release.manifest.entries.some(
    candidate => candidate.asset.name === definition.name && candidate.definition === digest,
  )
}

function environmentInstalled(ctx: Context): boolean {
  return (
    ctx.get(executionEnvironmentKey) !== undefined && ctx.get(toolEnvironmentsKey) !== undefined
  )
}

/** The domain service each release capability stands for: a capability is there while its service is. */
const CAPABILITY_SERVICES: Readonly<Record<string, string>> = {
  'calendar.read': calendarCalculatorKey,
  'schedule.read': scheduleQueriesKey,
  'schedule.write': scheduleCommandsKey,
  'notification.read': notificationInboxKey,
  'notification.write': notificationSendingKey,
  'session.read': sessionKey,
  'session.search': sessionSearchKey,
  'workspace.switch': workspaceInstancesKey,
}

function capabilityFacts(ctx: Context, definition: ToolDefinition) {
  return definition.requiredCapabilities.map(name => {
    const service = CAPABILITY_SERVICES[name]
    return { name, available: service !== undefined && ctx.get(service) !== undefined }
  })
}

/** What a result may carry beyond what the confirmed consumer reads: natively or not at all. */
type Products = Readonly<{ storable: boolean; taken: boolean }>
const NO_PRODUCTS: Products = { storable: true, taken: true }

async function productsOf(
  ctx: Context,
  reads: ModelReads,
  access: SessionAccessOf,
  beyond: readonly Modality[],
): Promise<Products | Unreadable> {
  if (beyond.length === 0) return NO_PRODUCTS
  if (ctx.get(toolMediaStoreKey) === undefined) return { storable: false, taken: true }
  const answer = await reads(access, beyond)
  return typeof answer === 'string' ? { storable: true, taken: answer === 'taken' } : answer
}

function allowedFacts(
  definition: ToolDefinition,
  confirmed: ToolReleaseManifest['consumer'],
  installed: boolean,
  capabilities: ReturnType<typeof capabilityFacts>,
  products: Products,
) {
  const facilities = declaredFacilities(definition)
  if (facilities === undefined) return unavailable('environment declaration is unreadable')
  const { declarations } = definition
  const consumerReads = new Set<string>(confirmed.input)
  const consumerWrites = new Set<string>(confirmed.output)
  return succeed({
    qualification: 'allowed' as const,
    dependencies: [
      ...facilities.map(name => ({ name: `facility:${name}`, available: installed })),
      ...capabilities,
    ],
    inputCompatible: declarations.inputModalities.every(m => consumerWrites.has(m)),
    outputCompatible:
      declarations.outputModalities.every(m => consumerReads.has(m)) && products.taken,
    attachmentsReadable: declarations.attachments.length === 0,
    productsStorable: products.storable,
  })
}

async function judgeRelease(ctx: Context, reads: ModelReads, input: JudgeInput): ReturnType<Judge> {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
  const work = await workSession(ctx, input.principal, input.tenant)
  if ('problem' in work) return unavailable(work.problem)
  if (!inRelease(release, input.definition, input.layer)) return denied
  const confirmed = release.manifest.consumer
  if (!confirmedTextConsumer(input.consumer, confirmed))
    return unavailable('consumer material is not a confirmed text consumer')
  const beyond = commandAddedModalities(input.definition, input.command)
  const access = { principal: input.principal, tenant: input.tenant, session: work.session }
  const products = await productsOf(ctx, reads, access, beyond)
  if ('unreadable' in products) return unavailable(products.unreadable)
  return allowedFacts(
    input.definition,
    confirmed,
    environmentInstalled(ctx),
    capabilityFacts(ctx, input.definition),
    products,
  )
}

export function createReleaseAvailability(
  ctx: Context,
  reads: ModelReads = sessionModelReads(ctx),
): LocalToolAvailabilitySource<unknown> {
  const source: LocalToolAvailabilitySource<unknown> = {
    async judge(input) {
      try {
        return await judgeRelease(ctx, reads, input)
      } catch {
        return unavailable('availability judgement failed')
      }
    },
  }
  return Object.freeze(source)
}
