import { type AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'

import type { RegistryHistoryResult } from '@omne-harness-lite/asset-evaluation'

import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'

import type { RunnerLogBinding } from './task-owner-types.ts'

/** Borrowed, captured providers. The caller owns authorization, generation checks and closure. */
export interface RunnerChainSources {
  readonly sessionTenancy: SessionTenancyService
  readonly manifest: Pick<AssemblyManifestService, 'readHead' | 'dependencyPresence'>
  readonly history: { read(request: unknown): Promise<RegistryHistoryResult> }
  readonly isActive: () => boolean
}
export interface ReadRunnerChainInput {
  readonly session: string
  readonly binding: RunnerLogBinding
  readonly sources: RunnerChainSources
}
