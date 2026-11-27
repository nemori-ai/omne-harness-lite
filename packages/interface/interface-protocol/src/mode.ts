import { SIZE_TIERS, THEMES, type InspectionMode } from './interface-protocol.ts'

export const MODE_BOUNDS = {
  width: { least: 320, most: 2560 },
  height: { least: 240, most: 2560 },
} as const

export const DEFAULT_MODE: InspectionMode = Object.freeze({
  theme: 'light',
  size: 'medium',
  look: Object.freeze({ kind: 'built-in' }),
  width: 1280,
  height: 800,
})

const within = (value: unknown, { least, most }: Readonly<{ least: number; most: number }>) =>
  Number.isInteger(value) && (value as number) >= least && (value as number) <= most

/** The mode a request is sent in: what was not given is the default; anything out of bounds is not sent. */
export function modeOf(given: Partial<InspectionMode>): InspectionMode | 'bad-mode' {
  const made = { ...DEFAULT_MODE, ...given }
  if (!within(made.width, MODE_BOUNDS.width) || !within(made.height, MODE_BOUNDS.height))
    return 'bad-mode'
  if (!THEMES.includes(made.theme) || !SIZE_TIERS.includes(made.size)) return 'bad-mode'
  const { look } = made
  if (look.kind === 'skin' && look.name.trim() === '') return 'bad-mode'
  return made
}
