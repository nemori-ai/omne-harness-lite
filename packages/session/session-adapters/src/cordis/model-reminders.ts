import type { StepDirectory } from './working-directory-step.ts'
import { createHash } from 'node:crypto'
import { missingGuidanceBlocks } from './guidance-window.ts'
import {
  workspaceGuidanceSchema,
  workspaceGuidanceDescriptor,
  type WorkspaceGuidance,
} from '../workspace-guidance.ts'
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

export type ModelHistoryProjection = Readonly<{ epoch: string; blocks: readonly string[] }>

export type PreparedReminders = Readonly<{
  projection?: ModelHistoryProjection
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
  qualifyHistory?: NonNullable<StepDirectory<P>['qualifyHistory']>
  inspectHistory?: NonNullable<StepDirectory<P>['inspectHistory']>
  eligibility: ReaderEligibilityHandoff<P>
  runtimeContext: ReaderOperations
  descriptors: DescriptorCatalog
  history?(
    input: ModelReminderInput<P>,
    partition: string,
    previous?: GuidanceHistory,
  ): Promise<Answer<GuidanceHistory>>
}>

type Told = Readonly<{
  window?: GuidanceHistory
  eligibility: EligibilityId
  reader: ContextReader
  snapshot: Snapshot
}>
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

async function projectionFor<P>(
  ports: ModelReminderPorts<P>,
  input: ModelReminderInput<P>,
  history: GuidanceHistory,
  current: Exclude<WorkspaceGuidance, { state: 'unavailable' }>,
): Promise<Answer<readonly string[]>> {
  const required =
    current.state === 'attached'
      ? [{ workspace: current.workspace, instance: current.instance, root: current.root }]
      : []
  if (ports.inspectHistory === undefined) {
    const qualified = await ports.qualifyHistory?.(input, history.index.scopes)
    return qualified && 'failure' in qualified ? qualified : succeed([])
  }
  const inspected = await ports.inspectHistory(input, [
    ...history.index.scopes,
    ...history.summarizedScopes,
    ...required,
  ])
  if ('failure' in inspected) return inspected
  const key = (scope: { workspace: string; instance: string }) =>
    JSON.stringify([scope.workspace, scope.instance])
  const denied = new Set(inspected.ok.map(key))
  if (required.some(scope => denied.has(key(scope)))) return fail({ kind: 'denied' })
  if (history.summarizedScopes.some(scope => denied.has(key(scope))))
    return down(
      'compacted workspace guidance includes a refused source without a separable original; rebuild the summary from qualified originals',
    )
  return succeed(
    [...history.index.sourceScopes]
      .filter(([, scope]) => denied.has(key(scope)))
      .map(([block]) => block),
  )
}

async function eligibilityOf<P>(
  ports: ModelReminderPorts<P>,
  input: ModelReminderInput<P>,
): Promise<Answer<EligibilityId>> {
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

async function bind<P>(
  ports: ModelReminderPorts<P>,
  eligibility: EligibilityId,
): Promise<Answer<ContextReader>> {
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

export function createModelReminders<P>(ports: ModelReminderPorts<P>): ModelReminders<P> {
  const told = new Map<string, Told>()

  const keyOf = (tenant: TenantId, scope: ScopeRef): string | null => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? JSON.stringify([text.value, scope.ref]) : null
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
      const eligibility = await eligibilityOf(ports, input)
      if ('failure' in eligibility) return eligibility
      if (told.get(key)?.eligibility.eligibility !== eligibility.ok.eligibility) drop(key)
      const previous = told.get(key)
      let reader: ContextReader
      if (previous !== undefined) reader = previous.reader
      else {
        const bound = await bind(ports, eligibility.ok)
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
        let window: GuidanceHistory | undefined
        if (state?.kind === 'value') {
          const scope = workspaceGuidanceSchema.safeParse(state.value)
          if (!scope.success) return down('invalid workspace guidance value')
          if (scope.data.state === 'unavailable')
            return down(
              `workspace guidance ${scope.data.path} (${scope.data.reason}): ${scope.data.diagnostic}`,
            )
          const history = await ports.history?.(input, key, previous?.window)
          if (history === undefined)
            return down('the current model view for workspace guidance is unavailable')
          if ('failure' in history) return history
          const projection = await projectionFor(ports, input, history.ok, scope.data)
          if ('failure' in projection) return projection
          if (projection.ok.length > 0)
            return succeed({
              projection: { epoch: history.ok.basis.epoch, blocks: projection.ok },
              modelView: history.ok.basis,
              messages: [],
              viewRevision: String(snapshot.viewRevision),
              advance() {},
            })
          window = history.ok
          guidance = missingGuidanceBlocks(scope.data, history.ok.index, key)
        }
        return succeed({
          ...(window === undefined ? {} : { modelView: window.basis }),
          messages: reminderMessages(
            [input.tenant, input.scope.ref, input.at, snapshot.viewRevision],
            text,
            guidance,
          ),
          viewRevision: String(snapshot.viewRevision),
          advance: () =>
            told.set(key, {
              eligibility: eligibility.ok,
              reader,
              snapshot,
              ...(window === undefined ? {} : { window }),
            }),
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
