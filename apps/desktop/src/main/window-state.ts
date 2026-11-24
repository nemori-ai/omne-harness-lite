import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>

export type WindowState = Readonly<{ bounds: Bounds; maximized: boolean }>

export const DEFAULT_SIZE = { width: 1280, height: 860 } as const
export const MIN_SIZE = { width: 720, height: 480 } as const

const MIN_VISIBLE = 120

const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= 1_000_000

export function readWindowState(text: string): WindowState | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const { bounds, maximized } = value as { bounds?: unknown; maximized?: unknown }
  if (typeof bounds !== 'object' || bounds === null) return undefined
  const { x, y, width, height } = bounds as Record<string, unknown>
  if (!whole(x) || !whole(y) || !whole(width) || !whole(height)) return undefined
  if (width < MIN_SIZE.width || height < MIN_SIZE.height) return undefined
  return { bounds: { x, y, width, height }, maximized: maximized === true }
}

function overlap(a: Bounds, b: Bounds): Readonly<{ width: number; height: number }> {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  }
}

export function usableState(
  state: WindowState | undefined,
  screens: readonly Bounds[],
): WindowState | undefined {
  if (state === undefined) return undefined
  const shows = screens.some(screen => {
    const seen = overlap(state.bounds, screen)
    return seen.width >= MIN_VISIBLE && seen.height >= MIN_VISIBLE
  })
  return shows ? state : undefined
}

export type WindowStateFile = Readonly<{
  load(): WindowState | undefined
  save(state: WindowState): void
}>

export function windowStateFile(path: string): WindowStateFile {
  return {
    load() {
      try {
        return readWindowState(readFileSync(path, 'utf8'))
      } catch {
        return undefined
      }
    },
    save(state) {
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(`${path}.tmp`, JSON.stringify(state))
        renameSync(`${path}.tmp`, path)
      } catch {}
    },
  }
}
