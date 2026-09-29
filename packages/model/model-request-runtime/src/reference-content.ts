import { createHash } from 'node:crypto'
import { narrow, type Storage, type MigrationFragment } from '@omne-harness-lite/storage'
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
import { judgeModelCallCreatedPayload, type ModelCallPayloadRef } from '@omne-harness-lite/messages'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import type { ModelCallContentStore, ModelCallContentValue } from './reference-types.ts'
import type { SettlementLogBinding } from './settlement-types.ts'
import { settlementGenerationCurrent } from './settlement-prefix.ts'

interface ContentRow {
  readonly organization: string
  readonly account: string
  readonly session: string
  readonly locator: string
  readonly version: string
  readonly kind: 'created' | 'reply_ready'
  readonly digest: string
  readonly bytes: Uint8Array
}
interface ContentDatabase {
  model_call_content: ContentRow
}
export interface ModelCallContentPolicy {
  readonly maxConcurrentWrites: number
  readonly maxContentBytes: number
}
/** Private content migration. SQL and SL3 never share a claimed transaction. */
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
const unavailable = Object.freeze({ unavailable: true } as const)
const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)
/** Immutable exact-byte publication store. ACK/reclamation awaits the successor adoption. */
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
  const tasks = new Set<Promise<void>>()
  let closed = false
  async function row(
    binding: SettlementLogBinding,
    ref: Pick<ModelCallPayloadRef, 'locator' | 'version'>,
  ) {
    return await storage.read(
      async tx =>
        await narrow<ContentDatabase>(tx)
          .selectFrom('model_call_content')
          .selectAll()
          .where('organization', '=', binding.tenant.organization)
          .where('account', '=', binding.tenant.account)
          .where('session', '=', binding.session)
          .where('locator', '=', ref.locator)
          .where('version', '=', ref.version)
          .executeTakeFirst(),
    )
  }
  return Object.freeze<ModelCallContentStore>({
    async put(request) {
      if (closed || tasks.size >= policy.maxConcurrentWrites) return unavailable
      if (
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
        return malformed
      if (!settlementGenerationCurrent(request.binding)) return unavailable
      // Capture all content synchronously before the first storage await.
      const owned = judgedContent(request.content)
      if (owned === undefined) return malformed
      // This factory has no external content-retention provider. Never publish bare locators.
      if (requiresRetention(owned)) return unavailable
      if (
        owned.kind === 'created' &&
        (!tenantIdEquals(owned.value.origin.tenant, request.binding.tenant) ||
          owned.value.ref.session !== request.binding.session ||
          owned.value.origin.session !== request.binding.session)
      )
        return malformed
      const bytes = new TextEncoder().encode(writeJsonLossless(owned.value))
      if (bytes.byteLength > policy.maxContentBytes) return unavailable
      const ref: ModelCallPayloadRef = Object.freeze({
        kind: owned.kind,
        locator: request.locator,
        version: request.version,
        digest: digest(bytes),
      })
      const binding = Object.freeze({
        ...request.binding,
        tenant: Object.freeze({ ...request.binding.tenant }),
      })
      const candidate: ContentRow = {
        organization: binding.tenant.organization,
        account: binding.tenant.account,
        session: binding.session,
        locator: ref.locator,
        version: ref.version,
        kind: ref.kind,
        digest: ref.digest,
        bytes: Buffer.from(bytes),
      }
      let complete = () => {}
      const done = new Promise<void>(resolve => {
        complete = resolve
      })
      tasks.add(done)
      try {
        try {
          await storage.write(async tx => {
            const db = narrow<ContentDatabase>(tx)
            await db
              .insertInto('model_call_content')
              .values(candidate)
              .onConflict(oc => oc.doNothing())
              .execute()
          })
        } catch {
          // Never infer absence from a failed commit receipt; recognize the same original row.
        }
        const existing = await row(binding, ref)
        if (existing === undefined) return unavailable
        if (
          existing.kind !== ref.kind ||
          existing.digest !== ref.digest ||
          !Buffer.from(existing.bytes).equals(bytes)
        )
          return malformed
        if (!settlementGenerationCurrent(binding)) return unavailable
        return { ref }
      } catch {
        return unavailable
      } finally {
        tasks.delete(done)
        complete()
      }
    },
    async read(request) {
      if (
        request === null ||
        typeof request !== 'object' ||
        !validBinding(request.binding) ||
        !validRef(request.ref)
      )
        return malformed
      const binding = Object.freeze({
        ...request.binding,
        tenant: Object.freeze({ ...request.binding.tenant }),
      })
      if (!settlementGenerationCurrent(request.binding)) return unavailable
      const ref = Object.freeze({ ...request.ref })
      try {
        const existing = await row(binding, ref)
        if (existing === undefined) return unavailable
        if (
          existing.kind !== ref.kind ||
          existing.digest !== ref.digest ||
          !(existing.bytes instanceof Uint8Array) ||
          digest(existing.bytes) !== ref.digest
        )
          return malformed
        let text: string
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(existing.bytes)
        } catch {
          return malformed
        }
        const parsed = readJsonStrict(text)
        if (!('ok' in parsed)) return malformed
        const content = judgedContent({ kind: ref.kind, value: parsed.ok })
        if (content === undefined) return malformed
        if (
          content.kind === 'created' &&
          (!tenantIdEquals(content.value.origin.tenant, binding.tenant) ||
            content.value.ref.session !== binding.session ||
            content.value.origin.session !== binding.session)
        )
          return malformed
        return settlementGenerationCurrent(binding) ? { content } : unavailable
      } catch {
        return unavailable
      }
    },
    async close() {
      closed = true
      await Promise.all([...tasks])
      return { released: true }
    },
  })
}
