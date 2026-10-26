import { readIssueCard, REST_HEADERS, type GhCommand } from './github-read.ts'
import { array, InputError, record, text } from './protocol.ts'

const TIMEOUT_MS = 15_000
/** The HTML comment that opens every carry comment; the JSON after it names the two titles. */
const CARRY_MARKER = 'omne-milestone-carry:v1'

export type Milestone = { number: number; title: string; state: string; dueOn: string | null }

/** A calendar date `YYYY-MM-DD` that exists. */
export function calendarDate(value: string, path: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = match === null ? null : new Date(`${value}T00:00:00Z`)
  if (date === null || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new InputError(`${path} must be a calendar date YYYY-MM-DD`)
  return value
}
/** A milestone title the carry comment can hold: nonempty, one line, no HTML comment end. */
function milestoneTitle(value: string, path: string): string {
  if (value.trim() === '' || /[\r\n]/.test(value) || value.includes('-->'))
    throw new InputError(`${path} must be a one-line milestone title`)
  return value
}
function get(call: GhCommand, path: string): unknown {
  return call(['api', '--method', 'GET', ...REST_HEADERS, path], TIMEOUT_MS)
}
/** Reads every page of a list endpoint; stops at 20 pages so a loop cannot run away. */
function paged(call: GhCommand, path: string): unknown[] {
  const items: unknown[] = []
  for (let page = 1; page <= 20; page += 1) {
    const result = array(
      get(call, `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`),
      path,
    )
    items.push(...result)
    if (result.length < 100) return items
  }
  throw new InputError(`Page limit reached at ${path}`)
}
function parseMilestone(value: unknown): Milestone {
  const raw = record(value, 'milestone'),
    number = raw.number
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1)
    throw new InputError('milestone.number must be a positive integer')
  return {
    number,
    title: text(raw.title, 'milestone.title'),
    state: text(raw.state, 'milestone.state'),
    dueOn: raw.due_on === null ? null : text(raw.due_on, 'milestone.due_on'),
  }
}
function listMilestones(repository: string, call: GhCommand): Milestone[] {
  return paged(call, `repos/${repository}/milestones?state=all`).map(parseMilestone)
}
function findMilestone(milestones: readonly Milestone[], title: string): Milestone | undefined {
  const found = milestones.filter(milestone => milestone.title === title)
  if (found.length > 1) throw new InputError(`More than one milestone is titled ${title}`)
  return found[0]
}

export type MilestoneCreate = {
  milestone: Milestone
  created: boolean
  /** True when the due date read back from GitHub is the requested date. */
  verified: boolean
}
/**
 * Creates the milestone `title` due on `due`. GitHub stores a due timestamp; the request sends
 * noon UTC so that the calendar date is the same in every time zone between UTC-11 and UTC+11.
 * An existing milestone with the same title and due date is returned without a write. One with
 * another due date is an input error: this command does not move due dates.
 */
export function createMilestone({
  repository,
  title,
  due,
  description,
  call,
}: {
  repository: string
  title: string
  due: string
  description?: string
  call: GhCommand
}): MilestoneCreate {
  milestoneTitle(title, 'title')
  calendarDate(due, 'due')
  const existing = findMilestone(listMilestones(repository, call), title)
  if (existing !== undefined) {
    if (existing.dueOn?.slice(0, 10) !== due)
      throw new InputError(
        `Milestone ${title} exists with due date ${existing.dueOn ?? 'none'}; this command does not change it`,
      )
    return { milestone: existing, created: false, verified: true }
  }
  let milestone: Milestone
  try {
    milestone = parseMilestone(
      call(
        [
          'api',
          '--method',
          'POST',
          ...REST_HEADERS,
          `repos/${repository}/milestones`,
          '-f',
          `title=${title}`,
          '-f',
          'state=open',
          '-f',
          `due_on=${due}T12:00:00Z`,
          ...(description === undefined ? [] : ['-f', `description=${description}`]),
        ],
        TIMEOUT_MS,
      ),
    )
  } catch {
    throw new InputError(
      'Milestone write failed. List the milestones before retrying. API output omitted.',
    )
  }
  return { milestone, created: true, verified: milestone.dueOn?.slice(0, 10) === due }
}

/** The carry comment of one card. The first line is the machine-readable marker. */
export function carryComment(from: string, to: string, reason: string): string {
  return [
    `<!-- ${CARRY_MARKER} ${JSON.stringify({ from, to })} -->`,
    `里程碑流转：\`${from}\` → \`${to}\`。`,
    '',
    `- 原因：${reason}`,
    '- binding 不变：本卡的 binding 与 attempt 保持原值。binding 中的里程碑是派发时的值，与 Issue 不一致时只作报告（`attribute-binding-drift`）。',
  ].join('\n')
}
/** True when `body` is a carry comment for exactly `from` to `to`. */
export function isCarryComment(body: string, from: string, to: string): boolean {
  const match = new RegExp(`^<!-- ${CARRY_MARKER} (\\{.*\\}) -->$`, 'm').exec(body)
  if (match?.[1] === undefined) return false
  try {
    const value = record(JSON.parse(match[1]), 'carry marker')
    return value.from === from && value.to === to
  } catch {
    return false
  }
}

export type CarryCard = {
  issue: string
  /** True when this run changed the Issue milestone; false when it was already `to`. */
  moved: boolean
  /** True when this run posted the carry comment; false when one was already there. */
  commented: boolean
  /** The milestone title read back after the writes. */
  readback: string | null
  verified: boolean
}
type Planned = { number: number; url: string; move: boolean; comment: boolean }
/**
 * Moves each card from milestone `from` to `to` and posts one carry comment on it. The binding
 * is not touched. Every card is read and checked before the first write: a card in a third
 * milestone, a pull request or a missing milestone stops the run with nothing written. A card
 * already in `to` or already carrying the comment skips that write, so a rerun after a partial
 * failure completes the rest.
 */
export function carryMilestone({
  repository,
  from,
  to,
  issues,
  reason,
  call,
}: {
  repository: string
  from: string
  to: string
  issues: readonly number[]
  reason: string
  call: GhCommand
}): CarryCard[] {
  milestoneTitle(from, 'from')
  milestoneTitle(to, 'to')
  if (from === to) throw new InputError('from and to must be different milestones')
  if (reason.trim() === '' || /[\r\n]/.test(reason))
    throw new InputError('reason must be one nonempty line')
  if (issues.length === 0) throw new InputError('Name at least one card')
  if (new Set(issues).size !== issues.length) throw new InputError('A card is named twice')
  const milestones = listMilestones(repository, call)
  if (findMilestone(milestones, from) === undefined)
    throw new InputError(`Milestone ${from} does not exist`)
  const target = findMilestone(milestones, to)
  if (target === undefined) throw new InputError(`Milestone ${to} does not exist`)
  const planned: Planned[] = issues.map(number => {
    const card = readIssueCard(
      get(call, `repos/${repository}/issues/${number}`),
      repository,
      number,
    )
    const current = card.attributes.milestone ?? null
    if (current !== from && current !== to)
      throw new InputError(`#${number} is in milestone ${current ?? 'none'}, not ${from} or ${to}`)
    const comments = paged(call, `repos/${repository}/issues/${number}/comments`).map(item =>
      text(record(item, 'comment').body, 'comment.body'),
    )
    return {
      number,
      url: card.url,
      move: current !== to,
      comment: !comments.some(body => isCarryComment(body, from, to)),
    }
  })
  const writes = planned.flatMap(card => [
    ...(card.move
      ? [
          [
            'api',
            '--method',
            'PATCH',
            ...REST_HEADERS,
            `repos/${repository}/issues/${card.number}`,
            '-F',
            `milestone=${target.number}`,
          ],
        ]
      : []),
    ...(card.comment
      ? [
          [
            'api',
            '--method',
            'POST',
            ...REST_HEADERS,
            `repos/${repository}/issues/${card.number}/comments`,
            '-f',
            `body=${carryComment(from, to, reason)}`,
          ],
        ]
      : []),
  ])
  writes.forEach((argv, index) => {
    try {
      call(argv, TIMEOUT_MS)
    } catch {
      throw new InputError(
        `Carry write ${index + 1} of ${writes.length} failed. Earlier writes stay applied. Rerun the same command to finish. API output omitted.`,
      )
    }
  })
  return planned.map(card => {
    const readback =
      readIssueCard(get(call, `repos/${repository}/issues/${card.number}`), repository, card.number)
        .attributes.milestone ?? null
    return {
      issue: card.url,
      moved: card.move,
      commented: card.comment,
      readback,
      verified: readback === to,
    }
  })
}
