import {
  candidates,
  mostSpecific,
  type Contract,
  type Entry,
  type Placed,
  type Registry,
  type Scope,
} from '@omne-harness/dynamis'
import { PART_ATTRIBUTE, PARTS_POINT, partsOn, type DeclaredPart, type PartRender } from './part.ts'

export const TOKENS_POINT = 'shell.tokens'
export const STYLE_POINT = 'shell.part-style'
export const RENDER_POINT = 'shell.part-render'
export const LAYOUT_POINT = 'shell.layout'

const APP = 'shell.app'
const LAYER = 'omne-changes'
const TENANT = 'tenant'

export type TokensItem = Readonly<{
  tokens: Readonly<Record<string, string>>
  builtIn?: boolean
}>

const STATES = ['hover', 'focus-visible', 'active', 'selected', 'open', 'disabled'] as const

export type PartState = (typeof STATES)[number]

export type PartStyle = Readonly<
  Partial<Record<'base' | PartState, Readonly<Record<string, string>>>>
>

export type StyleItem = Readonly<{ style: PartStyle }>

export type RenderItem = Readonly<{ render: PartRender }>

export type LayoutItem = Readonly<{ order: readonly string[] }>

export type Standing = Readonly<{
  point: string
  key: string
  by: readonly string[]
  scope: Scope
  builtIn: boolean
}>

export type Refused = Readonly<{
  point: string
  key: string
  by: string
  scope: Scope
  reason: string
}>

export type Conflict = Readonly<{ point: string; key: string; by: readonly string[] }>

export type Changes = Readonly<{
  css: string
  standing: readonly Standing[]
  refused: readonly Refused[]
  conflicts: readonly Conflict[]
  renders: ReadonlyMap<string, PartRender>
  layouts: Readonly<Record<string, readonly string[]>>
}>

export const tokensContract: Contract = {
  name: TOKENS_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: PARTS_POINT,
  key: 'the name of a part that opens tokens; shell.app is the whole application',
  gives: 'nothing: the item is data',
  item: { kind: 'data', fields: { tokens: 'object' } },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'an item the rule refuses does not count, and what the application shipped with shows',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance:
    'a token is one the interface has; a value is plain text of a value, with no call but the listed ones',
  summary: 'The tokens put on a part: names of the interface and the values they take there.',
}

export const styleContract: Contract = {
  name: STYLE_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: PARTS_POINT,
  key: 'the name of a part that opens style',
  gives: 'nothing: the item is data',
  item: { kind: 'data', fields: { style: 'object' } },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'an item the rule refuses does not count, and what the application shipped with shows',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance:
    'a state is one of the listed ones; a property is the name of a property, not a token; a value is plain text of a value',
  summary: 'The declarations put on a part: its own style at rest and in the states it can be in.',
}

export const renderContract: Contract = {
  name: RENDER_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: PARTS_POINT,
  key: 'the name of a part that opens render',
  gives:
    'what the host gives its own drawing, the name of the part, and the drawing it stands in for',
  item: { kind: 'pure', fields: { render: 'function' } },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'a drawing that throws falls back to the drawing the part shipped with',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: 'the part opens render',
  summary: 'The drawing put on a part in place of the one it shipped with.',
}

export const layoutContract: Contract = {
  name: LAYOUT_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'what is laid out: shell.pages, the pages of the shell',
  gives: 'nothing: the item is data',
  item: { kind: 'data', fields: { order: 'array' } },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'a layout the rule refuses does not count, and the order the modules gave stands',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: 'the order is ids of pages, each once',
  summary: 'The order of what the shell lays out: the ids it names come first, in its order.',
}

/** The scope of what one tenant put, and of the one who asks as that tenant; nobody signed in asks as the deployment. */
export function tenantScope(tenant: string | undefined): Scope {
  return tenant === undefined || tenant === '' ? [] : [TENANT, tenant]
}

const PLAIN = /^[A-Za-z0-9 #%.,()+*/_-]$/u
const CALL = /([A-Za-z-][A-Za-z0-9-]*)\(/gu
const CALLS = new Set([
  'var',
  'calc',
  'min',
  'max',
  'clamp',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
])

/** Why this text may not be the value of a token or of a declaration, or null when it may. */
export function valueFault(value: string): string | null {
  if (value.trim() === '') return 'the value is empty'
  const odd = Array.from(value).find(char => !PLAIN.test(char))
  if (odd !== undefined) return `the value has ${JSON.stringify(odd)}, which a value may not have`
  const called = Array.from(value.matchAll(CALL), match => match[1] ?? '').find(
    name => !CALLS.has(name.toLowerCase()),
  )
  return called === undefined ? null : `the value calls ${called}(, which a value may not call`
}

/** The same data written with its keys in order, so that two writings of one thing have one digest. */
function ordered(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, ordered(record[key])]),
  )
}

export function styleEntry(part: string, style: PartStyle, scope: Scope): Entry<StyleItem> {
  const item = { style }
  return {
    point: STYLE_POINT,
    key: part,
    id: '',
    scope,
    rank: 0,
    digest: JSON.stringify(ordered(item)),
    item,
  }
}

export function renderEntry(
  point: string,
  key: string,
  render: unknown,
  scope: Scope,
  by: string,
): Entry<Readonly<{ render: unknown }>> {
  return { point, key, id: '', scope, rank: 0, digest: by, item: { render } }
}

export function layoutEntry(
  key: string,
  order: readonly string[],
  scope: Scope,
): Entry<LayoutItem> {
  const item = { order }
  return { point: LAYOUT_POINT, key, id: '', scope, rank: 0, digest: JSON.stringify(item), item }
}

export function tokensEntry(
  part: string,
  tokens: Readonly<Record<string, string>>,
  scope: Scope,
  builtIn = false,
): Entry<TokensItem> {
  const item = builtIn ? { tokens, builtIn } : { tokens }
  return {
    point: TOKENS_POINT,
    key: part,
    id: '',
    scope,
    rank: 0,
    digest: JSON.stringify(ordered(item)),
    item,
  }
}

type Known = (token: string) => boolean

type Kind<I> = Readonly<{
  point: string
  fault: (key: string, item: I, parts: readonly DeclaredPart[], known: Known) => string | null
  builtIn?: (item: I) => boolean
}>

function partFaultOf(key: string, depth: string, parts: readonly DeclaredPart[]): string | null {
  const part = parts.find(found => found.name === key)
  if (part === undefined) return `no part is declared as ${key}`
  return (part.depths as readonly string[]).includes(depth)
    ? null
    : `the part ${key} does not open ${depth}`
}

const selectorOf = (key: string): string => (key === APP ? ':root' : `[${PART_ATTRIBUTE}="${key}"]`)

function declarationsOf(values: Readonly<Record<string, string>>): string {
  const names = Object.keys(values).sort()
  return names.map(name => `${name}:${(values[name] ?? '').trim()};`).join('')
}

function tokensFault(item: TokensItem, known: Known): string | null {
  for (const name of Object.keys(item.tokens).sort()) {
    const value: unknown = item.tokens[name]
    if (!known(name)) return `${name} is not a token of the interface`
    if (typeof value !== 'string') return `the token ${name} has no text for a value`
    const fault = valueFault(value)
    if (fault !== null) return `the token ${name}: ${fault}`
  }
  return null
}

function tokensRules(key: string, item: TokensItem): string {
  const declarations = declarationsOf(item.tokens)
  return declarations === '' ? '' : `${selectorOf(key)}{${declarations}}`
}

const WHEN: Readonly<Record<'base' | PartState, string>> = {
  base: '',
  hover: ':hover',
  'focus-visible': ':focus-visible',
  active: ':active',
  selected:
    ':is([aria-selected="true"],[data-selected="true"],[aria-current="page"],[aria-pressed="true"],[data-state="active"],[data-state="checked"])',
  open: ':is([data-state="open"],[aria-expanded="true"])',
  disabled: ':is(:disabled,[aria-disabled="true"],[data-disabled])',
}
const ORDER = ['base', ...STATES] as const
const PROPERTY = /^[a-z][a-z-]*$/u

function declarationFault(property: string, value: unknown): string | null {
  if (property.startsWith('--')) return `${property} is a token: tokens are put on ${TOKENS_POINT}`
  if (!PROPERTY.test(property)) return `${property} is not the name of a property`
  if (typeof value !== 'string') return `the property ${property} has no text for a value`
  const fault = valueFault(value)
  return fault === null ? null : `the property ${property}: ${fault}`
}

function styleFault(item: StyleItem): string | null {
  for (const state of Object.keys(item.style).sort()) {
    if (!(ORDER as readonly string[]).includes(state))
      return `the state ${state} is not one of ${STATES.join(', ')}`
    const declared: unknown = item.style[state as PartState]
    if (typeof declared !== 'object' || declared === null)
      return `the state ${state} has no declarations`
    for (const property of Object.keys(declared).sort()) {
      const fault = declarationFault(property, (declared as Record<string, unknown>)[property])
      if (fault !== null) return state === 'base' ? fault : `in ${state}, ${fault}`
    }
  }
  return null
}

function styleRules(key: string, item: StyleItem): string {
  return ORDER.map(state => {
    const declarations = declarationsOf(item.style[state] ?? {})
    return declarations === '' ? '' : `${selectorOf(key)}${WHEN[state]}{${declarations}}`
  }).join('')
}

const LAID_OUT: readonly string[] = ['shell.pages']

function layoutFault(key: string, item: LayoutItem): string | null {
  if (!LAID_OUT.includes(key)) return `there is nothing to lay out under ${key}`
  const order: readonly unknown[] = item.order
  const odd = order.find(id => typeof id !== 'string' || id === '')
  if (odd !== undefined)
    return `the order names ${JSON.stringify(odd)}, which is not the id of a page`
  const twice = order.find((id, index) => order.indexOf(id) !== index)
  return twice === undefined ? null : `the order names ${String(twice)} twice`
}

const TOKENS: Kind<TokensItem> = {
  point: TOKENS_POINT,
  fault: (key, item, parts, known) => partFaultOf(key, 'tokens', parts) ?? tokensFault(item, known),
  builtIn: item => item.builtIn === true,
}
const STYLE: Kind<StyleItem> = {
  point: STYLE_POINT,
  fault: (key, item, parts) => partFaultOf(key, 'style', parts) ?? styleFault(item),
}
const RENDER: Kind<RenderItem> = {
  point: RENDER_POINT,
  fault: (key, _item, parts) => partFaultOf(key, 'render', parts),
}
const LAYOUT: Kind<LayoutItem> = { point: LAYOUT_POINT, fault: layoutFault }

const placeOf = (out: Refused): string => `${out.point}\n${out.key}\n${out.by}`

const refusal = (entry: Placed, reason: string): Refused => ({
  point: entry.point,
  key: entry.key,
  by: entry.instance.fiber,
  scope: entry.scope,
  reason,
})

type Found = { standing: Standing[]; refused: Refused[]; conflicts: Conflict[] }

type Asked = Readonly<{
  registry: Registry
  asker: Scope
  parts: readonly DeclaredPart[]
  known: Known
  found: Found
}>

/** The item that stands on each key of one point: the most specific of those the rules take. */
function standingOn<I>(kind: Kind<I>, asked: Asked): Map<string, I> {
  const { found } = asked
  const stands = new Map<string, I>()
  const read = candidates<I>(asked.registry, kind.point, null, asked.asker)
  if (read.kind !== 'read') return stands
  found.refused.push(...read.filtered.map(out => refusal(out.entry, out.detail)))
  const sound = read.entries.filter(entry => {
    const fault = kind.fault(entry.key, entry.item, asked.parts, asked.known)
    if (fault !== null) found.refused.push(refusal(entry, fault))
    return fault === null
  })
  for (const key of new Set(sound.map(entry => entry.key))) {
    const answer = mostSpecific(sound.filter(entry => entry.key === key))
    if (answer.kind === 'conflict') {
      const by = answer.entries.map(entry => entry.instance.fiber).sort()
      found.conflicts.push({ point: kind.point, key, by })
    }
    if (answer.kind !== 'one') continue
    const { item, scope } = answer.entry
    const by = answer.holders.map(holder => holder.fiber)
    const builtIn = kind.builtIn?.(item) === true
    found.standing.push({ point: kind.point, key, by, scope, builtIn })
    stands.set(key, item)
  }
  return stands
}

function rulesOf<I>(stands: Map<string, I>, write: (key: string, item: I) => string): string {
  const whole = stands.get(APP)
  const rest = Array.from(stands).filter(([key]) => key !== APP)
  return [
    whole === undefined ? '' : write(APP, whole),
    ...rest.map(([key, item]) => write(key, item)),
  ].join('')
}

/** What the changes put on the parts come to for one asker: the sheet, the drawings, the layouts, who stands on each key, and what does not count. */
export function changesOn(registry: Registry, asker: Scope, known: Known): Changes {
  const found: Found = { standing: [], refused: [], conflicts: [] }
  const declared = partsOn(registry)
  const parts = declared.kind === 'read' ? declared.parts : []
  const asked: Asked = { registry, asker, parts, known, found }
  const css =
    rulesOf(standingOn(TOKENS, asked), tokensRules) + rulesOf(standingOn(STYLE, asked), styleRules)
  const renders = new Map(
    Array.from(standingOn(RENDER, asked), ([key, item]) => [key, item.render] as const),
  )
  const layouts = Object.fromEntries(
    Array.from(standingOn(LAYOUT, asked), ([key, item]) => [key, item.order] as const),
  )
  found.refused.sort((left, right) => (placeOf(left) < placeOf(right) ? -1 : 1))
  return { css: `@layer ${LAYER}{${css}}`, ...found, renders, layouts }
}

/** The pages in the order of a layout: the ids it names first, in its order; the rest as they were. */
export function laidOut<T extends Readonly<{ id: string }>>(
  items: readonly T[],
  order: readonly string[] | undefined,
): readonly T[] {
  if (order === undefined) return items
  const named = order.flatMap(id => items.filter(item => item.id === id))
  return [...named, ...items.filter(item => !order.includes(item.id))]
}
