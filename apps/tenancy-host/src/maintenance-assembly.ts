import {
  createOfflineMaintenance,
  maintenanceFailureResult,
  validMaintenanceLocation,
} from '@omne-harness-lite/governance-center-entry-node'
import { openSnapshotInspection } from '@omne-harness-lite/storage-sql'
import { hostSnapshotChecks } from './snapshot-checks.ts'
import { composedMigrationNames, hostMigrationFragments } from './migrations.ts'
import { callOps } from './ops-client.ts'
import { parseMaintenanceCommand, runMaintenanceCommand } from './maintenance-command.ts'
import type { MaintenanceCommand, MaintenanceCommandIo } from './command-data.ts'
import type { MaintenanceCommandEffects } from './maintenance-ports.ts'

export function createMaintenanceCommands() {
  const effects: MaintenanceCommandEffects = {
    validLocation: validMaintenanceLocation,
    callOps,
    async openOffline(workDirectory) {
      const inspection = await openSnapshotInspection(workDirectory)
      return {
        close: () => inspection.close(),
        create: report =>
          createOfflineMaintenance({
            inspection,
            workDirectory,
            snapshotChecks: hostSnapshotChecks,
            migrationNames: composedMigrationNames(hostMigrationFragments),
            report,
          }),
      }
    },
    failureResult: maintenanceFailureResult,
  }
  return {
    parse: (argv: readonly string[]) => parseMaintenanceCommand(argv, effects.validLocation),
    run: (command: MaintenanceCommand, io: MaintenanceCommandIo, signal: AbortSignal) =>
      runMaintenanceCommand(command, io, signal, effects),
  }
}
