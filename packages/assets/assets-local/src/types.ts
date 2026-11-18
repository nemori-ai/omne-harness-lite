import type { z } from 'zod'
import type { CapabilityId, CategoryView, PinnedBody } from '@omne-harness/assets'
import type { LocalPackages, PackageDurability, PackageStep } from './packages.ts'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type {
  assetLookupSchema,
  assetResultSchema,
  changeHoldingSchema,
  committedSchema,
  failureSchema,
  holdSchema,
  holdingResultSchema,
  publishMetadataSchema,
  publishedHoldingSchema,
  versionResultSchema,
  holdingLookupSchema,
  listLookupSchema,
  listResultSchema,
  versionLookupSchema,
} from './schema.ts'
export type AssetsLocalOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combinationVersion: string
  manifestDigest: string
  categories: Pick<CategoryView, 'lookup'>
  packageRoot?: string
  afterPackageStep?: (step: PackageStep) => void | Promise<void>
  packageDurability?: PackageDurability
}>
export type AssetsPublish = Readonly<z.infer<typeof publishMetadataSchema> & { pinned: PinnedBody }>
export type AssetsPublishAndHold = Readonly<
  AssetsPublish & { holding: z.infer<typeof publishedHoldingSchema> }
>
export type AssetsHold = z.infer<typeof holdSchema>
export type AssetsHoldingChange = z.infer<typeof changeHoldingSchema>
export type AssetsMutationResult =
  | z.infer<typeof committedSchema>
  | z.infer<typeof failureSchema>
  | Readonly<{ kind: 'unknown'; operationId: string }>
export type AssetsOperationResult = AssetsMutationResult | Readonly<{ kind: 'not_found' }>
export type AssetsReadResult = z.infer<typeof assetResultSchema>
export type AssetsHoldingResult = z.infer<typeof holdingResultSchema>
export type AssetsVersionResult = z.infer<typeof versionResultSchema>
export type AssetsListRequest = z.input<typeof listLookupSchema>
export type AssetsListResult = z.infer<typeof listResultSchema>
export interface AssetsLocal {
  readAsset(input: z.infer<typeof assetLookupSchema>): Promise<AssetsReadResult>
  publish(input: AssetsPublish): Promise<AssetsMutationResult>
  publishAndHold(input: AssetsPublishAndHold): Promise<AssetsMutationResult>
  hold(input: AssetsHold): Promise<AssetsMutationResult>
  changeHolding(input: AssetsHoldingChange): Promise<AssetsMutationResult>
  readHolding(input: z.infer<typeof holdingLookupSchema>): Promise<AssetsHoldingResult>
  readVersion(input: z.infer<typeof versionLookupSchema>): Promise<AssetsVersionResult>
  readHeldCapability(input: { capability: CapabilityId }): Promise<AssetsHoldingResult>
  listHeld(input: AssetsListRequest): Promise<AssetsListResult>
  readonly packages: LocalPackages
  getOperation(operationId: string): Promise<AssetsOperationResult>
  close(): Promise<void>
}
