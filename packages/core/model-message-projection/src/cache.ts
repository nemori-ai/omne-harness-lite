import { copyJsonValue, writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  checkSourceToken,
  compareInteger,
  sourceTokenEquals,
  checkLogPayload,
  type SourceToken,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkedRules } from './key.ts'
import { appendSegments, cold, ownedEntries, projection } from './projection.ts'
import { ingest, type IndexState } from './index-state.ts'
import type {
  CacheOwner,
  ExtensionInput,
  Projection,
  ProjectionFailure,
  ProjectionInput,
  CacheOptions,
  RebuildRequired,
  ProjectionRules,
} from './types.ts'
interface Held {
  readonly limits: CacheOptions['limits']
  bytes: number
  readonly state: IndexState
  view: Projection
  usable: boolean
  busy: boolean
}
const owners = new WeakMap<CacheOwner, Held>()
const invalid = { invalidInput: true, reason: 'shape' } as const
function rebuild(reason: RebuildRequired['reason']): RebuildRequired {
  return { rebuildRequired: true, reason }
}
function jsonBytes(value: JsonValue): number {
  return new TextEncoder().encode(writeJsonLossless(value)).byteLength
}
function limitsFrom(options: CacheOptions): CacheOptions['limits'] | undefined {
  if (options === null || typeof options !== 'object') return
  const descriptor = Object.getOwnPropertyDescriptor(options, 'limits')
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) return
  return checkedLimits(descriptor.value)
}
function checkedLimits(value: unknown): CacheOptions['limits'] | undefined {
  const copied = copyJsonValue(value)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok)
  )
    return
  const limits = copied.ok as unknown as CacheOptions['limits']
  if (
    Object.keys(limits).length !== 3 ||
    !['entries', 'blocks', 'bytes'].every(key => Object.hasOwn(limits, key))
  )
    return
  return Object.values(limits).every(value => Number.isSafeInteger(value) && value > 0)
    ? limits
    : undefined
}

export function createProjectionCache(
  input: ProjectionInput,
  options: CacheOptions,
): { readonly ready: CacheOwner; readonly projected: Projection } | ProjectionFailure {
  const limits = limitsFrom(options)
  if (limits === undefined) return invalid
  const ownedInput = copyJsonValue(input)
  if ('failed' in ownedInput) return invalid
  const bytes = jsonBytes(ownedInput.ok)
  if (bytes > limits.bytes) return { unavailable: true, reason: 'capacity' }
  const result = cold(input, options)
  if (!('projected' in result)) return result
  if (result.state.rules.external === null) return { unavailable: true, reason: 'requiredSource' }
  if (result.state.entries > limits.entries || result.state.blocks > limits.blocks)
    return { unavailable: true, reason: 'capacity' }
  const owner = Object.freeze({}) as CacheOwner
  owners.set(owner, {
    limits,
    bytes,
    state: result.state,
    view: result.projected,
    usable: true,
    busy: false,
  })
  return { ready: owner, projected: result.projected }
}
interface CapturedExtension {
  readonly source: SourceToken
  readonly entries: readonly LogEntry[]
  readonly rules: ProjectionRules
  readonly key: string
  readonly addedBytes: number
}
function captureExtension(input: ExtensionInput): CapturedExtension | ProjectionFailure {
  const copy = copyJsonValue(input)
  if ('failed' in copy || copy.ok === null || typeof copy.ok !== 'object' || Array.isArray(copy.ok))
    return invalid
  const value = copy.ok as unknown as ExtensionInput
  if (
    Object.keys(value).length !== 3 ||
    !['source', 'entries', 'rules'].every(key => Object.hasOwn(value, key))
  )
    return invalid
  const checked = checkSourceToken(value.source),
    rules = checkedRules(value.rules)
  if ('failure' in checked) return invalid
  if (!('rules' in rules)) return rules
  if (!Array.isArray(value.entries)) return invalid
  return {
    source: checked.ok,
    entries: value.entries,
    rules: rules.rules,
    key: rules.key,
    addedBytes: jsonBytes(value.entries as unknown as JsonValue),
  }
}
function invalidation(held: Held, value: CapturedExtension): RebuildRequired | undefined {
  const source = value.source,
    previous = held.view.source
  if (
    !tenantIdEquals(source.tenant, previous.tenant) ||
    source.session !== previous.session ||
    source.journalGeneration !== previous.journalGeneration
  )
    return rebuild('generation')
  if (value.rules.version !== held.state.rules.version) return rebuild('rule')
  if (value.key !== held.view.inputKey) return rebuild('external')
}
function delta(
  held: Held,
  value: CapturedExtension,
): { readonly entries: readonly LogEntry[] } | ProjectionFailure | RebuildRequired {
  if (
    held.state.entries + value.entries.length > held.limits.entries ||
    held.bytes + value.addedBytes > held.limits.bytes
  )
    return rebuild('capacity')
  if (compareInteger(value.source.tail, held.view.source.tail) <= 0) return rebuild('gap')
  const owned = ownedEntries(value.entries, value.source, held.state.entries)
  if (!('entries' in owned)) return rebuild('gap')
  // Older segment selection can change. Preserve the old view and require one linear rebuild.
  for (const entry of owned.entries) {
    const checked = checkLogPayload(entry.payload)
    if ('failure' in checked) return { invalidInput: true, reason: 'claimedPayload' }
    if (
      checked.kind === 'message' &&
      checked.payload.value.type === 'compaction' &&
      checked.payload.value.silenced.length > 0
    )
      return rebuild('impactUnknown')
  }
  return owned
}
function appendDelta(
  held: Held,
  value: CapturedExtension,
  entries: readonly LogEntry[],
):
  | { readonly projected: Projection; readonly reusedSegments: Projection['segments'] }
  | ProjectionFailure
  | RebuildRequired {
  const previous = held.view,
    appended = []
  for (const entry of entries) {
    const failure = ingest(held.state, entry)
    if (failure !== undefined) {
      held.usable = false
      return failure
    }
    const payload = checkLogPayload(entry.payload)
    if ('kind' in payload && payload.kind === 'message')
      appended.push(held.state.messages.get(payload.payload.value.id)!)
  }
  if (held.state.blocks > held.limits.blocks) {
    held.usable = false
    return rebuild('capacity')
  }
  const selected = appendSegments(previous.segments, appended, held.state)
  if (!('segments' in selected)) {
    held.usable = false
    return selected
  }
  held.bytes += value.addedBytes
  held.view = projection(held.state, value.source, previous.inputKey, selected.segments)
  return { projected: held.view, reusedSegments: previous.segments }
}
export function extendProjection(
  owner: CacheOwner,
  input: ExtensionInput,
):
  | { readonly projected: Projection; readonly reusedSegments: Projection['segments'] }
  | ProjectionFailure
  | RebuildRequired {
  const held = owners.get(owner)
  if (held === undefined || held.busy) return invalid
  if (!held.usable) return rebuild('corrupt')
  const value = captureExtension(input)
  if (!('addedBytes' in value)) return value
  const failure = invalidation(held, value)
  if (failure !== undefined) return failure
  if (sourceTokenEquals(value.source, held.view.source) && value.entries.length === 0)
    return { projected: held.view, reusedSegments: held.view.segments }
  const checked = delta(held, value)
  if (!('entries' in checked)) return checked
  held.busy = true
  try {
    return appendDelta(held, value, checked.entries)
  } catch (error) {
    held.usable = false
    throw error
  } finally {
    held.busy = false
  }
}
export function releaseProjectionCache(
  owner: CacheOwner,
): { readonly released: true } | ProjectionFailure {
  const held = owners.get(owner)
  if (held === undefined || held.busy) return invalid
  owners.delete(owner)
  return { released: true }
}
