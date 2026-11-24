import type { PreferenceStore } from './theme.ts'

/** A text kept on this device for each tenant, under one prefix. What the text says is its owner's to read. */
export type TenantTexts = Readonly<{
  read(tenant: string): string | null
  write(tenant: string, text: string): void
}>

/** Reads answer nothing and writes do nothing where the device keeps no storage: the page goes on without. */
export function storedTenantTexts(store: () => PreferenceStore, prefix: string): TenantTexts {
  return {
    read(tenant) {
      try {
        return store().getItem(`${prefix}${tenant}`)
      } catch {
        return null
      }
    },
    write(tenant, text) {
      try {
        store().setItem(`${prefix}${tenant}`, text)
      } catch {}
    },
  }
}

/** The look a person chose is kept under this prefix, by tenant. */
export const LOOK_KEY = 'omne.look.'
