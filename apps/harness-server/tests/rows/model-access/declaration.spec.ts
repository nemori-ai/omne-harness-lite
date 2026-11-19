import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  LISTING_REQUIREMENT_SOURCE,
  modelAccessConfig,
  modelAccessRow,
} from '../../../src/rows/model-access/index.ts'
import { SELECTION_REQUIREMENT_SOURCE } from '../../../src/rows/session-access/model-targets.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'

describe('the model-access row', () => {
  it('is a real row that provides nothing and injects the registry and the issuer of principals', () => {
    const declared = rowDeclarationOf(modelAccessRow)
    expect(declared).toMatchObject({ row: 'model-access', implementation: 'real' })
    expect(declared?.manifest).toMatchObject({
      provides: [],
      injects: ['accessRegistry', 'principalIssuer'],
      sameProviderGroup: null,
    })
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it('takes no configuration of its own', () => {
    expect(modelAccessConfig.parse({})).toEqual({})
    expect(modelAccessConfig.safeParse({ required: [] }).success).toBe(false)
  })

  it('names its own source for the requirement a listed model is judged by', () => {
    expect(LISTING_REQUIREMENT_SOURCE).toMatchObject({
      owner: 'harness-server',
      record: 'model-access/list-models',
    })
    expect(LISTING_REQUIREMENT_SOURCE.record).not.toBe(SELECTION_REQUIREMENT_SOURCE.record)
  })
})
