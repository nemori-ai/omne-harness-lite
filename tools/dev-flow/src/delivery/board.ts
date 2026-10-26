import { fields, IntegrationError, literal, string } from '../integration/parse.ts'
import type { TaskBinding } from './binding.ts'
import type { CardAttributes } from './attributes.ts'
import type { GhCommand } from './github-read.ts'
import { calendarDate } from './milestone.ts'
import { array, InputError, record, text } from './protocol.ts'

/** The Project field configuration, committed with the tool; code reads only key names. */
export const BOARD_CONFIG_PATH = 'tools/dev-flow/config/project-board.json'
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
/** The writes each event may enable. The config lists the enabled subset. */
const EVENT_WRITES = {
  dispatched: ['dispatchedAt', 'line'],
  delivered: ['deliveredAt', 'status'],
  integrating: ['status'],
  accepted: ['acceptedAt', 'cycleDays', 'status'],
} as const satisfies Record<BoardEvent, readonly WriteName[]>
/** The Status option each event sets when its `status` write is enabled. */
const EVENT_STATUS = {
  dispatched: undefined,
  delivered: 'In review',
  integrating: 'Integrating',
  accepted: 'Accepted',
} as const satisfies Record<BoardEvent, string | undefined>
/** The date field each event stamps. */
const EVENT_DATE = {
  dispatched: 'dispatchedAt',
  delivered: 'deliveredAt',
  integrating: undefined,
  accepted: 'acceptedAt',
} as const satisfies Record<BoardEvent, WriteName | undefined>

type SelectField = { id: string; options: Record<string, string> }
export type BoardConfig = {
  schemaVersion: 1
  enabled: boolean
  projectId: string
  /** The IANA time zone that turns the run instant into the calendar date of a date field. */
  timeZone: string
  fields: {
    status: SelectField
    line: SelectField
    dispatchedAt: string
    deliveredAt: string
    acceptedAt: string
    cycleDays: string
  }
  events: Record<BoardEvent, WriteName[]>
  /** Whether `milestone create` also creates a board view filtered to the new milestone. */
  milestoneView: boolean
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean')
    throw new IntegrationError('input-error', `${path} must be a boolean`)
  return value
}
function selectField(value: unknown, path: string): SelectField {
  const v = fields(value, ['id', 'options'], path)
  const options = record(v.options, `${path}.options`)
  return {
    id: string(v.id, `${path}.id`),
    options: Object.fromEntries(
      Object.entries(options).map(([name, id]) => [name, string(id, `${path}.options.${name}`)]),
    ),
  }
}
function timeZone(value: unknown): string {
  const zone = string(value, 'timeZone')
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone })
  } catch {
    throw new IntegrationError('input-error', 'timeZone must be an IANA time zone')
  }
  return zone
}
/**
 * Parses the board configuration. Unknown keys are refused. An event may enable only its own
 * writes, each once, and every Status option an enabled event sets must be configured.
 */
export function parseBoardConfig(value: unknown): BoardConfig {
  const v = fields(
    value,
    ['schemaVersion', 'enabled', 'projectId', 'timeZone', 'fields', 'events', 'milestoneView'],
    'board',
  )
  const f = fields(
    v.fields,
    ['status', 'line', 'dispatchedAt', 'deliveredAt', 'acceptedAt', 'cycleDays'],
    'fields',
  )
  const e = fields(v.events, boardEvents, 'events')
  const enabled = (event: BoardEvent): WriteName[] => {
    const allowed: readonly WriteName[] = EVENT_WRITES[event]
    const names = array(e[event], `events.${event}`).map(name => {
      const found = allowed.find(item => item === name)
      if (found === undefined)
        throw new IntegrationError('input-error', `events.${event} cannot enable ${String(name)}`)
      return found
    })
    if (new Set(names).size !== names.length)
      throw new IntegrationError('input-error', `events.${event} names a write twice`)
    return names
  }
  const events: Record<BoardEvent, WriteName[]> = {
    dispatched: enabled('dispatched'),
    delivered: enabled('delivered'),
    integrating: enabled('integrating'),
    accepted: enabled('accepted'),
  }
  const config: BoardConfig = {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    enabled: boolean(v.enabled, 'enabled'),
    projectId: string(v.projectId, 'projectId'),
    timeZone: timeZone(v.timeZone),
    fields: {
      status: selectField(f.status, 'fields.status'),
      line: selectField(f.line, 'fields.line'),
      dispatchedAt: string(f.dispatchedAt, 'fields.dispatchedAt'),
      deliveredAt: string(f.deliveredAt, 'fields.deliveredAt'),
      acceptedAt: string(f.acceptedAt, 'fields.acceptedAt'),
      cycleDays: string(f.cycleDays, 'fields.cycleDays'),
    },
    events,
    milestoneView: boolean(v.milestoneView, 'milestoneView'),
  }
  for (const event of boardEvents) {
    const status = EVENT_STATUS[event]
    if (
      status !== undefined &&
      events[event].includes('status') &&
      !(status in config.fields.status.options)
    )
      throw new IntegrationError('input-error', `fields.status.options lacks ${status}`)
  }
  return config
}

/** The calendar date of `now` in `zone`, as `YYYY-MM-DD`. */
export function calendarDay(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
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
 * Plans the enabled writes of one event. `date` stamps the event's date field. `line` feeds
 * the Line field and `dispatchedAt` the Cycle days. A write whose input is missing or has no
 * configured option is skipped with its reason instead of guessed.
 */
export function planBoardWrites({
  config,
  event,
  date,
  line,
  dispatchedAt,
}: {
  config: BoardConfig
  event: BoardEvent
  date: string
  line?: string | undefined
  dispatchedAt?: string | null | undefined
}): { writes: FieldWrite[]; skipped: SkippedWrite[] } {
  const writes: FieldWrite[] = [],
    skipped: SkippedWrite[] = []
  for (const name of config.events[event]) {
    switch (name) {
      case 'dispatchedAt':
      case 'deliveredAt':
      case 'acceptedAt':
        if (EVENT_DATE[event] === name)
          writes.push({ name, field: config.fields[name], value: { kind: 'date', date } })
        break
      case 'cycleDays': {
        if (dispatchedAt === undefined || dispatchedAt === null) {
          skipped.push({ name, reason: 'Dispatched at is empty' })
          break
        }
        const days = daysBetween(dispatchedAt, date)
        if (days < 0)
          skipped.push({ name, reason: `Dispatched at ${dispatchedAt} is after ${date}` })
        else
          writes.push({
            name,
            field: config.fields.cycleDays,
            value: { kind: 'number', number: days },
          })
        break
      }
      case 'line': {
        const option = line === undefined ? undefined : config.fields.line.options[line]
        if (line === undefined) skipped.push({ name, reason: 'The card has no delivery line' })
        else if (option === undefined) skipped.push({ name, reason: `Line has no option ${line}` })
        else
          writes.push({
            name,
            field: config.fields.line.id,
            value: { kind: 'option', option, name: line },
          })
        break
      }
      case 'status': {
        const status = EVENT_STATUS[event],
          option = status === undefined ? undefined : config.fields.status.options[status]
        if (status !== undefined && option !== undefined)
          writes.push({
            name,
            field: config.fields.status.id,
            value: { kind: 'option', option, name: status },
          })
        break
      }
      default: {
        const exhaustive: never = name
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
  config: BoardConfig,
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
    .filter(item => record(item.project, 'item.project').id === config.projectId)
  const item = matching[0]
  if (matching.length !== 1 || item === undefined)
    throw new InputError('The card is not on the configured Project, or is on it twice')
  return text(item.id, 'item.id')
}
/** Field ID to its current value: a date, a number or a single select option ID. */
function itemValues(
  config: BoardConfig,
  item: string,
  call: GhCommand,
): Map<string, string | number> {
  const node = record(graphql(call, VALUES, ['-f', `id=${item}`]).node, 'Project item node')
  if (node.id !== item || record(node.project, 'item.project').id !== config.projectId)
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
function updateVariables(config: BoardConfig, item: string, write: FieldWrite): string[] {
  const value =
    write.value.kind === 'date'
      ? ['-f', `value[date]=${write.value.date}`]
      : write.value.kind === 'number'
        ? ['-F', `value[number]=${write.value.number}`]
        : ['-f', `value[singleSelectOptionId]=${write.value.option}`]
  return [
    '-f',
    `project=${config.projectId}`,
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

export type BoardResult = {
  issue: string
  event: BoardEvent
  date: string
  item: string
  writes: FieldWrite[]
  skipped: SkippedWrite[]
  applied: boolean
  /** Field ID to the value read back after the writes; absent on a dry run. */
  readback?: Record<string, string | number | null>
  verified?: boolean
}
/**
 * Writes the enabled fields of one event on the card's Project item, then reads them back.
 * Each field is one `updateProjectV2ItemFieldValue` request; a failed write stops the run and
 * names its position, and the earlier writes stay. `dryRun` reads the item and plans only.
 */
export function recordBoardEvent({
  config,
  issue,
  event,
  date,
  line,
  dryRun,
  call,
}: {
  config: BoardConfig
  issue: { id: string; url: string }
  event: BoardEvent
  date: string
  line?: string | undefined
  dryRun: boolean
  call: GhCommand
}): BoardResult {
  calendarDate(date, 'date')
  const item = projectItem(config, issue.id, issue.url, call)
  const dispatchedAt = config.events[event].includes('cycleDays')
    ? itemValues(config, item, call).get(config.fields.dispatchedAt)
    : undefined
  const { writes, skipped } = planBoardWrites({
    config,
    event,
    date,
    line,
    dispatchedAt: typeof dispatchedAt === 'string' ? dispatchedAt : null,
  })
  const result = { issue: issue.url, event, date, item, writes, skipped }
  if (dryRun) return { ...result, applied: false }
  writes.forEach((write, index) => {
    try {
      const data = graphql(call, UPDATE_FIELD, updateVariables(config, item, write))
      record(data.updateProjectV2ItemFieldValue, 'updateProjectV2ItemFieldValue')
    } catch {
      throw new InputError(
        `Board write ${index + 1} of ${writes.length} (${write.name}) failed. Earlier writes stay applied. API output omitted.`,
      )
    }
  })
  const values =
    writes.length === 0 ? new Map<string, string | number>() : itemValues(config, item, call)
  const readback = Object.fromEntries(
    writes.map(write => [write.field, values.get(write.field) ?? null]),
  )
  return {
    ...result,
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
/**
 * The best-effort board write after a new task context: Dispatched at and Line. It never
 * throws. `configText` is the committed board config, or null when the commit has none, which
 * means the board is not configured and nothing is reported. A cloud session cannot reach
 * GraphQL, so it reports one skip line and sends nothing.
 */
export function recordDispatch({
  configText,
  projectId,
  cloud,
  issue,
  line,
  now,
  call,
}: {
  configText: string | null
  projectId: string
  cloud: boolean
  issue: { id: string; url: string }
  line: string | undefined
  now: Date
  call: GhCommand
}): BoardReport[] {
  if (configText === null) return []
  try {
    const config = parseBoardConfig(JSON.parse(configText))
    if (!config.enabled || config.events.dispatched.length === 0) return []
    if (config.projectId !== projectId)
      return [
        {
          code: 'board-write-failed',
          message: 'Board config names another Project than the delivery config',
        },
      ]
    if (cloud)
      return [
        {
          code: 'board-skipped',
          message:
            'A cloud session cannot write Project fields; run the board dispatched command from a local session',
        },
      ]
    const result = recordBoardEvent({
      config,
      issue,
      event: 'dispatched',
      date: calendarDay(config.timeZone, now),
      line,
      dryRun: false,
      call,
    })
    return [
      ...result.skipped.map(skip => ({
        code: 'board-skipped' as const,
        message: `${skip.name}: ${skip.reason}`,
      })),
      ...(result.verified === false
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

const VIEWS =
  'query($id:ID!){node(id:$id){... on ProjectV2{id views(first:100){pageInfo{hasNextPage} nodes{id number name filter}}}}}'
const CREATE_VIEW =
  'mutation($project:ID!,$name:String!){createProjectV2View(input:{projectId:$project,name:$name,layout:BOARD_LAYOUT}){projectV2View{id number name}}}'
const FILTER_VIEW =
  'mutation($view:ID!,$filter:String!){updateProjectV2View(input:{viewId:$view,filter:$filter}){projectV2View{id number name filter}}}'
/** The settings the Projects API cannot write; printed after a view is created. */
export const MILESTONE_VIEW_MANUAL_STEPS = [
  'Open the view on the Project page and confirm the layout is Board and the filter is the milestone.',
  'View menu, Column field: Status. Show the Integrating column if it is hidden.',
  'View menu, Swimlanes: Line.',
  'Save changes.',
] as const
export type MilestoneView = {
  id: string
  number: number
  name: string
  filter: string
  created: boolean
}
/**
 * Creates a board view named `title` filtered to the milestone. The API can set the name,
 * layout and filter only; column field and swimlanes stay manual. A view with the same name is
 * returned as is.
 */
export function createMilestoneView({
  config,
  title,
  call,
}: {
  config: BoardConfig
  title: string
  call: GhCommand
}): MilestoneView {
  const filter = `milestone:${JSON.stringify(title)}`
  const project = record(
    graphql(call, VIEWS, ['-f', `id=${config.projectId}`]).node,
    'Project node',
  )
  if (project.id !== config.projectId) throw new InputError('Project identity mismatch')
  const views = record(project.views, 'views')
  if (record(views.pageInfo, 'views.pageInfo').hasNextPage !== false)
    throw new InputError('The Project has more than 100 views')
  const existing = array(views.nodes, 'views.nodes')
    .map(view => record(view, 'view'))
    .find(view => view.name === title)
  const parse = (view: Record<string, unknown>, created: boolean): MilestoneView => {
    const number = view.number
    if (typeof number !== 'number') throw new InputError('view.number must be a number')
    return {
      id: text(view.id, 'view.id'),
      number,
      name: text(view.name, 'view.name'),
      filter: view.filter === null ? '' : text(view.filter, 'view.filter'),
      created,
    }
  }
  if (existing !== undefined) return parse(existing, false)
  const created = record(
    record(
      graphql(call, CREATE_VIEW, ['-f', `project=${config.projectId}`, '-f', `name=${title}`])
        .createProjectV2View,
      'createProjectV2View',
    ).projectV2View,
    'projectV2View',
  )
  const view = record(
    record(
      graphql(call, FILTER_VIEW, [
        '-f',
        `view=${text(created.id, 'view.id')}`,
        '-f',
        `filter=${filter}`,
      ]).updateProjectV2View,
      'updateProjectV2View',
    ).projectV2View,
    'projectV2View',
  )
  return parse(view, true)
}
