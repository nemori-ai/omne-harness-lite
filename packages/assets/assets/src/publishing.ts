import type { CategoryView } from './category-point.ts'
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
      kind:
        | 'denied'
        | 'unavailable'
        | 'unknown-category'
        | 'conflict'
        | 'operation-conflict'
        | 'removed'
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

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' } as const)

export function createTenantPublishing<P>(ports: {
  acting: TenantActing<P>
  categories: Pick<CategoryView, 'lookup'>
  publisherOf(tenant: string): Promise<TenantPublisher | undefined>
}): TenantPublishing<P> {
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
      const contract = ports.categories.lookup(request.capability.category)
      if (contract === undefined) return { kind: 'unknown-category' }
      const directory = request.content.kind === 'directory'
      if (directory !== (contract.layout !== undefined))
        return {
          kind: 'invalid',
          reason: directory ? 'not-a-directory-category' : 'a-directory-category',
        }
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
