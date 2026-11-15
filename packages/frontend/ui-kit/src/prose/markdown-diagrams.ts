import { useSyncExternalStore } from 'react'
import type { MermaidOptions } from 'streamdown'

const LIGHT: MermaidOptions = { config: { theme: 'neutral', securityLevel: 'strict' } }
const DARK: MermaidOptions = { config: { theme: 'dark', securityLevel: 'strict' } }
const idle = (): (() => void) => () => {}
const serverTheme = (): boolean => false

function darkTheme(): boolean {
  const theme = document.documentElement.dataset['theme']
  return theme
    ? theme === 'dark'
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
}

function subscribe(change: () => void): () => void {
  const observer = new MutationObserver(change)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  media?.addEventListener('change', change)
  return () => {
    observer.disconnect()
    media?.removeEventListener('change', change)
  }
}

export function useDiagramOptions(enabled: boolean): MermaidOptions {
  const dark = useSyncExternalStore(enabled ? subscribe : idle, darkTheme, serverTheme)
  return dark ? DARK : LIGHT
}
