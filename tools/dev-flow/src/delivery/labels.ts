import {
  attributeNames,
  judgeAttributes,
  LABEL_PREFIXES,
  projectedLabels,
  readCardAttributes,
  type CardAttributes,
} from './attributes.ts'
import type { GhRead } from './github-read.ts'
import type { DeliveryLines } from './lines.ts'
import { array, InputError, milestoneOf, record, text } from './protocol.ts'

/** The label difference of one card in the three attribute families. */
export type LabelPlan = {
  issue: string
  /** The card's labels in the three families now. */
  current: string[]
  /** The labels the body attributes project to. */
  target: string[]
  add: string[]
  remove: string[]
}
const families = Object.values(LABEL_PREFIXES)
function inFamilies(label: string): boolean {
  return families.some(prefix => label.startsWith(prefix))
}
/** Plans the three label families from the body; refuses a card without three valid attributes. */
export function planLabels(card: CardAttributes, lines: DeliveryLines): LabelPlan {
  const { attributes, findings } = judgeAttributes(card, lines)
  if (findings.length > 0)
    throw new InputError(
      `Card attributes cannot project labels: ${findings.map(finding => finding.message).join(' ')}`,
    )
  const target = attributeNames
    .flatMap(name => {
      const value = attributes[name]
      return value === undefined ? [] : projectedLabels(name, value)
    })
    .sort()
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
const HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
]
/**
 * Reads one Issue, plans its attribute labels and, with `apply`, adds and removes only labels
 * of the three families, then reads the Issue again to verify. `call` runs one `gh` command.
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
  call: GhRead
}): LabelSync {
  const path = `repos/${repository}/issues/${number}`,
    url = `https://github.com/${repository}/issues/${number}`
  function read(): CardAttributes {
    const raw = record(call(['api', '--method', 'GET', ...HEADERS, path], 15_000), 'Issue')
    if ('pull_request' in raw || raw.number !== number || raw.html_url !== url)
      throw new InputError('Issue identity mismatch or pull request')
    return readCardAttributes(raw.body === null ? '' : text(raw.body, 'Issue.body'), {
      url,
      labels: array(raw.labels, 'Issue.labels').map(item =>
        text(record(item, 'label').name, 'label.name'),
      ),
      ...milestoneOf(raw),
    })
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
            ...HEADERS,
            `${path}/labels`,
            ...plan.add.flatMap(label => ['-f', `labels[]=${label}`]),
          ],
        ]),
    ...plan.remove.map(label => [
      'api',
      '--method',
      'DELETE',
      ...HEADERS,
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
  const readback = read().labels.filter(inFamilies).sort()
  return {
    plan,
    applied: true,
    readback,
    verified: readback.join('\n') === plan.target.join('\n'),
  }
}
