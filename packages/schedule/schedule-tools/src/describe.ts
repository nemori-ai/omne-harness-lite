import type {
  ScheduleDefinition,
  SchedulePurpose,
  ScheduleRecurrence,
  ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ReleaseDescription, ReleaseRow } from '@omne-harness/tool-contract'
import { scheduleReadsOf, type ScheduleReadFaces } from './port.ts'
import { definitionOf, tree, type SchedulesArguments } from './protocol.ts'

export const ACTIVATION_KIND = 'schedule.activation@1'
export const activationCommands = [
  'create',
  'update',
  'replace',
  'promote',
  'pause',
  'resume',
  'stop',
] as const
type Activation = Extract<SchedulesArguments, { command: (typeof activationCommands)[number] }>
type Next =
  | Readonly<{ kind: 'times'; times: readonly string[] }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'none' }>

const READ_WITHIN_MS = 1500
const NEXT_COUNT = 3
const VERBS: Readonly<Record<Activation['command'], string>> = {
  create: '新建并生效',
  update: '修改生效中的日程',
  replace: '换掉生效中日程的规则',
  promote: '让草稿生效',
  pause: '暂停',
  resume: '恢复',
  stop: '结束',
}

// Only an object: a resident call keeps its whole definition in one execution record command,
// which already sits within a few KiB of the storage command cap; the schedule UI reads the value
// defensively and the card falls back to the rows.
export const activationSchema = tree({ type: 'object' })

const local = (value: string) => value.replace('T', ' ').replace(/:00$/, '')

function ruleText(recurrence: ScheduleRecurrence): string {
  switch (recurrence.kind) {
    case 'once':
      return `一次：${local(recurrence.localAt)}`
    case 'cron':
      return `cron ${recurrence.expression}`
    case 'rrule':
      return `RRULE ${recurrence.rule}`
    case 'position': {
      const period = { month: '月', quarter: '季度', year: '年' }[recurrence.period]
      const every =
        recurrence.interval === 1 ? `每${period}` : `每 ${recurrence.interval} ${period}`
      const which = recurrence.ordinal === 'last' ? '最后一' : `第 ${recurrence.ordinal} `
      const day =
        recurrence.selector.kind === 'workingDay'
          ? '个工作日'
          : `个星期${'一二三四五六日'[recurrence.selector.weekday - 1]}`
      return `${every}${which}${day}，${recurrence.times.map(local).join('、')}`
    }
  }
}

function purposeText(purpose: SchedulePurpose): string {
  return purpose.kind === 'reminder'
    ? `提醒「${purpose.content.title}」`
    : `执行${purpose.work.kind === 'agent' ? ' agent 的工作' : '一个程序'}`
}

/** What the call changes, read best effort: a failed read leaves the facts the arguments carry. */
type Subject = Readonly<{
  name: string
  definition: ScheduleDefinition | undefined
  next: Next
  timezone: string | undefined
}>

async function read(faces: ScheduleReadFaces | undefined, scheduleId: string) {
  if (faces === undefined) return undefined
  const found = await faces.queries.get(faces.context, { scheduleId: scheduleId as never })
  return found.kind === 'ok' ? (found.value as ScheduleView) : undefined
}

async function preview(
  faces: ScheduleReadFaces | undefined,
  source: Parameters<ScheduleReadFaces['queries']['preview']>[1]['source'],
  after: string,
) {
  if (faces === undefined) return undefined
  const answer = await faces.queries.preview(faces.context, {
    source,
    after: after as never,
    count: NEXT_COUNT,
  })
  return answer.kind === 'ok' ? answer.value : undefined
}

async function subjectOf(args: Activation, faces: ScheduleReadFaces | undefined, now: string) {
  const fresh = args.command === 'create' || args.command === 'replace'
  const given = fresh ? definitionOf(args.params.definition) : undefined
  const proposed = given?.success === true ? given.data : undefined
  const current = args.command === 'create' ? undefined : await read(faces, args.params.schedule)
  const definition = proposed ?? current?.definition
  const name = current?.definition.label ?? proposed?.label ?? '未命名'
  if (args.command === 'pause' || args.command === 'stop')
    return { name, definition, next: { kind: 'none' }, timezone: undefined } satisfies Subject
  const source =
    proposed === undefined
      ? args.command === 'create'
        ? undefined
        : ({ kind: 'schedule', scheduleId: args.params.schedule } as const)
      : ({ kind: 'inline', definition: proposed } as const)
  const shown = source === undefined ? undefined : await preview(faces, source as never, now)
  const times = shown?.candidates.map(item => local(item.adjustedLocal)) ?? []
  const next: Next = times.length === 0 ? { kind: 'unavailable' } : { kind: 'times', times }
  return { name, definition, next, timezone: shown?.basis.timezone } satisfies Subject
}

async function within<T>(work: () => Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  try {
    return await Promise.race([work().catch(() => undefined), expired])
  } finally {
    clearTimeout(timer)
  }
}

function nextText(next: Next): string | readonly string[] {
  if (next.kind === 'times') return next.times
  return next.kind === 'none' ? '这一动作之后不再执行' : '取不到'
}

function changeRows(args: Activation): ReleaseRow[] {
  if (args.command !== 'update') return []
  const { label, instruction } = args.params
  return [
    {
      label: '改成',
      value: label === undefined ? `指令：${instruction ?? ''}`.slice(0, 200) : `名字「${label}」`,
    },
  ]
}

/** Reads the schedule the call touches and the next times, never a write; a slow or failed read
 * says what it could not tell. */
export async function describeActivation(
  input: Readonly<{ arguments: Activation; signal: AbortSignal }>,
): Promise<ReleaseDescription> {
  const args = input.arguments
  const reads = scheduleReadsOf(input.signal)
  const subject = await within(async () => {
    const faces = reads === undefined ? undefined : await reads.faces()
    const reachable = faces === undefined || 'kind' in faces ? undefined : faces
    return subjectOf(args, reachable, reads?.now() ?? new Date().toISOString())
  }, READ_WITHIN_MS)
  const fallbackName =
    args.command === 'create' || args.command === 'replace'
      ? (args.params.definition.label ?? '未命名')
      : '未命名'
  const { name, definition, next, timezone } = subject ?? {
    name: fallbackName,
    definition: undefined,
    next: { kind: 'unavailable' } as const,
    timezone: undefined,
  }
  return {
    rows: [
      { label: '动作', value: VERBS[args.command] },
      { label: '日程', value: name },
      ...changeRows(args),
      {
        label: '规则',
        value: definition === undefined ? '取不到' : ruleText(definition.recurrence),
      },
      ...(next.kind === 'none' ? [] : [{ label: '时区', value: timezone ?? '取不到' }]),
      { label: '接下来三次', value: nextText(next) },
      {
        label: '要做的事',
        value: definition === undefined ? '取不到' : purposeText(definition.purpose).slice(0, 200),
      },
    ],
    typed: tree({ action: args.command, name, next }),
  }
}
