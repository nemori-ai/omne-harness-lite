import { capabilityId, MAX_ASSET_PAGE } from '@omne-harness/assets'
import type { AssetsHoldingResult, AssetsLocal } from '@omne-harness/assets-local'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  isAdoptionRevision,
  isConnectionTarget,
  isEndpointHolding,
  isEndpointName,
  isMillis,
  mcpEndpointGates,
  parseEndpointBody,
  PROGRAM_CALLS_SETTING,
  type EndpointRef,
  type EndpointSettings,
  type SettingValue,
} from '@omne-harness/mcp-contract'
import type {
  AdoptedEndpoint,
  AdoptionView,
  EligibilityVerdict,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import { classify } from '../authorization/principals.ts'
import { credentialBinding, CREDENTIAL_ITEM } from './credential.ts'

export const MCP_CATEGORY = mcpEndpointGates.category

type Held = Extract<AssetsHoldingResult, { kind: 'holding' }>

export type EndpointSettingRead =
  | Readonly<{ kind: 'unset'; revision: string }>
  | Readonly<{ kind: 'set'; value: unknown; revision: string }>
  | Readonly<{ kind: 'secret'; revision: string }>

export type CredentialPresence = Readonly<{ bound: boolean; revision: string }>

/** What the release knows of a tenant's endpoints. All are facts of the tenant: nobody is asked who reads. */
export type EndpointFacts = Readonly<{
  /** The assets of the tenant; undefined when they cannot be had. */
  assets(
    tenantRef: string,
  ): Promise<Pick<AssetsLocal, 'listHeld' | 'readHeldCapability'> | undefined>
  /** The settings of one endpoint by item, read whole; `unknown` when they cannot be read. */
  settings(
    tenant: TenantId,
    endpoint: string,
  ): Promise<ReadonlyMap<string, EndpointSettingRead> | 'unknown'>
  credential(tenant: TenantId, endpoint: string): Promise<Outcome<CredentialPresence, 'unknown'>>
}>

const UNSET = { kind: 'absent' } as const

function valueOf<T>(
  read: Exclude<EndpointSettingRead, { kind: 'secret' }>,
  is: (value: unknown) => value is T,
): SettingValue<T> {
  if (read.kind === 'unset') return UNSET
  return is(read.value)
    ? { kind: 'value', value: read.value }
    : {
        kind: 'invalid',
        text: typeof read.value === 'string' ? read.value : JSON.stringify(read.value),
      }
}

async function assetsOf(facts: Pick<EndpointFacts, 'assets'>, tenant: TenantId) {
  const tenantRef = tenantCodec.encode(tenant)
  return tenantRef.ok ? facts.assets(tenantRef.value) : undefined
}

async function heldOf(
  facts: Pick<EndpointFacts, 'assets'>,
  tenant: TenantId,
  name: string,
): Promise<Outcome<Held | 'absent', 'unknown'>> {
  const capability = capabilityId(MCP_CATEGORY, name)
  const assets = await assetsOf(facts, tenant)
  if (assets === undefined || !capability.ok) return fail('unknown')
  const read = await assets.readHeldCapability({ capability: capability.id })
  if (read.kind === 'absent') return succeed('absent')
  if (read.kind !== 'holding') return fail('unknown')
  return succeed(read.holding.state === 'held' ? read : 'absent')
}

/** The endpoints a tenant holds now, enabled or not: the candidates MCP is then asked about one by one. */
export async function heldEndpointRefs(
  facts: Pick<EndpointFacts, 'assets'>,
  tenant: TenantId,
): Promise<Outcome<readonly EndpointRef[], 'unknown'>> {
  const assets = await assetsOf(facts, tenant)
  if (assets === undefined) return fail('unknown')
  const found: EndpointRef[] = []
  let after: string | null = null
  do {
    const page = await assets.listHeld({ category: MCP_CATEGORY, after, limit: MAX_ASSET_PAGE })
    if (page.kind !== 'page') return fail('unknown')
    for (const { name, holdingRef } of page.items)
      if (isEndpointName(name) && isEndpointHolding(holdingRef))
        found.push({ name, holding: holdingRef })
    after = page.next
  } while (after !== null)
  return succeed(found)
}

async function settingsOf(
  facts: EndpointFacts,
  tenant: TenantId,
  held: Held,
): Promise<
  Outcome<Readonly<{ settings: EndpointSettings; revisions: readonly string[] }>, 'unknown'>
> {
  const { name, holdingRef } = held.holding
  const body = held.selected === null ? undefined : parseEndpointBody(held.selected.body, name)
  const secured = body !== undefined && 'ok' in body && body.ok.auth !== 'none'
  const items = await facts.settings(tenant, name)
  if (items === 'unknown') return fail('unknown')
  const target = items.get('target')
  const timeout = items.get('connect-timeout')
  const credential = secured ? items.get(CREDENTIAL_ITEM) : undefined
  if (target === undefined || target.kind === 'secret') return fail('unknown')
  if (timeout === undefined || timeout.kind === 'secret') return fail('unknown')
  if (secured && credential?.kind !== 'secret') return fail('unknown')
  const kept = secured ? await facts.credential(tenant, name) : succeed(undefined)
  if ('failure' in kept) return kept
  const binding = kept.ok?.bound === true ? credentialBinding(holdingRef, name) : undefined
  return succeed({
    settings: {
      target: valueOf(target, isConnectionTarget),
      connectTimeout: valueOf(timeout, isMillis),
      credential: binding === undefined ? UNSET : { kind: 'value', value: binding },
    },
    revisions: [
      target.revision,
      timeout.revision,
      credential?.revision ?? '',
      kept.ok?.revision ?? '',
    ],
  })
}

export async function programCallsOpen(
  facts: Pick<EndpointFacts, 'settings'>,
  tenant: TenantId,
  endpoint: string,
): Promise<boolean> {
  const items = await facts.settings(tenant, endpoint)
  const read = items === 'unknown' ? undefined : items.get(PROGRAM_CALLS_SETTING)
  return read?.kind === 'set' && read.value === true
}

async function adoptedOf(
  facts: EndpointFacts,
  tenant: TenantId,
  held: Held,
): Promise<Outcome<AdoptedEndpoint, 'unknown'>> {
  const { name, holdingRef } = held.holding
  if (!isEndpointName(name) || !isEndpointHolding(holdingRef) || held.selected === null)
    return fail('unknown')
  const read = await settingsOf(facts, tenant, held)
  if ('failure' in read) return read
  const { holding, selected } = held
  const revision = canonicalDigest({
    holding: [holding.revision, holding.ownerRevision, holding.enabled],
    version: [selected.version, selected.ownerRevision],
    settings: read.ok.revisions,
  })
  if (!isAdoptionRevision(revision)) return fail('unknown')
  return succeed({
    ref: { name, holding: holdingRef },
    revision,
    body: selected.body,
    settings: read.ok.settings,
  })
}

/** Which endpoints a tenant has adopted: the ones it holds, enabled or not, with their settings in force. */
export function createEndpointAdoption(facts: EndpointFacts): AdoptionView<unknown, unknown> {
  async function endpoint(
    tenant: TenantId,
    ref: EndpointRef,
  ): Promise<Outcome<AdoptedEndpoint | 'not-adopted', 'unknown'>> {
    const held = await heldOf(facts, tenant, ref.name)
    if ('failure' in held) return held
    if (held.ok === 'absent' || held.ok.holding.holdingRef !== ref.holding)
      return succeed('not-adopted')
    return adoptedOf(facts, tenant, held.ok)
  }

  return {
    endpoint: (asker, ref) => endpoint(asker.tenant, ref),

    async endpoints(asker) {
      const refs = await heldEndpointRefs(facts, asker.tenant)
      if ('failure' in refs) return refs
      const answers = await Promise.all(refs.ok.map(ref => endpoint(asker.tenant, ref)))
      const adopted: AdoptedEndpoint[] = []
      for (const answer of answers) {
        if ('failure' in answer) return answer
        if (answer.ok !== 'not-adopted') adopted.push(answer.ok)
      }
      return succeed(adopted)
    },
  }
}

const NOT_ELIGIBLE: EligibilityVerdict = { kind: 'refused', reason: 'not-eligible' }

/** Who may use an endpoint: a login or a session's work of the tenant that holds it, while it is enabled. */
export function createEndpointEligibility(
  facts: Pick<EndpointFacts, 'assets'>,
): UseEligibility<unknown> {
  return {
    async check(asker, endpoint) {
      const who = classify(asker.principal)
      if (who === null || who.column === 'system') return NOT_ELIGIBLE
      if (!tenantEquals(who.principal.tenant, asker.tenant)) return NOT_ELIGIBLE
      const held = await heldOf(facts, asker.tenant, endpoint.name)
      if ('failure' in held) return { kind: 'unknown' }
      if (held.ok === 'absent' || held.ok.holding.holdingRef !== endpoint.holding)
        return NOT_ELIGIBLE
      return held.ok.holding.enabled ? { kind: 'granted' } : { kind: 'refused', reason: 'disabled' }
    },
  }
}
