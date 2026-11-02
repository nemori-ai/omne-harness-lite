import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
const which = process.argv[2]
const { sessionStorageMaterials } = await import(which === 'base' ? './src/materials.ts' : '../src/materials.ts')
const materials = sessionStorageMaterials()
const participants = ['execution-record', 'session']
const catalog = {
  catalogProtocol: 'sql-catalog/1',
  participants: materials.participants,
  migrations: materials.migrations,
  readHandlers: materials.readHandlers,
  declaredCombinations: { tenant: { combinationVersion: 'c1', participants }, system: null },
}
const manifest = combinationManifest({ catalog, participants })
console.log(which, manifest.kind === 'manifest' ? manifestDigest(manifest.manifest) : manifest.kind)
