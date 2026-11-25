import type { PaperView } from '@omne-harness/ui-kit'

/** What this device keeps of the canvas: where it looks and how near, and whether the magnet is on. */
export type CanvasPreference = 'view' | 'magnet'

/** Text kept on this device under a name; the application's assembly says where. */
export type CanvasPreferences = Readonly<{
  read(name: CanvasPreference): string | null
  write(name: CanvasPreference, text: string): void
}>

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function heard(preferences: CanvasPreferences, name: CanvasPreference): string | null {
  try {
    return preferences.read(name)
  } catch {
    return null
  }
}

/** The view kept, or none when nothing is kept, it cannot be read, or it is not a view. */
export function keptView(preferences: CanvasPreferences): PaperView | undefined {
  const text = heard(preferences, 'view')
  if (text === null) return undefined
  try {
    const value = JSON.parse(text) as Partial<Record<keyof PaperView, unknown>> | null
    if (value === null || typeof value !== 'object') return undefined
    const { x, y, zoom } = value
    return finite(x) && finite(y) && finite(zoom) && zoom > 0 ? { x, y, zoom } : undefined
  } catch {
    return undefined
  }
}

/** The magnet is on unless this device kept it off. */
export const keptMagnet = (preferences: CanvasPreferences): boolean =>
  heard(preferences, 'magnet') !== 'off'

/** A preference not kept is a preference for this time only. */
export function keep(preferences: CanvasPreferences, name: CanvasPreference, text: string): void {
  try {
    preferences.write(name, text)
  } catch {
    return
  }
}

export const viewText = (view: PaperView): string =>
  JSON.stringify({ x: view.x, y: view.y, zoom: view.zoom })

export const magnetText = (on: boolean): string => (on ? 'on' : 'off')
