import type { Contract } from '@omne-harness/dynamis'
import type { Admission, ClientPoint, PointRules } from './port.ts'
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
  ...(contract.scopes !== undefined && contract.scopes !== 'all' && { scopes: contract.scopes }),
})

const pointHead = (name: string, side: string, rules: PointRules): string =>
  `${name}   point, ${side}   v${rules.version}.${rules.revision}`

/** The rules of a point, from its key to the member to copy. */
function rulesLines(rules: PointRules): string[] {
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
  ]
}

export type Form = Readonly<{ gives: string; example: string }>

/** The names one object holds, under the object: what the code of a plugin is called with. */
function handedText(handed: readonly string[]): string {
  const tops = handed.filter(name => !name.includes('.'))
  return tops
    .map(top => {
      const inner = handed
        .filter(name => name.startsWith(`${top}.`))
        .map(name => name.slice(top.length + 1))
      return inner.length === 0 ? top : `${top} (${inner.join(', ')})`
    })
    .join('; ')
}

/** Whether a plugin puts here and how a member is written: the loader's judgment, the form of the host, the rules' member. */
function categoryExample(point: string, way: string, category: string): string {
  const what = way === 'data' ? '"data":{}' : '"directory":"<name>"'
  return [
    `{"point":"${point}","key":"<name>",${what}}`,
    `<name> is the name it is published under. What one ${category} holds: OmneExtensions help with name publish and category ${category}.`,
  ].join('\n')
}

function admissionLines(
  name: string,
  admission: Admission | undefined,
  rules: PointRules,
  form: Form | undefined,
  handed: readonly string[] | undefined,
): string[] {
  if (admission?.open === false) return [`plugins: closed. ${admission.reason}`]
  const example =
    form?.example ??
    rules.example ??
    (admission?.category === undefined
      ? null
      : categoryExample(name, admission.way, admission.category))
  return [
    ...(admission === undefined
      ? []
      : [
          `plugins: open. A member gives ${admission.way === 'directory' ? 'a directory' : admission.way}.`,
        ]),
    ...(form === undefined ? [] : [`your code gives back: ${form.gives}`]),
    ...(admission?.way === 'code' && handed !== undefined && handed.length > 0
      ? [`your code is called with one object: ${handedText(handed)}`]
      : []),
    ...(example === null
      ? []
      : ['a member, to copy:', ...example.split('\n').map(line => `  ${line}`)]),
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

/** One point as both trees print it: its head, what it is for, its rules, and whether and how a plugin puts there. */
export function pointLines(
  head: Readonly<{ name: string; side: string; summary: string }>,
  rules: PointRules,
  admission: Admission | undefined,
  form: Form | undefined,
  handed: readonly string[] | undefined,
): string[] {
  return [
    pointHead(head.name, head.side, rules),
    head.summary,
    ...rulesLines(rules),
    ...admissionLines(head.name, admission, rules, form, handed),
  ]
}
