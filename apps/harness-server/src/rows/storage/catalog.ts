import {
  hitlSqlMaterials,
  independentWaitSqlMaterials,
} from '@omne-harness/human-intervention-local'
import { identitySqlMaterials } from '@omne-harness/identity-sql'
import { modelStorageMaterials } from '@omne-harness/model-storage-sql'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import { toolStorageMaterials } from '@omne-harness/tool-storage-sql'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'

export const DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES = 20971520

export function storageCatalog(): SqlMaterialCatalog {
  const owners = [
    sessionStorageMaterials({
      readOutputLimitBytes: DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES,
    }),
    identitySqlMaterials(),
    modelStorageMaterials(),
    toolStorageMaterials(),
    hitlSqlMaterials(),
    independentWaitSqlMaterials(),
  ]
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: owners.flatMap(owner => owner.participants),
    migrations: owners.flatMap(owner => owner.migrations),
    readHandlers: owners.flatMap(owner => owner.readHandlers),
    declaredCombinations: { tenant: null, system: null },
  }
}
