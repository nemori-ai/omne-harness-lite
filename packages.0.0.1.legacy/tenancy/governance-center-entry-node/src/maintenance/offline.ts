import { dirname, isAbsolute, join } from 'node:path'
import { hasCode, maintenanceFailure, MaintenanceFailure } from './failure.ts'
import { checkCancelled, publishOutput, withTemporaryOutput } from './publication.ts'
import type { OfflineMaintenanceOptions } from './maintenance-options.ts'
import type { MaintenanceEffects } from './maintenance-ports.ts'
import { reportResiduals, resultOf, type MaintenanceResult } from './results.ts'

interface VerifyInput {
  readonly sourceLocation: string
}
interface RestoreInput extends VerifyInput {
  readonly targetLocation: string
}
function validVerify(
  validate: MaintenanceEffects['validate'],
  input: unknown,
): input is VerifyInput {
  return validate('VerifyInput', input)
}
function validRestore(
  validate: MaintenanceEffects['validate'],
  input: unknown,
): input is RestoreInput {
  return validate('RestoreIsolatedInput', input)
}

/** Local file operations only: no Context, serving instance, or governance services. */
export function createOfflinePolicy(
  options: OfflineMaintenanceOptions,
  effects: MaintenanceEffects,
) {
  return {
    verify(input: unknown, signal?: AbortSignal): Promise<MaintenanceResult> {
      if (!validVerify(effects.validate, input) || !isAbsolute(input.sourceLocation))
        return Promise.resolve({ status: 'invalid-input' })
      return resultOf(
        effects.validate,
        'VerifyResult',
        () =>
          options.inspection.run(
            session =>
              effects.useBackup(input.sourceLocation, session, async source => {
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
        !validRestore(effects.validate, input) ||
        !isAbsolute(input.sourceLocation) ||
        !isAbsolute(input.targetLocation)
      )
        return Promise.resolve({ status: 'invalid-input' })
      let publishedLocation: string | null = null
      return resultOf(
        effects.validate,
        'RestoreIsolatedResult',
        () =>
          options.inspection.run(
            session =>
              effects.useBackup(input.sourceLocation, session, async source => {
                const metadata = await source.inspect(session, options)
                checkCancelled(session)
                const space = await effects.files.space(options.workDirectory)
                if (space.bavail * space.bsize < metadata.byteLength * 2 + 268_435_456)
                  throw new MaintenanceFailure('capacity')
                return effects.files.useDirectory(
                  dirname(input.targetLocation),
                  session,
                  false,
                  async parent => {
                    checkCancelled(session)
                    try {
                      await effects.files.mkdir(input.targetLocation)
                    } catch (error) {
                      if (hasCode(error, 'EEXIST'))
                        throw new MaintenanceFailure('target-exists', { cause: error })
                      throw error
                    }
                    let published = false
                    try {
                      return await effects.files.useDirectory(
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
                                await output.write(bytes)
                              }
                              await output.sync()
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
                                effects.files,
                                () => parent.confirm(),
                              )
                              return {
                                status: 'restored-isolated',
                                metadata,
                                targetLocation: input.targetLocation,
                                businessOpen: false,
                              }
                            },
                            effects.files,
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
