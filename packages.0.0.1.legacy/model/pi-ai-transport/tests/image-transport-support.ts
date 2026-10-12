import {
  planRequest as publishedPlan,
  createImagePreparer as createPublishedPreparer,
} from '@omne-harness-lite/pi-ai-transport'
import sharp from 'sharp'
import {
  createImagePreparer,
  createSharpImageCodec,
  modelImageBalancedV1,
} from '../src/image-preparation/index.ts'

// Explicit, real codec configuration for migrated request/projection fixtures.
// Token meters in these fixtures keep their original independent evidence scope.
export const imagePreparation = {
  policy: modelImageBalancedV1,
  codec: createSharpImageCodec(sharp),
}
const instance = createImagePreparer(imagePreparation.policy, imagePreparation.codec)
if (!('ready' in instance)) throw new Error('test codec unavailable')
const sourcePreparer = instance.ready
const publishedInstance = createPublishedPreparer(imagePreparation.policy, imagePreparation.codec)
if (!('ready' in publishedInstance)) throw new Error('published test codec unavailable')
const publishedPreparer = publishedInstance.ready
export function testImagePreparerFor(plan: unknown) {
  return plan === publishedPlan ? publishedPreparer : sourcePreparer
}
// The two preparers are never closed here. Without per-file isolation this module is loaded once
// per worker and shared by every test file in it, so closing them after the first file would hand
// a closed preparer to the rest. close() only aborts in-flight work and empties the cache; it holds
// no handle or timer that would keep the worker alive.
