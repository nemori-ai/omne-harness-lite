import { join } from 'node:path'
import { instantToRfc3339, type Instant } from '@omne-harness-lite/offer-expiry'
import type { SnapshotSession } from '@omne-harness-lite/storage'
import { validBackupInput, validBackupStatusInput } from './inputs.ts'
import { checkView } from './input.ts'
import { MaintenanceFailure } from './failure.ts'
import { CHUNK_BYTES, type Metadata } from './backup-data.ts'
import { metadataTime } from './metadata-policy.ts'
import { observeBackups } from './catalog.ts'
import { checkCancelled, publishOutput, withTemporaryOutput } from './publication.ts'
import type { OnlineMaintenanceOptions, MaintenanceReporter } from './maintenance-options.ts'
import type { MaintenanceEffects } from './maintenance-ports.ts'
import { reportResiduals, resultOf, type MaintenanceResult } from './results.ts'

export class OnlineMaintenance {
  #centerId: string | undefined
  #accepting = false
  #closed = false
  #active: Promise<MaintenanceResult> | undefined
  #abort: AbortController | undefined
  #closing: Promise<void> | undefined
  #failed = false
  constructor(
    private readonly options: OnlineMaintenanceOptions,
    private readonly effects: MaintenanceEffects,
  ) {}
  readonly #report: MaintenanceReporter = diagnostic => {
    this.#failed = true
    this.options.report(diagnostic)
  }

  serving(centerId: string): void {
    if (this.#closed) return
    if (this.#centerId !== undefined && this.#centerId !== centerId) {
      this.stop()
      throw new Error('maintenance received inconsistent center identity')
    }
    this.#centerId = centerId
    this.#accepting = true
  }
  stop(): void {
    this.#accepting = false
    this.#abort?.abort()
  }
  #now(): Instant {
    const now = this.options.clock.now()
    if (now === 'unavailable') throw new MaintenanceFailure('unavailable')
    return now
  }
  #run(
    definition: string,
    fn: (
      session: SnapshotSession,
      centerId: string,
      markPublished: (path: string) => void,
    ) => Promise<MaintenanceResult>,
  ): Promise<MaintenanceResult> {
    if (!this.#accepting || this.#closed || this.#centerId === undefined)
      return Promise.resolve({ status: 'unavailable' })
    if (this.#active !== undefined) return Promise.resolve({ status: 'busy' })
    const centerId = this.#centerId
    const abort = new AbortController()
    this.#abort = abort
    let publishedLocation: string | null = null
    const task = resultOf(
      definition,
      () =>
        this.options.source.run(
          session =>
            fn(session, centerId, path => {
              publishedLocation = path
            }),
          { signal: abort.signal },
        ),
      error => reportResiduals(error, this.#report, publishedLocation),
    )
      .catch((error: unknown) => {
        this.#failed = true
        throw error
      })
      .finally(() => {
        this.#active = undefined
        this.#abort = undefined
      })
    this.#active = task
    return task
  }
  backupStatus(input: unknown): Promise<MaintenanceResult> {
    if (!validBackupStatusInput(input)) return Promise.resolve({ status: 'invalid-input' })
    return this.#run('BackupStatusResult', (session, centerId) =>
      observeBackups(
        this.options.backupDirectory,
        session,
        this.options,
        centerId,
        this.#now(),
        this.effects,
      ),
    )
  }
  backup(input: unknown): Promise<MaintenanceResult> {
    if (!validBackupInput(input)) return Promise.resolve({ status: 'invalid-input' })
    return this.#run('BackupResult', async (session, centerId, markPublished) => {
      if (input.onlyIfDue) {
        const now = this.#now()
        const status = await observeBackups(
          this.options.backupDirectory,
          session,
          this.options,
          centerId,
          now,
          this.effects,
        )
        if (
          status.latest !== null &&
          now - metadataTime(status.latest.metadata.startedAt) < 72_000_000
        )
          return { status: 'not-due', backup: status.latest }
      }
      const startedAt = this.#now()
      return session.snapshot(async view => {
        if ((await checkView(view, this.options, this.effects.readCenter)) !== centerId)
          throw new MaintenanceFailure('invalid-backup')
        const hash = this.effects.digestFactory()
        for (let offset = 0; offset < view.byteLength; offset += CHUNK_BYTES) {
          checkCancelled(session)
          hash.update(await view.read(offset, Math.min(CHUNK_BYTES, view.byteLength - offset)))
        }
        const finishedAt = this.#now()
        if (finishedAt < startedAt) throw new MaintenanceFailure('unavailable')
        const metadata: Metadata = {
          format: 'omne-center-backup/1',
          centerId,
          sourceBuildId: this.options.sourceBuildId,
          migrationNames: view.inspection.appliedMigrations,
          startedAt: instantToRfc3339(startedAt),
          finishedAt: instantToRfc3339(finishedAt),
          byteLength: view.byteLength,
          sha256: hash.hex(),
        }
        const fileName = this.effects.backupName()
        return this.effects.files.useDirectory(
          this.options.backupDirectory,
          session,
          true,
          directory =>
            withTemporaryOutput(
              this.options.workDirectory,
              session,
              this.#report,
              async output => {
                await output.write(this.effects.codec.bytes(metadata))
                for (let offset = 0; offset < view.byteLength; offset += CHUNK_BYTES) {
                  checkCancelled(session)
                  await output.write(
                    await view.read(offset, Math.min(CHUNK_BYTES, view.byteLength - offset)),
                  )
                }
                await output.sync()
                await publishOutput(
                  output.path,
                  join(this.options.backupDirectory, fileName),
                  directory,
                  session,
                  { status: 'outcome-unknown', fileName, targetLocation: null },
                  path => {
                    output.markPublished(path)
                    markPublished(path)
                  },
                  this.effects.files,
                )
                return { status: 'completed', backup: { fileName, metadata } }
              },
              this.effects.files,
            ),
        )
      })
    })
  }
  close(): Promise<void> {
    this.#closed = true
    this.stop()
    this.#closing ??= (async () => {
      await this.#active?.catch(() => undefined)
      this.options.onClosed(this.#failed ? 'error' : 'clean')
    })()
    return this.#closing
  }
}
