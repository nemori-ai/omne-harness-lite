// The tenant-layer face of the settings (SPEC「租户层读写面」): list, describe, set and clear of the
// setting items of the assets a tenant holds, in the words of the domain. It checks the principal
// first and reads nothing before that. It orchestrates four ports that the assembly adapts: who the
// caller is, the catalog read of the settings, the permission rules, and the tenant-layer write. It
// keeps no value: every read is read now. It does not evaluate a permission; the permission port
// answers with the evaluation of the permission owner.
import { z } from 'zod'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SettingsChange, SettingsTarget } from './commands.ts'
import { valueValidator } from './definition.ts'
import { evaluateSettings, type SettingResolution } from './evaluation.ts'
import type { SettingsFailure, SettingsReadPort, SettingsTargetView } from './ports.ts'
import type { SettingsPreparedCommitResult } from './preparation.ts'
import { SettingsIdSchema, type SettingItem, type SettingPresence } from './schema.ts'

export type SettingJson = z.infer<ReturnType<typeof z.json>>
/** An asset the tenant holds, as a caller names it. The category may be left out. */
export type TenantSettingsAssetQuery = Readonly<{ category?: string; name: string }>
export type TenantSettingsAssetRef = Readonly<{ category: string; name: string }>
export type TenantSettingsAction = 'list' | 'describe' | 'set' | 'clear'

/** What a caller may write at the tenant layer. A permission item takes a pick only. */
export const SettingInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ordinary'), value: z.json() }),
  z.strictObject({ kind: z.literal('permission'), pick: SettingsIdSchema }),
  z.strictObject({ kind: z.literal('secret'), secret: z.string() }),
])
export type SettingInput = z.infer<typeof SettingInputSchema>

export type Presence = Readonly<{ kind: 'unset' }> | Readonly<{ kind: 'set'; value: SettingJson }>
export type Editable =
  | Readonly<{ kind: 'yes' }>
  | Readonly<{ kind: 'no'; reason: 'locked' | 'not-a-source' | 'prohibited-above' }>
export type SecretState = 'unset' | 'available' | 'revoked' | 'unreadable'
export type PermissionChoice = Readonly<{
  value: string
  label: string
  description: string
  permitsOperation: boolean
}>
export type PermissionEffective =
  | Readonly<{ kind: 'value'; value: string; source: 'default' | 'organization' | 'tenant' }>
  | Readonly<{ kind: 'prohibited'; by: 'organization' | 'tenant' }>
  | Readonly<{ kind: 'empty-bound' }>
/** The permission part of a view: what the permission port answers for one item. */
export type PermissionItemView = Readonly<{
  appliesAt: string
  choices: readonly PermissionChoice[]
  default: string
  /** The pick of the tenant layer. */
  own: string | null
  /** The result from the tenant layer outwards. A pick of one session is not in it. */
  effective: PermissionEffective
  /** The common allowed set; null when no layer locks one. */
  bound: readonly string[] | null
  editable: Editable
}>
export type SettingView = Readonly<{
  asset: TenantSettingsAssetRef
  item: string
  revision: string
  declaration: Readonly<{
    title: string
    purpose: string
    appliesAt: string
    clearEffect: string
  }>
}> &
  (
    | Readonly<{
        kind: 'ordinary'
        valueSchema: SettingJson
        default: Presence
        own: Presence
        effective: Readonly<{
          value: Presence
          source: 'default' | 'organization' | 'tenant' | null
        }>
        lockedBy: 'organization' | null
        editable: Editable
      }>
    | (Readonly<{ kind: 'permission' }> & Omit<PermissionItemView, 'appliesAt'>)
    | Readonly<{ kind: 'secret'; own: SecretState; official: SecretState; editable: Editable }>
  )

/** `denied` carries no reason and cannot be told from an absent target. */
export type ReadRefusal =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'not-visible' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unavailable' }>
/** `unavailable` is certainly not written; `unknown` may be written. */
export type WriteOutcome =
  | Readonly<{ kind: 'written'; revision: string }>
  | Readonly<{ kind: 'no-change' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'not-visible' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'not-writable'
      reason: 'locked' | 'out-of-bound' | 'prohibited-above' | 'not-a-source'
    }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type TenantSettingsListInput<P> = Readonly<{
  principal: P
  tenant: TenantId
  asset?: TenantSettingsAssetQuery
  /** The `next` text of the previous page. */
  after: string | null
  limit: number
}>
export type TenantSettingsItemInput<P> = Readonly<{
  principal: P
  tenant: TenantId
  asset: TenantSettingsAssetQuery
  item: string
}>
export type TenantSettingsWriteInput<P> = TenantSettingsItemInput<P> &
  Readonly<{
    /** The original operation of the caller. The same operation sent again recalls the same write. */
    operation: string
    /** The revision read from `list` or `describe`. */
    expectedRevision: string
  }>

export interface TenantSettings<P> {
  list(input: TenantSettingsListInput<P>): Promise<
    | Readonly<{
        kind: 'listed'
        items: readonly SettingView[]
        next: string | null
        completeness: 'complete' | 'partial'
      }>
    | ReadRefusal
  >
  describe(
    input: TenantSettingsItemInput<P>,
  ): Promise<Readonly<{ kind: 'described'; item: SettingView }> | ReadRefusal>
  set(input: TenantSettingsWriteInput<P> & Readonly<{ value: SettingInput }>): Promise<WriteOutcome>
  clear(input: TenantSettingsWriteInput<P>): Promise<WriteOutcome>
}

/** Whether the principal is the login principal of this tenant, with the right to the action now. */
export interface TenantSettingsPrincipals<P> {
  admit(
    input: Readonly<{ principal: P; tenant: TenantId; action: TenantSettingsAction }>,
  ): Promise<'allowed' | 'denied' | 'unavailable'>
}
/** The catalog read of the settings, in the management view of one tenant. */
export type TenantSettingsCatalog = SettingsReadPort<TenantId> &
  Readonly<{
    /** The asset a target stands for; undefined when the target is no holding of an asset. */
    assetOf(view: SettingsTargetView): TenantSettingsAssetRef | undefined
  }>
/** The rules of a permission item. The permission owner evaluates; the face only shows its answer. */
export interface TenantSettingsPermissions {
  kindOf(input: Readonly<{ view: SettingsTargetView; itemId: string }>): 'permission' | 'ordinary'
  view(
    input: Readonly<{ tenant: TenantId; view: SettingsTargetView; itemId: string }>,
  ): Promise<PermissionItemView | 'unavailable'>
  /** The stored value of the tenant layer with `pick`; the allowed set of the layer stays. */
  compose(
    input: Readonly<{ view: SettingsTargetView; itemId: string; pick: string }>,
  ): Readonly<{ kind: 'value'; value: SettingJson }> | Readonly<{ kind: 'invalid' }>
  /** The stored value after a clear: the pick goes; an allowed set of the layer stays. */
  cleared(
    input: Readonly<{ view: SettingsTargetView; itemId: string }>,
  ): Readonly<{ kind: 'clear' }> | Readonly<{ kind: 'value'; value: SettingJson }>
  /** Whether `pick` may be written under the current outer layers. */
  judge(
    input: Readonly<{ tenant: TenantId; view: SettingsTargetView; itemId: string; pick: string }>,
  ): Promise<'within' | 'out-of-bound' | 'unavailable'>
}
export type TenantSettingsWriteResult =
  | SettingsPreparedCommitResult
  | Readonly<{ kind: 'refused'; outcome: WriteOutcome }>
/**
 * The tenant-layer write: a preparation and its commit, one operation for the caller. The writer
 * calls `beforeWrite` only when the operation has no result yet; an operation that already has
 * one answers that result. A refusal of `beforeWrite` writes nothing.
 */
export interface TenantSettingsWriter {
  write(
    input: Readonly<{
      tenant: TenantId
      command: SettingsChange
      beforeWrite(): Promise<WriteOutcome | null>
    }>,
  ): Promise<TenantSettingsWriteResult>
}
export type TenantSettingsPorts<P> = Readonly<{
  deploymentRef: string
  principals: TenantSettingsPrincipals<P>
  catalog: TenantSettingsCatalog
  permissions: TenantSettingsPermissions
  writer: TenantSettingsWriter
}>

const LIST_LIMIT = 100
const REVISION = /^(0|[1-9][0-9]{0,14})$/
const OFFSET = /^(0|[1-9][0-9]{0,8})$/

type Entry = Readonly<{
  asset: TenantSettingsAssetRef
  view: SettingsTargetView
  item: SettingItem
  resolution: SettingResolution
}>
type Located = Readonly<{ kind: 'found'; entry: Entry }> | ReadRefusal

function sameAsset(ref: TenantSettingsAssetRef, query: TenantSettingsAssetQuery): boolean {
  return (
    ref.name === query.name && (query.category === undefined || ref.category === query.category)
  )
}
function presence(value: SettingPresence): Presence {
  return value.kind === 'absent' ? { kind: 'unset' } : { kind: 'set', value: value.value }
}
function tenantSourceOf(view: SettingsTargetView) {
  const sources = view.sources.filter(source => source.scope.kind === 'tenant')
  return sources.length === 1 ? sources[0] : undefined
}
function layerOf(view: SettingsTargetView, sourceId: string | null) {
  if (sourceId === null) return null
  if (sourceId === 'default') return 'default' as const
  const kind = view.sources.find(source => source.sourceId === sourceId)?.scope.kind
  return kind === 'tenant' || kind === 'organization' ? kind : null
}
function writable(view: SettingsTargetView, action: 'set' | 'clear') {
  const source = tenantSourceOf(view)
  if (source === undefined) return undefined
  const grant = view.grants.find(value => value.sourceId === source.sourceId)
  return grant?.actions.includes(action) === true ? source.sourceId : undefined
}
const ADOPTION_TEXT: Readonly<Record<SettingItem['presentation']['adoption'], string>> = {
  'next-read': 'Applies from the next read of the item.',
  'next-boundary': 'Applies from the next use boundary that the asset declares.',
  reload: 'Applies after the asset reloads.',
  creation: 'Applies to what is created after the change.',
}

function outcomeOf(result: TenantSettingsWriteResult): WriteOutcome {
  switch (result.kind) {
    case 'refused':
      return result.outcome
    case 'committed':
      return result.changed
        ? { kind: 'written', revision: String(result.revision) }
        : { kind: 'no-change' }
    case 'unknown':
      return { kind: 'unknown' }
    case 'aborted':
      return abortedOutcome(result.reason)
    case 'rejected':
      return rejectedOutcome(result.reason)
  }
}
function abortedOutcome(
  reason: Extract<SettingsPreparedCommitResult, { kind: 'aborted' }>['reason'],
): WriteOutcome {
  switch (reason) {
    case 'forbidden':
      return { kind: 'denied' }
    case 'revision_conflict':
    case 'definition_changed':
      return { kind: 'conflict' }
    case 'locked':
      return { kind: 'not-writable', reason: 'locked' }
    case 'incompatible':
      return { kind: 'invalid' }
    case 'cancelled':
    case 'sealed':
      return { kind: 'unavailable' }
  }
}
function rejectedOutcome(reason: SettingsFailure['reason']): WriteOutcome {
  switch (reason) {
    case 'invalid_input':
    case 'limit_exceeded':
    case 'incompatible':
      return { kind: 'invalid' }
    case 'forbidden':
      return { kind: 'denied' }
    case 'revision_conflict':
    case 'definition_changed':
    case 'operation_conflict':
      return { kind: 'conflict' }
    case 'locked':
      return { kind: 'not-writable', reason: 'locked' }
    case 'unsupported':
      return { kind: 'not-writable', reason: 'not-a-source' }
    case 'unavailable':
    case 'basis_changed':
    case 'closing':
      return { kind: 'unavailable' }
  }
}

export function createTenantSettings<P>(ports: TenantSettingsPorts<P>): TenantSettings<P> {
  const { principals, catalog, permissions, writer } = ports

  async function admit(principal: P, tenant: TenantId, action: TenantSettingsAction) {
    try {
      return await principals.admit({ principal, tenant, action })
    } catch {
      return 'unavailable' as const
    }
  }

  /** Every item of the tenant's assets, from one read of the catalog. */
  async function entries(tenant: TenantId) {
    let basis: Awaited<ReturnType<TenantSettingsCatalog['read']>>
    try {
      basis = await catalog.read(tenant, {
        deploymentRef: ports.deploymentRef,
        mode: 'management',
        targets: [],
        selectionRef: null,
      })
    } catch {
      return undefined
    }
    if ('kind' in basis) return undefined
    const found: Entry[] = []
    for (const view of basis.views) {
      const asset = catalog.assetOf(view)
      if (asset === undefined) continue
      const evaluated = evaluateSettings({
        definition: view.definition,
        sources: view.state.sources,
      })
      if (evaluated.kind !== 'complete') return undefined
      for (const item of view.definition.items) {
        const resolution = evaluated.entries.find(value => value.itemId === item.id)
        if (resolution === undefined) return undefined
        found.push({ asset, view, item, resolution })
      }
    }
    found.sort((a, b) => {
      const left = JSON.stringify([a.asset.category, a.asset.name, a.item.id])
      const right = JSON.stringify([b.asset.category, b.asset.name, b.item.id])
      return left < right ? -1 : left > right ? 1 : 0
    })
    return { entries: found, completeness: basis.completeness }
  }

  async function locate(
    tenant: TenantId,
    asset: TenantSettingsAssetQuery,
    itemId: string,
  ): Promise<Located> {
    const read = await entries(tenant)
    if (read === undefined) return { kind: 'unavailable' }
    const matches = read.entries.filter(
      entry => sameAsset(entry.asset, asset) && entry.item.id === itemId,
    )
    if (matches.length > 1) return { kind: 'conflict' }
    const entry = matches[0]
    if (entry === undefined)
      return read.completeness === 'complete' ? { kind: 'not-visible' } : { kind: 'unavailable' }
    return { kind: 'found', entry }
  }

  async function viewOf(tenant: TenantId, entry: Entry): Promise<SettingView | undefined> {
    const { asset, view, item, resolution } = entry
    const head = {
      asset,
      item: item.id,
      revision: String(view.state.revision),
    }
    const declaration = {
      title: item.presentation.title,
      purpose: item.presentation.description,
      appliesAt: ADOPTION_TEXT[item.presentation.adoption],
      clearEffect: item.presentation.clear,
    }
    if (item.sensitivity === 'secret')
      return {
        ...head,
        declaration,
        kind: 'secret',
        own: 'unreadable',
        official: 'unreadable',
        editable: { kind: 'no', reason: 'not-a-source' },
      }
    if (permissions.kindOf({ view, itemId: item.id }) === 'permission') {
      const permission = await permissions.view({ tenant, view, itemId: item.id })
      if (permission === 'unavailable') return undefined
      const { appliesAt, ...rest } = permission
      return { ...head, declaration: { ...declaration, appliesAt }, kind: 'permission', ...rest }
    }
    const tenantSource = tenantSourceOf(view)
    const own =
      tenantSource === undefined
        ? undefined
        : view.state.sources
            .find(source => source.id === tenantSource.sourceId)
            ?.values.find(value => value.itemId === item.id)?.value
    const lockedBy = layerOf(view, resolution.lockedBy)
    const lockedOutside =
      resolution.lockedBy !== null && resolution.lockedBy !== tenantSource?.sourceId
    const editable: Editable =
      writable(view, 'set') === undefined
        ? { kind: 'no', reason: 'not-a-source' }
        : lockedOutside
          ? { kind: 'no', reason: 'locked' }
          : { kind: 'yes' }
    return {
      ...head,
      declaration,
      kind: 'ordinary',
      valueSchema: item.valueSchema,
      default: presence(item.default),
      own: own === undefined ? { kind: 'unset' } : presence(own),
      effective: {
        value: presence(resolution.value),
        source: layerOf(view, resolution.source),
      },
      lockedBy: lockedBy === 'organization' ? 'organization' : null,
      editable,
    }
  }

  async function write(
    input: TenantSettingsWriteInput<P>,
    action: 'set' | 'clear',
    value: SettingInput | null,
  ): Promise<WriteOutcome> {
    const admitted = await admit(input.principal, input.tenant, action)
    if (admitted !== 'allowed') return { kind: admitted }
    const operation = SettingsIdSchema.safeParse(input.operation)
    const item = SettingsIdSchema.safeParse(input.item)
    if (!operation.success || !item.success || !REVISION.test(input.expectedRevision))
      return { kind: 'invalid' }
    const parsedValue = value === null ? null : SettingInputSchema.safeParse(value)
    if (parsedValue !== null && !parsedValue.success) return { kind: 'invalid' }
    const located = await locate(input.tenant, input.asset, item.data)
    if (located.kind !== 'found') return located
    const { entry } = located
    if (entry.item.sensitivity === 'secret') return { kind: 'not-writable', reason: 'not-a-source' }
    const sourceId = writable(entry.view, action)
    if (sourceId === undefined) return { kind: 'not-writable', reason: 'not-a-source' }
    if (entry.resolution.lockedBy !== null && entry.resolution.lockedBy !== sourceId)
      return { kind: 'not-writable', reason: 'locked' }
    const isPermission =
      permissions.kindOf({ view: entry.view, itemId: entry.item.id }) === 'permission'
    const planned = plan(entry, isPermission, parsedValue === null ? null : parsedValue.data)
    if (planned.kind === 'invalid') return planned
    const command: SettingsChange = {
      protocol: 'settings/1',
      requestId: operation.data,
      operationId: operation.data,
      target: structuredClone(entry.view.target) as SettingsTarget,
      definitionRef: structuredClone(entry.view.definitionRef),
      expectedRevision: Number(input.expectedRevision),
      sourceId,
      itemId: entry.item.id,
      action: planned.action,
    }
    const pick = planned.pick
    const beforeWrite = async (): Promise<WriteOutcome | null> => {
      if (pick === null) return null
      const judged = await permissions.judge({
        tenant: input.tenant,
        view: entry.view,
        itemId: entry.item.id,
        pick,
      })
      if (judged === 'within') return null
      return judged === 'out-of-bound'
        ? { kind: 'not-writable', reason: 'out-of-bound' }
        : { kind: 'unavailable' }
    }
    try {
      return outcomeOf(await writer.write({ tenant: input.tenant, command, beforeWrite }))
    } catch {
      return { kind: 'unknown' }
    }
  }

  type Planned =
    | Readonly<{ kind: 'invalid' }>
    | Readonly<{ kind: 'planned'; action: SettingsChange['action']; pick: string | null }>
  function plan(entry: Entry, isPermission: boolean, value: SettingInput | null): Planned {
    const target = { view: entry.view, itemId: entry.item.id }
    if (value === null) {
      if (!isPermission) return { kind: 'planned', action: { kind: 'clear' }, pick: null }
      const cleared = permissions.cleared(target)
      return {
        kind: 'planned',
        action: cleared.kind === 'clear' ? cleared : { kind: 'set', value: cleared.value },
        pick: null,
      }
    }
    if (isPermission) {
      if (value.kind !== 'permission') return { kind: 'invalid' }
      const composed = permissions.compose({ ...target, pick: value.pick })
      return composed.kind === 'invalid'
        ? composed
        : { kind: 'planned', action: { kind: 'set', value: composed.value }, pick: value.pick }
    }
    if (value.kind !== 'ordinary') return { kind: 'invalid' }
    const validate = valueValidator(entry.item)
    if (validate === undefined || !validate(value.value)) return { kind: 'invalid' }
    return { kind: 'planned', action: { kind: 'set', value: value.value }, pick: null }
  }

  const face: TenantSettings<P> = {
    async list(input) {
      const admitted = await admit(input.principal, input.tenant, 'list')
      if (admitted !== 'allowed') return { kind: admitted }
      const offset = input.after === null ? 0 : OFFSET.test(input.after) ? Number(input.after) : -1
      if (offset < 0) return { kind: 'unavailable' }
      const limit = Math.min(Math.max(Math.trunc(input.limit) || 1, 1), LIST_LIMIT)
      const read = await entries(input.tenant)
      if (read === undefined) return { kind: 'unavailable' }
      const { asset } = input
      const selected = read.entries.filter(
        entry => asset === undefined || sameAsset(entry.asset, asset),
      )
      const page = selected.slice(offset, offset + limit)
      const items: SettingView[] = []
      for (const entry of page) {
        const view = await viewOf(input.tenant, entry)
        if (view === undefined) return { kind: 'unavailable' }
        items.push(view)
      }
      return {
        kind: 'listed',
        items,
        next: offset + limit < selected.length ? String(offset + limit) : null,
        completeness: read.completeness,
      }
    },
    async describe(input) {
      const admitted = await admit(input.principal, input.tenant, 'describe')
      if (admitted !== 'allowed') return { kind: admitted }
      const located = await locate(input.tenant, input.asset, input.item)
      if (located.kind !== 'found') return located
      const item = await viewOf(input.tenant, located.entry)
      return item === undefined ? { kind: 'unavailable' } : { kind: 'described', item }
    },
    set: input => write(input, 'set', input.value),
    clear: input => write(input, 'clear', null),
  }
  return Object.freeze(face)
}
