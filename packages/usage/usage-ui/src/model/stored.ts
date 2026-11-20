import { layoutsOf, type Layouts } from './layout.ts'

export type LayoutStore = Readonly<{ read: () => Layouts; write: (layouts: Layouts) => void }>
export type PreferenceStore = Pick<Storage, 'getItem' | 'setItem'>

export const USAGE_LAYOUTS_KEY = 'omne.usage-layouts'

/** Layouts kept under one key of a preference store; an unreadable or broken value reads as none. */
export function storedLayouts(store: () => PreferenceStore, key = USAGE_LAYOUTS_KEY): LayoutStore {
  return {
    read() {
      try {
        const text = store().getItem(key)
        return text === null ? {} : layoutsOf(JSON.parse(text))
      } catch {
        return {}
      }
    },
    write(layouts) {
      try {
        store().setItem(key, JSON.stringify(layouts))
      } catch {}
    },
  }
}
