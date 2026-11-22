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

const APP = 'shell.app'
const LAYER = 'omne-changes'
const TENANT = 'tenant'

export type TokensItem = Readonly<{
  tokens: Readonly<Record<string, string>>
  builtIn?: boolean
}>

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

export function tokensEntry(
  part: string,
  tokens: Readonly<Record<string, string>>,
  scope: Scope,
  builtIn = false,
): Entry<TokensItem> {
  const names = Object.keys(tokens).sort()
  return {
    point: TOKENS_POINT,
    key: part,
    id: '',
    scope,
    rank: 0,
    digest: JSON.stringify([builtIn, names.map(name => [name, tokens[name]])]),
    item: builtIn ? { tokens, builtIn } : { tokens },
  }
}

type Known = (token: string) => boolean

function partFaultOf(key: string, depth: 'tokens', parts: readonly DeclaredPart[]): string | null {
  const part = parts.find(found => found.name === key)
  if (part === undefined) return `no part is declared as ${key}`
  return part.depths.includes(depth) ? null : `the part ${key} does not open ${depth}`
}

function tokensFault(
  entry: Placed<TokensItem>,
  parts: readonly DeclaredPart[],
  known: Known,
): string | null {
  const part = partFaultOf(entry.key, 'tokens', parts)
  if (part !== null) return part
  for (const name of Object.keys(entry.item.tokens).sort()) {
    const value: unknown = entry.item.tokens[name]
    if (!known(name)) return `${name} is not a token of the interface`
    if (typeof value !== 'string') return `the token ${name} has no text for a value`
    const fault = valueFault(value)
    if (fault !== null) return `the token ${name}: ${fault}`
  }
  return null
}

const selectorOf = (key: string): string => (key === APP ? ':root' : `[${PART_ATTRIBUTE}="${key}"]`)

function tokensRule(key: string, tokens: Readonly<Record<string, string>>): string {
  const names = Object.keys(tokens).sort()
  const declarations = names.map(name => `${name}:${(tokens[name] ?? '').trim()};`)
  return names.length === 0 ? '' : `${selectorOf(key)}{${declarations.join('')}}`
}

const placeOf = (out: Refused): string => `${out.key}\n${out.by}`

const refusal = (entry: Placed, reason: string): Refused => ({
  point: entry.point,
  key: entry.key,
  by: entry.instance.fiber,
  scope: entry.scope,
  reason,
})

/** What the changes put on the parts come to for one asker: the sheet, who stands on each key, and what does not count. */
export function changesOn(registry: Registry, asker: Scope, known: Known): Changes {
  const none = { css: `@layer ${LAYER}{}`, standing: [], refused: [], conflicts: [] }
  const declared = partsOn(registry)
  const read = candidates<TokensItem>(registry, TOKENS_POINT, null, asker)
  if (declared.kind !== 'read' || read.kind !== 'read') return none
  const refused = read.filtered.map(out => refusal(out.entry, out.detail))
  const sound = read.entries.filter(entry => {
    const fault = tokensFault(entry, declared.parts, known)
    if (fault !== null) refused.push(refusal(entry, fault))
    return fault === null
  })
  const rules: string[] = []
  const standing: Standing[] = []
  const conflicts: Conflict[] = []
  for (const key of new Set(sound.map(entry => entry.key))) {
    const answer = mostSpecific(sound.filter(entry => entry.key === key))
    if (answer.kind === 'conflict') {
      const by = answer.entries.map(entry => entry.instance.fiber).sort()
      conflicts.push({ point: TOKENS_POINT, key, by })
    }
    if (answer.kind !== 'one') continue
    const { item, scope } = answer.entry
    const by = answer.holders.map(holder => holder.fiber)
    standing.push({ point: TOKENS_POINT, key, by, scope, builtIn: item.builtIn === true })
    if (key === APP) rules.unshift(tokensRule(key, item.tokens))
    else rules.push(tokensRule(key, item.tokens))
  }
  refused.sort((left, right) => (placeOf(left) < placeOf(right) ? -1 : 1))
  return { css: `@layer ${LAYER}{${rules.join('')}}`, standing, refused, conflicts }
}
