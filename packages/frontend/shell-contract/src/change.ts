import {
  candidates,
  mostSpecific,
  type Contract,
  type Entry,
  type Placed,
  type Registry,
  type Scope,
} from '@omne-harness/dynamis'
import { PART_ATTRIBUTE, PARTS_POINT, partsOn, type DeclaredPart } from './part.ts'

export const TOKENS_POINT = 'shell.tokens'
export const STYLE_POINT = 'shell.part-style'

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
  depth: 'tokens' | 'style'
  fault: (item: I, known: Known) => string | null
  rules: (key: string, item: I) => string
  builtIn: (item: I) => boolean
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

const TOKENS: Kind<TokensItem> = {
  point: TOKENS_POINT,
  depth: 'tokens',
  fault(item, known) {
    for (const name of Object.keys(item.tokens).sort()) {
      const value: unknown = item.tokens[name]
      if (!known(name)) return `${name} is not a token of the interface`
      if (typeof value !== 'string') return `the token ${name} has no text for a value`
      const fault = valueFault(value)
      if (fault !== null) return `the token ${name}: ${fault}`
    }
    return null
  },
  rules(key, item) {
    const declarations = declarationsOf(item.tokens)
    return declarations === '' ? '' : `${selectorOf(key)}{${declarations}}`
  },
  builtIn: item => item.builtIn === true,
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

const STYLE: Kind<StyleItem> = {
  point: STYLE_POINT,
  depth: 'style',
  fault(item) {
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
  },
  rules(key, item) {
    return ORDER.map(state => {
      const declarations = declarationsOf(item.style[state] ?? {})
      return declarations === '' ? '' : `${selectorOf(key)}${WHEN[state]}{${declarations}}`
    }).join('')
  },
  builtIn: () => false,
}

const placeOf = (out: Refused): string => `${out.point}\n${out.key}\n${out.by}`

const refusal = (entry: Placed, reason: string): Refused => ({
  point: entry.point,
  key: entry.key,
  by: entry.instance.fiber,
  scope: entry.scope,
  reason,
})

type Found = { rules: string[]; standing: Standing[]; refused: Refused[]; conflicts: Conflict[] }

function gather<I>(
  kind: Kind<I>,
  registry: Registry,
  asker: Scope,
  parts: readonly DeclaredPart[],
  known: Known,
  found: Found,
): void {
  const read = candidates<I>(registry, kind.point, null, asker)
  if (read.kind !== 'read') return
  found.refused.push(...read.filtered.map(out => refusal(out.entry, out.detail)))
  const sound = read.entries.filter(entry => {
    const fault = partFaultOf(entry.key, kind.depth, parts) ?? kind.fault(entry.item, known)
    if (fault !== null) found.refused.push(refusal(entry, fault))
    return fault === null
  })
  const rules: string[] = []
  for (const key of new Set(sound.map(entry => entry.key))) {
    const answer = mostSpecific(sound.filter(entry => entry.key === key))
    if (answer.kind === 'conflict') {
      const by = answer.entries.map(entry => entry.instance.fiber).sort()
      found.conflicts.push({ point: kind.point, key, by })
    }
    if (answer.kind !== 'one') continue
    const { item, scope } = answer.entry
    const by = answer.holders.map(holder => holder.fiber)
    found.standing.push({ point: kind.point, key, by, scope, builtIn: kind.builtIn(item) })
    if (key === APP) rules.unshift(kind.rules(key, item))
    else rules.push(kind.rules(key, item))
  }
  found.rules.push(...rules)
}

/** What the changes put on the parts come to for one asker: the sheet, who stands on each key, and what does not count. */
export function changesOn(registry: Registry, asker: Scope, known: Known): Changes {
  const found: Found = { rules: [], standing: [], refused: [], conflicts: [] }
  const declared = partsOn(registry)
  if (declared.kind === 'read') {
    gather(TOKENS, registry, asker, declared.parts, known, found)
    gather(STYLE, registry, asker, declared.parts, known, found)
  }
  found.refused.sort((left, right) => (placeOf(left) < placeOf(right) ? -1 : 1))
  const { rules, ...rest } = found
  return { css: `@layer ${LAYER}{${rules.join('')}}`, ...rest }
}
