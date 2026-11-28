import type { Member } from './manifest.ts'
import type { Absent } from './side-state.ts'

type FieldKind = 'string' | 'number' | 'boolean' | 'function' | 'object' | 'array'

/** The rules of a point as far as a member is judged by them: a Dynamis contract has this shape. */
export type PointRules = Readonly<{
  binding: 'build' | 'run'
  item: Readonly<{ kind: 'data' | 'pure' | 'effect'; fields: Readonly<Record<string, FieldKind>> }>
  scopes?: 'all' | Readonly<{ only: 'deployment'; why: string; note: string }>
}>

/** A point as the loader of one tree finds it now. */
export type Target =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'point'; rules: PointRules; form: boolean }>
  | Readonly<{ kind: 'category'; takes: 'data' | 'directory' }>
  | Readonly<{ kind: 'category'; takes: 'none'; why: string }>

export type Way = 'data' | 'directory' | 'code'

/** Why a member is not put. The kind decides whether its plugin waits or fails; the words are for people. */
export type Reason =
  | Readonly<{ kind: 'absent'; absent: Absent }>
  | Readonly<{ kind: 'closed'; why: string; note: string }>
  | Readonly<{ kind: 'fixed' }>
  | Readonly<{ kind: 'wrong-way'; takes: Way; gives: Way }>
  | Readonly<{ kind: 'threw'; detail: string }>
  | Readonly<{ kind: 'refused'; detail: string }>

export type Judgment =
  | Readonly<{ kind: 'data' }>
  | Readonly<{ kind: 'held'; way: 'data' | 'directory' }>
  | Readonly<{ kind: 'code'; form: 'special' | 'generic' }>
  | Readonly<{ kind: 'not'; reason: Reason }>

export const wayOf = (member: Member): Way =>
  'module' in member ? 'code' : 'directory' in member ? 'directory' : 'data'

const not = (reason: Reason): Judgment => ({ kind: 'not', reason })
const wrong = (takes: Way, member: Member): Judgment =>
  not({ kind: 'wrong-way', takes, gives: wayOf(member) })

/** Whether one member can be put on a point, and how: the same table on both trees, read from the rules alone. */
export function judgeMember(target: Target, member: Member): Judgment {
  if (target.kind === 'absent')
    return not({ kind: 'absent', absent: { kind: 'point', name: member.point } })
  if (target.kind === 'category') {
    if (target.takes === 'none') return not({ kind: 'refused', detail: target.why })
    const { takes } = target
    return wayOf(member) === takes ? { kind: 'held', way: takes } : wrong(takes, member)
  }
  const { rules, form } = target
  if (rules.scopes !== undefined && rules.scopes !== 'all')
    return not({ kind: 'closed', why: rules.scopes.why, note: rules.scopes.note })
  if (rules.binding === 'build') return not({ kind: 'fixed' })
  if (rules.item.kind === 'data')
    return wayOf(member) === 'data' ? { kind: 'data' } : wrong('data', member)
  if (!('module' in member)) return wrong('code', member)
  return { kind: 'code', form: form ? 'special' : 'generic' }
}

const SAID: Readonly<Record<Way, string>> = { data: 'data', directory: 'a directory', code: 'code' }

export function reasonText(reason: Reason): string {
  switch (reason.kind) {
    case 'absent':
      return `${reason.absent.name} is not a point now`
    case 'closed':
      return `the point is closed to plugins (${reason.why}): ${reason.note}`
    case 'fixed':
      return 'the point is fixed when the application is built'
    case 'wrong-way':
      return `the point takes ${SAID[reason.takes]}; this member gives ${SAID[reason.gives]}`
    case 'threw':
    case 'refused':
      return reason.detail
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const HOLDS: Readonly<Record<FieldKind, (value: unknown) => boolean>> = {
  string: value => typeof value === 'string',
  number: value => typeof value === 'number',
  boolean: value => typeof value === 'boolean',
  function: value => typeof value === 'function',
  object: isRecord,
  array: Array.isArray,
}

/** The generic way for code: a function fills the one field the rules ask for when it is a function; an object is the item. The member's id and rank go over the fields of those names, and each field is checked for its kind. */
export function genericItem(
  rules: PointRules,
  given: unknown,
  spot: Readonly<{ id?: string; rank?: number }> = {},
): Readonly<{ item: object }> | Reason {
  const fields = Object.entries(rules.item.fields)
  const [only] = fields
  if (fields.length === 1 && only?.[1] === 'function' && typeof given === 'function')
    return { item: { [only[0]]: given } }
  if (!isRecord(given)) {
    const asked = fields.map(([name]) => name).join(', ')
    const detail = `what was given is not an item of the point, which asks for ${asked}`
    return { kind: 'refused', detail }
  }
  const named = rules.item.fields
  const item: Readonly<Record<string, unknown>> = {
    ...given,
    ...(spot.id !== undefined && 'id' in named && { id: spot.id }),
    ...(spot.rank !== undefined && 'rank' in named && { rank: spot.rank }),
  }
  const lacking = fields.find(([name, kind]) => !HOLDS[kind](item[name]))
  if (lacking === undefined) return { item }
  return { kind: 'refused', detail: `the item lacks ${lacking[0]} (${lacking[1]})` }
}
