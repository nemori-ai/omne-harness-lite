import { allowsOf, type Rule } from '@omne-harness/public-contract'
import type { FieldData, ProtocolShown, RuleData } from './port.ts'

export const PROTOCOL_KEY = /^([a-z][a-z0-9-]*)\/v([1-9][0-9]*)$/u

const allows = (rule: RuleData): string => allowsOf(rule as Rule)

const since = (field: { since?: number }): string =>
  field.since === undefined ? '' : `   from revision ${String(field.since)}`

/** Each field of a rule on a line of its own: its path, what it allows, and the revision it came in. */
function fieldLines(rule: RuleData, path: string, indent: string): string[][] {
  if (rule.kind === 'object') {
    const fields = Object.entries((rule as { fields: Readonly<Record<string, FieldData>> }).fields)
    if (fields.length === 0)
      return path === ''
        ? [[`${indent}(no fields)`, '']]
        : [[`${indent}${path}`, 'an empty object']]
    return fields.flatMap(([name, field]) => {
      const at = `${path === '' ? '' : `${path}.`}${name}${field.optional === true ? '?' : ''}`
      const lines = fieldLines(field.rule, at, indent)
      const [first, ...rest] = lines
      return first === undefined ? [] : [[first[0]!, `${first[1]!}${since(field)}`], ...rest]
    })
  }
  if (rule.kind === 'array') {
    const item = (rule as { item: RuleData }).item
    if (item.kind === 'object')
      return [[`${indent}${path}`, allows(rule)], ...fieldLines(item, `${path}[]`, indent)]
  }
  return [[`${indent}${path === '' ? '(the whole body)' : path}`, allows(rule)]]
}

const aligned = (rows: readonly (readonly string[])[]): string[] => {
  const width = Math.max(0, ...rows.map(row => row[0]!.length))
  return rows.map(([left, right]) => (right === '' ? left! : `${left!.padEnd(width)}   ${right!}`))
}

/** One protocol as the tenant can call it now: each operation with its body field by field and its answers, then each observation. */
export function protocolLines(shown: ProtocolShown): string[] {
  const { operations, observations } = shown.rules
  const held = shown.held === 'tenant' ? 'held by this tenant' : 'installed with the deployment'
  const lines = [
    `${shown.name}/v${String(shown.major)}   revision ${String(shown.revision)}   ${held}`,
  ]
  lines.push('operations:')
  for (const [name, operation] of Object.entries(operations)) {
    const fixed = Object.entries(operation.outcomes).filter(([, body]) => body === true)
    const bodied = Object.entries(operation.outcomes).filter(([, body]) => body !== true)
    lines.push(
      `  ${name}   ${operation.effect}   identity ${operation.identity}${since(operation)}`,
    )
    lines.push('    body:', ...aligned(fieldLines(operation.body, '', '      ')))
    for (const [outcome, body] of bodied)
      lines.push(`    answers ${outcome}:`, ...aligned(fieldLines(body as RuleData, '', '      ')))
    lines.push(`    answers also, with no body: ${fixed.map(([outcome]) => outcome).join(', ')}`)
  }
  const watched = Object.entries(observations)
  if (watched.length > 0) lines.push('observations:')
  for (const [name, observation] of watched) {
    lines.push(`  ${name}   identity ${observation.identity}${since(observation)}`)
    lines.push('    opens with:', ...aligned(fieldLines(observation.open, '', '      ')))
    lines.push('    each frame:', ...aligned(fieldLines(observation.frame, '', '      ')))
    lines.push(
      `    ends: ${observation.ends.length === 0 ? 'only when stopped' : observation.ends.join(', ')}`,
    )
  }
  lines.push(
    'A body is checked against these rules before it is sent; a refused one says where, what was given and what is allowed.',
  )
  return lines
}
