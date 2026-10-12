import { Context, Service } from '@deepseek-ai/cordis'
import type { ManifestOptions, AssemblyManifestService as Operations0 } from './index.ts'

/** @contract capability.assembly-manifest */
export abstract class AssemblyManifestService extends Service implements Operations0 {
  static readonly provide = 'assemblyManifest'
  constructor(ctx: Context) {
    super(ctx, AssemblyManifestService.provide)
  }
  abstract readHead(
    ...args: Parameters<Operations0['readHead']>
  ): ReturnType<Operations0['readHead']>
  abstract append(...args: Parameters<Operations0['append']>): ReturnType<Operations0['append']>
  abstract readHistory(
    ...args: Parameters<Operations0['readHistory']>
  ): ReturnType<Operations0['readHistory']>
  abstract dependencyPresence(
    ...args: Parameters<Operations0['dependencyPresence']>
  ): ReturnType<Operations0['dependencyPresence']>
  abstract readEvaluation(
    ...args: Parameters<Operations0['readEvaluation']>
  ): ReturnType<Operations0['readEvaluation']>
  abstract readGiven(
    ...args: Parameters<Operations0['readGiven']>
  ): ReturnType<Operations0['readGiven']>
}
export const ASSEMBLY_MANIFEST = AssemblyManifestService.provide

/** @owner packages/core/assembly-manifest
 * Runtime ports are borrowed; their owner retains them until the consumer drains.
 */
export abstract class AssemblyManifestResources extends Service {
  static readonly provide = 'assemblyManifestResources'
  abstract readonly options: ManifestOptions
  constructor(ctx: Context) {
    super(ctx, AssemblyManifestResources.provide)
  }
}
export const ASSEMBLY_MANIFEST_RESOURCES = AssemblyManifestResources.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    assemblyManifest: AssemblyManifestService
    assemblyManifestResources: AssemblyManifestResources
  }
}
