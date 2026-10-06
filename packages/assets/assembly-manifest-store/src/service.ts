import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  AssemblyManifestService,
  AssemblyManifestResources,
} from '@omne-harness-lite/assembly-manifest/cordis'
import type { ManifestOptions } from '@omne-harness-lite/assembly-manifest'
import type { AssemblyManifestStore } from './types.ts'

const resourceOptions = z
  .object({
    presenceSource: z
      .custom<NonNullable<ManifestOptions['presenceSource']>>(
        value =>
          value !== null &&
          typeof value === 'object' &&
          typeof (value as { read?: unknown }).read === 'function',
      )
      .optional(),
    diagnostic: z
      .custom<NonNullable<ManifestOptions['diagnostic']>>(value => typeof value === 'function')
      .optional(),
    diagnosticFailure: z
      .custom<NonNullable<ManifestOptions['diagnosticFailure']>>(
        value => typeof value === 'function',
      )
      .optional(),
  })
  .strict()
  .refine(value => value.diagnostic === undefined || value.diagnosticFailure !== undefined, {
    message: 'diagnostic failure port is required',
  })

/** Publishes borrowed ports. It never closes caller-owned resources. */
export class AssemblyManifestResourcesService extends AssemblyManifestResources {
  readonly options: ManifestOptions
  constructor(ctx: Context, supplied: ManifestOptions = {}) {
    const options = Object.freeze(resourceOptions.parse(supplied))
    super(ctx)
    this.options = Object.freeze({
      ...(options.presenceSource === undefined ? {} : { presenceSource: options.presenceSource }),
      ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
      ...(options.diagnosticFailure === undefined
        ? {}
        : { diagnosticFailure: options.diagnosticFailure }),
    })
  }
}

/** Owns one factory lifetime; storage and runtime ports remain borrowed. */
export class AssemblyManifestStoreService extends AssemblyManifestService {
  readonly readHead: AssemblyManifestStore['readHead']
  readonly append: AssemblyManifestStore['append']
  readonly readHistory: AssemblyManifestStore['readHistory']
  readonly dependencyPresence: AssemblyManifestStore['dependencyPresence']
  readonly readEvaluation: AssemblyManifestStore['readEvaluation']
  readonly readGiven: AssemblyManifestStore['readGiven']
  readonly closed: Promise<void>

  constructor(ctx: Context, store: AssemblyManifestStore) {
    const completion = Promise.withResolvers<void>()
    // Keep failure observable to owners even if no owner has attached yet.
    void completion.promise.catch(() => undefined)
    ctx.effect(() => () => {
      try {
        completion.resolve(store.close())
      } catch (error) {
        completion.reject(error)
      }
      return completion.promise
    })
    super(ctx)
    this.readHead = store.readHead
    this.append = store.append
    this.readHistory = store.readHistory
    this.dependencyPresence = store.dependencyPresence
    this.readEvaluation = store.readEvaluation
    this.readGiven = store.readGiven
    this.closed = completion.promise
  }
}
