/** The detail kind a Schedules call that brings a schedule into effect hands the release card. */
export const ACTIVATION_KIND = 'schedule.activation@1'

const ACTIONS = {
  create: '新建并生效',
  update: '修改生效中的日程',
  replace: '换掉生效中日程的规则',
  promote: '让草稿生效',
  pause: '暂停',
  resume: '恢复',
  stop: '结束',
} as const

export type Activation = Readonly<{
  action: string
  name: string
  next:
    | Readonly<{ kind: 'times'; times: readonly string[] }>
    | Readonly<{ kind: 'unavailable' | 'none' }>
}>

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function nextOf(value: unknown): Activation['next'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { kind, times } = value as { kind?: unknown; times?: unknown }
  if (kind === 'unavailable' || kind === 'none') return { kind }
  if (kind !== 'times' || !Array.isArray(times) || times.length === 0) return undefined
  return times.every(isText) ? { kind, times } : undefined
}

/** Reads the typed value; anything else is undefined and the card draws the rows instead. */
export function readActivation(text: string): Activation | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const { action, name, next } = value as { action?: unknown; name?: unknown; next?: unknown }
  const read = nextOf(next)
  if (!isText(action) || !Object.hasOwn(ACTIONS, action) || !isText(name) || read === undefined)
    return undefined
  return { action: ACTIONS[action as keyof typeof ACTIONS], name, next: read }
}
