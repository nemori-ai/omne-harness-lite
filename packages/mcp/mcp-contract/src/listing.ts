import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { isActionName, isDefinitionDigest, type DefinitionDigest } from './brands.ts'
import type { AdoptionBasis, ExpectedRevision, Freshness } from './catalog.ts'
import { digestOf } from './digest.ts'
import { canonical, isObject, member, textOf, without, type JsonObject } from './json.ts'
import type { ListingPage, TransportFailure } from './transport.ts'
import type { ActionDefinition } from './values.ts'

declare const complete: unique symbol

export type ListedAction = Readonly<{ definition: ActionDefinition; digest: DefinitionDigest }>

type ListingFields = Readonly<{
  actions: readonly ListedAction[]
  basis: AdoptionBasis
  freshness: Freshness
  basedOn: ExpectedRevision
}>

export type CompleteListing = ListingFields & { readonly [complete]: true }

export type ListingDefect =
  | 'page-failed'
  | 'pages-unfinished'
  | 'page-limit-exceeded'
  | 'action-limit-exceeded'
  | 'action-invalid'
  | 'duplicate-action-name'

const built = new WeakSet<object>()

function register(fields: ListingFields): asserts fields is CompleteListing {
  built.add(fields)
}

export function assertComplete(listing: CompleteListing): void {
  if (!built.has(listing)) throw new TypeError('the listing did not come from completeListing')
}

function actionDefinitionOf(raw: JsonValue): ActionDefinition | undefined {
  if (!isObject(raw)) return undefined
  const name = textOf(member(raw, 'name'))
  const outputSchema = member(raw, 'outputSchema')
  const annotations = member(raw, 'annotations')
  if (!isActionName(name) || !isObject(member(raw, 'inputSchema'))) return undefined
  if (outputSchema !== undefined && !isObject(outputSchema)) return undefined
  if (annotations !== undefined && !isObject(annotations)) return undefined
  return Object.freeze({
    name,
    ...(outputSchema === undefined ? {} : { outputSchema }),
    definition: without(raw, 'annotations'),
    ...(annotations === undefined
      ? {}
      : { annotations: Object.freeze({ untrusted: annotations }) }),
  })
}

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
  return digestOf(writeJsonText(canonical(whole)), isDefinitionDigest)
}

export type ListingRead = Readonly<{
  pages: readonly Outcome<ListingPage, TransportFailure>[]
  basis: AdoptionBasis
  acquiredAt: string
  limits: Readonly<{ maxPages: number; maxActions: number }>
  basedOn: ExpectedRevision
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

function freshnessOf(pages: readonly ListingPage[], acquiredAt: string): Freshness {
  const hints = pages.flatMap(page => (page.ttlMs === undefined ? [] : [page.ttlMs]))
  return hints.length === 0
    ? Object.freeze({ acquiredAt, changedNotified: false })
    : Object.freeze({ acquiredAt, ttlMs: Math.min(...hints), changedNotified: false })
}

export function completeListing(read: ListingRead): Outcome<CompleteListing, ListingDefect> {
  const defect = pagesDefect(read.pages, read.limits.maxPages)
  if (defect !== undefined) return fail(defect)
  const pages = read.pages.flatMap(page => ('ok' in page ? [page.ok] : []))
  const tools = pages.flatMap(page => page.tools)
  if (tools.length > read.limits.maxActions) return fail('action-limit-exceeded')
  const actions: ListedAction[] = []
  for (const tool of tools) {
    const definition = actionDefinitionOf(tool)
    if (definition === undefined) return fail('action-invalid')
    if (actions.some(action => action.definition.name === definition.name))
      return fail('duplicate-action-name')
    actions.push(Object.freeze({ definition, digest: digestDefinition(definition) }))
  }
  const listing = Object.freeze({
    actions: Object.freeze(actions),
    basis: Object.freeze({ ...read.basis }),
    freshness: freshnessOf(pages, read.acquiredAt),
    basedOn: read.basedOn,
  })
  register(listing)
  return succeed(listing)
}
