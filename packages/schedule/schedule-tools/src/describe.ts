import type {
  ScheduleDefinition,
  SchedulePurpose,
  ScheduleRecurrence,
  ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ReleaseDescription, ReleaseRow } from '@omne-harness/tool-contract'
import { scheduleReadsOf, type ScheduleReadFaces, type ScheduleReads } from './port.ts'
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

// Only an object: a resident call's execution record command is near the storage command cap.
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

type Given = Readonly<{
  label: string | undefined
  proposed: ScheduleDefinition | undefined
  schedule: string | undefined
}>

/** What only a read tells: the schedule as it is, and the next times. */
type Seen = Readonly<{
  current: ScheduleView | undefined
  next: Next
  timezone: string | undefined
}>

const UNSEEN: Seen = { current: undefined, next: { kind: 'unavailable' }, timezone: undefined }
const ENDING: ReadonlySet<Activation['command']> = new Set(['pause', 'stop'])

function givenOf(args: Activation): Given {
  if (args.command !== 'create' && args.command !== 'replace')
    return { label: undefined, proposed: undefined, schedule: args.params.schedule }
  const parsed = definitionOf(args.params.definition)
  return {
    label: args.params.definition.label,
    proposed: parsed.success ? parsed.data : undefined,
    schedule: args.command === 'replace' ? args.params.schedule : undefined,
  }
}

function previewSource(given: Given) {
  if (given.proposed !== undefined) return { kind: 'inline', definition: given.proposed } as const
  return given.schedule === undefined
    ? undefined
    : ({ kind: 'schedule', scheduleId: given.schedule } as const)
}

async function read(faces: ScheduleReadFaces, scheduleId: string) {
  const found = await faces.queries.get(faces.context, { scheduleId: scheduleId as never })
  return found.kind === 'ok' ? (found.value as ScheduleView) : undefined
}

async function nextOf(faces: ScheduleReadFaces, given: Given, after: string) {
  const source = previewSource(given)
  if (source === undefined) return undefined
  const answer = await faces.queries.preview(faces.context, {
    source: source as never,
    after: after as never,
    count: NEXT_COUNT,
  })
  return answer.kind === 'ok' ? answer.value : undefined
}

async function seenOf(args: Activation, given: Given, reads: ScheduleReads): Promise<Seen> {
  const faces = await reads.faces()
  if ('kind' in faces) return UNSEEN
  const current = given.schedule === undefined ? undefined : await read(faces, given.schedule)
  const shown = ENDING.has(args.command) ? undefined : await nextOf(faces, given, reads.now())
  const times = shown?.candidates.map(item => local(item.adjustedLocal)) ?? []
  const next: Next = times.length === 0 ? { kind: 'unavailable' } : { kind: 'times', times }
  return { current, next, timezone: shown?.basis.timezone }
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
  const given = givenOf(args)
  const reads = scheduleReadsOf(input.signal)
  const seen =
    reads === undefined
      ? UNSEEN
      : ((await within(() => seenOf(args, given, reads), READ_WITHIN_MS)) ?? UNSEEN)
  const name = seen.current?.definition.label ?? given.label ?? '未命名'
  const definition = given.proposed ?? seen.current?.definition
  const next: Next = ENDING.has(args.command) ? { kind: 'none' } : seen.next
  const timezone = seen.timezone
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
