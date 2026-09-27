import { ownResourceAt } from './resources.ts'
import { constants, type Stats } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  SnapshotFailure,
  type SnapshotCheck,
  type SnapshotInspectionSession,
  type SnapshotView,
} from '@omne-harness-lite/storage'
import { readSnapshotCenterId } from '../center-id/snapshot.ts'
import { readJsonText } from '../json.ts'
import { MaintenanceFailure, withCleanup } from './failure.ts'
import {
  CHUNK_BYTES,
  MAGIC,
  MAX_DATA_BYTES,
  MAX_HEADER_BYTES,
  parseMetadata,
  type Metadata,
} from './metadata.ts'

export interface SnapshotFormat {
  readonly migrationNames: readonly string[]
  readonly snapshotChecks: readonly SnapshotCheck[]
}

export async function checkView(view: SnapshotView, format: SnapshotFormat): Promise<string> {
  if (JSON.stringify(view.inspection.appliedMigrations) !== JSON.stringify(format.migrationNames))
    throw new SnapshotFailure('invalid-data')
  for (const check of format.snapshotChecks) {
    if (!(await check(view)).ok) throw new SnapshotFailure('invalid-data')
  }
  return readSnapshotCenterId(view)
}

async function readExactly(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  let filled = 0
  while (filled < length) {
    const result = await handle.read(buffer, filled, length - filled, offset + filled)
    if (result.bytesRead === 0) throw new MaintenanceFailure('unavailable')
    filled += result.bytesRead
  }
  return buffer
}

/** One descriptor supplies both parsing and the bytes copied into isolated inspection. */
export class BackupInputFile {
  private constructor(
    private readonly handle: FileHandle,
    private readonly initial: Stats,
    readonly metadata: Metadata,
    readonly dataOffset: number,
  ) {}

  static async use<T>(
    path: string,
    session: SnapshotInspectionSession,
    fn: (input: BackupInputFile) => Promise<T>,
  ): Promise<T> {
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    const close = ownResourceAt(
      session,
      () => handle.close(),
      () => handle.fd < 0,
      path,
    )
    return withCleanup(async () => {
      const info = await handle.stat()
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
        throw new MaintenanceFailure('unavailable')
      if (info.size > MAGIC.length + 4 + MAX_HEADER_BYTES + MAX_DATA_BYTES)
        throw new MaintenanceFailure('capacity')
      if (info.size < MAGIC.length + 5) throw new MaintenanceFailure('invalid-backup')
      const prefix = await readExactly(handle, 0, MAGIC.length + 4)
      if (!prefix.subarray(0, MAGIC.length).equals(MAGIC))
        throw new MaintenanceFailure('invalid-backup')
      const headerLength = prefix.readUInt32BE(MAGIC.length)
      if (headerLength > MAX_HEADER_BYTES) throw new MaintenanceFailure('capacity')
      const dataOffset = MAGIC.length + 4 + headerLength
      if (headerLength < 1 || dataOffset >= info.size)
        throw new MaintenanceFailure('invalid-backup')
      const header = readJsonText(await readExactly(handle, MAGIC.length + 4, headerLength), {
        depth: 8,
        members: 16,
      })
      if (header.kind !== 'value' || header.duplicates.length !== 0)
        throw new MaintenanceFailure('invalid-backup')
      const metadata = parseMetadata(header.value)
      if (info.size !== dataOffset + metadata.byteLength)
        throw new MaintenanceFailure('invalid-backup')
      return fn(new BackupInputFile(handle, info, metadata, dataOffset))
    }, close)
  }

  async stable(): Promise<void> {
    const current = await this.handle.stat()
    if (
      (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'] as const).some(
        field => current[field] !== this.initial[field],
      )
    )
      throw new SnapshotFailure('unavailable')
  }

  async *bytes(wholeFile = false): AsyncIterable<Uint8Array> {
    const hash = createHash('sha256')
    if (wholeFile) yield await readExactly(this.handle, 0, this.dataOffset)
    for (let offset = 0; offset < this.metadata.byteLength; offset += CHUNK_BYTES) {
      const chunk = await readExactly(
        this.handle,
        this.dataOffset + offset,
        Math.min(CHUNK_BYTES, this.metadata.byteLength - offset),
      )
      hash.update(chunk)
      yield chunk
    }
    if (hash.digest('hex') !== this.metadata.sha256) throw new SnapshotFailure('invalid-data')
    await this.stable()
  }

  async inspect(session: SnapshotInspectionSession, format: SnapshotFormat): Promise<Metadata> {
    return session.inspect(
      { byteLength: this.metadata.byteLength, chunks: this.bytes() },
      async view => {
        if (
          (await checkView(view, format)) !== this.metadata.centerId ||
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
    await this.handle.sync()
    await this.stable()
  }
}
