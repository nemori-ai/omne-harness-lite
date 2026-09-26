import { mkdir, statfs } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { SnapshotInspection } from '@omne-harness-lite/storage'
import { entryValidator } from '../routing/schema.ts'
import { BackupInputFile, type SnapshotFormat } from './input.ts'
import { hasCode, maintenanceFailure, MaintenanceFailure } from './failure.ts'
import {
  checkCancelled,
  MaintenanceDirectory,
  publishOutput,
  withTemporaryOutput,
  type MaintenanceReporter,
} from './publication.ts'
import { reportResiduals, resultOf, type MaintenanceResult } from './results.ts'

export interface OfflineMaintenanceOptions extends SnapshotFormat {
  readonly inspection: SnapshotInspection
  /** The same protected root passed when constructing inspection. */
  readonly workDirectory: string
  readonly report: MaintenanceReporter
}
interface VerifyInput {
  readonly sourceLocation: string
}
interface RestoreInput extends VerifyInput {
  readonly targetLocation: string
}
function validVerify(input: unknown): input is VerifyInput {
  return entryValidator('VerifyInput')(input)
}
function validRestore(input: unknown): input is RestoreInput {
  return entryValidator('RestoreIsolatedInput')(input)
}

/** Local file operations only: no Context, serving instance, or governance services. */
export function createOfflineMaintenance(options: OfflineMaintenanceOptions) {
  return {
    verify(input: unknown, signal?: AbortSignal): Promise<MaintenanceResult> {
      if (!validVerify(input) || !isAbsolute(input.sourceLocation))
        return Promise.resolve({ status: 'invalid-input' })
      return resultOf(
        'VerifyResult',
        () =>
          options.inspection.run(
            session =>
              BackupInputFile.use(input.sourceLocation, session, async source => {
                const metadata = await source.inspect(session, options)
                checkCancelled(session)
                return { status: 'verified', metadata, businessOpen: false }
              }),
            signal === undefined ? {} : { signal },
          ),
        error => reportResiduals(error, options.report, null),
      )
    },
    restoreIsolated(input: unknown, signal?: AbortSignal): Promise<MaintenanceResult> {
      if (
        !validRestore(input) ||
        !isAbsolute(input.sourceLocation) ||
        !isAbsolute(input.targetLocation)
      )
        return Promise.resolve({ status: 'invalid-input' })
      let publishedLocation: string | null = null
      return resultOf(
        'RestoreIsolatedResult',
        () =>
          options.inspection.run(
            session =>
              BackupInputFile.use(input.sourceLocation, session, async source => {
                const metadata = await source.inspect(session, options)
                checkCancelled(session)
                const space = await statfs(options.workDirectory)
                if (space.bavail * space.bsize < metadata.byteLength * 2 + 268_435_456)
                  throw new MaintenanceFailure('capacity')
                return MaintenanceDirectory.use(
                  dirname(input.targetLocation),
                  session,
                  false,
                  async parent => {
                    checkCancelled(session)
                    try {
                      await mkdir(input.targetLocation, { mode: 0o700 })
                    } catch (error) {
                      if (hasCode(error, 'EEXIST'))
                        throw new MaintenanceFailure('target-exists', { cause: error })
                      throw error
                    }
                    let published = false
                    try {
                      return await MaintenanceDirectory.use(
                        input.targetLocation,
                        session,
                        true,
                        target =>
                          withTemporaryOutput(
                            options.workDirectory,
                            session,
                            options.report,
                            async output => {
                              for await (const bytes of source.bytes(true)) {
                                checkCancelled(session)
                                await output.handle.writeFile(bytes)
                              }
                              await output.handle.sync()
                              await source.stable()
                              await publishOutput(
                                output.path,
                                join(input.targetLocation, 'data.omne-backup'),
                                target,
                                session,
                                {
                                  status: 'outcome-unknown',
                                  fileName: null,
                                  targetLocation: input.targetLocation,
                                },
                                path => {
                                  published = true
                                  publishedLocation = path
                                  output.markPublished(path)
                                },
                                () => parent.confirm(),
                              )
                              return {
                                status: 'restored-isolated',
                                metadata,
                                targetLocation: input.targetLocation,
                                businessOpen: false,
                              }
                            },
                          ),
                      )
                    } catch (error) {
                      if (!published) {
                        // An exclusively created but incomplete target is retained, never merged or retried.
                        options.report({
                          event: 'maintenance-residual',
                          temporaryLocation: input.targetLocation,
                          publishedLocation: null,
                        })
                        if (maintenanceFailure(error) instanceof MaintenanceFailure)
                          throw new MaintenanceFailure('unavailable', { cause: error })
                      }
                      throw error
                    }
                  },
                )
              }),
            signal === undefined ? {} : { signal },
          ),
        error => reportResiduals(error, options.report, publishedLocation),
      )
    },
  }
}
