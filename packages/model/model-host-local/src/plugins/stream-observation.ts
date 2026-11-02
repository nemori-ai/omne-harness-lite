import type { Context } from '@deepseek-ai/cordis'
import type { ModelObservationHost } from '@omne-harness/model/commands'
import {
  ModelStreamObservationService,
  ModelStreamReferencesService,
} from '@omne-harness/model-cordis-contract/cordis'

/** Publishes both observation services over one host lease. */
export function createModelStreamLocalPlugin(
  input: Readonly<{ source: ModelObservationHost<unknown> }>,
): (ctx: Context) => void {
  const { source } = input
  return ctx => {
    class References extends ModelStreamReferencesService<unknown> {
      readonly current: ModelStreamReferencesService<unknown>['current'] = access =>
        source.references.current(access)
    }
    class Observation extends ModelStreamObservationService<unknown> {
      readonly observe: ModelStreamObservationService<unknown>['observe'] = access =>
        source.observation.observe(access)
    }
    new References(ctx)
    new Observation(ctx)
  }
}
