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
import type { DrawingSource } from './point.ts'

export const TOKENS_POINT = 'shell.tokens'
export const STYLE_POINT = 'shell.part-style'
export const RENDER_POINT = 'shell.part-render'
export const LAYOUT_POINT = 'shell.layout'

const APP = 'shell.app'
const LAYER = 'omne-changes'
const TENANT = 'tenant'
const LOOK = 'look'

export type TokensItem = Readonly<{
  tokens: Readonly<Record<string, string>>
  builtIn?: boolean
  files?: string
}>

const STATES = ['hover', 'focus-visible', 'active', 'selected', 'open', 'disabled'] as const

export type PartState = (typeof STATES)[number]

export type PartStyle = Readonly<
  Partial<Record<'base' | PartState, Readonly<Record<string, string>>>>
>

export type StyleItem = Readonly<{ style: PartStyle; files?: string }>

export type RenderItem = Readonly<{ render: PartRender; source?: DrawingSource }>

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
  app: Readonly<Record<string, string>>
}>

export const tokensContract: Contract = {
  name: TOKENS_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: PARTS_POINT,
  key: 'the name of a part that opens tokens; shell.app is the whole app',
  gives: 'nothing: the item is data, a record of token names and values',
  item: { kind: 'data', fields: { tokens: 'object' } },
  resolve: 'most-specific',
  binding: 'run',
  onError:
    'an item with a name that is not a token, or a value that is not plain, does not count, and the theme the app shipped with shows; the client says which name and the nearest tokens',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance:
    'a name is a token of the interface: OmneExtensionPoints show shell.tokens lists each with its value now; a value is plain text of a value, with no call but var, calc, min, max, clamp and the colour functions',
  summary:
    'The theme: the colours, sizes and other design tokens of the interface, for the whole app or for one part. To change the theme or a brand colour, put tokens on shell.app.',
  example: '{"point":"shell.tokens","key":"shell.app","data":{"--omne-accent":"#0a7a4a"}}',
}

export const styleContract: Contract = {
  name: STYLE_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: PARTS_POINT,
  key: 'the name of a part that opens style',
  gives:
    'nothing: the item is data, a record of states, each a record of CSS properties and values',
  item: { kind: 'data', fields: { style: 'object' } },
  resolve: 'most-specific',
  binding: 'run',
  onError:
    'an item the rule refuses does not count as a whole, and the style the app shipped with shows',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: `a state is base or one of ${STATES.join(', ')}; a property is the name of a CSS property, not a token (a name that starts with -- goes on shell.tokens); a value is plain text of a value`,
  summary:
    'The style of one part: its own CSS declarations at rest and in each state it can be in. Use it when no token does the job.',
  example:
    '{"point":"shell.part-style","key":"session.composer.send","data":{"base":{"border-radius":"999px"},"hover":{"opacity":"0.9"}}}',
}

const RENDER_EXAMPLE = [
  '{"point":"shell.part-render","key":"session.transcript.agent-message","module":"agent-message.js","export":"message"}',
  'agent-message.js:',
  'export const message = ({ React }) => ({ part, builtIn }) =>',
  "  React.createElement('div', { ...part, style: { borderLeft: '3px solid #0a7a4a' } }, builtIn())",
].join('\n')

export const renderContract: Contract = {
  name: RENDER_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: PARTS_POINT,
  key: 'the name of a part that opens render',
  gives:
    'the export of the file is called once, with an object that holds React, and gives back the drawing; the drawing is called with props, what the module gives its own drawing; part, the attribute that names the part, to spread on the outermost element, or the part cannot be found; and builtIn, a function that gives the drawing the part shipped with',
  item: { kind: 'pure', fields: { render: 'function' } },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'a drawing that throws falls back to the drawing the part shipped with',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: 'the part opens render',
  summary:
    'The drawing of one part, in place of the one it shipped with: code. Use it only when tokens and style cannot do the job.',
  example: RENDER_EXAMPLE,
}

export const layoutContract: Contract = {
  name: LAYOUT_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'what is laid out: only shell.pages, the pages in the navigation',
  gives: 'nothing: the item is data, a list of page ids',
  item: { kind: 'data', fields: { order: 'array' } },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'a layout the rule refuses does not count, and the order the modules gave stands',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: 'the order is ids of pages, each once; an id that no page has is skipped',
  summary:
    'The order of the pages in the navigation: the page ids an item names come first, in its order, and the other pages follow as they were.',
  example: '{"point":"shell.layout","key":"shell.pages","data":["assets","conversation"]}',
}

/** The scope of what one tenant put, and of the one who asks as that tenant; nobody signed in asks as the deployment. */
export function tenantScope(tenant: string | undefined): Scope {
  return tenant === undefined || tenant === '' ? [] : [TENANT, tenant]
}

export function lookScope(tenant: string | undefined, look: string | undefined): Scope {
  const scope = tenantScope(tenant)
  return scope.length === 0 || look === undefined || look === '' ? scope : [...scope, LOOK, look]
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

const FILE = /(?<![A-Za-z0-9_-])file\(([^()]*)\)/gu
const FILE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/u
const IMAGE = /\.(?:png|jpg|webp|avif|svg)$/u
const FILES_PLACE = /^\/(?:[A-Za-z0-9._~-]+\/)+$/u

function fileFault(path: string, files: string | undefined): string | null {
  if (!FILE_PATH.test(path)) return `file(${path}) is not a path inside the package`
  if (!IMAGE.test(path)) return `file(${path}) does not name an image`
  if (files === undefined)
    return `file(${path}) points at a file, and what put this item gave no files`
  return FILES_PLACE.test(files)
    ? null
    : 'the place of the files of this item is not a path of this application'
}

/** Why this text may not be the value of a token or of a declaration, or null when it may. */
export function valueFault(value: string, files?: string): string | null {
  if (value.trim() === '') return 'the value is empty'
  const odd = Array.from(value).find(char => !PLAIN.test(char))
  if (odd !== undefined) return `the value has ${JSON.stringify(odd)}, which a value may not have`
  const lost = Array.from(value.matchAll(FILE), match => fileFault((match[1] ?? '').trim(), files))
  const fault = lost.find(found => found !== null)
  if (fault !== undefined) return fault
  const called = Array.from(value.replace(FILE, '').matchAll(CALL), match => match[1] ?? '').find(
    name => !CALLS.has(name.toLowerCase()),
  )
  return called === undefined ? null : `the value calls ${called}(, which a value may not call`
}

const written = (value: string, files: string | undefined): string =>
  files === undefined
    ? value
    : value.replace(FILE, (_, path: string) => `url("${files}${path.trim()}")`)

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

export function styleEntry(
  part: string,
  style: PartStyle,
  scope: Scope,
  files?: string,
): Entry<StyleItem> {
  const item = files === undefined ? { style } : { style, files }
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
  source?: DrawingSource,
): Entry<Readonly<{ render: unknown; source?: DrawingSource }>> {
  const item = source === undefined ? { render } : { render, source }
  return { point, key, id: '', scope, rank: 0, digest: by, item }
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
  files?: string,
): Entry<TokensItem> {
  const item = { tokens, ...(builtIn && { builtIn }), ...(files !== undefined && { files }) }
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

export type Known = (token: string) => boolean

export type Names = () => readonly string[] | undefined

type Tokens = Readonly<{ known: Known; names: Names }>

type Kind<I> = Readonly<{
  point: string
  fault: (key: string, item: I, parts: readonly DeclaredPart[], tokens: Tokens) => string | null
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

function declarationsOf(values: Readonly<Record<string, string>>, files?: string): string {
  const names = Object.keys(values).sort()
  return names.map(name => `${name}:${written((values[name] ?? '').trim(), files)};`).join('')
}

function distance(left: string, right: string): number {
  let above = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (const [row, char] of Array.from(left).entries()) {
    const line = [row + 1]
    for (const [column, other] of Array.from(right).entries())
      line.push(
        Math.min(
          (above[column + 1] ?? 0) + 1,
          (line[column] ?? 0) + 1,
          (above[column] ?? 0) + (char === other ? 0 : 1),
        ),
      )
    above = line
  }
  return above[right.length] ?? 0
}

const bare = (name: string): string => name.replace(/^--(omne-)?/u, '')

function nearest(name: string, names: readonly string[]): readonly string[] {
  const reach = Math.max(2, Math.floor(name.length / 4))
  return names
    .map(token => ({ token, apart: bare(token) === bare(name) ? -1 : distance(name, token) }))
    .filter(near => near.apart <= reach)
    .sort((left, right) => left.apart - right.apart || (left.token < right.token ? -1 : 1))
    .slice(0, 3)
    .map(near => near.token)
}

function unknownToken(name: string, names: Names): string {
  const said = `${name} is not a token of the interface`
  const listed = names() ?? []
  if (listed.length === 0) return said
  const near = nearest(name, listed)
  const nearby = near.length === 0 ? '' : ` Nearest: ${near.join(', ')}.`
  return `${said}.${nearby} OmneExtensionPoints show ${TOKENS_POINT} lists them all.`
}

function tokensFault(item: TokensItem, tokens: Tokens): string | null {
  for (const name of Object.keys(item.tokens).sort()) {
    const value: unknown = item.tokens[name]
    if (!tokens.known(name)) return unknownToken(name, tokens.names)
    if (typeof value !== 'string') return `the token ${name} has no text for a value`
    const fault = valueFault(value, item.files)
    if (fault !== null) return `the token ${name}: ${fault}`
  }
  return null
}

function tokensRules(key: string, item: TokensItem): string {
  const declarations = declarationsOf(item.tokens, item.files)
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

function declarationFault(property: string, value: unknown, files?: string): string | null {
  if (property.startsWith('--')) return `${property} is a token: tokens are put on ${TOKENS_POINT}`
  if (!PROPERTY.test(property)) return `${property} is not the name of a property`
  if (typeof value !== 'string') return `the property ${property} has no text for a value`
  const fault = valueFault(value, files)
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
      const value = (declared as Record<string, unknown>)[property]
      const fault = declarationFault(property, value, item.files)
      if (fault !== null) return state === 'base' ? fault : `in ${state}, ${fault}`
    }
  }
  return null
}

function styleRules(key: string, item: StyleItem): string {
  return ORDER.map(state => {
    const declarations = declarationsOf(item.style[state] ?? {}, item.files)
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
  fault: (key, item, parts, tokens) =>
    partFaultOf(key, 'tokens', parts) ?? tokensFault(item, tokens),
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
  tokens: Tokens
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
    const fault = kind.fault(entry.key, entry.item, asked.parts, asked.tokens)
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

export type ChangesRead = Readonly<{ changes: Changes; drawn: ReadonlyMap<string, RenderItem> }>

/** What the changes put on the parts come to for one asker: the sheet, the drawings, the layouts, who stands on each key, and what does not count. */
export function changesOn(
  registry: Registry,
  asker: Scope,
  known: Known,
  names: Names = () => undefined,
): Changes {
  return readChanges(registry, asker, known, names).changes
}

export function readChanges(
  registry: Registry,
  asker: Scope,
  known: Known,
  names: Names = () => undefined,
): ChangesRead {
  const found: Found = { standing: [], refused: [], conflicts: [] }
  const declared = partsOn(registry)
  const parts = declared.kind === 'read' ? declared.parts : []
  const asked: Asked = { registry, asker, parts, tokens: { known, names }, found }
  const tokens = standingOn(TOKENS, asked)
  const css = rulesOf(tokens, tokensRules) + rulesOf(standingOn(STYLE, asked), styleRules)
  const tint = Object.entries(tokens.get(APP)?.tokens ?? {})
  const app = Object.fromEntries(tint.map(([name, value]) => [name, value.trim()]))
  const drawn = standingOn(RENDER, asked)
  const renders = new Map(Array.from(drawn, ([key, item]) => [key, item.render] as const))
  const layouts = Object.fromEntries(
    Array.from(standingOn(LAYOUT, asked), ([key, item]) => [key, item.order] as const),
  )
  found.refused.sort((left, right) => (placeOf(left) < placeOf(right) ? -1 : 1))
  return { changes: { css: `@layer ${LAYER}{${css}}`, ...found, renders, layouts, app }, drawn }
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
