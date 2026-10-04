export type * from './types.ts'
export { REGISTERED_CATEGORIES } from './types.ts'
export { createAssetRegistry } from './registry.ts'
export {
  buildTableContents,
  buildSnapshots,
  computeAvailability,
  findInSnapshot,
} from './tables.ts'
export { buildReport } from './report.ts'
export { extractRootSourceFromFullFillRecord } from './records.ts'
export { assetRegistryPlugin, ASSET_REGISTRY_SERVICE } from './plugin.ts'
