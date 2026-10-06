import {
  SnapshotFailure,
  type SnapshotInspectionSession,
  type SnapshotView,
} from '@omne-harness-lite/storage'
import { CHUNK_BYTES, type Metadata } from './backup-data.ts'
import type { SnapshotFormat } from './maintenance-options.ts'
import type { PhysicalInput, Digest, MaintenanceEffects } from './maintenance-ports.ts'

export async function checkView(
  view: SnapshotView,
  format: SnapshotFormat,
  readCenter: (view: SnapshotView) => Promise<string>,
): Promise<string> {
  if (JSON.stringify(view.inspection.appliedMigrations) !== JSON.stringify(format.migrationNames))
    throw new SnapshotFailure('invalid-data')
  for (const check of format.snapshotChecks) {
    if (!(await check(view)).ok) throw new SnapshotFailure('invalid-data')
  }
  return readCenter(view)
}

/** Policy over one descriptor; its provider retains close responsibility. */
export class BackupInputFile {
  constructor(
    private readonly physical: PhysicalInput,
    readonly metadata: Metadata,
    readonly dataOffset: number,
    private readonly digestFactory: () => Digest,
    private readonly readCenter: MaintenanceEffects['readCenter'],
  ) {}
  async stable(): Promise<void> {
    await this.physical.stable()
  }
  async *bytes(wholeFile = false): AsyncIterable<Uint8Array> {
    const hash = this.digestFactory()
    if (wholeFile) yield await this.physical.read(0, this.dataOffset)
    for (let offset = 0; offset < this.metadata.byteLength; offset += CHUNK_BYTES) {
      const chunk = await this.physical.read(
        this.dataOffset + offset,
        Math.min(CHUNK_BYTES, this.metadata.byteLength - offset),
      )
      hash.update(chunk)
      yield chunk
    }
    if (hash.hex() !== this.metadata.sha256) throw new SnapshotFailure('invalid-data')
    await this.stable()
  }

  async inspect(session: SnapshotInspectionSession, format: SnapshotFormat): Promise<Metadata> {
    return session.inspect(
      { byteLength: this.metadata.byteLength, chunks: this.bytes() },
      async view => {
        if (
          (await checkView(view, format, this.readCenter)) !== this.metadata.centerId ||
          JSON.stringify(view.inspection.appliedMigrations) !==
            JSON.stringify(this.metadata.migrationNames)
        )
          throw new SnapshotFailure('invalid-data')
        await this.stable()
        return this.metadata
      },
    )
  }

  /** Only status/due invokes this; verify does not assert publication durability. */
  async confirm(): Promise<void> {
    await this.stable()
    await this.physical.sync()
    await this.stable()
  }
}
