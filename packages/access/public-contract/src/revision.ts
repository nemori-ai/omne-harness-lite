import type { ProtocolContract } from './protocol.ts'
import type { Rule } from './rule.ts'

/** What has no `since` was there from revision 1. With no revision asked for, everything is there. */
export const livesAt = (since: number | undefined, revision: number | undefined): boolean =>
  revision === undefined || (since ?? 1) <= revision

export const isRevision = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1

type Field = Extract<Rule, { kind: 'object' }>['fields'][string]

/** Every field of a rule, at any depth, with its name. */
function fieldsOf(rule: Rule): (readonly [string, Field])[] {
  if (rule.kind === 'array') return fieldsOf(rule.item)
  if (rule.kind === 'one-of') return rule.rules.flatMap(fieldsOf)
  if (rule.kind !== 'object') return []
  return Object.entries(rule.fields).flatMap(([name, field]) => [
    [name, field] as const,
    ...fieldsOf(field.rule),
  ])
}

/** A later field must be optional: a writer of an earlier revision could not have written it. */
export function checkRule(rule: Rule): void {
  for (const [name, field] of fieldsOf(rule)) {
    const since: unknown = field.since
    if (since === undefined) continue
    if (!isRevision(since))
      throw new TypeError(`the since of field ${name} is not a positive integer`)
    if (since > 1 && field.optional !== true)
      throw new TypeError(`field ${name} came at revision ${since} and is not optional`)
  }
}

const latestIn = (rule: Rule | undefined): number =>
  rule === undefined ? 1 : Math.max(1, ...fieldsOf(rule).map(([, field]) => field.since ?? 1))

/** The rule as it was at a revision: the fields that came later are not in it. */
export function projectRule(rule: Rule, revision: number): Rule {
  if (rule.kind === 'array') return { ...rule, item: projectRule(rule.item, revision) }
  if (rule.kind === 'one-of')
    return { ...rule, rules: rule.rules.map(option => projectRule(option, revision)) }
  if (rule.kind !== 'object') return rule
  const fields = Object.entries(rule.fields)
    .filter(([, field]) => livesAt(field.since, revision))
    .map(([name, field]) => [name, { ...field, rule: projectRule(field.rule, revision) }])
  return { kind: 'object', fields: Object.fromEntries(fields) }
}

/** The revision of a protocol is the latest `since` anywhere in it; nobody writes it by hand. */
export function revisionOf(protocol: ProtocolContract): number {
  const operations = Object.values(protocol.operations).flatMap(operation => [
    operation.since ?? 1,
    latestIn(operation.body.rule),
    ...Object.values(operation.outcomes).map(body => (body === true ? 1 : latestIn(body.rule))),
  ])
  const observations = Object.values(protocol.observations).flatMap(observation => [
    observation.since ?? 1,
    latestIn(observation.open.rule),
    latestIn(observation.frame.rule),
  ])
  return Math.max(1, ...operations, ...observations)
}
