import type { PreferenceStore } from './shell/theme.ts'

/** Where on the canvas this device looks and how near, and whether its magnet is on, are kept under this prefix. */
export const CANVAS_KEY = 'omne.canvas.'

/** Texts kept on this device by name. What they say is the canvas's to read, and to fall back from. */
export type NamedTexts = Readonly<{
  read(name: string): string | null
  write(name: string, text: string): void
}>

export function storedCanvasPreferences(store: () => PreferenceStore): NamedTexts {
  return {
    read: name => store().getItem(`${CANVAS_KEY}${name}`),
    write: (name, text) => store().setItem(`${CANVAS_KEY}${name}`, text),
  }
}
