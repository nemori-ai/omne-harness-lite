import type { StorageUnit } from '@omne-harness-lite/storage'
import type { MembershipStandingResult } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { CurrentInputReader, EvaluationStorageDependencies } from './types.ts'
import type { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'
import type { RegistryInputReader } from './registry-input-reader.ts'
import type { RegistryHistoryReader } from './registry-history-reader.ts'

/** Trusted assembly ports over current local admission and the original creation observation. Not JSON configuration. */
export interface AdmittedInputSourceDependencies extends EvaluationStorageDependencies {
  readonly scope: SessionScope
  /** The owner must hold current member/permission ordering until the same tenant unit actually ends. */
  readonly withAuthorizedUnit: <T>(
    read: (unit: StorageUnit) => Promise<T>,
  ) => Promise<{ readonly read: T } | { readonly unavailable: true }>
  /** Original durable S-26 result for this Session's creation. This is recipe data, not authorization. */
  readonly readCreationStanding: () => Promise<MembershipStandingResult>
}
export interface AdmittedInputSource {
  readonly reader: CurrentInputReader
  readonly captureSessionRecipe: (
    input: unknown,
  ) => Promise<
    { readonly captured: true } | { readonly failure: 'invalidInput' | 'conflict' | 'unavailable' }
  >
  /** Stops both read and capture admission and waits for original owned work. Borrowed owners remain open. */
  readonly close: () => Promise<void>
}

/** Trusted original-Run owner. The callback verifies its durable grant in the actual tenant unit. */
export interface RunInputReaderDependencies extends EvaluationStorageDependencies {
  readonly scope: SessionScope
  readonly withOriginalRunUnit: AdmittedInputSourceDependencies['withAuthorizedUnit']
}

export interface RunRegistryReaderDependencies extends RunInputReaderDependencies {
  readonly manifestHistory: Pick<AssemblyManifestService, 'readHistory'>
}
export interface RunRegistryReaders {
  readonly fixedRoot: RegistryInputReader
  readonly history: RegistryHistoryReader
  readonly close: () => Promise<void>
}
