import type { Contract } from '@omne-harness/dynamis'
import type { ClientPoint, PointRules } from './port.ts'
import { columns } from './text.ts'

const ARITY: Readonly<Record<PointRules['arity'], string>> = {
  one: 'one item',
  list: 'a list',
  'keyed-one': 'one per key',
  'keyed-list': 'a list per key',
}
const RESOLVE: Readonly<Record<PointRules['resolve'], string>> = {
  conflict: 'two different items in one place are a conflict and neither is used',
  'most-specific':
    'among several, the most specific scope wins; two at the same scope are a conflict',
}
const ITEM: Readonly<Record<PointRules['item']['kind'], string>> = {
  data: 'data',
  pure: 'a pure function',
  effect: 'a function with effects',
}
const NAMES_SHOWN = 200

/** A server contract in the one shape both trees are shown in. */
export const rulesOf = (contract: Contract): PointRules => ({
  arity: contract.arity,
  keyFrom: contract.keyFrom,
  key: contract.key,
  gives: contract.gives,
  item: {
    kind: contract.item.kind,
    fields: Object.keys(contract.item.fields)
      .sort()
      .map(name => ({ name, kind: contract.item.fields[name] as string })),
  },
  resolve: contract.resolve,
  binding: contract.binding,
  onError: contract.onError,
  version: contract.version,
  revision: contract.revision,
  example: contract.example ?? null,
})

export const pointHead = (name: string, side: string, rules: PointRules): string =>
  `${name}   point, ${side}   v${rules.version}.${rules.revision}`

/** The rules of a point, from its key to the member to copy. */
export function rulesLines(rules: PointRules): string[] {
  const keyed = rules.arity.startsWith('keyed')
  const fields = rules.item.fields.map(field => `${field.name} (${field.kind})`)
  return [
    keyed ? `key: ${rules.key}` : `key: none; the point holds ${ARITY[rules.arity]}`,
    ...(rules.keyFrom === null ? [] : [`keys from: ${rules.keyFrom}`]),
    `holds: ${ARITY[rules.arity]}; ${RESOLVE[rules.resolve]}`,
    `may change: ${rules.binding === 'run' ? 'while running' : 'only when the application is built'}`,
    `a member gives: ${ITEM[rules.item.kind]}${fields.length === 0 ? '' : `. fields: ${fields.join(', ')}`}`,
    `the host gives it: ${rules.gives}`,
    `when it throws: ${rules.onError}`,
    ...(rules.example === null
      ? []
      : ['a member, to copy:', ...rules.example.split('\n').map(line => `  ${line}`)]),
  ]
}

export function dataKeyLines(keys: NonNullable<ClientPoint['dataKeys']>): string[] {
  const sorted = [...keys].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )
  const shown = sorted.slice(0, NAMES_SHOWN)
  return [
    `names its data may use (${keys.length}), with the value now:`,
    ...columns(
      shown.map(key => (key.now === null ? [`  ${key.name}`] : [`  ${key.name}`, key.now])),
    ),
    ...(sorted.length > NAMES_SHOWN ? [`  and ${sorted.length - NAMES_SHOWN} more`] : []),
  ]
}

/** The text find matches a point against: its name, its summary and its rules. */
export const pointText = (
  name: string,
  summary: string,
  rules: PointRules | undefined,
  keys: ClientPoint['dataKeys'] = [],
): string =>
  [
    name,
    summary,
    ...(rules === undefined ? [] : [rules.key, rules.gives, rules.example ?? '']),
    ...keys.map(key => key.name),
  ].join(' ')
