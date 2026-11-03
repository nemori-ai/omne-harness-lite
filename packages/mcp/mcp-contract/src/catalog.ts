// The MCP action catalog and its known actions. The catalog lives in the catalog store and is
// written whole under a revision condition, so it is an immutable record with pure transitions.
import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical, isObject, member, textOf, without, type JsonObject } from './json.ts'
import type { ListingPage, TransportFailure } from './transport.ts'
import {
  isActionName,
  isCatalogRevision,
  isDefinitionDigest,
  type ActionDefinition,
  type ActionName,
  type CatalogRevision,
  type DefinitionDigest,
  type Generation,
  type ProtocolVersion,
  type TaskSupport,
} from './values.ts'

/** Why a known action is unavailable. The set is closed. */
export type UnavailableReason =
  | 'no-longer-offered'
  | 'connection-unavailable'
  | 'authorization-required'
  | 'credential-unavailable'
  | 'landing-unavailable'

export type Availability =
  | Readonly<{ kind: 'available' }>
  | Readonly<{ kind: 'unavailable'; reason: UnavailableReason }>

/** A known action. In its catalog the action name is its identity. */
export type KnownAction = Readonly<{
  name: ActionName
  lastLawful: ActionDefinition
  definitionDigest: DefinitionDigest
  availability: Availability
}>

/** The basis of one adoption: the connection generation, protocol version and capabilities. */
export type AdoptionBasis = Readonly<{
  generation: Generation
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
}>

/** When the listing was acquired, the shortest freshness hint of its pages, and later news. */
export type Freshness = Readonly<{
  acquiredAt: string
  ttlMs?: number
  changedNotified: boolean
}>

/** An acquired catalog. The actions are sorted by name and the names are unique. */
export type ActionCatalogRecord = Readonly<{
  revision: CatalogRevision
  basis: AdoptionBasis
  freshness: Freshness
  actions: readonly KnownAction[]
}>

/** Not acquired and acquired are two states. Not acquired is not a catalog of zero actions. */
export type CatalogState =
  | Readonly<{ kind: 'not-acquired' }>
  | Readonly<{ kind: 'acquired'; record: ActionCatalogRecord }>

/** The revision that a conditional write expects. A key never written expects `absent`. */
export type ExpectedRevision = CatalogRevision | 'absent'

const COMPLETE: unique symbol = Symbol('complete-listing')
// The listings that completeListing built. A copy carries the symbol but is not in this set.
const built = new WeakSet<CompleteListing>()

/** One complete, lawful listing without repeated names. Only `completeListing` builds it. */
export type CompleteListing = Readonly<{
  actions: readonly Readonly<{ definition: ActionDefinition; digest: DefinitionDigest }>[]
  basis: AdoptionBasis
  freshness: Freshness
  [COMPLETE]: true
}>

/** Why a listing is not complete. The set is closed. */
export type ListingDefect =
  | 'page-failed'
  | 'pages-unfinished'
  | 'page-limit-exceeded'
  | 'action-limit-exceeded'
  | 'action-invalid'
  | 'duplicate-action-name'

export type MergeRefusal = 'stale-revision' | 'not-complete'

const TASK_SUPPORT: readonly TaskSupport[] = ['forbidden', 'optional', 'required']

function taskSupportOf(definition: JsonObject): TaskSupport | undefined {
  const execution = member(definition, 'execution')
  if (execution === undefined) return 'forbidden'
  if (!isObject(execution)) return undefined
  const value = member(execution, 'taskSupport')
  if (value === undefined) return 'forbidden'
  return TASK_SUPPORT.find(known => known === textOf(value))
}

/** Reads one peer tool object. MCP checks only what it reads and keeps the rest as written. */
function actionDefinitionOf(raw: JsonValue): ActionDefinition | undefined {
  if (!isObject(raw)) return undefined
  const name = textOf(member(raw, 'name'))
  const taskSupport = taskSupportOf(raw)
  const outputSchema = member(raw, 'outputSchema')
  const annotations = member(raw, 'annotations')
  if (!isActionName(name) || taskSupport === undefined) return undefined
  if (!isObject(member(raw, 'inputSchema'))) return undefined
  if (outputSchema !== undefined && !isObject(outputSchema)) return undefined
  if (annotations !== undefined && !isObject(annotations)) return undefined
  return {
    name,
    taskSupport,
    ...(outputSchema === undefined ? {} : { outputSchema }),
    definition: without(raw, 'annotations'),
    ...(annotations === undefined ? {} : { annotations: { untrusted: annotations } }),
  }
}

/**
 * The SHA-256 digest of the canonical JSON text of the definition as the peer wrote it,
 * annotations included. Member order does not change it; a number lexeme does.
 */
export function digestDefinition(definition: ActionDefinition): DefinitionDigest {
  const entries = isObject(definition.definition) ? definition.definition.entries : []
  const whole: JsonObject = {
    kind: 'object',
    entries: [
      ...entries,
      ...(definition.annotations === undefined
        ? []
        : [{ key: 'annotations', value: definition.annotations.untrusted }]),
    ],
  }
  const text = writeJsonText(canonical(whole))
  const digest = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
  if (!isDefinitionDigest(digest)) throw new TypeError('SHA-256 did not give 64 hex digits')
  return digest
}

export type ListingRead = Readonly<{
  pages: readonly Outcome<ListingPage, TransportFailure>[]
  basis: AdoptionBasis
  acquiredAt: string
  limits: Readonly<{ maxPages: number; maxActions: number }>
}>

function pagesDefect(
  pages: readonly Outcome<ListingPage, TransportFailure>[],
  maxPages: number,
): ListingDefect | undefined {
  if (pages.some(page => 'failure' in page)) return 'page-failed'
  if (pages.length > maxPages) return 'page-limit-exceeded'
  const last = pages.at(-1)
  if (last === undefined || ('ok' in last && last.ok.nextCursor !== undefined))
    return pages.length >= maxPages ? 'page-limit-exceeded' : 'pages-unfinished'
  return undefined
}

/**
 * Builds a complete listing from the pages of one acquisition. Any failed page discards the
 * whole acquisition, earlier pages included. The listing is complete only when the last page
 * names no next page, every tool is a lawful definition, and no action name repeats.
 */
export function completeListing(read: ListingRead): Outcome<CompleteListing, ListingDefect> {
  const defect = pagesDefect(read.pages, read.limits.maxPages)
  if (defect !== undefined) return fail(defect)
  const pages = read.pages.flatMap(page => ('ok' in page ? [page.ok] : []))
  const tools = pages.flatMap(page => page.tools)
  if (tools.length > read.limits.maxActions) return fail('action-limit-exceeded')
  const actions: { definition: ActionDefinition; digest: DefinitionDigest }[] = []
  for (const tool of tools) {
    const definition = actionDefinitionOf(tool)
    if (definition === undefined) return fail('action-invalid')
    if (actions.some(action => action.definition.name === definition.name))
      return fail('duplicate-action-name')
    actions.push({ definition, digest: digestDefinition(definition) })
  }
  const hints = pages.flatMap(page => (page.ttlMs === undefined ? [] : [page.ttlMs]))
  const freshness: Freshness =
    hints.length === 0
      ? { acquiredAt: read.acquiredAt, changedNotified: false }
      : { acquiredAt: read.acquiredAt, ttlMs: Math.min(...hints), changedNotified: false }
  const listing: CompleteListing = Object.freeze({
    actions,
    basis: read.basis,
    freshness,
    [COMPLETE]: true as const,
  })
  built.add(listing)
  return succeed(listing)
}

function nextRevision(previous: CatalogRevision | undefined): CatalogRevision {
  const next = (previous ?? 0) + 1
  if (!isCatalogRevision(next)) throw new RangeError('the catalog revision is exhausted')
  return next
}

function byName(left: KnownAction, right: KnownAction): number {
  if (left.name < right.name) return -1
  return left.name > right.name ? 1 : 0
}

/**
 * The adoption algorithm. It accepts only a listing that `completeListing` built, and only when
 * the current revision is the revision the listing is based on. Offered actions become
 * available with their new definition; a known action that the peer no longer offers stays,
 * with its last lawful definition, as unavailable. The result is a whole new record whose
 * revision is one higher. Connection generations are not compared here.
 */
export function mergeListing(
  current: CatalogState,
  listing: CompleteListing,
  basedOn: ExpectedRevision,
): Outcome<ActionCatalogRecord, MergeRefusal> {
  if (!built.has(listing)) return fail('not-complete')
  const previous = current.kind === 'acquired' ? current.record : undefined
  if ((previous?.revision ?? 'absent') !== basedOn) return fail('stale-revision')
  const offered: KnownAction[] = listing.actions.map(({ definition, digest }) => ({
    name: definition.name,
    lastLawful: definition,
    definitionDigest: digest,
    availability: { kind: 'available' },
  }))
  const kept: KnownAction[] = (previous?.actions ?? [])
    .filter(known => !offered.some(action => action.name === known.name))
    .map(known => ({
      ...known,
      availability: { kind: 'unavailable', reason: 'no-longer-offered' },
    }))
  return succeed({
    revision: nextRevision(previous?.revision),
    basis: listing.basis,
    freshness: listing.freshness,
    actions: [...offered, ...kept].sort(byName),
  })
}

/**
 * Marks every known action unavailable for a connection, credential, authorization or landing
 * reason. An action that the peer no longer offers keeps that reason. Definitions stay; the
 * revision is one higher.
 */
export function markUnavailable(
  record: ActionCatalogRecord,
  reason: Exclude<UnavailableReason, 'no-longer-offered'>,
): ActionCatalogRecord {
  return {
    ...record,
    revision: nextRevision(record.revision),
    actions: record.actions.map(known =>
      known.availability.kind === 'unavailable' && known.availability.reason === 'no-longer-offered'
        ? known
        : { ...known, availability: { kind: 'unavailable', reason } },
    ),
  }
}

/**
 * The per-action permission items, `execute:<action name>`, one for each known action whether
 * available or not. Before a catalog is acquired there are none, and that is not zero actions.
 */
export function actionPermissionItems(state: CatalogState): readonly string[] | 'not-acquired' {
  if (state.kind === 'not-acquired') return 'not-acquired'
  return state.record.actions.map(known => `execute:${known.name}`)
}
