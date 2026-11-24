import { createHash } from 'node:crypto'
import { guidanceBlocks } from './guidance-window.ts'
import { workspaceGuidanceSchema, workspaceGuidanceDescriptor } from '../workspace-guidance.ts'
import type { GuidanceHistory } from './guidance-history.ts'
import type { ModelViewBasis, SessionId } from '@omne-harness/session-contract'
import type { BlockId, TextContentBlock } from '@omne-harness/content-block'
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
  modelView?: ModelViewBasis
  messages: readonly SystemReminderMessage[]
  /** The view revision the reminder tells; it names the source of the reminder commit. */
  viewRevision: string
  /** Called after the reminder commit is accepted; never on a refusal or an unknown answer. */
  advance(): void
}>

export type ModelReminderInput<P> = Readonly<{
  session?: SessionId
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
  history?(input: ModelReminderInput<P>): Promise<Answer<GuidanceHistory>>
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

function reminderMessages(
  seed: readonly unknown[],
  text: string | null,
  guidance: readonly TextContentBlock[],
): readonly SystemReminderMessage[] {
  const id = createHash('sha256')
    .update(JSON.stringify([...seed, text, ...guidance.map(block => block.id)]))
    .digest('base64url')
  const [first, ...rest] =
    text === null
      ? guidance
      : [
          { kind: 'text' as const, id: `blk_${id}` as BlockId, visibility: VISIBLE, text },
          ...guidance,
        ]
  return first === undefined
    ? []
    : [{ id: `msg_${id}` as MessageId, role: 'system_reminder', blocks: [first, ...rest] }]
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
    perRead: changes.perRead,
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
      const prepared = async (
        snapshot: Snapshot,
        text: string | null,
      ): Promise<Answer<PreparedReminders>> => {
        const state = snapshot.blocks.find(
          block => block.key === workspaceGuidanceDescriptor.key,
        )?.state
        let guidance: readonly TextContentBlock[] = []
        let modelView: ModelViewBasis | undefined
        if (state?.kind === 'value') {
          const scope = workspaceGuidanceSchema.safeParse(state.value)
          if (!scope.success) return down('invalid workspace guidance value')
          const history = await ports.history?.(input)
          if (history === undefined)
            return down('the current model view for workspace guidance is unavailable')
          if ('failure' in history) return history
          modelView = history.ok.basis
          guidance = guidanceBlocks(scope.data, history.ok.messages, key)
        }
        return succeed({
          ...(modelView === undefined ? {} : { modelView }),
          messages: reminderMessages(
            [input.tenant, input.scope.ref, input.at, snapshot.viewRevision],
            text,
            guidance,
          ),
          viewRevision: String(snapshot.viewRevision),
          advance: () => told.set(key, { eligibility: eligibility.ok, reader, snapshot }),
        })
      }
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
          return prepared(
            applied(previous.snapshot, changes.value),
            renderChangeReminder(
              changes.value.entries,
              materials.filter(item => item.key !== workspaceGuidanceDescriptor.key),
            ),
          )
        }
        if (changes.kind !== 'cursor-invalidated') return failureOf(changes)
      }
      const snapshot = await reader.snapshot()
      if (snapshot.kind !== 'success') return failureOf(snapshot)
      if (snapshot.value.missing.length > 0)
        return failureOf({ kind: 'missing', items: snapshot.value.missing })
      return prepared(
        snapshot.value,
        renderSnapshotReminder(
          snapshot.value.blocks.filter(item => item.key !== workspaceGuidanceDescriptor.key),
        ),
      )
    },
    forget(input) {
      const key = keyOf(input.tenant, input.scope)
      if (key !== null) drop(key)
    },
  }
}
