import { randomUUID } from 'node:crypto'
import type {
  BindingKind,
  EnvironmentContinuity,
  EnvironmentFacilities,
  EnvironmentLease,
  EnvironmentProvider,
  FacilityKey,
  FacilityResult,
  FileSystemFacility,
  LeaseInvalidation,
  ProviderFacts,
} from '@omne-harness/execution-environment-contract'
import { createHostFiles } from './host-files.ts'

function ledgerClosed(requestId: string): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason: 'closed' }
}

/**
 * The `files` facility of one acquisition. Each operation first reads the acquisition ledger's
 * `closed` signal; once the ledger is closed it answers `closed` without touching the file system.
 */
function ledgerGatedFiles(
  files: FileSystemFacility<unknown>,
  closed: AbortSignal,
): FileSystemFacility<unknown> {
  return {
    read: async request => (closed.aborted ? ledgerClosed(request.requestId) : files.read(request)),
    stat: async request => (closed.aborted ? ledgerClosed(request.requestId) : files.stat(request)),
    write: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.write(request),
    close: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.close(request),
    list: async request => (closed.aborted ? ledgerClosed(request.requestId) : files.list(request)),
    search: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.search(request),
    mkdir: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.mkdir(request),
    remove: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.remove(request),
    move: async request => (closed.aborted ? ledgerClosed(request.requestId) : files.move(request)),
    copy: async request => (closed.aborted ? ledgerClosed(request.requestId) : files.copy(request)),
    commitBatch: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.commitBatch(request),
    recoverBatch: async request =>
      closed.aborted ? ledgerClosed(request.requestId) : files.recoverBatch(request),
  }
}

/**
 * The host provider of the `files` facility. It serves the `host_machine` layer only, confirms no
 * isolation claim, gives no continuity guarantee and does not support recovery: its file operations
 * leave no managed resource behind.
 */
export function createHostFilesProvider(): EnvironmentProvider {
  const name = 'host-files'
  const generation = randomUUID()
  const files = createHostFiles()
  const facilities: readonly FacilityKey[] = ['files']
  // One resolver per live lease; a release removes its own, a retirement settles the rest.
  const invalidations = new Set<(value: LeaseInvalidation) => void>()
  let retired = false

  const facts: ProviderFacts = Object.freeze({
    provider: name,
    generation,
    platform: process.platform,
    facilities,
    isolation: [],
    prerequisites: 'satisfied',
  })

  const bindingKinds: readonly BindingKind[] = Object.freeze(['host_machine'])
  const continuity: EnvironmentContinuity = Object.freeze({ kind: 'not_guaranteed' })

  const provider: EnvironmentProvider = {
    name,
    generation,
    bindingKinds,
    continuity,
    facilities,
    isolation: [],
    async describe() {
      return facts
    },
    async acquire(input) {
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (input.placement.binding.kind !== 'host_machine')
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      let settle: (value: LeaseInvalidation) => void = () => undefined
      const invalidated = new Promise<LeaseInvalidation>(resolve => {
        settle = resolve
      })
      invalidations.add(settle)
      const available: Partial<EnvironmentFacilities> = {
        files: ledgerGatedFiles(files, input.ledger.closed),
      }
      const lease: EnvironmentLease = {
        placement: input.placement,
        instance: { id: 'host', generation },
        continuity,
        invalidated,
        facility<F extends FacilityKey>(key: F) {
          return available[key]
        },
        async release() {
          invalidations.delete(settle)
          return { kind: 'released' }
        },
      }
      return {
        kind: 'acquired',
        lease,
        evidence: {
          kind: 'object',
          entries: [
            { key: 'provider', value: { kind: 'string', value: name } },
            { key: 'generation', value: { kind: 'string', value: generation } },
          ],
        },
      }
    },
    async retire() {
      retired = true
      for (const invalidate of invalidations)
        invalidate({ source: 'provider', reason: 'providerRetired' })
      invalidations.clear()
      return { kind: 'drained' }
    },
  }
  return Object.freeze(provider)
}
