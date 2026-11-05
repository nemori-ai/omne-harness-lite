import type { z } from 'zod'
import type { CategoryRegistry, PinnedBody } from '@omne-harness/assets'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type {
  changeHoldingSchema,
  committedSchema,
  failureSchema,
  holdSchema,
  holdingResultSchema,
  publishMetadataSchema,
  versionResultSchema,
  holdingLookupSchema,
  versionLookupSchema,
} from './schema.ts'
export type AssetsLocalOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combinationVersion: string
  manifestDigest: string
  categories: CategoryRegistry
}>
export type AssetsPublish = Readonly<z.infer<typeof publishMetadataSchema> & { pinned: PinnedBody }>
export type AssetsHold = z.infer<typeof holdSchema>
export type AssetsHoldingChange = z.infer<typeof changeHoldingSchema>
export type AssetsMutationResult =
  | z.infer<typeof committedSchema>
  | z.infer<typeof failureSchema>
  | Readonly<{ kind: 'unknown'; operationId: string }>
export type AssetsOperationResult = AssetsMutationResult | Readonly<{ kind: 'not_found' }>
export type AssetsHoldingResult = z.infer<typeof holdingResultSchema>
export type AssetsVersionResult = z.infer<typeof versionResultSchema>
export interface AssetsLocal {
  publish(input: AssetsPublish): Promise<AssetsMutationResult>
  hold(input: AssetsHold): Promise<AssetsMutationResult>
  changeHolding(input: AssetsHoldingChange): Promise<AssetsMutationResult>
  readHolding(input: z.infer<typeof holdingLookupSchema>): Promise<AssetsHoldingResult>
  readVersion(input: z.infer<typeof versionLookupSchema>): Promise<AssetsVersionResult>
  getOperation(operationId: string): Promise<AssetsOperationResult>
  close(): Promise<void>
}
