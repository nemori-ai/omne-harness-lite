import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolConsumerProfile, ToolDefinition } from '@omne-harness/tool-contract'
import { toolEnvironmentsKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { LocalToolAvailabilitySource } from '@omne-harness/tool-host-local'
import { releaseOf } from '../../entry/tool-release.ts'
import type { ToolReleaseManifest } from '../../entry/tool-release-manifest.ts'
import { classify } from '../authorization/principals.ts'

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-availability', diagnostic })

const denied = succeed({
  qualification: 'denied' as const,
  dependencies: [],
  inputCompatible: false,
  outputCompatible: false,
  attachmentsReadable: false,
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

async function workPrincipalProblem(
  ctx: Context,
  principal: unknown,
  tenant: JudgeInput['tenant'],
): Promise<string | null> {
  const verifier: PrincipalVerifier | undefined = ctx.get(principalVerifierKey)
  if (verifier === undefined) return 'principal verifier absent'
  const verified = await verifier.verify(principal)
  if (verified.kind !== 'verified') return 'principal is not verified'
  const who = classify(verified.principal)
  const sameTenant =
    who?.column === 'work' &&
    tenantCodec.encode(tenant).ok &&
    tenantEquals(who.principal.tenant, tenant)
  return sameTenant ? null : 'not a session work principal of this tenant'
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

function allowedFacts(
  definition: ToolDefinition,
  confirmed: ToolReleaseManifest['consumer'],
  installed: boolean,
) {
  const facilities = declaredFacilities(definition)
  if (facilities === undefined) return unavailable('environment declaration is unreadable')
  const { declarations } = definition
  const consumerReads = new Set<string>(confirmed.input)
  const consumerWrites = new Set<string>(confirmed.output)
  return succeed({
    qualification: 'allowed' as const,
    dependencies: facilities.map(name => ({ name: `facility:${name}`, available: installed })),
    inputCompatible: declarations.inputModalities.every(m => consumerWrites.has(m)),
    outputCompatible: declarations.outputModalities.every(m => consumerReads.has(m)),
    attachmentsReadable: declarations.attachments.length === 0,
  })
}

async function judgeRelease(ctx: Context, input: JudgeInput): ReturnType<Judge> {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
  const problem = await workPrincipalProblem(ctx, input.principal, input.tenant)
  if (problem !== null) return unavailable(problem)
  if (!inRelease(release, input.definition, input.layer)) return denied
  const confirmed = release.manifest.consumer
  if (!confirmedTextConsumer(input.consumer, confirmed))
    return unavailable('consumer material is not a confirmed text consumer')
  return allowedFacts(input.definition, confirmed, environmentInstalled(ctx))
}

export function createReleaseAvailability(ctx: Context): LocalToolAvailabilitySource<unknown> {
  const source: LocalToolAvailabilitySource<unknown> = {
    async judge(input) {
      try {
        return await judgeRelease(ctx, input)
      } catch {
        return unavailable('availability judgement failed')
      }
    },
  }
  return Object.freeze(source)
}
