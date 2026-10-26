import { IntegrationError } from '../integration/parse.ts'
import type { TaskBinding } from './binding.ts'
import type { CardAttributes } from './attributes.ts'
import type { GhCommand } from './github-read.ts'
import {
  array,
  calendarDate,
  calendarDay,
  daysBetween,
  InputError,
  record,
  text,
  type DeliveryConfig,
} from './protocol.ts'

const TIMEOUT_MS = 15_000

export const boardEvents = ['dispatched', 'delivered', 'integrating', 'accepted'] as const
export type BoardEvent = (typeof boardEvents)[number]
const writeNames = [
  'dispatchedAt',
  'deliveredAt',
  'acceptedAt',
  'cycleDays',
  'line',
  'status',
] as const
export type WriteName = (typeof writeNames)[number]
/** The writes each event may enable. The delivery config lists the enabled subset. */
const EVENT_WRITES = {
  dispatched: ['dispatchedAt', 'line'],
  delivered: ['deliveredAt', 'status'],
  integrating: ['status'],
  accepted: ['acceptedAt', 'cycleDays', 'status'],
} as const satisfies Record<BoardEvent, readonly WriteName[]>
/** The Stage (Status) option each event sets when its `status` write is enabled. */
const EVENT_STATUS = {
  dispatched: undefined,
  delivered: 'In review',
  integrating: 'Integrating',
  accepted: 'Accepted',
} as const satisfies Record<BoardEvent, string | undefined>

/**
 * One enabled write with everything it needs, parsed from the delivery config: the field ID
 * and, for a single select, its option. A date write stamps the event's date field.
 */
export type EnabledWrite =
  | { name: 'dispatchedAt' | 'deliveredAt' | 'acceptedAt'; field: string }
  | { name: 'cycleDays'; field: string; dispatchedField: string }
  | { name: 'line'; field: string; options: ReadonlyMap<string, string> }
  | { name: 'status'; field: string; option: string; status: string }
/** The board writes of one event. */
export type BoardEventConfig = {
  projectId: string
  /** The IANA time zone that turns the run instant into the calendar date of a date field. */
  timeZone: string
  event: BoardEvent
  writes: EnabledWrite[]
}

function requireField(id: string | null, event: BoardEvent, name: WriteName): string {
  if (id === null)
    throw new IntegrationError(
      'input-error',
      `config.board.events.${event} enables ${name} without its field ID`,
    )
  return id
}
function parseWrite(config: DeliveryConfig, event: BoardEvent, name: WriteName): EnabledWrite {
  const { fields, options } = config.project
  switch (name) {
    case 'dispatchedAt':
    case 'deliveredAt':
    case 'acceptedAt':
      return { name, field: requireField(fields[name], event, name) }
    case 'cycleDays':
      return {
        name,
        field: requireField(fields.cycleDays, event, name),
        dispatchedField: requireField(fields.dispatchedAt, event, name),
      }
    case 'line':
      return {
        name,
        field: requireField(fields.line, event, name),
        options: new Map(Object.entries(options.line)),
      }
    case 'status': {
      const status = EVENT_STATUS[event]
      const option =
        status !== undefined && Object.hasOwn(options.stage, status)
          ? options.stage[status]
          : undefined
      if (status === undefined || option === undefined)
        throw new IntegrationError(
          'input-error',
          `config.project.options.stage lacks ${status ?? 'a Stage for ' + event}`,
        )
      return { name, field: requireField(fields.stage, event, name), option, status }
    }
    default: {
      const exhaustive: never = name
      throw new IntegrationError('invariant', `Unknown board write ${String(exhaustive)}`)
    }
  }
}
/**
 * Reads the board writes of one event from the delivery config. Returns null when the config
 * has no `board` entry or the event enables nothing, without judging the rest of the entry.
 * Otherwise the Project ID, time zone and event names must be valid, the event may enable only
 * its own writes, each once, and each enabled write must have its field ID and option.
 */
export function boardEvent(config: DeliveryConfig, event: BoardEvent): BoardEventConfig | null {
  const board = config.board
  const names = board === null ? [] : (board.events[event] ?? [])
  if (board === null || names.length === 0) return null
  const projectId = config.project.id
  if (projectId === null)
    throw new IntegrationError('input-error', 'config.project.id is required for board writes')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: board.timeZone })
  } catch {
    throw new IntegrationError('input-error', 'config.board.timeZone must be an IANA time zone')
  }
  const unknown = Object.keys(board.events).filter(name => !boardEvents.some(item => item === name))
  if (unknown.length > 0)
    throw new IntegrationError(
      'input-error',
      `config.board.events: unknown events ${unknown.join(', ')}`,
    )
  const allowed: readonly WriteName[] = EVENT_WRITES[event]
  const writes = names.map(name => {
    const found = allowed.find(item => item === name)
    if (found === undefined)
      throw new IntegrationError(
        'input-error',
        `config.board.events.${event} cannot enable ${name}`,
      )
    return parseWrite(config, event, found)
  })
  if (new Set(names).size !== names.length)
    throw new IntegrationError('input-error', `config.board.events.${event} names a write twice`)
  return { projectId, timeZone: board.timeZone, event, writes }
}

/** The line a card was dispatched to: the v2 binding's, else the body attribute. */
export function cardLine(
  binding: TaskBinding | undefined,
  attributes: Pick<CardAttributes, 'fields'>,
): string | undefined {
  if (binding?.schemaVersion === 2) return binding.line
  const values = attributes.fields.line
  return values.length === 1 ? values[0] : undefined
}

export type FieldValue =
  | { kind: 'date'; date: string }
  | { kind: 'number'; number: number }
  | { kind: 'option'; option: string; name: string }
export type FieldWrite = { name: WriteName; field: string; value: FieldValue }
export type SkippedWrite = { name: WriteName; reason: string }
/**
 * Plans the writes of one event. `date` stamps the event's date field. `current` is the item's
 * field values read before the writes: Dispatched at is written only while it is empty, and
 * Cycle days counts from it. A write whose input is missing or invalid is skipped with its
 * reason instead of guessed.
 */
export function planBoardWrites({
  config,
  date,
  line,
  current,
}: {
  config: BoardEventConfig
  date: string
  line?: string | undefined
  current: ReadonlyMap<string, string | number>
}): { writes: FieldWrite[]; skipped: SkippedWrite[] } {
  const writes: FieldWrite[] = [],
    skipped: SkippedWrite[] = []
  for (const write of config.writes) {
    switch (write.name) {
      case 'dispatchedAt': {
        const existing = current.get(write.field)
        if (existing !== undefined)
          skipped.push({ name: write.name, reason: `Dispatched at is already ${String(existing)}` })
        else writes.push({ name: write.name, field: write.field, value: { kind: 'date', date } })
        break
      }
      case 'deliveredAt':
      case 'acceptedAt':
        writes.push({ name: write.name, field: write.field, value: { kind: 'date', date } })
        break
      case 'cycleDays': {
        const dispatched = current.get(write.dispatchedField)
        if (dispatched === undefined) {
          skipped.push({ name: write.name, reason: 'Dispatched at is empty' })
          break
        }
        let from: string
        try {
          from = calendarDate(String(dispatched), 'Dispatched at')
        } catch {
          skipped.push({
            name: write.name,
            reason: `Dispatched at ${String(dispatched)} is not a calendar date`,
          })
          break
        }
        const days = daysBetween(from, date)
        if (days < 0)
          skipped.push({ name: write.name, reason: `Dispatched at ${from} is after ${date}` })
        else
          writes.push({
            name: write.name,
            field: write.field,
            value: { kind: 'number', number: days },
          })
        break
      }
      case 'line': {
        const option = line === undefined ? undefined : write.options.get(line)
        if (line === undefined)
          skipped.push({ name: write.name, reason: 'The card has no delivery line' })
        else if (option === undefined)
          skipped.push({ name: write.name, reason: `Line has no option ${line}` })
        else
          writes.push({
            name: write.name,
            field: write.field,
            value: { kind: 'option', option, name: line },
          })
        break
      }
      case 'status':
        writes.push({
          name: write.name,
          field: write.field,
          value: { kind: 'option', option: write.option, name: write.status },
        })
        break
      default: {
        const exhaustive: never = write
        throw new IntegrationError('invariant', `Unknown board write ${String(exhaustive)}`)
      }
    }
  }
  return { writes, skipped }
}

const ITEMS =
  'query($id:ID!){node(id:$id){... on Issue{id url projectItems(first:100,includeArchived:true){pageInfo{hasNextPage} nodes{id project{id}}}}}}'
const VALUES =
  'query($id:ID!){node(id:$id){... on ProjectV2Item{id project{id} fieldValues(first:100){pageInfo{hasNextPage} nodes{__typename ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id}}} ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id}}} ... on ProjectV2ItemFieldSingleSelectValue{optionId field{... on ProjectV2SingleSelectField{id}}}}}}}}'
export const UPDATE_FIELD =
  'mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}){projectV2Item{id}}}'

function graphql(
  call: GhCommand,
  query: string,
  variables: readonly string[],
): Record<string, unknown> {
  const result = record(
    call(['api', 'graphql', '-f', `query=${query}`, ...variables], TIMEOUT_MS),
    'GraphQL response',
  )
  if ('errors' in result) throw new InputError('GraphQL errors. API output omitted.')
  return record(result.data, 'GraphQL data')
}
/** The card's unique item in the configured Project; a card off the board is an input error. */
function projectItem(
  projectId: string,
  issueId: string,
  issueUrl: string,
  call: GhCommand,
): string {
  const node = record(graphql(call, ITEMS, ['-f', `id=${issueId}`]).node, 'Issue node')
  if (node.id !== issueId || node.url !== issueUrl)
    throw new InputError('Project item Issue identity mismatch')
  const items = record(node.projectItems, 'projectItems')
  if (record(items.pageInfo, 'projectItems.pageInfo').hasNextPage !== false)
    throw new InputError('The card has more than 100 Project items')
  const matching = array(items.nodes, 'projectItems.nodes')
    .map(item => record(item, 'Project item'))
    .filter(item => record(item.project, 'item.project').id === projectId)
  const item = matching[0]
  if (matching.length !== 1 || item === undefined)
    throw new InputError('The card is not on the configured Project, or is on it twice')
  return text(item.id, 'item.id')
}
/** Field ID to its current value: a date, a number or a single select option ID. */
function itemValues(
  projectId: string,
  item: string,
  call: GhCommand,
): Map<string, string | number> {
  const node = record(graphql(call, VALUES, ['-f', `id=${item}`]).node, 'Project item node')
  if (node.id !== item || record(node.project, 'item.project').id !== projectId)
    throw new InputError('Project item identity mismatch')
  const values = record(node.fieldValues, 'fieldValues')
  if (record(values.pageInfo, 'fieldValues.pageInfo').hasNextPage !== false)
    throw new InputError('The item has more than 100 field values')
  const result = new Map<string, string | number>()
  for (const raw of array(values.nodes, 'fieldValues.nodes')) {
    const value = record(raw, 'field value')
    if (value.field === undefined || value.field === null) continue
    const id = record(value.field, 'field value.field').id
    if (typeof id !== 'string') continue
    if (value.__typename === 'ProjectV2ItemFieldDateValue') result.set(id, text(value.date, 'date'))
    else if (
      value.__typename === 'ProjectV2ItemFieldNumberValue' &&
      typeof value.number === 'number'
    )
      result.set(id, value.number)
    else if (value.__typename === 'ProjectV2ItemFieldSingleSelectValue')
      result.set(id, text(value.optionId, 'optionId'))
  }
  return result
}
/** The GraphQL variables of one field write, as `gh api graphql` field arguments. */
function updateVariables(projectId: string, item: string, write: FieldWrite): string[] {
  const value =
    write.value.kind === 'date'
      ? ['-f', `value[date]=${write.value.date}`]
      : write.value.kind === 'number'
        ? ['-F', `value[number]=${write.value.number}`]
        : ['-f', `value[singleSelectOptionId]=${write.value.option}`]
  return [
    '-f',
    `project=${projectId}`,
    '-f',
    `item=${item}`,
    '-f',
    `field=${write.field}`,
    ...value,
  ]
}
function expected(write: FieldWrite): string | number {
  return write.value.kind === 'date'
    ? write.value.date
    : write.value.kind === 'number'
      ? write.value.number
      : write.value.option
}

type BoardPlan = {
  issue: string
  event: BoardEvent
  date: string
  item: string
  writes: FieldWrite[]
  skipped: SkippedWrite[]
}
/** A dry run plans only; an applied run carries the readback of every written field. */
export type BoardResult =
  | (BoardPlan & { applied: false })
  | (BoardPlan & {
      applied: true
      /** Field ID to the value read back after the writes. */
      readback: Record<string, string | number | null>
      verified: boolean
    })
/**
 * A write that failed after planning. It keeps the skipped writes and names the failed one;
 * the earlier writes stay applied.
 */
export class BoardWriteError extends InputError {
  readonly skipped: SkippedWrite[]
  constructor(message: string, skipped: SkippedWrite[]) {
    super(message)
    this.name = 'BoardWriteError'
    this.skipped = skipped
  }
}
/**
 * Writes the planned fields of one event on the card's Project item, then reads them back.
 * The item's field values are read once before planning. Each field is one
 * `updateProjectV2ItemFieldValue` request; a failed write stops the run with a
 * `BoardWriteError`. `dryRun` reads and plans only.
 */
export function recordBoardEvent({
  config,
  issue,
  date,
  line,
  dryRun,
  call,
}: {
  config: BoardEventConfig
  issue: { id: string; url: string }
  date: string
  line?: string | undefined
  dryRun: boolean
  call: GhCommand
}): BoardResult {
  calendarDate(date, 'date')
  const item = projectItem(config.projectId, issue.id, issue.url, call)
  const reads = config.writes.some(
    write => write.name === 'dispatchedAt' || write.name === 'cycleDays',
  )
  const current = reads ? itemValues(config.projectId, item, call) : new Map<string, string>()
  const { writes, skipped } = planBoardWrites({ config, date, line, current })
  const plan: BoardPlan = { issue: issue.url, event: config.event, date, item, writes, skipped }
  if (dryRun) return { ...plan, applied: false }
  writes.forEach((write, index) => {
    try {
      const data = graphql(call, UPDATE_FIELD, updateVariables(config.projectId, item, write))
      record(data.updateProjectV2ItemFieldValue, 'updateProjectV2ItemFieldValue')
    } catch {
      throw new BoardWriteError(
        `Board write ${index + 1} of ${writes.length} (${write.name}) failed. Earlier writes stay applied. API output omitted.`,
        skipped,
      )
    }
  })
  const values =
    writes.length === 0
      ? new Map<string, string | number>()
      : itemValues(config.projectId, item, call)
  const readback = Object.fromEntries(
    writes.map(write => [write.field, values.get(write.field) ?? null]),
  )
  return {
    ...plan,
    applied: true,
    readback,
    verified: writes.every(write => readback[write.field] === expected(write)),
  }
}

/** One report line of the start-time board write. */
export type BoardReport = {
  code: 'board-skipped' | 'board-write-failed' | 'board-unverified'
  message: string
}
const skipLines = (skipped: readonly SkippedWrite[]): BoardReport[] =>
  skipped.map(skip => ({ code: 'board-skipped', message: `${skip.name}: ${skip.reason}` }))
/**
 * The best-effort board write after a new task context: Dispatched at and Line. It never
 * throws. When the delivery config has no `board` entry or `dispatched` enables nothing,
 * nothing is written or reported. A cloud session cannot reach GraphQL, so it reports one skip
 * line and sends nothing.
 */
export function recordDispatch({
  config,
  cloud,
  issue,
  line,
  now,
  call,
}: {
  config: DeliveryConfig
  cloud: boolean
  issue: { id: string; url: string }
  line: string | undefined
  now: Date
  call: GhCommand
}): BoardReport[] {
  try {
    const board = boardEvent(config, 'dispatched')
    if (board === null) return []
    if (cloud)
      return [
        {
          code: 'board-skipped',
          message:
            'A cloud session cannot write Project fields; run the board dispatched command from a local session',
        },
      ]
    const result = recordBoardEvent({
      config: board,
      issue,
      date: calendarDay(board.timeZone, now),
      line,
      dryRun: false,
      call,
    })
    return [
      ...skipLines(result.skipped),
      ...(result.applied && !result.verified
        ? [
            {
              code: 'board-unverified' as const,
              message: 'Project field readback differs from the written values',
            },
          ]
        : []),
    ]
  } catch (error) {
    return [
      ...(error instanceof BoardWriteError ? skipLines(error.skipped) : []),
      {
        code: 'board-write-failed',
        message:
          error instanceof InputError || error instanceof IntegrationError
            ? error.message
            : 'Board write failed. API output omitted.',
      },
    ]
  }
}
