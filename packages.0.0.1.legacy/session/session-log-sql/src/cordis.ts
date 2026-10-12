import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import type { AtomicStorage, Storage } from '@omne-harness-lite/storage'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startRetainedAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import {
  SessionLogService,
  SessionLogBackingService,
  SessionLogOwnerService,
  SessionLogParticipantService,
  SESSION_LOG,
  SESSION_LOG_BACKING,
  SESSION_LOG_OWNER,
  SESSION_LOG_PARTICIPANT,
  SESSION_LOG_AUTHORITY,
} from '@omne-harness-lite/session-log/cordis'
import type {
  SessionLog,
  SessionLogBackingOperations,
  SessionLogOwnerOperations,
  SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import { openSqlSessionLog, type SqlSessionLog } from './index.ts'

export const Config = z
  .object({ operationLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
  .strict()
const requires = [STORAGE_SERVICE, SESSION_LOG_AUTHORITY] as const
const provides = [
  SESSION_LOG,
  SESSION_LOG_BACKING,
  SESSION_LOG_OWNER,
  SESSION_LOG_PARTICIPANT,
] as const

function atomicStorage(storage: Storage): AtomicStorage {
  if (!('atomic' in storage) || typeof storage.atomic !== 'function')
    throw new TypeError('session log requires AtomicStorage')
  return storage as AtomicStorage
}
class LogProvider extends SessionLogService {
  readonly append: SessionLog['append']
  readonly readByKey: SessionLog['readByKey']
  readonly readSince: SessionLog['readSince']
  constructor(ctx: Context, log: SessionLog) {
    super(ctx)
    this.append = log.append
    this.readByKey = log.readByKey
    this.readSince = log.readSince
  }
}
class BackingProvider extends SessionLogBackingService {
  readonly ownerGeneration: string
  readonly borrow: SessionLogBackingOperations['borrow']
  constructor(ctx: Context, backing: SessionLogBackingOperations) {
    super(ctx)
    this.ownerGeneration = backing.ownerGeneration
    this.borrow = backing.borrow
  }
}
class OwnerProvider extends SessionLogOwnerService {
  readonly enumerate: SessionLogOwnerOperations['enumerate']
  readonly borrow: SessionLogOwnerOperations['borrow']
  readonly readPrefix: SessionLogOwnerOperations['readPrefix']
  constructor(ctx: Context, owner: SessionLogOwnerOperations) {
    super(ctx)
    this.enumerate = owner.enumerate
    this.borrow = owner.borrow
    this.readPrefix = owner.readPrefix
  }
}
class ParticipantProvider extends SessionLogParticipantService {
  readonly readSinceIn: SessionLogParticipant['readSinceIn']
  readonly readPrefixIn: SessionLogParticipant['readPrefixIn']
  readonly readByKeyIn: SessionLogParticipant['readByKeyIn']
  readonly sourceIn: SessionLogParticipant['sourceIn']
  readonly appendIn: SessionLogParticipant['appendIn']
  readonly source: SessionLogParticipant['source']
  readonly readPrefix: SessionLogParticipant['readPrefix']
  constructor(ctx: Context, participant: SessionLogParticipant) {
    super(ctx)
    this.readSinceIn = participant.readSinceIn
    this.readPrefixIn = participant.readPrefixIn
    this.readByKeyIn = participant.readByKeyIn
    this.sourceIn = participant.sourceIn
    this.appendIn = participant.appendIn
    this.source = participant.source
    this.readPrefix = participant.readPrefix
  }
}
/** A single mounted generation borrows storage and retains it until accepted journal work drains. */
export function createSessionLogSql() {
  let mounted = false
  let stopped = false
  let owner: SqlSessionLog | undefined
  const ready = Promise.withResolvers<void>()
  void ready.promise.catch(() => undefined)
  const plugin = Object.assign(
    definePlugin({
      name: 'session-log-sql',
      Config,
      inject: [...requires, ASSEMBLY_LIFETIME_SERVICE],
      apply(ctx, config) {
        if (mounted) throw new Error('session log factory already mounted')
        mounted = true
        const storage = atomicStorage(ctx.storage)
        const authority = ctx.sessionLogAuthority
        function assertPublishing() {
          ctx.fiber.assertActive()
          if (stopped || !ctx.assemblyLifetime.isCurrent())
            throw new Error('session log owner stopped')
        }
        startRetainedAssemblyWork(
          ctx,
          async () => {
            try {
              assertPublishing()
              await storage.read(async tx => {
                for (const table of ['sl_journal', 'sl_entry', 'sl_read_key', 'sl_attempt'])
                  await tx.db.selectFrom(table).selectAll().limit(0).execute()
              })
              assertPublishing()
              // Cordis exposes a consumer-specific service face. Prove that both
              // faces participate in this actual instance before adopting the
              // authority's stable construction identity for physical ownership.
              await storage.atomic(async unit => {
                unit.assertStorage(authority.storage)
              })
              assertPublishing()
              owner = openSqlSessionLog({
                storage: authority.storage,
                authority,
                operationLimit: config.operationLimit,
              })
              new LogProvider(ctx, owner)
              new BackingProvider(ctx, owner.backing)
              new OwnerProvider(ctx, owner.owner)
              new ParticipantProvider(ctx, owner.participant)
              ready.resolve()
            } catch (error) {
              ready.reject(error)
              throw error
            }
          },
          async () => {
            stopped = true
            await owner?.close()
          },
        )
      },
    }),
    {
      assemblyLifecycle: 1 as const,
      describeAssembly(value: unknown): AssemblyDeclaration {
        Config.parse(value)
        return {
          provides: [...provides],
          requires: [...requires],
          optional: [],
          dynamicProvides: [],
          dynamicRequires: [],
          claims: [],
        }
      },
    },
  )
  return Object.freeze({ plugin, ready: ready.promise })
}
