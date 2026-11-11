import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog, FactCommandV2 } from '@omne-harness/sql-contract'
import { settingsAssetsProjectionFact, type SettingsProjectionBinding } from './projection.ts'
import { json } from './encoding.ts'
export function settingsWithoutAssetsMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const url = new URL(
    `./without-assets-participant.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`,
    import.meta.url,
  )
  return {
    participants: [
      {
        participant: 'settings.without-assets',
        protocol: 'settings-projection/1',
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [settingsAssetsProjectionFact],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [],
  }
}
export function settingsWithoutAssetsProjectionCommand(
  binding: SettingsProjectionBinding,
): FactCommandV2 {
  return { participant: 'settings.without-assets', facts: { binding: json(binding) } }
}
