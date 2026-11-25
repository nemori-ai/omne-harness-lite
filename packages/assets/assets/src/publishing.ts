import type { CategoryView, CreationMode } from './category-point.ts'
import { evaluate, type Candidate, type LayerInput } from './evaluate.ts'
import type { CapabilityId, JsonValue } from './identity.ts'
import type { PackageReader } from './package.ts'

export type PublishContent =
  | Readonly<{ kind: 'data'; body: JsonValue }>
  | Readonly<{ kind: 'directory'; from: PackageReader }>

export type TenantPublishRequest<P> = Readonly<{
  operationId: string
  tenant: string
  principal: P
  capability: CapabilityId
  content: PublishContent
}>

export type TenantPublishOutcome =
  | Readonly<{ kind: 'published'; version: string; holdingRef: string; changed: boolean }>
  | Readonly<{
      kind: 'denied' | 'unavailable' | 'unknown-category' | 'conflict' | 'operation-conflict'
    }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unknown'; operationId: string }>

export type TenantActing<P> = Readonly<{
  admit(
    input: Readonly<{ principal: P; tenant: string }>,
  ): Promise<'admitted' | 'denied' | 'unavailable'>
}>

export type TenantPublisher = Readonly<{
  publish(
    input: Readonly<{ operationId: string; capability: CapabilityId; content: PublishContent }>,
  ): Promise<TenantPublishOutcome>
}>

export type TenantPublishing<P> = Readonly<{
  publish(request: TenantPublishRequest<P>): Promise<TenantPublishOutcome>
}>

/** How a new holding would stand against what the wider layers hold under its name. */
export type PublishStanding =
  | Readonly<{ kind: 'free' }>
  | Readonly<{ kind: 'irreplaceable'; layer: string }>
  | Readonly<{ kind: 'unavailable' }>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)
const FREE: PublishStanding = Object.freeze({ kind: 'free' })
const NEW_HOLDING: Candidate = Object.freeze({
  asset: '\u0000a new holding',
  version: '',
  disabled: false,
  immutable: false,
  replaceLocked: false,
})

/** Weighs a new holding on `layer` as its only candidate, against the wider layers before it, by the same evaluation every reading uses. */
export function publishStanding(layers: readonly LayerInput[], layer: string): PublishStanding {
  const at = layers.findIndex(each => each.layer === layer)
  if (at === -1) return FREE
  const weighed = [...layers.slice(0, at), { layer, state: 'read', candidates: [NEW_HOLDING] }]
  const answer = evaluate({ layers: weighed as readonly LayerInput[], eligible: () => 'yes' })
  if (answer.kind === 'unavailable') return UNAVAILABLE
  const blocked = answer.filtered.find(each => each.candidate === NEW_HOLDING)
  return blocked?.by === undefined ? FREE : { kind: 'irreplaceable', layer: blocked.by }
}

/** What a publish meets before anything is staged; undefined: it goes on. A publish and its preview both ask this. */
export function publishRefusal(
  standing: PublishStanding,
  capability: CapabilityId,
): TenantPublishOutcome | undefined {
  if (standing.kind === 'free') return undefined
  if (standing.kind === 'unavailable') return UNAVAILABLE
  return {
    kind: 'invalid',
    reason: `irreplaceable-official: ${capability.category} ${capability.name} is held on the ${standing.layer} layer and cannot be replaced; nothing was published`,
  }
}

export function creationRefusal(
  mode: CreationMode,
  content: PublishContent['kind'],
): string | undefined {
  if (mode === 'none') return 'creation-closed'
  if (mode === 'data' && content === 'directory') return 'not-a-directory-category'
  if (mode === 'directory' && content === 'data') return 'a-directory-category'
  return undefined
}

export function createTenantPublishing<P>(ports: {
  acting: TenantActing<P>
  categories: Pick<CategoryView, 'describe'>
  /** How a new holding of this tenant would stand against the wider layers; without it nothing wider is asked. */
  standing?(tenant: string, capability: CapabilityId): Promise<PublishStanding>
  publisherOf(tenant: string): Promise<TenantPublisher | undefined>
}): TenantPublishing<P> {
  async function standingOf(request: TenantPublishRequest<P>): Promise<PublishStanding> {
    if (ports.standing === undefined) return FREE
    try {
      return await ports.standing(request.tenant, request.capability)
    } catch {
      return UNAVAILABLE
    }
  }
  async function admitted(request: TenantPublishRequest<P>) {
    try {
      return await ports.acting.admit({ principal: request.principal, tenant: request.tenant })
    } catch {
      return 'unavailable' as const
    }
  }
  async function publisher(tenant: string) {
    try {
      return await ports.publisherOf(tenant)
    } catch {
      return undefined
    }
  }
  return Object.freeze({
    async publish(request: TenantPublishRequest<P>): Promise<TenantPublishOutcome> {
      const answer = await admitted(request)
      if (answer !== 'admitted') return { kind: answer }
      const listing = ports.categories.describe(request.capability.category)
      if (listing === undefined) return { kind: 'unknown-category' }
      if ('unusable' in listing) return UNAVAILABLE
      const refused = creationRefusal(listing.creation, request.content.kind)
      if (refused !== undefined) return { kind: 'invalid', reason: refused }
      const shadowed = publishRefusal(await standingOf(request), request.capability)
      if (shadowed !== undefined) return shadowed
      const local = await publisher(request.tenant)
      if (local === undefined) return UNAVAILABLE
      const { operationId, capability, content } = request
      try {
        return await local.publish({ operationId, capability, content })
      } catch {
        return { kind: 'unknown', operationId }
      }
    },
  })
}
