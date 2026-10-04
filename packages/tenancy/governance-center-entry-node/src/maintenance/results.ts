import { SnapshotFailure, StorageDefect } from '@omne-harness-lite/storage'
import { entryValidator } from '../routing/schema.ts'
import {
  maintenanceFailure,
  MaintenanceFailure,
  PublicationUnknown,
  type MaintenanceFailureKind,
  type UnknownResult,
} from './failure.ts'
import type { MaintenanceReporter } from './publication.ts'
import type { BackupDescriptor, Metadata } from './metadata.ts'

export interface ObservedBackups {
  readonly status: 'observed'
  readonly health: 'current' | 'overdue' | 'missing'
  readonly latest: BackupDescriptor | null
  readonly invalidCount: number
}
export type MaintenanceResult =
  | { readonly status: MaintenanceFailureKind }
  | UnknownResult
  | ObservedBackups
  | { readonly status: 'completed' | 'not-due'; readonly backup: BackupDescriptor }
  | { readonly status: 'verified'; readonly metadata: Metadata; readonly businessOpen: false }
  | {
      readonly status: 'restored-isolated'
      readonly metadata: Metadata
      readonly targetLocation: string
      readonly businessOpen: false
    }

/** Storage may aggregate publication uncertainty with subsequent cleanup failure. */
function knownFailures(
  error: unknown,
): readonly (MaintenanceFailure | PublicationUnknown)[] | undefined {
  const mapped = maintenanceFailure(error)
  if (mapped instanceof MaintenanceFailure || mapped instanceof PublicationUnknown) return [mapped]
  if (!(mapped instanceof AggregateError) || mapped.errors.length === 0) return undefined
  const failures: (MaintenanceFailure | PublicationUnknown)[] = []
  for (const item of mapped.errors as unknown[]) {
    const nested = knownFailures(item)
    if (nested === undefined) return undefined
    failures.push(...nested)
  }
  return failures
}
export function failureResult(error: unknown): MaintenanceResult {
  const failures = knownFailures(error)
  if (failures === undefined) throw error
  const unknown = failures.find(item => item instanceof PublicationUnknown)
  if (unknown instanceof PublicationUnknown) return unknown.result
  const last = failures.at(-1)
  if (!(last instanceof MaintenanceFailure)) throw new StorageDefect('empty maintenance failure')
  return { status: last.kind }
}
export async function resultOf(
  definition: string,
  fn: () => Promise<MaintenanceResult>,
  onFailure?: (error: unknown) => void,
): Promise<MaintenanceResult> {
  let result: MaintenanceResult
  try {
    result = await fn()
  } catch (error) {
    onFailure?.(error)
    result = failureResult(error)
  }
  if (!entryValidator(definition)(result))
    throw new StorageDefect('maintenance result violates its accepted schema')
  return result
}

/** Consume only the storage protocol's local residual locator, never error messages/data. */
export function reportResiduals(
  error: unknown,
  report: MaintenanceReporter,
  publishedLocation: string | null,
): void {
  const visited = new Set<unknown>()
  const locations = new Set<string>()
  function visit(value: unknown): void {
    if (visited.has(value)) return
    visited.add(value)
    if (value instanceof SnapshotFailure && value.residual !== undefined)
      locations.add(value.residual)
    if (value instanceof AggregateError) for (const item of value.errors as unknown[]) visit(item)
    if (value instanceof Error && value.cause !== undefined) visit(value.cause)
  }
  visit(error)
  for (const temporaryLocation of locations)
    report({ event: 'maintenance-residual', temporaryLocation, publishedLocation })
}
