import { expectTypeOf, test } from 'vitest'
import {
  ASSET_LAYERS,
  collectCandidates,
  evaluate,
  type AssetLayer,
  type AssetLayerSource,
  type LayerInput,
} from '../src/index.ts'

test('the layers are four names in the order of evaluation', () => {
  expectTypeOf(ASSET_LAYERS).toEqualTypeOf<
    readonly ['official', 'organization', 'tenant', 'workspace']
  >()
  expectTypeOf<AssetLayer>().toEqualTypeOf<'official' | 'organization' | 'tenant' | 'workspace'>()
})

test('the answer of a layer source is the input of evaluate, not a new type', () => {
  expectTypeOf<ReturnType<AssetLayerSource['candidates']>>().toEqualTypeOf<Promise<LayerInput>>()
  type Collected = Awaited<ReturnType<typeof collectCandidates>>
  expectTypeOf<Collected>().toExtend<Parameters<typeof evaluate>[0]['layers']>()
})
