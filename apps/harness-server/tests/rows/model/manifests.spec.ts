import { modelTokenizersRow } from '../../../src/rows/model-tokenizers/index.ts'
import { describe, expect, it } from 'vitest'
import { serveProfile } from '../../../src/profile.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelConvertersRow } from '../../../src/rows/model-converters/index.ts'
import { modelCredentialRow } from '../../../src/rows/model-credential/index.ts'
import { modelInstancesRow } from '../../../src/rows/model-instances/index.ts'
import { modelProfilesRow } from '../../../src/rows/model-profiles/index.ts'
import { modelRequestPreparationRow } from '../../../src/rows/model-request-preparation/index.ts'

const rows = {
  'model-tokenizers': modelTokenizersRow,
  'model-converters': modelConvertersRow,
  'model-credential': modelCredentialRow,
  'model-instances': modelInstancesRow,
  'model-profiles': modelProfilesRow,
  'model-request-preparation': modelRequestPreparationRow,
}

describe('the model-side rows', () => {
  for (const [id, row] of Object.entries(rows)) {
    it(`${id} equals its row of the stubs table`, () => {
      const table = serveProfile().stubManifests.get(id as never)
      const declaration = rowDeclarationOf(row)
      expect(table).toBeDefined()
      expect(declaration?.row).toBe(id)
      expect(declaration?.implementation).toBe('real')
      expect([...(declaration?.manifest.provides ?? [])].sort()).toEqual(
        [...(table?.provides ?? [])].sort(),
      )
      expect([...(declaration?.manifest.injects ?? [])].sort()).toEqual(
        [...(table?.injects ?? [])].sort(),
      )
      expect(declaration?.manifest.phase).toBe(table?.phase)
      expect(declaration?.manifest.sameProviderGroup).toBe(table?.sameProviderGroup)
    })
  }
})
