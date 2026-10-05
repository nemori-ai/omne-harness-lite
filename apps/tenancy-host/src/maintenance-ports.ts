import type { MaintenanceCommand } from './command-data.ts'

export interface OfflineOperations {
  verify(input: unknown, signal?: AbortSignal): Promise<unknown>
  restoreIsolated(input: unknown, signal?: AbortSignal): Promise<unknown>
}
export interface OfflineLease {
  close(): Promise<void>
  create(report: (diagnostic: unknown) => void): OfflineOperations
}
export interface MaintenanceCommandEffects {
  validLocation(value: unknown): value is string
  callOps(
    command: Extract<MaintenanceCommand, { kind: 'ops' }>,
    signal: AbortSignal,
  ): Promise<unknown>
  openOffline(workDirectory: string): Promise<OfflineLease>
  failureResult(error: unknown): unknown
}
