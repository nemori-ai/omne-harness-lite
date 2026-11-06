import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionReader } from './compile.ts'
import { readDomainReference, type DomainIndex } from './domain-index.ts'
import { readBootId, stopRecordedDomain } from './session.ts'

export type MacosRecovery = Readonly<{
  domains: DomainIndex | undefined
  reader(): Promise<SessionReader>
  stopBoundMs: number
  /** This boot's identity; `kern.bootsessionuuid` when absent. */
  bootId?: () => Promise<string | undefined>
}>

/**
 * The macOS domains of a scope from the cold index. Without a state directory there is no index,
 * and a listing that cannot be complete is `unavailable`, not empty.
 */
export async function listMacosResources(
  recovery: MacosRecovery,
  scope: ScopeRef,
): Promise<readonly ManagedResource[] | 'unavailable'> {
  if (recovery.domains === undefined) return 'unavailable'
  return recovery.domains.list(scope)
}

export type MacosRecoverStatus = 'confirmedStopped' | 'pending' | 'unsupported'

/**
 * Stops a macOS domain of this provider and removes its marker. A domain of another boot is
 * stopped. A domain without a marker never got GO (the marker precedes it) or was stopped already.
 */
export async function recoverMacosResource(
  recovery: MacosRecovery,
  resource: ManagedResource,
  provider: string,
): Promise<MacosRecoverStatus> {
  const named = readDomainReference(resource.reference)
  if (resource.provider !== provider || named === undefined) return 'unsupported'
  if (recovery.domains === undefined) return 'pending'
  const forget = async () =>
    (await recovery.domains?.forget(named.key)) === true ? 'confirmedStopped' : 'pending'
  const bootId = await (recovery.bootId ?? readBootId)()
  if (bootId === undefined) return 'pending'
  if (bootId !== named.bootId) return forget()
  const coordinate = await recovery.domains.coordinate(named.key)
  if (coordinate === 'absent') return 'confirmedStopped'
  if (coordinate === 'unreadable') return 'pending'
  const reader = await recovery.reader()
  if (reader.kind !== 'ready') return 'pending'
  const status = await stopRecordedDomain({
    reader: reader.path,
    coordinate,
    bootId,
    boundMs: recovery.stopBoundMs,
  })
  return status === 'confirmed' ? forget() : 'pending'
}
