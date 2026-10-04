import type { Context } from '@deepseek-ai/cordis'
import type { AtomicStorage, StorageInstance } from '@omne-harness-lite/storage'
import { StorageService } from '@omne-harness-lite/storage/cordis'
import type { SqlStorage } from './provider.ts'
import { attachStorageInstance } from './service-identity.ts'

/** Publishes a borrowed instance. The caller retains responsibility for closing it. */
export class SqlStorageService extends StorageService implements AtomicStorage, StorageInstance {
  readonly read: SqlStorage['read']
  readonly write: SqlStorage['write']
  readonly atomic: SqlStorage['atomic']
  readonly close: SqlStorage['close']
  readonly maintenance: SqlStorage['maintenance']

  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    attachStorageInstance(this, storage)
    this.read = storage.read.bind(storage)
    this.write = storage.write.bind(storage)
    this.atomic = storage.atomic.bind(storage)
    this.close = storage.close.bind(storage)
    this.maintenance = storage.maintenance
  }
}
