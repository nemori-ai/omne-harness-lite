export type MaintenanceCommand =
  | {
      readonly kind: 'ops'
      readonly socketDirectory: string
      readonly operation: 'full-health' | 'backup' | 'backup-status'
      readonly onlyIfDue: boolean
    }
  | { readonly kind: 'verify'; readonly sourceLocation: string; readonly workDirectory: string }
  | {
      readonly kind: 'restore-isolated'
      readonly sourceLocation: string
      readonly workDirectory: string
      readonly targetLocation: string
    }

export interface MaintenanceCommandIo {
  stdout(text: string): void | Promise<void>
  stderr(text: string): void | Promise<void>
}
