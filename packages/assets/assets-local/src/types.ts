import type { z } from 'zod'
import type { CapabilityId, CategoryView, PinnedBody } from '@omne-harness/assets'
import type { LocalPackages, PackageDurability, PackageStep } from './packages.ts'
import type { PublicationRecall } from './results.ts'
import type { LocalUploads, UploadPolicy } from './uploads.ts'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type {
  assetLookupSchema,
  assetResultSchema,
  changeHoldingSchema,
  committedSchema,
  domainResultSchema,
  failureSchema,
  holdSchema,
  holdingResultSchema,
  publishMetadataSchema,
  publishedHoldingSchema,
  summaryResultSchema,
  versionResultSchema,
  holdingLookupSchema,
  listLookupSchema,
  listResultSchema,
  versionLookupSchema,
  versionsLookupSchema,
  versionsResultSchema,
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
  /** Without a policy, or without a package root, uploads answer unavailable. */
  uploads?: UploadPolicy
  clock?: () => number
  /** Called once after each new commit that changed something, before its result is answered. */
  onCommitted?: (signal: AssetsCommitted) => void
}>
export type AssetsCommitted = Readonly<{ domain: DomainRef; revision: number }>
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
export type AssetsSummaryResult = z.infer<typeof summaryResultSchema>
export type AssetsListRequest = z.input<typeof listLookupSchema>
export type AssetsListResult = z.infer<typeof listResultSchema>
export type AssetsVersionsRequest = z.input<typeof versionsLookupSchema>
export type AssetsVersionsResult = z.infer<typeof versionsResultSchema>
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
  listVersions(input: AssetsVersionsRequest): Promise<AssetsVersionsResult>
  /** The asset summary stored with one version; a version is never rewritten, so neither is it. */
  readSummary(input: z.infer<typeof versionLookupSchema>): Promise<AssetsSummaryResult>
  readonly packages: LocalPackages
  readonly uploads: LocalUploads
  domainRevision(): Promise<z.infer<typeof domainResultSchema>>
  getOperation(operationId: string): Promise<AssetsOperationResult>
  /** The outcome of the publication made under this operation, as the publisher answered it. */
  recallPublication(operationId: string): Promise<PublicationRecall>
  /** The receipt of an earlier change of this holding; a receipt for another change is a conflict. */
  recallChange(
    input: Readonly<{
      operationId: string
      holdingRef: string
      change: AssetsHoldingChange['change']
    }>,
  ): Promise<AssetsOperationResult>
  close(): Promise<void>
}
