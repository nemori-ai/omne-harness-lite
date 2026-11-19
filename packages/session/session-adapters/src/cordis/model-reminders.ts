import { createHash } from 'node:crypto'
import type { BlockId } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { MessageId, SystemReminderMessage } from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  diffForReminder,
  renderChangeReminder,
  renderSnapshotReminder,
  type BlockEntry,
  type Changes,
  type ChangesResult,
  type ContextReader,
  type DescriptorCatalog,
  type EligibilityId,
  type ReaderEligibilityHandoff,
  type ReaderOperations,
  type ScopeRef,
  type Snapshot,
  type SnapshotResult,
} from '@omne-harness/runtime-context-contract'

// A full snapshot when nothing was told in this process, then only what changed; what was told
// moves on only after the reminder commit is accepted, and losing it costs one more snapshot.

export type ModelReminderFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type PreparedReminders = Readonly<{
  messages: readonly SystemReminderMessage[]
  /** The view revision the reminder tells; it names the source of the reminder commit. */
  viewRevision: string
  /** Called after the reminder commit is accepted; never on a refusal or an unknown answer. */
  advance(): void
}>

export type ModelReminderInput<P> = Readonly<{
  principal: P
  tenant: TenantId
  scope: ScopeRef
  /** The Session revision the reminder is committed against; it keeps message ids apart. */
  at: string
}>

export type ModelReminders<P> = Readonly<{
  prepare(input: ModelReminderInput<P>): Promise<Outcome<PreparedReminders, ModelReminderFailure>>
  /** Drops what was told in this scope, after a compaction changed what the model sees. */
  forget(input: Readonly<{ tenant: TenantId; scope: ScopeRef }>): void
}>

export type ModelReminderPorts<P> = Readonly<{
  eligibility: ReaderEligibilityHandoff<P>
  runtimeContext: ReaderOperations
  descriptors: DescriptorCatalog
}>

type Told = Readonly<{ eligibility: EligibilityId; reader: ContextReader; snapshot: Snapshot }>
type Refusal = Exclude<SnapshotResult | ChangesResult, { kind: 'success' }>
type Answer<T> = Outcome<T, ModelReminderFailure>

const VISIBLE = { toHuman: true, toModel: true } as const

const down = (diagnostic: string): Answer<never> => fail({ kind: 'unavailable', diagnostic })

function failureOf(read: Refusal): Answer<never> {
  switch (read.kind) {
    case 'refused':
      return read.reason === 'unauthorized'
        ? fail({ kind: 'denied' })
        : down(`runtime context refused the read: ${read.reason}`)
    case 'missing':
      return down(`runtime context is missing ${read.items.map(item => item.key).join(', ')}`)
    case 'unknown':
      return down(`runtime context answered unknown: ${read.cause}`)
    case 'cursor-invalidated':
      return down('runtime context invalidated the cursor')
  }
}

function reminder(seed: readonly unknown[], text: string): SystemReminderMessage {
  const id = createHash('sha256')
    .update(JSON.stringify([...seed, text]))
    .digest('base64url')
  return {
    id: `msg_${id}` as MessageId,
    role: 'system_reminder',
    blocks: [{ kind: 'text', id: `blk_${id}` as BlockId, visibility: VISIBLE, text }],
  }
}

function applied(previous: Snapshot, changes: Changes): Snapshot {
  const blocks = new Map<string, BlockEntry>(previous.blocks.map(block => [block.key, block]))
  for (const entry of changes.entries)
    blocks.set(entry.key, { ...entry, volatility: blocks.get(entry.key)?.volatility ?? 'stable' })
  return {
    scope: changes.scope,
    viewRevision: changes.to,
    cursor: changes.cursor,
    blocks: [...blocks.values()],
    missing: changes.missing,
    perRequest: changes.perRequest,
  }
}

export function createModelReminders<P>(ports: ModelReminderPorts<P>): ModelReminders<P> {
  const told = new Map<string, Told>()

  const keyOf = (tenant: TenantId, scope: ScopeRef): string | null => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? JSON.stringify([text.value, scope.ref]) : null
  }

  async function eligibilityOf(input: ModelReminderInput<P>): Promise<Answer<EligibilityId>> {
    const handed = await ports.eligibility.current({
      principal: input.principal,
      tenant: input.tenant,
      scope: input.scope,
      consumer: 'model',
    })
    switch (handed.kind) {
      case 'current':
        return succeed(handed.eligibility)
      case 'refused':
        return fail({ kind: 'denied' })
      case 'absent':
        return down('the model has no reader eligibility in this scope')
      case 'unknown':
        return down('the reader eligibility of the model is unknown')
      case 'unavailable':
        return down(handed.diagnostic)
    }
  }

  async function bind(eligibility: EligibilityId): Promise<Answer<ContextReader>> {
    const bound = await ports.runtimeContext.bind(eligibility)
    switch (bound.kind) {
      case 'bound':
        return succeed(bound.reader)
      case 'refused':
        return bound.reason === 'unauthorized'
          ? fail({ kind: 'denied' })
          : down(`runtime context refused the reader: ${bound.reason}`)
      case 'unknown':
        return down(`runtime context answered unknown for the reader: ${bound.cause}`)
    }
  }

  function drop(key: string): void {
    const gone = told.get(key)
    told.delete(key)
    if (gone !== undefined) void gone.reader.end().catch(() => undefined)
  }

  return {
    async prepare(input) {
      const key = keyOf(input.tenant, input.scope)
      if (key === null) return fail({ kind: 'denied' })
      const eligibility = await eligibilityOf(input)
      if ('failure' in eligibility) return eligibility
      if (told.get(key)?.eligibility.eligibility !== eligibility.ok.eligibility) drop(key)
      const previous = told.get(key)
      let reader: ContextReader
      if (previous !== undefined) reader = previous.reader
      else {
        const bound = await bind(eligibility.ok)
        if ('failure' in bound) return bound
        reader = bound.ok
      }
      const prepared = (snapshot: Snapshot, text: string | null): PreparedReminders => ({
        messages:
          text === null
            ? []
            : [reminder([input.tenant, input.scope.ref, input.at, snapshot.viewRevision], text)],
        viewRevision: String(snapshot.viewRevision),
        advance: () => told.set(key, { eligibility: eligibility.ok, reader, snapshot }),
      })
      if (previous !== undefined) {
        const changes = await reader.changes(previous.snapshot.cursor)
        if (changes.kind === 'success') {
          if (changes.value.missing.length > 0)
            return failureOf({ kind: 'missing', items: changes.value.missing })
          const materials = diffForReminder({
            previous: previous.snapshot,
            next: changes.value,
            descriptors: ports.descriptors,
          })
          return succeed(
            prepared(
              applied(previous.snapshot, changes.value),
              renderChangeReminder(changes.value.entries, materials),
            ),
          )
        }
        if (changes.kind !== 'cursor-invalidated') return failureOf(changes)
      }
      const snapshot = await reader.snapshot()
      if (snapshot.kind !== 'success') return failureOf(snapshot)
      if (snapshot.value.missing.length > 0)
        return failureOf({ kind: 'missing', items: snapshot.value.missing })
      return succeed(prepared(snapshot.value, renderSnapshotReminder(snapshot.value.blocks)))
    },
    forget(input) {
      const key = keyOf(input.tenant, input.scope)
      if (key !== null) drop(key)
    },
  }
}
