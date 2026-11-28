/** The local route the page asks the application to draw a page by, and the query the drawing window is opened with. */
export const DEVICE_VIEW = '/device/view'
export const DEVICE_SHOT = '/device/shot'
export const VIEW_PARAM = 'view'
export const VIEW_MARK = 'data-view'
export const VIEW_STRUCTURE = 'data-view-structure'

export const VIEW_THEMES = ['light', 'dark'] as const
export const VIEW_SIZES = ['small', 'medium', 'large', 'reading'] as const
export const VIEW_BOUNDS = Object.freeze({
  width: Object.freeze({ min: 320, max: 2560 }),
  height: Object.freeze({ min: 240, max: 2560 }),
})

export type ViewLook = Readonly<{ kind: 'built-in' }> | Readonly<{ kind: 'skin'; name: string }>
export type ViewUntil = Readonly<{ part: string; text?: string; seconds: number }>
export type ViewAsked = Readonly<{
  /** The tenant the page is drawn for, as the shell names it; the server still judges every call. */
  tenant: string
  page: string
  subject?: string
  theme: (typeof VIEW_THEMES)[number]
  size: (typeof VIEW_SIZES)[number]
  look: ViewLook
  width: number
  height: number
  part?: string
  until?: ViewUntil
}>

/** What the drawing page says once it knows; the window tells the rest (not drawn in time, no window). */
export type ViewMark = 'ready' | 'no-page' | 'no-skin'
export type ViewCannot = 'no-page' | 'no-skin' | 'bad-mode' | 'not-settled' | 'unsupported'

const TEXT_LIMIT = 512

const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= TEXT_LIMIT
const within = (value: unknown, { min, max }: { min: number; max: number }): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
const oneOf = <T extends string>(names: readonly T[], value: unknown): value is T =>
  names.includes(value as T)

function untilOf(value: unknown): ViewUntil | undefined | 'bad' {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return 'bad'
  const { part, text: said, seconds } = value as Record<string, unknown>
  if (!text(part) || (said !== undefined && !text(said))) return 'bad'
  if (!within(seconds, { min: 1, max: 20 })) return 'bad'
  return { part, ...(said === undefined ? {} : { text: said }), seconds }
}

function lookOf(value: unknown): ViewLook | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { kind, name } = value as Record<string, unknown>
  if (kind === 'built-in') return { kind }
  return kind === 'skin' && text(name) ? { kind, name } : undefined
}

/** The request, when every value is one this application can draw; anything else is a bad mode. */
export function viewAskedOf(value: unknown): ViewAsked | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { tenant, page, subject, theme, size, look, width, height, part, until } = value as Record<
    string,
    unknown
  >
  const worn = lookOf(look)
  const waits = untilOf(until)
  if (!text(tenant) || !text(page) || (subject !== undefined && !text(subject))) return undefined
  if (waits === 'bad' || (part !== undefined && !text(part))) return undefined
  if (worn === undefined) return undefined
  if (!oneOf(VIEW_THEMES, theme) || !oneOf(VIEW_SIZES, size)) return undefined
  if (!within(width, VIEW_BOUNDS.width) || !within(height, VIEW_BOUNDS.height)) return undefined
  return {
    tenant,
    page,
    ...(subject === undefined ? {} : { subject }),
    theme,
    size,
    look: worn,
    width,
    height,
    ...(part === undefined ? {} : { part }),
    ...(waits === undefined ? {} : { until: waits }),
  }
}

export const viewQuery = (asked: ViewAsked): string =>
  `?${new URLSearchParams({ [VIEW_PARAM]: JSON.stringify(asked) }).toString()}`

/** The request a page was opened for, or undefined for a page a person uses; a query that does not read as one is a bad mode. */
export function viewOfQuery(search: string): ViewAsked | 'bad-mode' | undefined {
  const raw = new URLSearchParams(search).get(VIEW_PARAM)
  if (raw === null) return undefined
  try {
    return viewAskedOf(JSON.parse(raw)) ?? 'bad-mode'
  } catch {
    return 'bad-mode'
  }
}
