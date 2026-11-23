import type { ShellState } from './state.ts'

/** The sheet of the changes, adopted by the page after its own sheets: its text is what the shell reads. */
export function adoptChanges(page: Document, text: ShellState['sheet']): () => void {
  const adopted = new CSSStyleSheet()
  const write = (css: string): void => adopted.replaceSync(css)
  write(text.get())
  page.adoptedStyleSheets = [...page.adoptedStyleSheets, adopted]
  const stop = text.subscribe(write)
  return () => {
    stop()
    page.adoptedStyleSheets = page.adoptedStyleSheets.filter(sheet => sheet !== adopted)
  }
}

/** A token of the interface is a name under `--omne-` that the page gives a value at its root. */
export const tokenOf =
  (page: Document) =>
  (name: string): boolean =>
    name.startsWith('--omne-') &&
    getComputedStyle(page.documentElement).getPropertyValue(name).trim() !== ''
