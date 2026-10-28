import {
  attributeNames,
  judgeAttributes,
  LABEL_PREFIXES,
  projectedLabels,
  type CardAttributes,
} from './attributes.ts'
import { readIssueCard, REST_HEADERS, type GhCommand } from './github-read.ts'
import type { DeliveryLines } from './lines.ts'
import { InputError } from './protocol.ts'

/** The label difference for the work kind and card attributes. */
export type LabelPlan = {
  issue: string
  /** The card's labels in the managed families now. */
  current: string[]
  /** The labels the body attributes project to. */
  target: string[]
  add: string[]
  remove: string[]
}
const families = [...Object.values(LABEL_PREFIXES), 'kind:']
function inFamilies(label: string): boolean {
  return families.some(prefix => label.startsWith(prefix))
}
/** Refuses projection unless the body has one valid work kind and valid attributes. */
export function planLabels(card: CardAttributes, lines: DeliveryLines): LabelPlan {
  if (card.workKind === undefined)
    throw new InputError('Card work kind cannot project labels: expected one valid 主工作类型')
  const { attributes, findings } = judgeAttributes(card, lines)
  if (findings.length > 0)
    throw new InputError(
      `Card attributes cannot project labels: ${findings.map(finding => finding.message).join(' ')}`,
    )
  const target = [
    ...attributeNames.flatMap(name => {
      const value = attributes[name]
      return value === undefined ? [] : projectedLabels(name, value)
    }),
    `kind:${card.workKind}`,
  ].sort()
  const current = card.labels.filter(inFamilies).sort()
  return {
    issue: card.issue,
    current,
    target,
    add: target.filter(label => !current.includes(label)),
    remove: current.filter(label => !target.includes(label)),
  }
}

export type LabelSync = {
  plan: LabelPlan
  applied: boolean
  /** The family labels read back after applying; absent without `--apply`. */
  readback?: string[]
  verified?: boolean
}
/**
 * Reads one Issue, plans its attribute labels and, with `apply`, adds and removes only labels
 * of the four families, then reads the Issue again to verify. `call` runs one `gh` command.
 */
export function syncLabels({
  repository,
  number,
  apply,
  lines,
  call,
}: {
  repository: string
  number: number
  apply: boolean
  lines: DeliveryLines
  call: GhCommand
}): LabelSync {
  const path = `repos/${repository}/issues/${number}`
  function read(): CardAttributes {
    return readIssueCard(
      call(['api', '--method', 'GET', ...REST_HEADERS, path], 15_000),
      repository,
      number,
    ).attributes
  }
  const plan = planLabels(read(), lines)
  if (!apply) return { plan, applied: false }
  const writes = [
    ...(plan.add.length === 0
      ? []
      : [
          [
            'api',
            '--method',
            'POST',
            ...REST_HEADERS,
            `${path}/labels`,
            ...plan.add.flatMap(label => ['-f', `labels[]=${label}`]),
          ],
        ]),
    ...plan.remove.map(label => [
      'api',
      '--method',
      'DELETE',
      ...REST_HEADERS,
      `${path}/labels/${encodeURIComponent(label)}`,
    ]),
  ]
  writes.forEach((argv, index) => {
    try {
      call(argv, 15_000)
    } catch {
      throw new InputError(
        `Label write ${index + 1} of ${writes.length} failed. Earlier writes stay applied. Read the card again before retrying. API output omitted.`,
      )
    }
  })
  const after = read(),
    readback = after.labels.filter(inFamilies).sort(),
    currentTarget = planLabels(after, lines).target
  return {
    plan,
    applied: true,
    readback,
    verified:
      readback.join('\n') === plan.target.join('\n') &&
      currentTarget.join('\n') === plan.target.join('\n'),
  }
}
