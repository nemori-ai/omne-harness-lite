import { createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { instantToRfc3339, type Clock, type Instant } from '@omne-harness-lite/offer-expiry'
import type { SnapshotMaintenance, SnapshotSession } from '@omne-harness-lite/storage'
import { validBackupInput, validBackupStatusInput } from './inputs.ts'
import { checkView, type SnapshotFormat } from './input.ts'
import { MaintenanceFailure } from './failure.ts'
import { CHUNK_BYTES, metadataBytes, metadataTime, type Metadata } from './metadata.ts'
import { observeBackups } from './catalog.ts'
import {
  checkCancelled,
  MaintenanceDirectory,
  publishOutput,
  withTemporaryOutput,
  type MaintenanceReporter,
} from './publication.ts'
import { reportResiduals, resultOf, type MaintenanceResult } from './results.ts'

export interface OnlineMaintenanceOptions extends SnapshotFormat {
  readonly source: SnapshotMaintenance
  readonly clock: Clock
  readonly backupDirectory: string
  readonly workDirectory: string
  readonly sourceBuildId: string | null
  readonly report: MaintenanceReporter
  readonly onClosed: (status: 'clean' | 'error') => void
}
export class OnlineMaintenance {
  #centerId: string | undefined
  #accepting = false
  #closed = false
  #active: Promise<MaintenanceResult> | undefined
  #abort: AbortController | undefined
  #closing: Promise<void> | undefined
  #failed = false
  constructor(private readonly options: OnlineMaintenanceOptions) {}
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
      observeBackups(this.options.backupDirectory, session, this.options, centerId, this.#now()),
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
        )
        if (
          status.latest !== null &&
          now - metadataTime(status.latest.metadata.startedAt) < 72_000_000
        )
          return { status: 'not-due', backup: status.latest }
      }
      const startedAt = this.#now()
      return session.snapshot(async view => {
        if ((await checkView(view, this.options)) !== centerId)
          throw new MaintenanceFailure('invalid-backup')
        const hash = createHash('sha256')
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
          sha256: hash.digest('hex'),
        }
        const fileName = `${randomBytes(16).toString('hex')}.omne-backup`
        return MaintenanceDirectory.use(this.options.backupDirectory, session, true, directory =>
          withTemporaryOutput(this.options.workDirectory, session, this.#report, async output => {
            await output.handle.writeFile(metadataBytes(metadata))
            for (let offset = 0; offset < view.byteLength; offset += CHUNK_BYTES) {
              checkCancelled(session)
              await output.handle.writeFile(
                await view.read(offset, Math.min(CHUNK_BYTES, view.byteLength - offset)),
              )
            }
            await output.handle.sync()
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
            )
            return { status: 'completed', backup: { fileName, metadata } }
          }),
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
