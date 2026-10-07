import { createHash, randomUUID } from 'node:crypto'
import {
  narrow,
  type Storage,
  type MigrationFragment,
  type ReadTx,
  type WriteTx,
} from '@omne-harness-lite/storage'
import {
  writeJsonLossless,
  readJsonStrict,
  type ContentBlock,
  copyJsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  judgeModelCallCreatedPayload,
  judgeModelCallSemanticDigest,
  judgeModelInvocationRecord,
  type ModelCallAcknowledgedRecord,
  type ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { AckPendingReason } from '@omne-harness-lite/model-request-runtime'
import type { ModelCallCleanupResult } from '@omne-harness-lite/model-request-runtime'
import type {
  ModelCallContentStore,
  ModelCallContentValue,
  ModelCallRetentionKey,
  ModelCallRetentionPhase,
} from './reference-types.ts'
import type {
  ServiceInvalidInput,
  ServiceUnavailable,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import { settlementGenerationCurrent } from '@omne-harness-lite/model-request-runtime'
import { createSettlementWorkStore, settlementWorkMigration } from './settlement-work-store.ts'

interface ContentRow {
  readonly organization: string
  readonly account: string
  readonly session: string
  readonly locator: string
  readonly version: string
  /** RT12 S-98: the owning CallKey; every delete names it together with the exact ref. */
  readonly call: string
  readonly kind: 'created' | 'reply_ready'
  readonly digest: string
  readonly bytes: Uint8Array
}
interface RetentionRow {
  readonly organization: string
  readonly account: string
  readonly session: string
  readonly call: string
  readonly phase: ModelCallRetentionPhase
  /** The one fixed original ACK batch (lossless JSON); null while still retained. */
  readonly acknowledgement: string | null
}
interface RetentionUseRow {
  readonly organization: string
  readonly account: string
  readonly session: string
  readonly call: string
  readonly use_id: string
  readonly kind: 'publish'
  /** The store instance that registered the use; another generation's use is never cleared. */
  readonly owner: string
}
/**
 * RT12 S-98 (identities are never reused): a released content identity keeps a small row with
 * its owner and exact ref after the bytes are deleted. No call may publish under it again.
 */
interface ContentTombstoneRow {
  readonly organization: string
  readonly account: string
  readonly session: string
  readonly locator: string
  readonly version: string
  readonly call: string
  readonly kind: 'created' | 'reply_ready'
  readonly digest: string
}
interface ContentDatabase {
  model_call_content: ContentRow
  model_call_content_tombstone: ContentTombstoneRow
  model_call_retention: RetentionRow
  model_call_retention_use: RetentionUseRow
}
export interface ModelCallContentPolicy {
  readonly maxConcurrentWrites: number
  readonly maxContentBytes: number
}
/**
 * Private content, RT12 S-98 retention and S-99⑧ settlement-work migrations. Content,
 * retention, permits and staging rows share one Storage; SQL and SL3 never share a transaction.
 */
export function modelCallContentMigrations(
  backend: 'sqlite' | 'postgres',
): readonly MigrationFragment[] {
  return [
    {
      name: 'model_call_content',
      migration: {
        async up(db) {
          await db.schema
            .createTable('model_call_content')
            .ifNotExists()
            .addColumn('organization', 'text', c => c.notNull())
            .addColumn('account', 'text', c => c.notNull())
            .addColumn('session', 'text', c => c.notNull())
            .addColumn('locator', 'text', c => c.notNull())
            .addColumn('version', 'text', c => c.notNull())
            .addColumn('call', 'text', c => c.notNull())
            .addColumn('kind', 'text', c => c.notNull())
            .addColumn('digest', 'text', c => c.notNull())
            .addColumn('bytes', backend === 'sqlite' ? 'blob' : 'bytea', c => c.notNull())
            .addPrimaryKeyConstraint('model_call_content_pkey', [
              'organization',
              'account',
              'session',
              'locator',
              'version',
            ])
            .execute()
        },
      },
    },
    {
      name: 'model_call_retention',
      migration: {
        async up(db) {
          await db.schema
            .createTable('model_call_retention')
            .ifNotExists()
            .addColumn('organization', 'text', c => c.notNull())
            .addColumn('account', 'text', c => c.notNull())
            .addColumn('session', 'text', c => c.notNull())
            .addColumn('call', 'text', c => c.notNull())
            .addColumn('phase', 'text', c => c.notNull())
            .addColumn('acknowledgement', 'text')
            .addPrimaryKeyConstraint('model_call_retention_pkey', [
              'organization',
              'account',
              'session',
              'call',
            ])
            .execute()
          await db.schema
            .createTable('model_call_retention_use')
            .ifNotExists()
            .addColumn('organization', 'text', c => c.notNull())
            .addColumn('account', 'text', c => c.notNull())
            .addColumn('session', 'text', c => c.notNull())
            .addColumn('call', 'text', c => c.notNull())
            .addColumn('use_id', 'text', c => c.notNull())
            .addColumn('kind', 'text', c => c.notNull())
            .addColumn('owner', 'text', c => c.notNull())
            .addPrimaryKeyConstraint('model_call_retention_use_pkey', [
              'organization',
              'account',
              'session',
              'call',
              'use_id',
            ])
            .execute()
        },
      },
    },
    settlementWorkMigration,
    {
      name: 'model_call_content_tombstone',
      migration: {
        async up(db) {
          await db.schema
            .createTable('model_call_content_tombstone')
            .ifNotExists()
            .addColumn('organization', 'text', c => c.notNull())
            .addColumn('account', 'text', c => c.notNull())
            .addColumn('session', 'text', c => c.notNull())
            .addColumn('locator', 'text', c => c.notNull())
            .addColumn('version', 'text', c => c.notNull())
            .addColumn('call', 'text', c => c.notNull())
            .addColumn('kind', 'text', c => c.notNull())
            .addColumn('digest', 'text', c => c.notNull())
            .addPrimaryKeyConstraint('model_call_content_tombstone_pkey', [
              'organization',
              'account',
              'session',
              'locator',
              'version',
            ])
            .execute()
        },
      },
    },
  ]
}
function validBinding(binding: SettlementLogBinding): boolean {
  return (
    binding !== null &&
    typeof binding === 'object' &&
    'ok' in parseTenantId(binding.tenant) &&
    'ok' in parseOpaqueIdentifier(binding.session, 'SessionRef')
  )
}
function validCall(call: unknown): call is string {
  return typeof call === 'string' && 'ok' in judgeAccountValue('ModelCallId', call)
}
function validRef(ref: ModelCallPayloadRef): boolean {
  return (
    ref !== null &&
    typeof ref === 'object' &&
    (ref.kind === 'created' || ref.kind === 'reply_ready') &&
    'ok' in parseOpaqueIdentifier(ref.locator, 'ModelCallPayloadLocator') &&
    'ok' in parseOpaqueIdentifier(ref.version, 'ModelCallPayloadVersion') &&
    /^[0-9a-f]{64}$/u.test(ref.digest)
  )
}
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
function isPending(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}
function judgedContent(input: {
  readonly kind: 'created' | 'reply_ready'
  readonly value: unknown
}): ModelCallContentValue | undefined {
  if (input?.kind === 'created') {
    const result = judgeModelCallCreatedPayload(input.value)
    return 'ok' in result ? { kind: 'created', value: result.ok } : undefined
  }
  if (input?.kind === 'reply_ready') {
    const copied = copyJsonValue(input.value)
    if ('failed' in copied || !isPending(copied.ok)) return undefined
    return { kind: 'reply_ready', value: copied.ok }
  }
  return undefined
}
function ownerCall(content: ModelCallContentValue): string {
  return content.kind === 'created' ? content.value.ref.callId : content.value.call.callId
}
function hasExternalContent(blocks: readonly ContentBlock[]): boolean {
  return blocks.some(block => {
    if (block.kind === 'file') return true
    if (block.kind === 'voice' || block.kind === 'image')
      return (
        !('inline' in block.data) ||
        (block.renderings?.some(rendering =>
          rendering.blocks.some(item => item.kind !== 'text' && !('inline' in item.data)),
        ) ??
          false)
      )
    if (block.kind === 'tool_result')
      return block.offloaded !== undefined || hasExternalContent(block.blocks)
    return false
  })
}
function requiresRetention(content: ModelCallContentValue): boolean {
  if (content.kind === 'reply_ready')
    return content.value.raw?.body !== undefined || hasExternalContent(content.value.reply.blocks)
  return (
    content.value.input.messages.some(message => hasExternalContent(message.blocks)) ||
    (content.value.status === 'accepted' &&
      content.value.adopted.messages.some(message => hasExternalContent(message.blocks)))
  )
}
function ownedBinding(binding: SettlementLogBinding): SettlementLogBinding {
  return Object.freeze({ ...binding, tenant: Object.freeze({ ...binding.tenant }) })
}
function matchesContentBinding(
  content: ModelCallContentValue,
  binding: SettlementLogBinding,
): boolean {
  return !(
    content.kind === 'created' &&
    (!tenantIdEquals(content.value.origin.tenant, binding.tenant) ||
      content.value.ref.session !== binding.session ||
      content.value.origin.session !== binding.session)
  )
}
function acknowledgementOf(text: string | null): ModelCallAcknowledgedRecord | undefined {
  if (text === null) return undefined
  const parsed = readJsonStrict(text)
  if (!('ok' in parsed)) return undefined
  const judged = judgeModelInvocationRecord(parsed.ok)
  return 'ok' in judged && judged.ok.kind === 'model_call_acknowledged' ? judged.ok : undefined
}
function isPhase(value: unknown): value is ModelCallRetentionPhase {
  return (
    value === 'retained' || value === 'retiring' || value === 'acknowledged' || value === 'released'
  )
}
/** Decode one exact-byte row into its judged value, or report a contradiction. */
function decodeRow(
  existing: ContentRow,
  ref: ModelCallPayloadRef,
  binding: SettlementLogBinding,
  call: string,
): ModelCallContentValue | undefined {
  if (
    existing.kind !== ref.kind ||
    existing.digest !== ref.digest ||
    existing.call !== call ||
    !(existing.bytes instanceof Uint8Array) ||
    digest(existing.bytes) !== ref.digest
  )
    return undefined
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(existing.bytes)
  } catch {
    return undefined
  }
  const parsed = readJsonStrict(text)
  if (!('ok' in parsed)) return undefined
  const content = judgedContent({ kind: ref.kind, value: parsed.ok })
  if (content === undefined || ownerCall(content) !== call) return undefined
  if (!matchesContentBinding(content, binding)) return undefined
  return content
}
const unavailable = Object.freeze({ unavailable: true } as const)
const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)
/** A transaction outcome that is neither a commit nor a rollback the caller may rely on. */
class Refused {
  constructor(readonly result: ServiceInvalidInput | ServiceUnavailable) {}
}

function validPutRequest(request: Parameters<ModelCallContentStore['put']>[0]): boolean {
  return !(
    request === null ||
    typeof request !== 'object' ||
    !validBinding(request.binding) ||
    !validRef({
      kind: request.content?.kind,
      locator: request.locator,
      version: request.version,
      digest: '0'.repeat(64),
    })
  )
}

function requireSameContent(
  existing: ContentRow,
  call: string,
  ref: ModelCallPayloadRef,
  bytes: Uint8Array,
): void {
  if (
    existing.call !== call ||
    existing.kind !== ref.kind ||
    existing.digest !== ref.digest ||
    !Buffer.from(existing.bytes).equals(bytes)
  )
    throw new Refused(malformed)
}

function fixedAcknowledgement(row: RetentionRow, call: string): ModelCallAcknowledgedRecord {
  const fixed = acknowledgementOf(row.acknowledgement)
  if (fixed === undefined || fixed.call !== call) throw new Refused(unavailable)
  return fixed
}

function preparedAcknowledgement(
  built: ReturnType<Parameters<ModelCallContentStore['prepareAcknowledgement']>[0]['build']>,
  call: string,
  payloads: readonly ModelCallPayloadRef[],
): { readonly record: ModelCallAcknowledgedRecord; readonly text: string } {
  if (!('record' in built)) throw new Refused(built)
  const record = built.record
  if (
    record.call !== call ||
    !record.releasablePayloads.every(ref =>
      payloads.some(candidate => modelLogJsonEqual(candidate, ref)),
    )
  )
    throw new Refused(malformed)
  const text = writeJsonLossless(record)
  if (acknowledgementOf(text) === undefined) throw new Refused(malformed)
  return { record, text }
}

function requireCompatibleAcknowledgement(
  row: RetentionRow,
  fixed: ModelCallAcknowledgedRecord | undefined,
  record: ModelCallAcknowledgedRecord,
): void {
  if (row.acknowledgement !== null && fixed === undefined) throw new Refused(unavailable)
  // The log is the ACK authority; a differing fixed batch is a broken invariant.
  if (fixed !== undefined && !modelLogJsonEqual(fixed, record)) throw new Refused(unavailable)
}

/**
 * Immutable exact-byte publication store with the RT12 S-98 retention gate. Every content
 * read, publish admission, ACK preparation and deletion touches the same retention row of the
 * owning CallKey inside one Storage transaction.
 */
export function createModelCallContentStore(input: {
  readonly storage: Storage
  readonly policy: ModelCallContentPolicy
}): ModelCallContentStore {
  if (
    typeof input.storage?.read !== 'function' ||
    typeof input.storage.write !== 'function' ||
    ![input.policy?.maxConcurrentWrites, input.policy?.maxContentBytes].every(
      n => Number.isSafeInteger(n) && n > 0,
    )
  )
    throw new TypeError('immutable content storage and explicit finite policy required')
  const storage = input.storage
  const policy = Object.freeze({ ...input.policy })
  /** This store instance's generation; permits of another generation are never cleared here. */
  const generation = randomUUID()
  const tasks = new Set<Promise<void>>()
  let closed = false
  function owned<T>(work: () => Promise<T>): Promise<T> {
    let complete = () => {}
    const done = new Promise<void>(resolve => {
      complete = resolve
    })
    tasks.add(done)
    return work().finally(() => {
      tasks.delete(done)
      complete()
    })
  }
  function retentionKey(binding: SettlementLogBinding, call: string) {
    return {
      organization: binding.tenant.organization,
      account: binding.tenant.account,
      session: binding.session,
      call,
    }
  }
  /** Create the row if absent (unique-insert recognition), then lock the existing row. */
  async function lockRetention(
    tx: WriteTx,
    binding: SettlementLogBinding,
    call: string,
  ): Promise<RetentionRow> {
    const key = retentionKey(binding, call)
    const db = narrow<ContentDatabase>(tx)
    await db
      .insertInto('model_call_retention')
      .values({ ...key, phase: 'retained', acknowledgement: null })
      .onConflict(oc => oc.doNothing())
      .execute()
    await tx.lockRow('model_call_retention', key)
    const row = await db
      .selectFrom('model_call_retention')
      .selectAll()
      .where('organization', '=', key.organization)
      .where('account', '=', key.account)
      .where('session', '=', key.session)
      .where('call', '=', key.call)
      .executeTakeFirst()
    if (row === undefined || !isPhase(row.phase)) throw new Refused(unavailable)
    return row
  }
  async function publishers(
    tx: ReadTx,
    binding: SettlementLogBinding,
    call: string,
  ): Promise<number> {
    const rows = await narrow<ContentDatabase>(tx)
      .selectFrom('model_call_retention_use')
      .select('use_id')
      .where('organization', '=', binding.tenant.organization)
      .where('account', '=', binding.tenant.account)
      .where('session', '=', binding.session)
      .where('call', '=', call)
      .where('kind', '=', 'publish')
      .execute()
    return rows.length
  }
  async function contentRow(
    tx: ReadTx,
    binding: SettlementLogBinding,
    ref: Pick<ModelCallPayloadRef, 'locator' | 'version'>,
  ): Promise<ContentRow | undefined> {
    return await narrow<ContentDatabase>(tx)
      .selectFrom('model_call_content')
      .selectAll()
      .where('organization', '=', binding.tenant.organization)
      .where('account', '=', binding.tenant.account)
      .where('session', '=', binding.session)
      .where('locator', '=', ref.locator)
      .where('version', '=', ref.version)
      .executeTakeFirst()
  }
  /** Every listed payload is this call's exact retained row, and the ACK digests match them. */
  async function agreesWithOriginals(
    tx: ReadTx,
    binding: SettlementLogBinding,
    call: string,
    record: ModelCallAcknowledgedRecord,
  ): Promise<boolean> {
    const contents: ModelCallContentValue[] = []
    for (const ref of record.releasablePayloads) {
      const existing = await contentRow(tx, binding, ref)
      // A listed original that is gone cannot be checked; that is not a verdict either way.
      if (existing === undefined) throw new Refused(unavailable)
      const decoded = decodeRow(existing, ref, binding, call)
      if (decoded === undefined) return false
      contents.push(decoded)
    }
    const created = contents.find(content => content.kind === 'created')
    if (
      created?.kind !== 'created' ||
      created.value.creationKey !== record.creationKey ||
      !(
        'ok' in
        judgeModelCallSemanticDigest(
          'model-call-creation-semantic-sha256/v1',
          created.value.input,
          record.creationInput,
        )
      )
    )
      return false
    const digest = record.retainedResultDigest
    if (digest === undefined) return true
    const target = record.target
    const retained = contents.find(
      content =>
        content.kind === 'reply_ready' &&
        target.kind === 'response' &&
        content.value.id === target.response,
    )
    return (
      retained?.kind === 'reply_ready' &&
      'ok' in
        judgeModelCallSemanticDigest(
          'model-call-retained-result-semantic-sha256/v1',
          retained.value,
          digest,
        )
    )
  }
  async function writeOwned<T>(
    work: (tx: WriteTx) => Promise<T>,
  ): Promise<T | ServiceInvalidInput | ServiceUnavailable> {
    try {
      return await storage.write(work)
    } catch (error) {
      if (error instanceof Refused) return error.result
      throw error
    }
  }
  function retentionInput(request: ModelCallRetentionKey):
    | {
        readonly binding: SettlementLogBinding
        readonly call: string
      }
    | typeof malformed {
    if (
      request === null ||
      typeof request !== 'object' ||
      !validBinding(request.binding) ||
      !validCall(request.call)
    )
      return malformed
    return { binding: ownedBinding(request.binding), call: request.call }
  }
  return Object.freeze<ModelCallContentStore>({
    async put(request) {
      if (closed || tasks.size >= policy.maxConcurrentWrites) return unavailable
      if (!validPutRequest(request)) return malformed
      if (!settlementGenerationCurrent(request.binding)) return unavailable
      // Capture all content synchronously before the first storage await.
      const content = judgedContent(request.content)
      if (content === undefined) return malformed
      // This factory has no external content-retention provider. Never publish bare locators.
      if (requiresRetention(content)) return unavailable
      const binding = ownedBinding(request.binding)
      if (!matchesContentBinding(content, binding)) return malformed
      const call = ownerCall(content)
      if (!validCall(call)) return malformed
      const bytes = new TextEncoder().encode(writeJsonLossless(content.value))
      if (bytes.byteLength > policy.maxContentBytes) return unavailable
      const ref: ModelCallPayloadRef = Object.freeze({
        kind: content.kind,
        locator: request.locator,
        version: request.version,
        digest: digest(bytes),
      })
      const useId = randomUUID()
      const candidate: ContentRow = {
        ...retentionKey(binding, call),
        locator: ref.locator,
        version: ref.version,
        kind: ref.kind,
        digest: ref.digest,
        bytes: Buffer.from(bytes),
      }
      async function completePublication(): ReturnType<ModelCallContentStore['put']> {
        const committed = await writeOwned(async tx => {
          const row = await lockRetention(tx, binding, call)
          // RT12 S-98: retiring closes new publication; the original bytes stay unchanged.
          if (row.phase !== 'retained') throw new Refused(unavailable)
          // A released identity is never published again, by this call or any other.
          const tombstone = await narrow<ContentDatabase>(tx)
            .selectFrom('model_call_content_tombstone')
            .select('call')
            .where('organization', '=', binding.tenant.organization)
            .where('account', '=', binding.tenant.account)
            .where('session', '=', binding.session)
            .where('locator', '=', ref.locator)
            .where('version', '=', ref.version)
            .executeTakeFirst()
          if (tombstone !== undefined) throw new Refused(malformed)
          const existing = await contentRow(tx, binding, ref)
          if (existing === undefined) {
            await narrow<ContentDatabase>(tx)
              .insertInto('model_call_content')
              .values(candidate)
              .execute()
          } else requireSameContent(existing, call, ref, bytes)
          await narrow<ContentDatabase>(tx)
            .insertInto('model_call_retention_use')
            .values({
              ...retentionKey(binding, call),
              use_id: useId,
              kind: 'publish',
              owner: generation,
            })
            .execute()
          return 'committed' as const
        }).catch(() => undefined)
        if (committed !== undefined && committed !== 'committed') return committed
        if (committed === undefined) {
          // Never infer absence from a failed commit receipt; recognize this exact permit.
          try {
            const found = await storage.read(async tx => {
              const use = await narrow<ContentDatabase>(tx)
                .selectFrom('model_call_retention_use')
                .select('use_id')
                .where('organization', '=', binding.tenant.organization)
                .where('account', '=', binding.tenant.account)
                .where('session', '=', binding.session)
                .where('call', '=', call)
                .where('use_id', '=', useId)
                .executeTakeFirst()
              return use !== undefined
            })
            if (!found) return unavailable
          } catch {
            return unavailable
          }
        }
        if (!settlementGenerationCurrent(binding)) {
          await releasePermit(binding, call, useId)
          return unavailable
        }
        let releasing: Promise<{ readonly released: true } | typeof unavailable> | undefined
        return {
          ref,
          permit: Object.freeze({
            release: () => {
              releasing ??= releasePermit(binding, call, useId).then(result => {
                if ('unavailable' in result) releasing = undefined
                return result
              })
              return releasing
            },
          }),
        }
      }
      return await owned(completePublication)
    },
    async read(request) {
      if (
        request === null ||
        typeof request !== 'object' ||
        !validBinding(request.binding) ||
        !validCall(request.call) ||
        !validRef(request.ref)
      )
        return malformed
      const binding = ownedBinding(request.binding)
      const call = request.call
      if (!settlementGenerationCurrent(request.binding)) return unavailable
      const ref = Object.freeze({ ...request.ref })
      try {
        // RT12 S-97/S-98: phase and bytes come from one snapshot; the copy is formed here.
        const read = await storage.read(async tx => {
          const retention = await narrow<ContentDatabase>(tx)
            .selectFrom('model_call_retention')
            .select('phase')
            .where('organization', '=', binding.tenant.organization)
            .where('account', '=', binding.tenant.account)
            .where('session', '=', binding.session)
            .where('call', '=', call)
            .executeTakeFirst()
          if (retention?.phase !== 'retained') return undefined
          return await contentRow(tx, binding, ref)
        })
        if (read === undefined) return unavailable
        const content = decodeRow(read, ref, binding, call)
        if (content === undefined) return malformed
        return settlementGenerationCurrent(binding) ? { content } : unavailable
      } catch {
        return unavailable
      }
    },
    async prepareAcknowledgement(request) {
      const key = retentionInput(request)
      if ('invalidInput' in key) return key
      if (
        !Array.isArray(request.payloads) ||
        !request.payloads.every(validRef) ||
        typeof request.build !== 'function'
      )
        return malformed
      if (closed || !settlementGenerationCurrent(key.binding)) return unavailable
      const payloads = request.payloads.map(ref => Object.freeze({ ...ref }))
      const build = request.build
      const { binding, call } = key
      return await owned(async () => {
        try {
          return await writeOwned(async tx => {
            const row = await lockRetention(tx, binding, call)
            if (row.phase !== 'retained') {
              // The original batch was fixed before; never rebuild or replace it.
              const fixed = fixedAcknowledgement(row, call)
              return { record: fixed, phase: row.phase }
            }
            const contents: ModelCallContentValue[] = []
            for (const ref of payloads) {
              const existing = await contentRow(tx, binding, ref)
              if (existing === undefined) throw new Refused(unavailable)
              const decoded = decodeRow(existing, ref, binding, call)
              if (decoded === undefined) throw new Refused(malformed)
              contents.push(decoded)
            }
            const built = build(Object.freeze(contents))
            const { record, text } = preparedAcknowledgement(built, call, payloads)
            await narrow<ContentDatabase>(tx)
              .updateTable('model_call_retention')
              .set({ phase: 'retiring', acknowledgement: text })
              .where('organization', '=', binding.tenant.organization)
              .where('account', '=', binding.tenant.account)
              .where('session', '=', binding.session)
              .where('call', '=', call)
              .execute()
            return { record, phase: 'retiring' as const }
          })
        } catch {
          return unavailable
        }
      })
    },
    async withdrawAcknowledgement(request) {
      const key = retentionInput(request)
      if ('invalidInput' in key) return key
      const judged = judgeModelInvocationRecord(request.record)
      if (!('ok' in judged) || judged.ok.kind !== 'model_call_acknowledged') return malformed
      const record = judged.ok
      const { binding, call } = key
      return await owned(async () => {
        try {
          return await writeOwned(async tx => {
            const row = await lockRetention(tx, binding, call)
            if (row.phase === 'retained') return { phase: 'retained' as const }
            const fixed = acknowledgementOf(row.acknowledgement)
            // Only the very batch this caller fixed, still unconfirmed, may retreat.
            if (
              row.phase !== 'retiring' ||
              fixed === undefined ||
              !modelLogJsonEqual(fixed, record)
            )
              throw new Refused(unavailable)
            await narrow<ContentDatabase>(tx)
              .updateTable('model_call_retention')
              .set({ phase: 'retained', acknowledgement: null })
              .where('organization', '=', binding.tenant.organization)
              .where('account', '=', binding.tenant.account)
              .where('session', '=', binding.session)
              .where('call', '=', call)
              .where('phase', '=', 'retiring')
              .execute()
            return { phase: 'retained' as const }
          })
        } catch {
          return unavailable
        }
      })
    },
    async confirmAcknowledgement(request) {
      const key = retentionInput(request)
      if ('invalidInput' in key) return key
      const judged = judgeModelInvocationRecord(request.record)
      if (!('ok' in judged) || judged.ok.kind !== 'model_call_acknowledged') return malformed
      const record = judged.ok
      const { binding, call } = key
      if (record.call !== call) return malformed
      // Recording confirmation needs no current log generation: the log fact already exists.
      return await owned(async () => {
        try {
          return await writeOwned(async tx => {
            const row = await lockRetention(tx, binding, call)
            const fixed = acknowledgementOf(row.acknowledgement)
            requireCompatibleAcknowledgement(row, fixed, record)
            if (row.phase === 'acknowledged' || row.phase === 'released')
              return { phase: row.phase }
            // RT12 S-98 (a lawful ACK only): a batch this store never fixed must agree with the
            // exact retained originals before anything may be released on its authority.
            if (fixed === undefined && !(await agreesWithOriginals(tx, binding, call, record)))
              return { contradicted: true as const }
            await narrow<ContentDatabase>(tx)
              .updateTable('model_call_retention')
              .set({ phase: 'acknowledged', acknowledgement: writeJsonLossless(record) })
              .where('organization', '=', binding.tenant.organization)
              .where('account', '=', binding.tenant.account)
              .where('session', '=', binding.session)
              .where('call', '=', call)
              .execute()
            return { phase: 'acknowledged' as const }
          })
        } catch {
          return unavailable
        }
      })
    },
    async releaseAcknowledged(request) {
      const key = retentionInput(request)
      const storageUnavailable: ModelCallCleanupResult = {
        cleanup: 'pending',
        pendingReasons: ['storage_unavailable'],
      }
      if ('invalidInput' in key) return storageUnavailable
      const { binding, call } = key
      return await owned(async () => {
        let outcome: ModelCallCleanupResult | ServiceInvalidInput | ServiceUnavailable
        try {
          outcome = await writeOwned(async tx => {
            const row = await lockRetention(tx, binding, call)
            if (row.phase === 'released') return { cleanup: 'released' as const }
            const fixed = acknowledgementOf(row.acknowledgement)
            if (row.phase !== 'acknowledged' || fixed === undefined) throw new Refused(unavailable)
            const active = await publishers(tx, binding, call)
            if (active > 0) {
              const reasons: readonly AckPendingReason[] = ['writer_in_flight']
              return { cleanup: 'pending' as const, pendingReasons: reasons }
            }
            const db = narrow<ContentDatabase>(tx)
            for (const ref of fixed.releasablePayloads) {
              // The identity outlives the bytes in the same commit (no reuse after release).
              await db
                .insertInto('model_call_content_tombstone')
                .values({
                  organization: binding.tenant.organization,
                  account: binding.tenant.account,
                  session: binding.session,
                  locator: ref.locator,
                  version: ref.version,
                  call,
                  kind: ref.kind,
                  digest: ref.digest,
                })
                .onConflict(oc => oc.doNothing())
                .execute()
              await db
                .deleteFrom('model_call_content')
                .where('organization', '=', binding.tenant.organization)
                .where('account', '=', binding.tenant.account)
                .where('session', '=', binding.session)
                .where('call', '=', call)
                .where('locator', '=', ref.locator)
                .where('version', '=', ref.version)
                .where('kind', '=', ref.kind)
                .where('digest', '=', ref.digest)
                .execute()
            }
            await db
              .updateTable('model_call_retention')
              .set({ phase: 'released' })
              .where('organization', '=', binding.tenant.organization)
              .where('account', '=', binding.tenant.account)
              .where('session', '=', binding.session)
              .where('call', '=', call)
              .execute()
            return { cleanup: 'released' as const }
          })
        } catch {
          // The commit receipt is unknown: recognize the outcome from the same control row.
          try {
            const phase = await storage.read(
              async tx =>
                (
                  await narrow<ContentDatabase>(tx)
                    .selectFrom('model_call_retention')
                    .select('phase')
                    .where('organization', '=', binding.tenant.organization)
                    .where('account', '=', binding.tenant.account)
                    .where('session', '=', binding.session)
                    .where('call', '=', call)
                    .executeTakeFirst()
                )?.phase,
            )
            return phase === 'released' ? { cleanup: 'released' } : storageUnavailable
          } catch {
            return { cleanup: 'pending', pendingReasons: ['receipt_unknown'] }
          }
        }
        return 'cleanup' in outcome ? outcome : storageUnavailable
      })
    },
    async retention(request) {
      const key = retentionInput(request)
      if ('invalidInput' in key) return unavailable
      const { binding, call } = key
      try {
        return await storage.read(async tx => {
          const row = await narrow<ContentDatabase>(tx)
            .selectFrom('model_call_retention')
            .select('phase')
            .where('organization', '=', binding.tenant.organization)
            .where('account', '=', binding.tenant.account)
            .where('session', '=', binding.session)
            .where('call', '=', call)
            .executeTakeFirst()
          if (row !== undefined && !isPhase(row.phase)) return unavailable
          return { phase: row?.phase ?? null, publishers: await publishers(tx, binding, call) }
        })
      } catch {
        return unavailable
      }
    },
    work: createSettlementWorkStore({ storage, owned, closed: () => closed }),
    async close() {
      closed = true
      await Promise.all([...tasks])
      return { released: true }
    },
  })
  async function releasePermit(
    binding: SettlementLogBinding,
    call: string,
    useId: string,
  ): Promise<{ readonly released: true } | typeof unavailable> {
    try {
      await storage.write(async tx => {
        await narrow<ContentDatabase>(tx)
          .deleteFrom('model_call_retention_use')
          .where('organization', '=', binding.tenant.organization)
          .where('account', '=', binding.tenant.account)
          .where('session', '=', binding.session)
          .where('call', '=', call)
          .where('use_id', '=', useId)
          .where('owner', '=', generation)
          .execute()
      })
      return { released: true }
    } catch {
      return unavailable
    }
  }
}
